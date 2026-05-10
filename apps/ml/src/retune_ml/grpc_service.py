"""gRPC servicer that hosts the `ML` service from `proto/ml.proto`.

Sits next to the FastAPI HTTP routes — same handler logic, two
transports. The cross-process boundary that the TS cognitive workbench
talks to in production is gRPC; the HTTP path stays for human-friendly
debugging via the FastAPI /docs UI.

Wire-format conversions:
  - embeddings: list[float] (handler) → bytes (proto wire) via
    np.float32 little-endian packing
  - field-name: snake_case (handler / Pydantic) → camelCase (proto)
  - errors: HandlerError → grpc.StatusCode (INVALID_ARGUMENT / UNAVAILABLE)
"""

from __future__ import annotations

import struct

import grpc

import json

from retune_ml.grpc_gen import ml_pb2, ml_pb2_grpc
from retune_ml.handlers import (
    HandlerError,
    classify_discourse_handler,
    embed_handler,
    extract_spans_handler,
    health_handler,
)
from retune_ml.lib.logging import get_logger

log = get_logger(__name__)


def _embedding_to_bytes(values: list[float]) -> bytes:
    """Pack a list[float] into little-endian float32 bytes (matches the
    TS GrpcTransport's bytes_to_floats() decoder)."""
    return struct.pack(f"<{len(values)}f", *values)


class MLService(ml_pb2_grpc.MLServicer):
    async def Health(  # noqa: N802 — protoc-gen-grpc-python uses PascalCase
        self,
        request: ml_pb2.HealthRequest,  # noqa: ARG002
        context: grpc.aio.ServicerContext,  # noqa: ARG002
    ) -> ml_pb2.HealthResponse:
        out = health_handler()
        return ml_pb2.HealthResponse(
            status=out.status,
            service=out.service,
            version=out.version,
            uptime_seconds=out.uptime_seconds,
            models_loaded=list(out.models_loaded),
        )

    async def Embed(  # noqa: N802
        self,
        request: ml_pb2.EmbedRequest,
        context: grpc.aio.ServicerContext,
    ) -> ml_pb2.EmbedResponse:
        try:
            out = embed_handler(texts=list(request.texts), model=request.model)
        except HandlerError as e:
            code = (
                grpc.StatusCode.INVALID_ARGUMENT
                if e.code == "invalid_model"
                else grpc.StatusCode.UNAVAILABLE
            )
            await context.abort(code, str(e))
            raise  # unreachable; abort raises

        return ml_pb2.EmbedResponse(
            embeddings=[_embedding_to_bytes(vec) for vec in out.embeddings],
            model_version=out.model_version,
            latency_ms=out.latency_ms,
        )

    async def ExtractSpans(  # noqa: N802
        self,
        request: ml_pb2.ExtractSpansRequest,
        context: grpc.aio.ServicerContext,
    ) -> ml_pb2.ExtractSpansResponse:
        try:
            out = extract_spans_handler(
                text=request.text,
                source_doc_kind=request.source_doc_kind,
                span_kinds=list(request.span_kinds),
            )
        except HandlerError as e:
            code = (
                grpc.StatusCode.INVALID_ARGUMENT
                if e.code == "invalid_input"
                else grpc.StatusCode.UNAVAILABLE
            )
            await context.abort(code, str(e))
            raise

        proto_spans = [
            ml_pb2.Span(
                kind=s.kind,
                text=s.text,
                char_start=s.char_start,
                char_end=s.char_end,
                confidence=ml_pb2.Confidence(
                    point=s.confidence.point,
                    lower=s.confidence.lower,
                    upper=s.confidence.upper,
                    coverage=s.confidence.coverage,
                ),
                payload_json=json.dumps(s.payload, separators=(",", ":")),
            )
            for s in out.spans
        ]
        return ml_pb2.ExtractSpansResponse(
            spans=proto_spans,
            model_version=out.model_version,
            latency_ms=out.latency_ms,
        )

    async def ClassifyDiscourse(  # noqa: N802
        self,
        request: ml_pb2.ClassifyDiscourseRequest,
        context: grpc.aio.ServicerContext,
    ) -> ml_pb2.ClassifyDiscourseResponse:
        try:
            out = classify_discourse_handler(jd_text=request.jd_text)
        except HandlerError as e:
            code = (
                grpc.StatusCode.INVALID_ARGUMENT
                if e.code == "invalid_input"
                else grpc.StatusCode.UNAVAILABLE
            )
            await context.abort(code, str(e))
            raise

        # Logits in the proto are a `repeated double` in the stable
        # category order from `discourse_classifier.DISCOURSE_FUNCTIONS`.
        # The TS side reconstructs the dict by zipping with that order.
        from retune_ml.models.discourse_classifier import DISCOURSE_FUNCTIONS

        proto_sentences = [
            ml_pb2.DiscourseLabeledSentence(
                sentence_index=s.sentence_index,
                text=s.text,
                function=s.function,
                function_logits=[s.function_logits.get(k, 0.0) for k in DISCOURSE_FUNCTIONS],
                importance=s.importance,
            )
            for s in out.sentences
        ]
        return ml_pb2.ClassifyDiscourseResponse(
            sentences=proto_sentences,
            model_version=out.model_version,
            latency_ms=out.latency_ms,
        )

    # ─────────── Other RPCs land in commits #8+ ───────────
    # protoc-gen-grpc-python's auto-generated MLServicer base raises
    # UNIMPLEMENTED for every method we don't override.


async def make_server(
    *,
    address: str = "0.0.0.0:9090",
    max_workers: int | None = None,
) -> grpc.aio.Server:
    """Build and start an aio gRPC server hosting `MLService`.

    Caller is responsible for `await server.wait_for_termination()`.
    """
    server = grpc.aio.server(
        options=[
            ("grpc.max_send_message_length", 64 * 1024 * 1024),
            ("grpc.max_receive_message_length", 64 * 1024 * 1024),
        ]
    )
    if max_workers is not None:  # pragma: no cover — currently unused
        log.info("grpc_max_workers_set", max_workers=max_workers)

    ml_pb2_grpc.add_MLServicer_to_server(MLService(), server)
    server.add_insecure_port(address)
    await server.start()
    log.info("grpc_server_started", address=address)
    return server
