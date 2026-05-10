"""Span-extraction endpoint.

Stub: regex+lexicon over a curated vocabulary.
Real: GLiNER multi-task large v0.5, lazy-loaded.

Both produce `ExtractSpansResponse`-shape outputs; the choice is
controlled by `RETUNE_ML_USE_STUBS`. See `handlers.extract_spans_handler`.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from retune_ml.contracts import ExtractSpansRequest, ExtractSpansResponse
from retune_ml.handlers import HandlerError, extract_spans_handler

router = APIRouter(tags=["sensory"])


@router.post("/extract-spans", response_model=ExtractSpansResponse)
def extract_spans(req: ExtractSpansRequest) -> ExtractSpansResponse:
    """HTTP/JSON façade — pure work in `handlers.extract_spans_handler`."""
    try:
        return extract_spans_handler(
            text=req.text,
            source_doc_kind=req.source_doc_kind,
            span_kinds=list(req.span_kinds),
        )
    except HandlerError as e:
        status = 400 if e.code == "invalid_input" else 503
        raise HTTPException(status_code=status, detail=str(e)) from e
