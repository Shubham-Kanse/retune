"""Runtime configuration, parsed from environment variables."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the ML service.

    All values are overridable via environment variables prefixed `RETUNE_ML_`.
    """

    model_config = SettingsConfigDict(
        env_prefix="RETUNE_ML_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "retune-ml"
    version: str = "0.1.0"
    log_level: str = "INFO"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # gRPC co-server (commit #5). When enabled, the FastAPI lifespan
    # spawns an aio gRPC server on `grpc_port` alongside the HTTP server.
    grpc_enabled: bool = True
    grpc_port: int = 9090

    # Embedding defaults — bge-large-en-v1.5 with continue-pretrained LoRA.
    embedding_dim: int = Field(default=768, frozen=True)
    embedding_default_model: str = "bge-large-en-v1.5"

    # Observability
    otel_enabled: bool = False
    otel_endpoint: str | None = None

    # When True, deterministic stubs are returned. The real model paths
    # (BGE embedder + GLiNER extractor) are exercised when this is False,
    # which requires `pip install -e ".[heavy]"` and a populated cache.
    use_stubs: bool = True

    # Real-model configuration (used when use_stubs=False).
    # Cache dir is $XDG_CACHE_HOME / retune-ml by default; HF Hub uses it.
    model_cache_dir: str | None = None
    bge_model_id: str = "BAAI/bge-large-en-v1.5"
    gliner_model_id: str = "urchade/gliner_multitask-large-v0.5"
    # Zero-shot NLI model for discourse classification. The standard
    # public choice that fits in INT8 ONNX under 100MB.
    discourse_model_id: str = "MoritzLaurer/DeBERTa-v3-small-mnli-fever-anli-ling-binary"


_settings: Settings | None = None


def get_settings() -> Settings:
    """Process-singleton settings."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
