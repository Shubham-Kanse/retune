#!/usr/bin/env bash
#
# Retune issue reproduction helper (Charter 20 Epic 01).
#
# Captures environment state into a repro-<issue>.txt file that can be
# attached to a GitHub issue. Does NOT capture secret values — only
# checks whether env vars are set.
#
# Usage:
#   ./scripts/repro-issue.sh <issue-number>
#   ./scripts/repro-issue.sh 42
#
# Output: repro-42.txt in the current directory.

set -euo pipefail

cd "$(dirname "$0")/.."

ISSUE="${1:-unknown}"
OUT="repro-${ISSUE}.txt"

echo "Capturing repro info for issue #${ISSUE}…"

{
  echo "=== Retune Issue Repro: #${ISSUE} ==="
  echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo ""

  echo "=== System ==="
  echo "OS: $(uname -srm)"
  echo "Node: $(node --version 2>/dev/null || echo 'not found')"
  echo "pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
  echo "Python: $(python3 --version 2>/dev/null || echo 'not found')"
  echo "Docker: $(docker --version 2>/dev/null || echo 'not found')"
  echo ""

  echo "=== Git ==="
  echo "Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
  echo "Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
  echo ""
  echo "Recent commits:"
  git log --oneline -10 2>/dev/null || echo "(git log failed)"
  echo ""

  echo "=== Environment (presence only — no values) ==="
  check_env() {
    local var="$1"
    if [ -n "${!var:-}" ]; then
      echo "  $var: SET"
    else
      echo "  $var: NOT SET"
    fi
  }
  check_env AI_PROVIDER
  check_env ANTHROPIC_API_KEY
  check_env OPENAI_API_KEY
  check_env RETUNE_PERSIST
  check_env RETUNE_DATABASE_URL
  check_env RETUNE_TEMPORAL
  check_env RETUNE_TEMPORAL_ADDRESS
  check_env JWT_SECRET
  check_env NEXT_PUBLIC_SUPABASE_URL
  check_env NEXT_PUBLIC_SUPABASE_ANON_KEY
  check_env SUPABASE_SERVICE_ROLE_KEY
  check_env RETUNE_ML_TRANSPORT
  check_env RETUNE_ML_BASE_URL
  echo ""

  echo "=== TypeScript diagnostics ==="
  echo "--- packages/agent ---"
  npx tsc --noEmit -p packages/agent/tsconfig.json 2>&1 | head -30 || true
  echo ""
  echo "--- apps/web ---"
  (cd apps/web && npx tsc --noEmit 2>&1 | head -30) || true
  echo ""
  echo "--- apps/api ---"
  npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -30 || true
  echo ""

  echo "=== Package versions (key deps) ==="
  node -e "
    const fs = require('fs');
    const lock = JSON.parse(fs.readFileSync('pnpm-lock.yaml', 'utf8').replace(/^---\n/, ''));
  " 2>/dev/null || true
  # Fallback: read from package.json
  node -e "
    const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const keys = ['next', 'react', 'typescript', '@anthropic-ai/sdk', 'openai', 'drizzle-orm', 'hono', '@temporalio/client'];
    for (const k of keys) {
      if (deps[k]) console.log('  ' + k + ': ' + deps[k]);
    }
  " 2>/dev/null || echo "  (could not read package.json)"
  echo ""

  echo "=== pnpm workspace packages ==="
  pnpm list --depth=0 2>/dev/null | head -40 || echo "(pnpm list failed)"
  echo ""

  echo "=== End of repro ==="
} > "$OUT" 2>&1

echo "✓ Repro captured: $OUT"
echo "  Attach this file to GitHub issue #${ISSUE}"
