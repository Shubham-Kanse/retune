"""Liveness + readiness endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from retune_ml.contracts import HealthResponse
from retune_ml.handlers import health_handler

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """HTTP/JSON façade — pure work in `handlers.health_handler`."""
    return health_handler()
