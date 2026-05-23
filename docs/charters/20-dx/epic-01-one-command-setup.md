# Epic 01 — One-Command Setup

## Goal

Any developer — on macOS, Linux, or in a GitHub Codespace — can go from `git clone` to a fully running Retune stack with a single command. Prerequisites are validated, infrastructure is provisioned, the database is migrated and seeded, and the developer is told exactly what to do next.

## Current State

- `pnpm dev` starts all apps but does not check prerequisites or seed data.
- `scripts/seed.ts` (11 KB) exists but is not documented in README and not run automatically.
- `apps/api/scripts/startup-selfcheck.mjs` (1310 bytes) and `apps/web/scripts/startup-selfcheck.mjs` (921 bytes) exist but are not invoked.
- No devcontainer configuration.
- README lists manual steps (`pnpm install`, `pnpm db:up`, `pnpm db:migrate`) separately with no single entry point.

---

## Story 1: Create Devcontainer Configuration

### User Story

As a developer opening this repo in VS Code or GitHub Codespaces, I want the environment to be fully provisioned automatically so that I can start coding without installing Node, Python, pnpm, or Docker manually.

### Acceptance Criteria

- [ ] `.devcontainer/devcontainer.json` exists and is valid JSON.
- [ ] Container uses `mcr.microsoft.com/devcontainers/typescript-node:22` as base image.
- [ ] Python 3.12, pnpm 10, and Docker-in-Docker are available inside the container.
- [ ] `pnpm install` runs automatically after container creation.
- [ ] All required env vars from `.env.example` are set as container env vars with placeholder values.
- [ ] Opening the repo in VS Code with Dev Containers extension triggers the devcontainer build without errors.

### Tasks

#### Task 1.1: Create `.devcontainer/devcontainer.json`

**File:** `.devcontainer/devcontainer.json`

```json
{
  "name": "Retune Dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "features": {
    "ghcr.io/devcontainers/features/python:1": {
      "version": "3.12"
    },
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers-contrib/features/pnpm:2": {
      "version": "10"
    }
  },
  "postCreateCommand": "pnpm install",
  "containerEnv": {
    "NEXT_PUBLIC_SUPABASE_URL": "https://your-project-ref.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
    "RETUNE_DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/retune",
    "RETUNE_DB_KIND": "postgres",
    "NEXT_PUBLIC_APP_URL": "http://localhost:3000",
    "NEXT_PUBLIC_API_URL": "http://localhost:4000",
    "AI_PROVIDER": "openai",
    "OPENAI_API_KEY": "sk-placeholder",
    "SMTP_HOST": "mail.privateemail.com",
    "SMTP_PORT": "465",
    "SMTP_USER": "hello@retuned.cv",
    "SMTP_PASS": "placeholder",
    "SMTP_FROM": "hello@retuned.cv",
    "RETUNE_ML_USE_STUBS": "true",
    "RETUNE_API_CORS": "*"
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "biomejs.biome",
        "ms-azuretools.vscode-docker"
      ]
    }
  }
}
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Create `.devcontainer/` directory | 1 min |
| 1.1.2 | Write `devcontainer.json` with base image, features, env vars | 15 min |
| 1.1.3 | Test build in VS Code Dev Containers locally | 10 min |
| 1.1.4 | Test build in GitHub Codespaces | 10 min |

### Tests

**Test: Devcontainer builds successfully**

```bash
# From repo root, validate JSON syntax
node -e "JSON.parse(require('fs').readFileSync('.devcontainer/devcontainer.json','utf8'))"

# Verify required keys exist
node -e "
const dc = JSON.parse(require('fs').readFileSync('.devcontainer/devcontainer.json','utf8'));
console.assert(dc.image.includes('typescript-node:22'), 'Base image must be typescript-node:22');
console.assert(dc.features['ghcr.io/devcontainers/features/python:1'].version === '3.12', 'Python 3.12 required');
console.assert(dc.postCreateCommand === 'pnpm install', 'postCreateCommand must run pnpm install');
console.assert(dc.containerEnv.NEXT_PUBLIC_SUPABASE_URL, 'Must set NEXT_PUBLIC_SUPABASE_URL');
console.assert(dc.containerEnv.RETUNE_DATABASE_URL, 'Must set RETUNE_DATABASE_URL');
console.log('All devcontainer assertions passed');
"
```

---

## Story 2: Create `scripts/setup.sh`

### User Story

As a developer cloning Retune for the first time, I want to run a single script that validates my machine has the right tools, provisions infrastructure, and seeds the database so that I don't have to read and execute multiple manual steps.

### Acceptance Criteria

- [ ] `scripts/setup.sh` is executable (`chmod +x`).
- [ ] Script exits with code 1 and a clear error message if any prerequisite check fails.
- [ ] Checks Node.js >= 22, pnpm >= 10, Docker running, Python >= 3.11.
- [ ] Copies `.env.example` to `.env` if `.env` doesn't already exist (does not overwrite).
- [ ] Runs `pnpm install`.
- [ ] Runs `pnpm db:up && pnpm db:migrate`.
- [ ] Runs `pnpm --filter @retune/db exec tsx scripts/seed.ts`.
- [ ] Prints a success message with next steps (`pnpm dev`).
- [ ] Script is idempotent — running it twice does not break anything.

### Tasks

#### Task 2.1: Create `scripts/setup.sh`

**File:** `scripts/setup.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔧 Retune Setup"
echo "================"
echo ""

# --- Prerequisite Checks ---

echo "Checking prerequisites..."

# Node.js >= 22
if ! node --version | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  echo -e "${RED}✗ Node.js >= 22 required. Found: $(node --version 2>/dev/null || echo 'not installed')${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# pnpm >= 10
if ! pnpm --version | grep -qE '^1[0-9]'; then
  echo -e "${RED}✗ pnpm >= 10 required. Found: $(pnpm --version 2>/dev/null || echo 'not installed')${NC}"
  exit 1
fi
echo -e "${GREEN}✓ pnpm $(pnpm --version)${NC}"

# Docker running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running. Please start Docker Desktop.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Python >= 3.11
if ! python3 --version | grep -qE '3\.(1[1-9]|[2-9][0-9])'; then
  echo -e "${RED}✗ Python >= 3.11 required. Found: $(python3 --version 2>/dev/null || echo 'not installed')${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Python $(python3 --version)${NC}"

echo ""

# --- Environment ---

if [ ! -f .env ]; then
  echo -e "${YELLOW}Copying .env.example → .env${NC}"
  cp .env.example .env
else
  echo -e "${GREEN}✓ .env already exists (not overwriting)${NC}"
fi

echo ""

# --- Install ---

echo "Installing dependencies..."
pnpm install

echo ""

# --- Database ---

echo "Provisioning database..."
pnpm db:up && pnpm db:migrate

echo ""

# --- Seed ---

echo "Seeding database..."
pnpm --filter @retune/db exec tsx scripts/seed.ts

echo ""

# --- Done ---

echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Retune setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys (OPENAI_API_KEY or ANTHROPIC_API_KEY)"
echo "  2. Run: pnpm dev"
echo ""
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Create `scripts/setup.sh` with prerequisite checks | 20 min |
| 2.1.2 | Add env copy logic | 5 min |
| 2.1.3 | Add install, db, and seed steps | 10 min |
| 2.1.4 | Add success message and next steps | 5 min |
| 2.1.5 | `chmod +x scripts/setup.sh` | 1 min |
| 2.1.6 | Test on clean clone (macOS) | 15 min |
| 2.1.7 | Test idempotency (run twice) | 5 min |

### Tests

**Test: Prerequisite check fails gracefully**

```bash
# Simulate missing Node by overriding PATH
(
  export PATH="/usr/bin"
  output=$(bash scripts/setup.sh 2>&1 || true)
  echo "$output" | grep -q "Node.js >= 22 required" && echo "PASS: Node check" || echo "FAIL: Node check"
)
```

**Test: Script is executable**

```bash
test -x scripts/setup.sh && echo "PASS: executable" || echo "FAIL: not executable"
```

**Test: .env not overwritten if exists**

```bash
echo "EXISTING=true" > .env.test-backup
cp .env .env.test-backup 2>/dev/null || true
# Run setup (would need full env to pass checks)
# After run: diff .env .env.test-backup should show no change
```

**Test: Full integration (CI)**

```bash
# In a clean Docker container with all prerequisites:
git clone <repo> /tmp/retune-test
cd /tmp/retune-test
./scripts/setup.sh
# Assert exit code 0
test $? -eq 0 && echo "PASS: setup completed" || echo "FAIL: setup failed"
# Assert database is seeded
pnpm --filter @retune/db exec tsx -e "
import { db } from './src/index';
const count = await db.query.users.findMany();
process.exit(count.length > 0 ? 0 : 1);
"
```

---

## Story 3: Update README with One-Command Setup

### User Story

As a developer reading the README, I want to see a single command to get started so that I don't have to piece together multiple manual steps.

### Acceptance Criteria

- [ ] README "Quick Start" section shows `./scripts/setup.sh && pnpm dev` as the primary path.
- [ ] Previous manual steps are preserved under a "Manual Setup" collapsible section for reference.
- [ ] Devcontainer option is mentioned as an alternative.

### Tasks

#### Task 3.1: Update README Quick Start section

**File:** `README.md`

Replace the current Quick Start section with:

```markdown
## Quick Start

```bash
git clone <repo-url> && cd retune
./scripts/setup.sh && pnpm dev
```

The setup script validates prerequisites (Node 22+, pnpm 10+, Docker, Python 3.11+), installs dependencies, provisions the database, and seeds initial data.

**Alternative: GitHub Codespaces / VS Code Dev Containers**

Open this repo in a Codespace or with the Dev Containers extension — the environment is fully configured via `.devcontainer/devcontainer.json`.

<details>
<summary>Manual Setup (advanced)</summary>

### Prerequisites

- Node.js 22+
- `pnpm` 10+
- Docker (recommended for Postgres)
- Python 3.11+ (required for document generation and ML service)

### Install

```bash
pnpm install
```

### Infra + DB

```bash
pnpm db:up
pnpm db:migrate
```

### Seed

```bash
pnpm --filter @retune/db exec tsx scripts/seed.ts
```

### Run

```bash
pnpm dev
```

</details>
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Replace Quick Start section in README.md | 10 min |
| 3.1.2 | Add devcontainer mention | 5 min |
| 3.1.3 | Wrap old steps in `<details>` collapsible | 5 min |
| 3.1.4 | Verify markdown renders correctly | 5 min |

### Tests

**Test: README contains one-command setup**

```bash
grep -q "scripts/setup.sh" README.md && echo "PASS: setup.sh referenced" || echo "FAIL"
grep -q "pnpm dev" README.md && echo "PASS: pnpm dev referenced" || echo "FAIL"
grep -q "devcontainer" README.md && echo "PASS: devcontainer mentioned" || echo "FAIL"
```

---

## Summary

| Story | Files Created/Modified | Effort Estimate |
|-------|----------------------|-----------------|
| 1. Devcontainer | `.devcontainer/devcontainer.json` | 0.5 day |
| 2. Setup Script | `scripts/setup.sh` | 1 day |
| 3. README Update | `README.md` | 0.5 day |
| **Total** | | **2 days** |
