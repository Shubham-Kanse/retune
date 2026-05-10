"""gRPC ClassifyDiscourse round-trip — proves the proto wire format
preserves per-sentence labels AND the per-class logits in stable
category order."""

from __future__ import annotations

import socket as _s

import grpc
import pytest

from retune_ml.grpc_gen import ml_pb2, ml_pb2_grpc
from retune_ml.grpc_service import make_server
from retune_ml.handlers import reset_discourse_classifier_cache
from retune_ml.models.discourse_classifier import DISCOURSE_FUNCTIONS


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


JD = (
    "About the role: We're hiring a Senior Software Engineer to build "
    "distributed systems. Must have an active US security clearance. "
    "Bonus points for Kafka. We work async-first. "
    "Equal opportunity employer."
)


async def test_grpc_classify_discourse_round_trip(grpc_channel: grpc.aio.Channel) -> None:
    reset_discourse_classifier_cache()
    stub = ml_pb2_grpc.MLStub(grpc_channel)
    res = await stub.ClassifyDiscourse(ml_pb2.ClassifyDiscourseRequest(jd_text=JD))
    assert len(res.sentences) >= 4
    assert res.model_version == "stub-v1"

    seen = {s.function for s in res.sentences}
    assert "filter" in seen
    assert "aspiration" in seen
    assert "culture" in seen
    assert "legal" in seen

    # Logits arrive as `repeated double` in the stable category order;
    # length must match the canonical tuple.
    for s in res.sentences:
        assert len(s.function_logits) == len(DISCOURSE_FUNCTIONS)
        # Sums to ~1 (same contract as the HTTP path).
        assert 0.99 <= sum(s.function_logits) <= 1.01
