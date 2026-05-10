# syntax=docker/dockerfile:1.7

# ─── build stage ──────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# System deps for numpy and friends.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src

# Install (production deps only — no dev/ml extras in commit #1 image).
RUN pip install --upgrade pip \
 && pip install --prefix=/install .

# ─── runtime stage ────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    RETUNE_ML_HOST=0.0.0.0 \
    RETUNE_ML_PORT=8000

WORKDIR /app

# Non-root user.
RUN groupadd --system retune \
 && useradd --system --gid retune --create-home --home-dir /home/retune retune

COPY --from=builder /install /usr/local
COPY --from=builder /build/src ./src

USER retune

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)" \
  || exit 1

CMD ["uvicorn", "retune_ml.main:app", "--host", "0.0.0.0", "--port", "8000"]
