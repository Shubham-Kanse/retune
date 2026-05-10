"""Tests for HTTP /classify-discourse + the underlying handler."""

from __future__ import annotations

from fastapi.testclient import TestClient

from retune_ml.handlers import (
    classify_discourse_handler,
    reset_discourse_classifier_cache,
)
from retune_ml.main import create_app


JD = """About the role:
We're hiring a Senior Software Engineer to build distributed systems.
Must have an active US security clearance. 5+ years of experience required.
Bonus points if you've worked with Kafka or Spark.
We work async-first across 8 time zones and value high agency.
Equal opportunity employer; we hire without regard to protected class.
Apply now to join our team."""


def test_handler_labels_each_sentence() -> None:
    reset_discourse_classifier_cache()
    out = classify_discourse_handler(jd_text=JD)
    # Sentence count > 0; indexes are sequential.
    assert len(out.sentences) >= 5
    for i, s in enumerate(out.sentences):
        assert s.sentence_index == i
        # Logits are a probability distribution.
        total = sum(s.function_logits.values())
        assert 0.99 <= total <= 1.01


def test_handler_recognizes_canonical_cues() -> None:
    reset_discourse_classifier_cache()
    out = classify_discourse_handler(jd_text=JD)
    by_text = {s.text: s.function for s in out.sentences}

    # Must-have line is a filter.
    filter_lines = [t for t, fn in by_text.items() if "active US security clearance" in t]
    assert filter_lines
    assert by_text[filter_lines[0]] == "filter"

    # Bonus points → aspiration.
    aspiration_lines = [t for t, fn in by_text.items() if "Bonus points" in t]
    assert aspiration_lines
    assert by_text[aspiration_lines[0]] == "aspiration"

    # async-first → culture.
    culture_lines = [t for t, fn in by_text.items() if "async-first" in t]
    assert culture_lines
    assert by_text[culture_lines[0]] == "culture"

    # Equal opportunity → legal.
    legal_lines = [t for t, fn in by_text.items() if "Equal opportunity" in t]
    assert legal_lines
    assert by_text[legal_lines[0]] == "legal"

    # "About the role:" → boilerplate.
    boilerplate_lines = [t for t, fn in by_text.items() if "About the role" in t]
    assert boilerplate_lines
    assert by_text[boilerplate_lines[0]] == "boilerplate"


def test_handler_importance_ordered() -> None:
    """Filter > actual_test > culture/aspiration > legal/boilerplate."""
    reset_discourse_classifier_cache()
    out = classify_discourse_handler(jd_text=JD)
    by_fn: dict[str, list[float]] = {}
    for s in out.sentences:
        by_fn.setdefault(s.function, []).append(s.importance)
    if "filter" in by_fn and "boilerplate" in by_fn:
        assert max(by_fn["filter"]) > max(by_fn["boilerplate"])
    if "actual_test" in by_fn and "boilerplate" in by_fn:
        assert max(by_fn["actual_test"]) > max(by_fn["boilerplate"])


def test_http_route_returns_distribution() -> None:
    reset_discourse_classifier_cache()
    client = TestClient(create_app())
    res = client.post("/classify-discourse", json={"jd_text": JD})
    assert res.status_code == 200
    body = res.json()
    assert len(body["sentences"]) >= 5
    assert body["model_version"] == "stub-v1"
    for s in body["sentences"]:
        assert s["function"] in {
            "filter",
            "actual_test",
            "aspiration",
            "culture",
            "legal",
            "boilerplate",
        }
        assert 0.0 <= s["importance"] <= 1.0


def test_http_route_validates_short_input() -> None:
    client = TestClient(create_app())
    res = client.post("/classify-discourse", json={"jd_text": "too short"})
    assert res.status_code == 422


def test_handler_handles_bullet_lines() -> None:
    """JDs frequently use bullet leaders. The splitter must strip them
    and not concatenate adjacent bullets into one sentence."""
    reset_discourse_classifier_cache()
    text = """Responsibilities:
- Design distributed systems
- Mentor engineers
- Drive technical strategy
We work remotely across 8 time zones."""
    # Bypass the 50-char min by padding sentinels — the handler doesn't
    # see the validator (that runs in the FastAPI route).
    out = classify_discourse_handler(jd_text=text + " " * 50)
    texts = [s.text for s in out.sentences]
    # Each bullet is its own sentence.
    assert any("Design distributed systems" in t for t in texts)
    assert any("Mentor engineers" in t for t in texts)
    assert any("Drive technical strategy" in t for t in texts)
    # No bullet leader survives.
    for t in texts:
        assert not t.startswith(("- ", "• ", "* "))
