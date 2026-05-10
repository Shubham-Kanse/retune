"""Tests for the HTTP /extract-spans route + the underlying handler."""

from __future__ import annotations

from fastapi.testclient import TestClient

from retune_ml.handlers import extract_spans_handler, reset_extractor_cache
from retune_ml.main import create_app


JD_TEXT = (
    "Senior Software Engineer at Stripe.\n"
    "Build and lead distributed systems infrastructure in Python and Go.\n"
    "5+ years experience required. Reduce p99 latency by 30% in 6 months.\n"
    "Familiarity with Kubernetes, Docker, and SOC2 compliance a plus."
)


def test_handler_extracts_known_skills_and_companies() -> None:
    reset_extractor_cache()
    out = extract_spans_handler(text=JD_TEXT, source_doc_kind="jd", span_kinds=[])
    kinds_found = {s.kind for s in out.spans}
    # Must capture skill, company, metric, duration, compliance from JD_TEXT.
    assert "skill" in kinds_found
    assert "company" in kinds_found
    assert "metric" in kinds_found
    assert "duration" in kinds_found
    assert "compliance" in kinds_found
    # Stub version tag.
    assert out.model_version == "stub-v1"
    # Latency is non-negative; stub should be fast.
    assert out.latency_ms >= 0
    assert out.latency_ms < 100


def test_handler_respects_kind_filter() -> None:
    reset_extractor_cache()
    out = extract_spans_handler(
        text=JD_TEXT, source_doc_kind="jd", span_kinds=["company", "metric"]
    )
    kinds = {s.kind for s in out.spans}
    assert kinds <= {"company", "metric"}
    assert "company" in kinds
    assert "metric" in kinds


def test_handler_dedupes_overlapping_spans() -> None:
    """When two lexicons overlap (e.g. 'kubernetes' is both skill + tool),
    overlapping spans should collapse to a single entry per offset range."""
    reset_extractor_cache()
    out = extract_spans_handler(
        text="We use Kubernetes in production.",
        source_doc_kind="jd",
        span_kinds=[],
    )
    # Each character offset can be covered by at most one span.
    seen: list[tuple[int, int]] = []
    for s in out.spans:
        for prev in seen:
            assert s.char_end <= prev[0] or s.char_start >= prev[1], (
                f"overlap between {prev} and ({s.char_start},{s.char_end})"
            )
        seen.append((s.char_start, s.char_end))


def test_http_route_returns_spans() -> None:
    reset_extractor_cache()
    client = TestClient(create_app())
    res = client.post(
        "/extract-spans",
        json={"text": JD_TEXT, "source_doc_kind": "jd", "span_kinds": []},
    )
    assert res.status_code == 200
    body = res.json()
    assert "spans" in body
    assert len(body["spans"]) > 0
    for s in body["spans"]:
        assert s["kind"] in {
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
        }
        # Confidence sanity.
        assert 0.0 <= s["confidence"]["point"] <= 1.0
        assert s["confidence"]["lower"] <= s["confidence"]["upper"]


def test_http_route_validates_empty_text() -> None:
    client = TestClient(create_app())
    res = client.post(
        "/extract-spans",
        json={"text": "", "source_doc_kind": "jd", "span_kinds": []},
    )
    # Pydantic rejects empty text via min_length=1.
    assert res.status_code == 422


def test_handler_offsets_substring_match() -> None:
    """Reported char_start/char_end must slice back to the matched text."""
    reset_extractor_cache()
    out = extract_spans_handler(
        text="I love Python and TypeScript.",
        source_doc_kind="jd",
        span_kinds=["skill"],
    )
    for s in out.spans:
        assert s.text.lower() == "I love Python and TypeScript."[s.char_start : s.char_end].lower()
