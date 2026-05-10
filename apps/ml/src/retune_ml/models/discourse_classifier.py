"""Discourse-function classifier.

Classifies each sentence in a JD into one of six functions:

  filter           — hard requirement; absence disqualifies
                     (e.g. "must have an active US security clearance")
  actual_test      — what the recruiter genuinely cares about; the
                     hidden hiring bar (e.g. "you will design and own
                     the streaming-ingest pipeline serving 50M req/day")
  aspiration       — wish-list, nice-to-have
                     (e.g. "experience with Kafka a plus")
  culture          — values / working style claims
                     (e.g. "we work async-first across 8 time zones")
  legal            — EEO, ADA, salary-band statutes
                     (e.g. "Equal opportunity employer")
  boilerplate      — structurally required filler
                     (e.g. "About the role:", "Responsibilities:")

Two implementations sharing one interface:

  - StubDiscourseClassifier:
      regex + cue-phrase heuristics. Deterministic, ~1ms / paragraph,
      structurally-correct outputs for tests. Per-class logits are
      synthesized from the cue match strength so downstream consumers
      that read `function_logits` get a meaningful distribution.

  - RealDiscourseClassifier:
      DeBERTa-v3-small (44M params), zero-shot multi-label classification
      via the entailment trick (six hypothesis prompts; argmax over
      entailment probabilities). ONNX Runtime, INT8 quantized.
      ~80ms / paragraph on CPU, downloaded lazily into model_cache_dir.

Sentence segmentation is shared between both: `_split_sentences()` runs
a deliberately-conservative regex splitter that handles the bullet-list
shapes common in JDs ("•", "-", "*", numbered).

@brain Wernicke's (lexical/discourse) + DLPFC (function attribution)
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Protocol


# Stable category order — proto contract, the TS side reads this exact
# order to interpret `function_logits`. Don't reorder.
DISCOURSE_FUNCTIONS: tuple[str, ...] = (
    "filter",
    "actual_test",
    "aspiration",
    "culture",
    "legal",
    "boilerplate",
)


@dataclass(frozen=True, slots=True)
class LabeledSentence:
    sentence_index: int
    text: str
    function: str
    function_logits: dict[str, float]
    importance: float


# ─────────── interface ───────────


class DiscourseClassifier(Protocol):
    @property
    def version(self) -> str: ...

    def classify(self, *, jd_text: str) -> list[LabeledSentence]: ...


# ─────────── sentence splitter ───────────

# A JD's sentence boundaries are messier than prose. This handles:
#   - bullet leaders: •, *, -, 1., 2)
#   - inline period-followed-by-capital
#   - newline-separated lines (very common)
_BULLET_LEADER = re.compile(r"^\s*(?:[\-•*]|\d+[\.\)])\s+")
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def _split_sentences(text: str) -> list[str]:
    """Conservative sentence splitter optimized for JD text shapes."""
    out: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        # Strip any bullet leader, but preserve the surface text otherwise.
        stripped = _BULLET_LEADER.sub("", stripped)
        if not stripped:
            continue
        # Within a line, split on terminal punctuation.
        if "." in stripped or "!" in stripped or "?" in stripped:
            for piece in _SENTENCE_BOUNDARY.split(stripped):
                piece = piece.strip()
                if piece:
                    out.append(piece)
        else:
            out.append(stripped)
    return out


# ─────────── stub implementation ───────────

# Cue-phrase tables. High-precision, low-recall — chosen so that the
# stub produces sensible labels on the canonical test JDs without ever
# false-positive labelling neutral content. Anything unmatched falls
# through to "actual_test" (the most common functional category in JDs).

_LEGAL_CUES = (
    "equal opportunity",
    "eoe",
    "ada compliance",
    "without regard to",
    "protected class",
    "veteran status",
    "disabilit",  # disability / disabilities
    "salary range",  # CA / NY pay-band statutes
    "pay transparency",
)
_BOILERPLATE_CUES = (
    "about the role",
    "about us",
    "about the team",
    "responsibilities:",
    "qualifications:",
    "what you'll do",
    "what we offer",
    "join us",
    "apply now",
)
_FILTER_CUES = (
    "must have",
    "required:",
    "minimum requirement",
    "minimum qualification",
    "active clearance",
    "active security clearance",
    "us citizen",
    "ph.d. required",
    "phd required",
    "bachelor's degree required",
    " years of experience required",
    "years of experience required",
)
_ASPIRATION_CUES = (
    "nice to have",
    "bonus points",
    "a plus",
    "preferred:",
    "preferred qualifications",
    "would be great",
    "we'd love",
)
_CULTURE_CUES = (
    "we value",
    "we believe",
    "our culture",
    "async-first",
    "remote-first",
    "work-life",
    "diverse team",
    "ownership mentality",
    "no jerks",
    "high agency",
    "move fast",
)


class StubDiscourseClassifier:
    @property
    def version(self) -> str:
        return "stub-v1"

    def classify(self, *, jd_text: str) -> list[LabeledSentence]:
        sentences = _split_sentences(jd_text)
        out: list[LabeledSentence] = []
        for i, s in enumerate(sentences):
            scores = _score_one(s)
            label = max(scores, key=lambda k: scores[k])
            # Importance roughly tracks how confident we are this sentence
            # is meaningful to the candidate. Boilerplate/legal → low;
            # filter/actual_test → high.
            importance = {
                "filter": 0.95,
                "actual_test": 0.85,
                "aspiration": 0.55,
                "culture": 0.50,
                "legal": 0.10,
                "boilerplate": 0.05,
            }[label]
            out.append(
                LabeledSentence(
                    sentence_index=i,
                    text=s,
                    function=label,
                    function_logits=scores,
                    importance=importance,
                )
            )
        return out


def _score_one(sentence: str) -> dict[str, float]:
    """Heuristic per-class scoring. Returns logits-like distribution
    summing to 1.0 (post-normalization). Default mass goes to
    `actual_test` so unmatched substantive content is not silently
    classified as boilerplate."""
    s = sentence.lower()

    base = {
        "filter": 0.05,
        "actual_test": 0.35,  # default majority
        "aspiration": 0.10,
        "culture": 0.10,
        "legal": 0.05,
        "boilerplate": 0.05,
    }

    def _hit(cues: tuple[str, ...]) -> bool:
        return any(c in s for c in cues)

    if _hit(_LEGAL_CUES):
        base["legal"] += 0.80
    if _hit(_BOILERPLATE_CUES):
        base["boilerplate"] += 0.80
    if _hit(_FILTER_CUES):
        base["filter"] += 0.80
    if _hit(_ASPIRATION_CUES):
        base["aspiration"] += 0.80
    if _hit(_CULTURE_CUES):
        base["culture"] += 0.80

    # Normalize so the dict reads as probabilities. The proto field
    # name says "logits" but the contract is an ordered distribution;
    # the TS side just renders the argmax.
    total = sum(base.values())
    return {k: v / total for k, v in base.items()}


# ─────────── real implementation (lazy) ───────────


_HYPOTHESIS_TEMPLATES: dict[str, str] = {
    "filter": "This sentence states a hard requirement that disqualifies candidates who don't meet it.",
    "actual_test": "This sentence describes the substantive responsibilities or technical work of the role.",
    "aspiration": "This sentence describes a nice-to-have or preferred qualification, not a hard requirement.",
    "culture": "This sentence describes the company's culture, values, or working style.",
    "legal": "This sentence is a legal disclaimer about equal opportunity, pay transparency, or employment law.",
    "boilerplate": "This sentence is a section header or generic introductory filler.",
}


class RealDiscourseClassifier:
    """Zero-shot multi-class classifier via NLI entailment.

    For each sentence S, we compute entailment probability of S against
    each hypothesis template `H_k` ("This sentence is X"); argmax over
    k gives the function label. ONNX Runtime + DeBERTa-v3-small.
    """

    def __init__(self, *, model_id: str, cache_dir: str | None) -> None:
        self._model_id = model_id
        self._cache_dir = cache_dir
        self._tokenizer: object | None = None
        self._session: object | None = None
        self._lock = threading.Lock()

    @property
    def version(self) -> str:
        return f"{self._model_id}@nli-v1"

    def _ensure_loaded(self) -> tuple[object, object]:  # pragma: no cover — heavy
        if self._tokenizer is not None and self._session is not None:
            return self._tokenizer, self._session
        with self._lock:
            if self._tokenizer is not None and self._session is not None:
                return self._tokenizer, self._session
            from optimum.onnxruntime import (  # type: ignore[import-not-found]
                ORTModelForSequenceClassification,
            )
            from transformers import AutoTokenizer  # type: ignore[import-not-found]

            self._tokenizer = AutoTokenizer.from_pretrained(
                self._model_id,
                cache_dir=self._cache_dir,
            )
            self._session = ORTModelForSequenceClassification.from_pretrained(
                self._model_id,
                cache_dir=self._cache_dir,
                export=True,
                provider="CPUExecutionProvider",
            )
            return self._tokenizer, self._session

    def classify(self, *, jd_text: str) -> list[LabeledSentence]:  # pragma: no cover — heavy
        import numpy as np  # local import keeps the stub path numpy-free at import-time
        import torch  # type: ignore[import-not-found]

        tokenizer, session = self._ensure_loaded()
        sentences = _split_sentences(jd_text)
        out: list[LabeledSentence] = []

        for i, s in enumerate(sentences):
            entail_scores: dict[str, float] = {}
            for fn, hypothesis in _HYPOTHESIS_TEMPLATES.items():
                inputs = tokenizer(  # type: ignore[operator]
                    s,
                    hypothesis,
                    return_tensors="pt",
                    truncation=True,
                    max_length=256,
                )
                with torch.no_grad():
                    logits = session(**inputs).logits  # type: ignore[operator]
                # MNLI heads output [contradiction, neutral, entailment].
                probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
                entail_scores[fn] = float(probs[2])
            total = sum(entail_scores.values()) or 1.0
            distribution = {k: v / total for k, v in entail_scores.items()}
            label = max(distribution, key=lambda k: distribution[k])
            importance = float(np.clip(distribution[label] * 1.2, 0.0, 1.0))
            out.append(
                LabeledSentence(
                    sentence_index=i,
                    text=s,
                    function=label,
                    function_logits=distribution,
                    importance=importance,
                )
            )
        return out
