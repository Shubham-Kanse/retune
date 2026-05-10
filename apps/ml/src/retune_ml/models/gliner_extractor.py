"""GLiNER multi-task span extractor.

Two implementations sharing one interface:

  - `StubGlinerExtractor`: deterministic regex-based extraction for the
    common JD vocabulary. Used in CI and dev to keep tests fast and
    bandwidth-free. Produces `RawExtractedSpan`-shape outputs that are
    structurally identical to the real model's outputs.

  - `RealGlinerExtractor`: lazy-loads `gliner` (PyPI: `gliner`) backed by
    the `urchade/gliner_multitask-large-v0.5` checkpoint. Cached under
    `settings.model_cache_dir`. Selected when `RETUNE_ML_USE_STUBS=false`.

The interface returns plain `RawExtractedSpan` objects so downstream
handlers don't need to know which implementation they got.

@brain temporal cortex (entity recognition) + Wernicke's (lexical access)
"""

from __future__ import annotations

import re
import threading
from typing import Protocol

from retune_ml.contracts import Confidence, RawExtractedSpan, SpanKind

# ─────────── interface ───────────


class GlinerExtractor(Protocol):
    """Implementation-agnostic span extractor."""

    @property
    def version(self) -> str: ...

    def extract(
        self,
        *,
        text: str,
        source_doc_kind: str,
        span_kinds: list[SpanKind],
    ) -> list[RawExtractedSpan]: ...


# ─────────── stub implementation ───────────

# Curated lexicons by span_kind. Deliberately small and high-precision —
# the goal is "structurally correct extraction on test inputs", not full
# recall. Real GLiNER takes over when use_stubs=false.
_STUB_LEXICON: dict[SpanKind, list[str]] = {
    "skill": [
        "python",
        "typescript",
        "javascript",
        "rust",
        "go",
        "java",
        "c++",
        "sql",
        "machine learning",
        "deep learning",
        "distributed systems",
        "system design",
        "data engineering",
        "frontend",
        "backend",
        "devops",
        "infrastructure",
        "security",
        "kubernetes",
        "docker",
        "react",
        "node.js",
        "graphql",
        "rest",
        "grpc",
        "microservices",
    ],
    "tool": [
        "kubernetes",
        "docker",
        "terraform",
        "aws",
        "gcp",
        "azure",
        "postgresql",
        "redis",
        "kafka",
        "spark",
        "airflow",
        "snowflake",
        "datadog",
        "grafana",
        "prometheus",
        "github actions",
        "jenkins",
        "vault",
    ],
    "framework": [
        "react",
        "next.js",
        "django",
        "flask",
        "fastapi",
        "spring",
        "rails",
        "vue",
        "angular",
        "pytorch",
        "tensorflow",
        "jax",
    ],
    "company": [
        "stripe",
        "google",
        "meta",
        "facebook",
        "openai",
        "anthropic",
        "amazon",
        "microsoft",
        "apple",
        "netflix",
        "airbnb",
        "uber",
        "shopify",
        "datadog",
        "snowflake",
    ],
    "role": [
        "senior software engineer",
        "staff engineer",
        "principal engineer",
        "engineering manager",
        "tech lead",
        "ml engineer",
        "data engineer",
        "product manager",
    ],
    "leadership_signal": [
        "led",
        "managed",
        "mentored",
        "owned",
        "drove",
        "spearheaded",
        "founded",
        "built and led",
    ],
    "verb": [
        "built",
        "designed",
        "shipped",
        "deployed",
        "scaled",
        "optimized",
        "migrated",
        "refactored",
        "automated",
        "launched",
    ],
    "compliance": [
        "soc2",
        "soc 2",
        "hipaa",
        "gdpr",
        "pci",
        "iso 27001",
        "fedramp",
    ],
}


# Match metric-shaped phrases like "10x", "30%", "1.5M", "200ms p95".
_METRIC_PATTERN = re.compile(
    r"\b(?:\d+(?:\.\d+)?[%xX]|\$?\d+(?:\.\d+)?[KMB]\b|\d+(?:\.\d+)?\s*(?:ms|s|qps|rps|req/s)\b|p\d{2,3})",
    re.IGNORECASE,
)

# Year ranges and durations — "5 years", "3+ yrs", "2020–2024".
_DURATION_PATTERN = re.compile(
    r"\b(?:\d+\+?\s*(?:years?|yrs?|months?|mos?)|\d{4}\s*[-–]\s*\d{4})\b",
    re.IGNORECASE,
)


class StubGlinerExtractor:
    """Deterministic, regex+lexicon span extractor. Test/dev only."""

    @property
    def version(self) -> str:
        return "stub-v1"

    def extract(
        self,
        *,
        text: str,
        source_doc_kind: str,  # noqa: ARG002
        span_kinds: list[SpanKind],
    ) -> list[RawExtractedSpan]:
        # If caller didn't restrict, extract everything we know.
        wanted = set(span_kinds) if span_kinds else set(_STUB_LEXICON.keys()) | {
            "metric",
            "duration",
        }
        spans: list[RawExtractedSpan] = []

        # Lexicon scan
        for kind, lexicon in _STUB_LEXICON.items():
            if kind not in wanted:
                continue
            for term in lexicon:
                spans.extend(_find_term(text=text, term=term, kind=kind))

        if "metric" in wanted:
            for m in _METRIC_PATTERN.finditer(text):
                spans.append(_make_span("metric", m.group(0), m.start(), m.end()))
        if "duration" in wanted:
            for m in _DURATION_PATTERN.finditer(text):
                spans.append(_make_span("duration", m.group(0), m.start(), m.end()))

        # Drop overlaps with the lower-confidence span (stable: keeps first).
        spans.sort(key=lambda s: (s.char_start, -s.confidence.point))
        deduped: list[RawExtractedSpan] = []
        for s in spans:
            if deduped and _overlaps(deduped[-1], s):
                continue
            deduped.append(s)
        return deduped


def _find_term(*, text: str, term: str, kind: SpanKind) -> list[RawExtractedSpan]:
    """Word-bounded, case-insensitive find. Skips false positives within
    other words (e.g. "go" inside "google")."""
    out: list[RawExtractedSpan] = []
    pat = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
    for m in pat.finditer(text):
        out.append(_make_span(kind, m.group(0), m.start(), m.end()))
    return out


def _make_span(kind: SpanKind, text: str, start: int, end: int) -> RawExtractedSpan:
    return RawExtractedSpan(
        kind=kind,
        text=text,
        char_start=start,
        char_end=end,
        confidence=Confidence(point=0.85, lower=0.75, upper=0.92, coverage=0.95),
        payload={"matcher": "stub_lexicon"},
    )


def _overlaps(a: RawExtractedSpan, b: RawExtractedSpan) -> bool:
    return not (a.char_end <= b.char_start or b.char_end <= a.char_start)


# ─────────── real implementation (lazy) ───────────


class RealGlinerExtractor:
    """Wraps the `gliner` PyPI package. Lazy-loaded on first call so that
    the import isn't paid by tests that never go through this path.

    The model checkpoint is downloaded to `settings.model_cache_dir` via
    HuggingFace Hub on first use. CI populates the cache once via the
    `cognitive-cycle-heavy` job; subsequent runs hit the cache.

    This class is intentionally thin: error handling and contract shaping
    happen one layer up in `extract_spans_handler`.
    """

    def __init__(self, *, model_id: str, cache_dir: str | None) -> None:
        self._model_id = model_id
        self._cache_dir = cache_dir
        self._model: object | None = None
        self._lock = threading.Lock()

    @property
    def version(self) -> str:
        return f"{self._model_id}@v0.5"

    def _ensure_loaded(self) -> object:  # pragma: no cover — heavy path
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            # Imported lazily so the gliner / torch dependency is only
            # required when use_stubs=false.
            from gliner import GLiNER  # type: ignore[import-not-found]

            self._model = GLiNER.from_pretrained(
                self._model_id,
                cache_dir=self._cache_dir,
            )
            return self._model

    def extract(  # pragma: no cover — heavy path
        self,
        *,
        text: str,
        source_doc_kind: str,  # noqa: ARG002
        span_kinds: list[SpanKind],
    ) -> list[RawExtractedSpan]:
        model = self._ensure_loaded()
        labels = list(span_kinds) if span_kinds else list(_STUB_LEXICON.keys())
        # gliner.predict_entities returns dicts with start/end/label/score.
        raw = model.predict_entities(text, labels)  # type: ignore[attr-defined]
        spans: list[RawExtractedSpan] = []
        for r in raw:
            kind = r.get("label")
            if kind not in _STUB_LEXICON and kind not in {"metric", "duration"}:
                continue
            score = float(r.get("score", 0.0))
            spans.append(
                RawExtractedSpan(
                    kind=kind,  # type: ignore[arg-type]
                    text=str(r.get("text", "")),
                    char_start=int(r.get("start", 0)),
                    char_end=int(r.get("end", 0)),
                    confidence=Confidence(
                        point=score,
                        lower=max(0.0, score - 0.05),
                        upper=min(1.0, score + 0.05),
                        coverage=0.95,
                    ),
                    payload={"matcher": "gliner"},
                )
            )
        return spans
