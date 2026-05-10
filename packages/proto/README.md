# @retune/proto

Source-of-truth gRPC contracts for the boundary between the TS cognitive
workbench (`packages/agent`) and the Python ML compute layer (`apps/ml`).

## Status (commit #4)

Codegen pipeline live. Buf + `protoc-gen-es` for TS; `grpcio-tools` for Python.

```sh
# Regenerate TS stubs into gen/ts/
pnpm --filter @retune/proto generate

# Regenerate Python stubs into apps/ml/src/retune_ml/grpc_gen/
pnpm --filter @retune/proto generate:py

# Lint the proto file (style + breaking-change checks)
pnpm --filter @retune/proto lint
```

Both runs are idempotent. CI runs both and fails if the generated files
are stale relative to `proto/ml.proto`.

## Earlier status

Proto definitions are committed; codegen is **deferred to commit #2**.
Until then both sides transport over HTTP/JSON, with payloads validated by
zod on the TS side (`packages/types/src/ml-contracts.ts`) and by Pydantic
on the Python side (`apps/ml/src/retune_ml/contracts.py`).

This is intentional: the contract is fixed, but the wire format upgrade
to gRPC is a follow-up that doesn't block week-1 foundation work.

## Files

- `proto/ml.proto` — RPCs exposed by `apps/ml`
- `proto/workbench_events.proto` — cross-service event envelopes
  (added when Temporal worker introduces durable cross-service events)

## Codegen plan (commit #2)

```sh
# TS
pnpm dlx @bufbuild/buf generate
# Python
python -m grpc_tools.protoc -I packages/proto/proto \
  --python_out=apps/ml/src/retune_ml/generated \
  --grpc_python_out=apps/ml/src/retune_ml/generated \
  packages/proto/proto/ml.proto
```
