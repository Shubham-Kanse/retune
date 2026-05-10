"""Smoke test for the deterministic /embed stub.

Validates the contract that:
    1. Output dim equals 768 for bge-large.
    2. Same input → same output (deterministic).
    3. Different input → different output (stub is hash-seeded).
    4. Each vector has unit norm (cosine-ready).
"""

from __future__ import annotations

import math

from fastapi.testclient import TestClient

from retune_ml.contracts import EMBEDDING_DIM
from retune_ml.main import app


def test_embed_shape_and_determinism() -> None:
    client = TestClient(app)
    payload = {"texts": ["hello", "world", "hello"], "model": "bge-large-en-v1.5"}
    res = client.post("/embed", json=payload)
    assert res.status_code == 200, res.text
    body = res.json()

    embeddings: list[list[float]] = body["embeddings"]
    assert len(embeddings) == 3
    for v in embeddings:
        assert len(v) == EMBEDDING_DIM
        norm = math.sqrt(sum(x * x for x in v))
        assert abs(norm - 1.0) < 1e-3, f"vector not unit norm: {norm}"

    # Determinism: index 0 ("hello") must equal index 2 ("hello").
    assert embeddings[0] == embeddings[2]
    # Distinctness: index 0 ("hello") ≠ index 1 ("world").
    assert embeddings[0] != embeddings[1]

    assert "model_version" in body
    assert body["latency_ms"] >= 0.0


def test_embed_rejects_unknown_model() -> None:
    client = TestClient(app)
    res = client.post("/embed", json={"texts": ["hi"], "model": "nonsense-model"})
    assert res.status_code == 400


def test_embed_rejects_empty_texts() -> None:
    client = TestClient(app)
    res = client.post("/embed", json={"texts": [], "model": "bge-large-en-v1.5"})
    assert res.status_code == 422
