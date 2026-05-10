"""Smoke test: /health returns the expected manifest."""

from __future__ import annotations

from fastapi.testclient import TestClient

from retune_ml.main import app


def test_health_ok() -> None:
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "retune-ml"
    assert isinstance(body["uptime_seconds"], float)
    assert isinstance(body["models_loaded"], list)
