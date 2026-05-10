"""FastAPI app — entry point for the ML compute layer.

Run locally:
    uvicorn retune_ml.main:app --reload --port 8000
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from retune_ml.lib.logging import configure_logging, get_logger
from retune_ml.routes import classify_discourse as classify_discourse_routes
from retune_ml.routes import embed as embed_routes
from retune_ml.routes import extract_spans as extract_spans_routes
from retune_ml.routes import health as health_routes
from retune_ml.settings import get_settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    log = get_logger(__name__)
    log.info(
        "retune_ml_startup",
        version=settings.version,
        port=settings.port,
        use_stubs=settings.use_stubs,
        grpc_enabled=settings.grpc_enabled,
        grpc_port=settings.grpc_port,
    )

    # Optionally co-host a gRPC server in the same process. The TS
    # GrpcTransport talks to this server in production; HTTP stays
    # available for human-friendly debugging via /docs.
    grpc_server = None
    if settings.grpc_enabled:
        from retune_ml.grpc_service import make_server

        grpc_server = await make_server(address=f"0.0.0.0:{settings.grpc_port}")

    try:
        yield
    finally:
        if grpc_server is not None:
            await grpc_server.stop(grace=2.0)
            log.info("grpc_server_stopped")
        log.info("retune_ml_shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Retune ML",
        description="The brain's perceptual + generative cortex.",
        version=settings.version,
        lifespan=lifespan,
        # OpenAPI / docs are useful in dev; turned off in prod via settings.
        docs_url="/docs",
        redoc_url=None,
    )

    # CORS — dev only. Production is gated behind apps/api which is the
    # only legitimate caller.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_routes.router)
    app.include_router(embed_routes.router)
    app.include_router(extract_spans_routes.router)
    app.include_router(classify_discourse_routes.router)

    return app


app = create_app()
