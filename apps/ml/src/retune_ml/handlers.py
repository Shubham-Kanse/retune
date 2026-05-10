"""Pure handler logic — shared by FastAPI HTTP routes AND the gRPC server.

Keeping the cognitive work here, transport-agnostic, lets us serve both
HTTP/JSON (existing FastAPI) and gRPC from one implementation. No
FastAPI types in this module.

Each handler:
  - takes domain inputs (dataclasses or primitives)
  - returns domain outputs (Pydantic models from `retune_ml.contracts`)
  - raises `HandlerError` on user-facing errors (the transport layers
    map this to HTTP 4xx / gRPC INVALID_ARGUMENT)
  - logs structured events for observability
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

import numpy as np

from retune_ml.contracts import (
    EMBEDDING_DIM,
    ClassifyDiscourseResponse,
    DiscourseLabeledSentencePy,
    EmbedResponse,
    ExtractSpansResponse,
    HealthResponse,
    RawExtractedSpan,
)
from retune_ml.lib.clock import now_ms, uptime_seconds
from retune_ml.lib.logging import get_logger
from retune_ml.models import get_registry
from retune_ml.settings import get_settings

log = get_logger(__name__)


@dataclass
class HandlerError(Exception):
    """Domain-level error. Transport translates to HTTP 4xx / gRPC INVALID_ARGUMENT."""

    code: str
    message: str

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


def health_handler() -> HealthResponse:
    """Liveness + manifest of currently loaded models."""
    settings = get_settings()
    registry = get_registry()
    return HealthResponse(
        status="ok",
        service="retune-ml",
        version=settings.version,
        uptime_seconds=uptime_seconds(),
        models_loaded=registry.list_loaded(),
    )


def embed_handler(texts: list[str], model: str) -> EmbedResponse:
    """Embed a batch of texts. Stub implementation in commit #5; real
    `bge-large-en-v1.5` model lands in commit #6."""
    settings = get_settings()
    registry = get_registry()

    try:
        handle = registry.get(model)
    except ValueError as e:
        raise HandlerError("invalid_model", str(e)) from e

    if not settings.use_stubs:
        raise HandlerError("not_implemented", "real embedding model not yet wired")

    t0 = now_ms()
    embeddings = [_stub_embedding(t) for t in texts]
    latency_ms = now_ms() - t0

    log.info(
        "embed_completed",
        n=len(texts),
        model=handle.name,
        is_stub=handle.is_stub,
        transport="shared",
        latency_ms=round(latency_ms, 3),
    )

    return EmbedResponse(
        embeddings=embeddings,
        model_version=handle.display(),
        latency_ms=latency_ms,
    )


def extract_spans_handler(
    *, text: str, source_doc_kind: str, span_kinds: list[str]
) -> ExtractSpansResponse:
    """Extract typed entity spans from arbitrary text.

    Routes to the stub or real GLiNER implementation based on
    `settings.use_stubs`. Both implementations produce the same
    `RawExtractedSpan` shape, so downstream callers don't branch.
    """
    settings = get_settings()
    extractor = _get_extractor()

    t0 = now_ms()
    spans = extractor.extract(
        text=text,
        source_doc_kind=source_doc_kind,
        span_kinds=span_kinds,  # type: ignore[arg-type]
    )
    latency_ms = now_ms() - t0

    log.info(
        "extract_spans_completed",
        n_chars=len(text),
        n_spans=len(spans),
        kinds_requested=span_kinds,
        is_stub=settings.use_stubs,
        latency_ms=round(latency_ms, 3),
    )

    return ExtractSpansResponse(
        spans=spans,
        model_version=extractor.version,
        latency_ms=latency_ms,
    )


_extractor_cache: Any = None


def _get_extractor() -> Any:
    """Process-singleton extractor — stub or real, decided once."""
    global _extractor_cache
    if _extractor_cache is not None:
        return _extractor_cache

    from retune_ml.models.gliner_extractor import (
        RealGlinerExtractor,
        StubGlinerExtractor,
    )

    settings = get_settings()
    if settings.use_stubs:
        _extractor_cache = StubGlinerExtractor()
    else:  # pragma: no cover — heavy path, exercised by RUN_HEAVY CI
        _extractor_cache = RealGlinerExtractor(
            model_id=settings.gliner_model_id,
            cache_dir=settings.model_cache_dir,
        )
    return _extractor_cache


def reset_extractor_cache() -> None:
    """Test helper — clears the memoized extractor so settings changes take effect."""
    global _extractor_cache
    _extractor_cache = None


def classify_discourse_handler(*, jd_text: str) -> ClassifyDiscourseResponse:
    """Six-way per-sentence classification of a JD into discourse functions.

    Routes to the stub or real DeBERTa NLI implementation based on
    `settings.use_stubs`.
    """
    settings = get_settings()
    classifier = _get_discourse_classifier()

    t0 = now_ms()
    sentences = classifier.classify(jd_text=jd_text)
    latency_ms = now_ms() - t0

    log.info(
        "classify_discourse_completed",
        n_chars=len(jd_text),
        n_sentences=len(sentences),
        is_stub=settings.use_stubs,
        latency_ms=round(latency_ms, 3),
    )

    return ClassifyDiscourseResponse(
        sentences=[
            DiscourseLabeledSentencePy(
                sentence_index=s.sentence_index,
                text=s.text,
                function=s.function,  # type: ignore[arg-type]
                function_logits=s.function_logits,
                importance=s.importance,
            )
            for s in sentences
        ],
        model_version=classifier.version,
        latency_ms=latency_ms,
    )


_discourse_classifier_cache: Any = None


def _get_discourse_classifier() -> Any:
    global _discourse_classifier_cache
    if _discourse_classifier_cache is not None:
        return _discourse_classifier_cache

    from retune_ml.models.discourse_classifier import (
        RealDiscourseClassifier,
        StubDiscourseClassifier,
    )

    settings = get_settings()
    if settings.use_stubs:
        _discourse_classifier_cache = StubDiscourseClassifier()
    else:  # pragma: no cover — heavy path
        _discourse_classifier_cache = RealDiscourseClassifier(
            model_id=settings.discourse_model_id,
            cache_dir=settings.model_cache_dir,
        )
    return _discourse_classifier_cache


def reset_discourse_classifier_cache() -> None:
    """Test helper."""
    global _discourse_classifier_cache
    _discourse_classifier_cache = None


def _stub_embedding(text: str) -> list[float]:
    """Deterministic, hash-seeded unit vector at the configured dim.

    NOT semantically meaningful. Contract-correct placeholder so the
    workbench can be developed end-to-end before the real model in
    commit #6.
    """
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "little", signed=False)
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(EMBEDDING_DIM).astype(np.float32)
    norm = float(np.linalg.norm(v))
    if norm == 0.0:
        return [0.0] * EMBEDDING_DIM
    return (v / norm).tolist()
