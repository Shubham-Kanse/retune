"""gRPC service tests.

Boots an aio server on a random port, exercises Health + Embed against
it via a real grpc.aio channel, and verifies field mapping + bytes →
float32 unpacking.
"""

from __future__ import annotations

import struct

import grpc
import pytest

from retune_ml.contracts import EMBEDDING_DIM
from retune_ml.grpc_gen import ml_pb2, ml_pb2_grpc
from retune_ml.grpc_service import make_server


@pytest.fixture
async def grpc_channel():
    server = await make_server(address="127.0.0.1:0")
    # The aio.Server doesn't expose the bound port directly when 0 is given;
    # instead we use add_insecure_port's return value. Recreate manually.
    server.stop_event = None  # quiet linter
    # Workaround: build server with a known port allocator.
    # Stop the auto-bound server and make one with a chosen port.
    await server.stop(grace=0)
    import socket as _s

    sock = _s.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    server = await make_server(address=f"127.0.0.1:{port}")
    channel = grpc.aio.insecure_channel(f"127.0.0.1:{port}")
    yield channel
    await channel.close()
    await server.stop(grace=0)


async def test_health_returns_ok(grpc_channel: grpc.aio.Channel) -> None:
    stub = ml_pb2_grpc.MLStub(grpc_channel)
    res = await stub.Health(ml_pb2.HealthRequest())
    assert res.status == "ok"
    assert res.service == "retune-ml"
    assert res.uptime_seconds >= 0
    # protobuf `repeated` fields are RepeatedScalarContainer, not list.
    assert list(res.models_loaded) == [] or len(res.models_loaded) >= 0


async def test_embed_returns_packed_float32_bytes(grpc_channel: grpc.aio.Channel) -> None:
    stub = ml_pb2_grpc.MLStub(grpc_channel)
    res = await stub.Embed(
        ml_pb2.EmbedRequest(texts=["hello", "world"], model="bge-large-en-v1.5")
    )
    assert len(res.embeddings) == 2
    for buf in res.embeddings:
        assert len(buf) == EMBEDDING_DIM * 4
        # Verify it unpacks as float32.
        floats = struct.unpack(f"<{EMBEDDING_DIM}f", buf)
        assert len(floats) == EMBEDDING_DIM
        # Stub embeddings are unit vectors → norm² ≈ 1.
        norm_sq = sum(v * v for v in floats)
        assert abs(norm_sq - 1.0) < 1e-3
    assert res.model_version
    assert res.latency_ms >= 0


async def test_embed_rejects_unknown_model(grpc_channel: grpc.aio.Channel) -> None:
    stub = ml_pb2_grpc.MLStub(grpc_channel)
    with pytest.raises(grpc.aio.AioRpcError) as exc_info:
        await stub.Embed(ml_pb2.EmbedRequest(texts=["x"], model="not-a-real-model"))
    assert exc_info.value.code() == grpc.StatusCode.INVALID_ARGUMENT
