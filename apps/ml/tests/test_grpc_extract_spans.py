"""gRPC ExtractSpans test — exercises wire format end to end."""

from __future__ import annotations

import json
import socket as _s

import grpc
import pytest

from retune_ml.grpc_gen import ml_pb2, ml_pb2_grpc
from retune_ml.grpc_service import make_server
from retune_ml.handlers import reset_extractor_cache


@pytest.fixture
async def grpc_channel():
    sock = _s.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = await make_server(address=f"127.0.0.1:{port}")
    channel = grpc.aio.insecure_channel(f"127.0.0.1:{port}")
    yield channel
    await channel.close()
    await server.stop(grace=0)


async def test_grpc_extract_spans_round_trip(grpc_channel: grpc.aio.Channel) -> None:
    reset_extractor_cache()
    stub = ml_pb2_grpc.MLStub(grpc_channel)
    res = await stub.ExtractSpans(
        ml_pb2.ExtractSpansRequest(
            text="Senior Software Engineer at Stripe building Kubernetes infra. 30% latency win.",
            source_doc_kind="jd",
            span_kinds=[],
        )
    )
    assert len(res.spans) > 0
    assert res.model_version == "stub-v1"

    kinds = {s.kind for s in res.spans}
    assert "company" in kinds
    assert "metric" in kinds
    # Wire format checks.
    for s in res.spans:
        assert s.text
        assert s.char_start >= 0
        assert s.char_end > s.char_start
        assert 0.0 <= s.confidence.point <= 1.0
        # payload_json round-trips as valid JSON.
        if s.payload_json:
            payload = json.loads(s.payload_json)
            assert isinstance(payload, dict)


async def test_grpc_extract_spans_kind_filter(grpc_channel: grpc.aio.Channel) -> None:
    reset_extractor_cache()
    stub = ml_pb2_grpc.MLStub(grpc_channel)
    res = await stub.ExtractSpans(
        ml_pb2.ExtractSpansRequest(
            text="Built systems at Google and Meta. 10x growth.",
            source_doc_kind="jd",
            span_kinds=["company"],
        )
    )
    kinds = {s.kind for s in res.spans}
    assert kinds == {"company"}
    texts = {s.text.lower() for s in res.spans}
    assert "google" in texts
    assert "meta" in texts
