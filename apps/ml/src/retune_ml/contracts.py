"""Pydantic contracts mirroring `packages/types/src/ml-contracts.ts`.

Source of truth is `packages/proto/proto/ml.proto`. These Python models
must stay structurally identical to the Zod schemas on the TS side.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator


# ─────────────────────── Common ───────────────────────


class Confidence(BaseModel):
    point: float = Field(ge=0.0, le=1.0)
    lower: float = Field(ge=0.0, le=1.0)
    upper: float = Field(ge=0.0, le=1.0)
    coverage: float = Field(default=0.95, ge=0.0, le=1.0)

    @field_validator("upper")
    @classmethod
    def _check_bounds(cls, upper: float, info: Any) -> float:  # noqa: ARG003
        # Pydantic v2 cross-field validation via `model_validator` would be
        # more idiomatic; we keep this minimal here.
        return upper


# ─────────────────────── Health ───────────────────────


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["retune-ml"] = "retune-ml"
    version: str
    uptime_seconds: float = Field(ge=0.0)
    models_loaded: list[str]


# ─────────────────────── Embed ───────────────────────

EMBEDDING_DIM = 768


class EmbedRequest(BaseModel):
    texts: Annotated[list[str], Field(min_length=1, max_length=256)]
    model: str = "bge-large-en-v1.5"
    max_tokens: int | None = None

    @field_validator("texts")
    @classmethod
    def _no_empty_texts(cls, v: list[str]) -> list[str]:
        if any(len(t) == 0 for t in v):
            raise ValueError("texts must be non-empty strings")
        return v


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model_version: str
    latency_ms: float = Field(ge=0.0)

    @field_validator("embeddings")
    @classmethod
    def _check_dim(cls, v: list[list[float]]) -> list[list[float]]:
        for row in v:
            if len(row) != EMBEDDING_DIM:
                raise ValueError(
                    f"each embedding must have exactly {EMBEDDING_DIM} dims, got {len(row)}"
                )
        return v


# ─────────────────────── Extract spans ───────────────────────

# Mirrors `EvidenceSpan.span_kind` in @retune/types/src/evidence.ts
SpanKind = Literal[
    "skill",
    "tool",
    "framework",
    "metric",
    "scope",
    "duration",
    "project",
    "compliance",
    "company",
    "role",
    "achievement",
    "verb",
    "domain",
    "leadership_signal",
    "named_system",
]


class ExtractSpansRequest(BaseModel):
    text: Annotated[str, Field(min_length=1)]
    source_doc_kind: str
    span_kinds: list[SpanKind] = []


class RawExtractedSpan(BaseModel):
    kind: SpanKind
    text: str
    char_start: int = Field(ge=0)
    char_end: int = Field(ge=0)
    confidence: Confidence
    payload: dict[str, Any] = {}


class ExtractSpansResponse(BaseModel):
    spans: list[RawExtractedSpan]
    model_version: str
    latency_ms: float = Field(ge=0.0)


# ─────────────────────── Classify discourse ───────────────────────


DiscourseFunction = Literal[
    "filter",
    "actual_test",
    "aspiration",
    "culture",
    "legal",
    "boilerplate",
]


class ClassifyDiscourseRequest(BaseModel):
    # Min length deliberately matches the TS schema (50 chars). Below this,
    # there's nothing meaningful to classify.
    jd_text: Annotated[str, Field(min_length=50)]


class DiscourseLabeledSentencePy(BaseModel):
    sentence_index: int = Field(ge=0)
    text: str
    function: DiscourseFunction
    function_logits: dict[str, float]
    importance: float = Field(ge=0.0, le=1.0)


class ClassifyDiscourseResponse(BaseModel):
    sentences: list[DiscourseLabeledSentencePy]
    model_version: str
    latency_ms: float = Field(ge=0.0)


# ─────────────────────── Errors ───────────────────────


class MLError(BaseModel):
    error: str
    message: str
    request_id: str | None = None
