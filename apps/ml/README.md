# `apps/ml` — Retune ML compute layer

Python FastAPI service. The brain's perceptual + generative cortex.

The TypeScript cognitive workbench in `packages/agent` calls into this
service for every operation that requires a real ML model:

- Embeddings (`bge-large-en-v1.5` LoRA on resume corpus)
- Span extraction (GLiNER multi-task)
- Discourse classification (DeBERTa-v3-small)
- Contradiction detection (DeBERTa NLI)
- Reader simulation (DeBERTa multi-head)
- Composition (`Qwen2.5-14B-AWQ` via vLLM)
- Critic ensemble (distilled `Qwen2.5-32B-AWQ`)
- Outcome prediction (XGBoost → transformer)
- Evidence solver (OR-tools CP-SAT)
- Fairness audit (counterfactual perturbations)
- ATS vendor parser simulation

## Status — commit #1

This is the foundation skeleton. Endpoints exposed:

- `GET /health` — liveness + loaded-models manifest
- `POST /embed` — deterministic stub (real `bge-large` LoRA in commit #3)

Subsequent commits flesh out one cognitive subsystem per week, per the
12-week plan in the techspec.

## Run locally

```sh
cd apps/ml
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn retune_ml.main:app --reload --port 8000
```

Then from the repo root:

```sh
curl http://localhost:8000/health
curl -X POST http://localhost:8000/embed \
  -H 'content-type: application/json' \
  -d '{"texts": ["hello"], "model": "bge-large-en-v1.5"}'
```

## Run inside docker-compose

```sh
docker compose -f infra/compose/dev.yml up ml-service
```

## Design notes

- **HTTP/JSON now, gRPC later.** Wire format is JSON for commit #1; the
  proto in `packages/proto/proto/ml.proto` is the source of truth and
  codegen lands in commit #2 without changing the contract shape.
- **Deterministic stubs first.** Every endpoint returns plausible,
  shape-correct output before the real model is wired. This lets the
  TS workbench be developed end-to-end against a stable contract.
- **No model loaded at import time.** Models lazy-load on first request
  through `models/registry.py`, which lets `pytest` import the app
  without a GPU.
- **Strict typing.** Pyright strict mode. Pydantic everywhere at the
  boundary. Zero `Any` in non-test code.
