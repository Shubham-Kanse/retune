"""Embedding endpoint.

Commit #1 returns a deterministic, shape-correct stub so the TS workbench
can wire its ML client end-to-end against a stable contract. The real
`bge-large-en-v1.5` LoRA model is loaded in commit #3.

The stub uses a hash-derived seed per text to produce reproducible 768-dim
unit vectors. Identical text → identical embedding; tests can rely on this.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from retune_ml.contracts import EmbedRequest, EmbedResponse
from retune_ml.handlers import HandlerError, embed_handler

router = APIRouter(tags=["sensory"])


@router.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """HTTP/JSON façade — pure work in `handlers.embed_handler`."""
    try:
        return embed_handler(texts=req.texts, model=req.model)
    except HandlerError as e:
        status = 400 if e.code in {"invalid_model"} else 503
        raise HTTPException(status_code=status, detail=str(e)) from e
