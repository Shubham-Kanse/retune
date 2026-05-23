#!/usr/bin/env bash
#
# Retune one-command setup (Charter 20 Epic 01).
#
# Goes from a fresh `git clone` to a running dev environment in one shot.
#
# Steps:
#   1. Verify host prerequisites (node, pnpm, docker, python3).
#   2. Install workspace dependencies (`pnpm install`).
#   3. Bootstrap `.env` from `.env.example` if missing (with placeholders
#      that fail-fast at startup until real values land).
#   4. Bring up the dev infra stack (`infra/compose/dev.yml`): postgres,
#      redis, temporal, ml.
#   5. Run database migrations.
#   6. Run the startup self-checks across api/web/worker.
#
# Skip steps via env flags:
#   SKIP_DOCKER=1 ./scripts/setup.sh    # don't try to start docker stack
#   SKIP_INSTALL=1 ./scripts/setup.sh   # skip pnpm install
#   SKIP_MIGRATE=1 ./scripts/setup.sh   # skip db:migrate

set -euo pipefail

cd "$(dirname "$0")/.."

# ─── Colours (no-op when stdout isn't a tty) ──────────────────────────
if [ -t 1 ]; then
  GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; CYAN="\033[36m"; RESET="\033[0m"
else
  GREEN=""; YELLOW=""; RED=""; CYAN=""; RESET=""
fi

ok()    { echo -e "${GREEN}✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $1"; }
fail()  { echo -e "${RED}✗${RESET} $1"; exit 1; }
step()  { echo -e "\n${CYAN}━━━ $1 ━━━${RESET}"; }

# ─── Step 1: prerequisites ────────────────────────────────────────────
step "Step 1/6 — Verify prerequisites"

require_cmd() {
  local name="$1" min="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "$name is required (>= $min). Install it then re-run."
  fi
  ok "$name found: $(command -v "$name")"
}

require_cmd node "22.x"
require_cmd pnpm "10.x"
require_cmd python3 "3.11"

# Docker is optional if SKIP_DOCKER=1.
if [ "${SKIP_DOCKER:-0}" != "1" ]; then
  if command -v docker >/dev/null 2>&1; then
    ok "docker found: $(command -v docker)"
  else
    warn "docker not found — set SKIP_DOCKER=1 to skip the infra stack."
    fail "docker required. Install Docker Desktop or set SKIP_DOCKER=1."
  fi
fi

# Node major-version check.
node_major=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$node_major" -lt 22 ]; then
  fail "node 22+ required (found $(node -v)). Install with nvm/Volta and retry."
fi
ok "node version $(node -v) is compatible"

# ─── Step 2: install dependencies ─────────────────────────────────────
step "Step 2/6 — Install workspace dependencies"
if [ "${SKIP_INSTALL:-0}" = "1" ]; then
  warn "SKIP_INSTALL=1 — skipping pnpm install"
else
  pnpm install --frozen-lockfile || pnpm install
  ok "pnpm install complete"
fi

# ─── Step 3: bootstrap .env ───────────────────────────────────────────
step "Step 3/6 — Bootstrap environment"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    ok "created .env from .env.example"
    warn "PLACEHOLDER values in .env — replace before running production."
  else
    fail ".env.example missing — cannot bootstrap"
  fi
else
  ok ".env already exists"
fi

# ─── Step 4: dev infra (docker-compose) ───────────────────────────────
step "Step 4/6 — Start dev infrastructure"
if [ "${SKIP_DOCKER:-0}" = "1" ]; then
  warn "SKIP_DOCKER=1 — skipping infra stack"
else
  if [ -f infra/compose/dev.yml ]; then
    docker compose -f infra/compose/dev.yml up -d
    ok "dev infra started (postgres, redis, temporal, ml)"
  elif [ -f docker-compose.yml ]; then
    docker compose up -d postgres
    ok "postgres started (root docker-compose.yml)"
  else
    warn "no docker-compose file found — skipping infra"
  fi
fi

# ─── Step 5: db migrations ────────────────────────────────────────────
step "Step 5/6 — Run database migrations"
if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
  warn "SKIP_MIGRATE=1 — skipping db:migrate"
else
  if pnpm db:migrate 2>&1; then
    ok "migrations applied"
  else
    warn "migrations failed — see logs above. The dev DB may not be reachable yet."
    warn "If postgres is still booting, wait 10s then run: pnpm db:migrate"
  fi
fi

# ─── Step 6: startup self-check ───────────────────────────────────────
step "Step 6/6 — Run startup self-checks"
if pnpm startup:selfcheck 2>&1; then
  ok "all services pass startup self-check"
else
  warn "self-check reported issues — review the output above"
fi

# ─── Done ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}✓ Retune setup complete${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with real values for Supabase, AI provider, JWT_SECRET"
echo "  2. Run:   pnpm dev          # start all services"
echo "  3. Visit: http://localhost:3000"
echo ""
