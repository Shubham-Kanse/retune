"""Discourse-function classification endpoint.

Stub: cue-phrase heuristics over a curated JD vocabulary.
Real: DeBERTa-v3-small zero-shot NLI, lazy-loaded.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from retune_ml.contracts import ClassifyDiscourseRequest, ClassifyDiscourseResponse
from retune_ml.handlers import HandlerError, classify_discourse_handler

router = APIRouter(tags=["comprehension"])


@router.post("/classify-discourse", response_model=ClassifyDiscourseResponse)
def classify_discourse(req: ClassifyDiscourseRequest) -> ClassifyDiscourseResponse:
    try:
        return classify_discourse_handler(jd_text=req.jd_text)
    except HandlerError as e:
        status = 400 if e.code == "invalid_input" else 503
        raise HTTPException(status_code=status, detail=str(e)) from e
