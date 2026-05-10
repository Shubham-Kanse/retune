#!/usr/bin/env bash
# Regenerate Python gRPC stubs from packages/proto/proto/ml.proto.
#
# Idempotent. Run after editing the proto file. CI runs this as part of
# `pnpm proto:check` and fails if the generated files are stale.
#
# Output:
#   src/retune_ml/grpc_gen/ml_pb2.py      — message types
#   src/retune_ml/grpc_gen/ml_pb2_grpc.py — service stubs
#   src/retune_ml/grpc_gen/__init__.py    — package marker
#
# Requires: grpcio-tools (declared in apps/ml/pyproject.toml).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROTO_DIR="$REPO_ROOT/packages/proto/proto"
OUT_DIR="$REPO_ROOT/apps/ml/src/retune_ml/grpc_gen"

mkdir -p "$OUT_DIR"
touch "$OUT_DIR/__init__.py"

# python -m grpc_tools.protoc routes through the python runtime so the
# user doesn't need a system protoc binary. grpcio-tools bundles one.
# Prefer the project's venv python so we use the pinned grpcio-tools.
PY="${PYTHON:-}"
if [[ -z "$PY" ]]; then
    if [[ -x "$REPO_ROOT/apps/ml/.venv/bin/python" ]]; then
        PY="$REPO_ROOT/apps/ml/.venv/bin/python"
    elif command -v python3 >/dev/null; then
        PY="$(command -v python3)"
    else
        echo "error: python not found; activate apps/ml/.venv or install python" >&2
        exit 1
    fi
fi

"$PY" -m grpc_tools.protoc \
    --proto_path="$PROTO_DIR" \
    --python_out="$OUT_DIR" \
    --pyi_out="$OUT_DIR" \
    --grpc_python_out="$OUT_DIR" \
    "$PROTO_DIR/ml.proto"

# Fix import path: protoc generates `import ml_pb2` (top-level), but the
# package is `retune_ml.grpc_gen.ml_pb2`. Rewrite the grpc stub to use a
# relative import.
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' \
        's/^import ml_pb2 as ml__pb2$/from . import ml_pb2 as ml__pb2/' \
        "$OUT_DIR/ml_pb2_grpc.py"
else
    sed -i \
        's/^import ml_pb2 as ml__pb2$/from . import ml_pb2 as ml__pb2/' \
        "$OUT_DIR/ml_pb2_grpc.py"
fi

echo "✓ generated → $OUT_DIR"
echo "  $(ls -1 "$OUT_DIR" | tr '\n' ' ')"
