# Epic 03 — Pre-Commit Hooks

## Goal

Prevent secrets, lint failures, and formatting issues from reaching the remote repository by installing automated pre-commit hooks that run on every commit. Harden `.gitignore` to close known gaps and remove already-committed `.env` files.

## Current State

- No pre-commit hooks — `.git/hooks/` has only `.sample` files.
- `.gitignore` does NOT exclude: `apps/web/data/`, `**/*.bak`, `**/.tmp-*`, `keys/`, `.env.vercel`.
- `apps/web/.env` (2391 bytes) and `apps/api/.env` (1966 bytes) are committed with local dev values.
- Biome is configured as the project linter/formatter but is not enforced before commit.
- No secret scanning in the development workflow.

---

## Story 1: Install and Configure Husky + lint-staged

### User Story

As a developer committing code, I want lint and format checks to run automatically on staged files so that I never push code that fails CI lint checks.

### Acceptance Criteria

- [ ] `husky` and `lint-staged` are in root `package.json` devDependencies.
- [ ] `.husky/pre-commit` hook exists and is executable.
- [ ] `lint-staged` runs `biome check --write` on staged `*.{ts,tsx}` files.
- [ ] `lint-staged` runs `biome format --write` on staged `*.{json,md}` files.
- [ ] Committing a `.env*` file (except `.env.example`) is blocked with a clear error.
- [ ] Hook runs in < 5 seconds for typical commits (< 20 staged files).
- [ ] `pnpm install` automatically sets up hooks via husky's `prepare` script.

### Tasks

#### Task 1.1: Install husky and lint-staged

**Command:**

```bash
pnpm add -D husky lint-staged -w
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Run install command | 2 min |
| 1.1.2 | Verify packages appear in root `package.json` devDependencies | 1 min |

#### Task 1.2: Initialize husky

**Command:**

```bash
pnpm exec husky init
```

This creates the `.husky/` directory and adds `"prepare": "husky"` to `package.json` scripts.

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.2.1 | Run `pnpm exec husky init` | 1 min |
| 1.2.2 | Verify `.husky/` directory exists | 1 min |
| 1.2.3 | Verify `"prepare": "husky"` is in `package.json` scripts | 1 min |

#### Task 1.3: Create `.husky/pre-commit`

**File:** `.husky/pre-commit`

```bash
#!/bin/sh

# Run lint-staged on all staged files
pnpm exec lint-staged

# Secret scanning (if gitleaks is installed)
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged --no-banner
fi
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.3.1 | Write `.husky/pre-commit` with lint-staged and gitleaks commands | 5 min |
| 1.3.2 | `chmod +x .husky/pre-commit` | 1 min |
| 1.3.3 | Test hook fires on `git commit` | 5 min |

#### Task 1.4: Configure lint-staged in `package.json`

**File:** `package.json` (root)

Add the following top-level key:

```json
"lint-staged": {
  "*.{ts,tsx}": ["biome check --write"],
  "*.{json,md}": ["biome format --write"],
  ".env*": ["sh -c 'echo ERROR: Do not commit .env files && exit 1'"]
}
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.4.1 | Add `lint-staged` config to root `package.json` | 5 min |
| 1.4.2 | Test with a staged `.ts` file — verify biome runs | 5 min |
| 1.4.3 | Test with a staged `.env` file — verify commit is blocked | 5 min |

### Tests

**Test: Husky is installed and prepare script exists**

```bash
grep -q '"husky"' package.json && echo "PASS: husky in deps" || echo "FAIL"
grep -q '"lint-staged"' package.json && echo "PASS: lint-staged in deps" || echo "FAIL"
node -e "
const pkg = JSON.parse(require('fs').readFileSync('package.json','utf8'));
console.assert(pkg.scripts.prepare === 'husky', 'prepare script must be husky');
console.log('PASS: prepare script');
"
```

**Test: Pre-commit hook is executable**

```bash
test -x .husky/pre-commit && echo "PASS: hook executable" || echo "FAIL: hook not executable"
```

**Test: lint-staged blocks .env commits**

```bash
# Create a test .env file and try to commit it
echo "TEST=true" > .env.test-commit
git add .env.test-commit
output=$(git commit -m "test" 2>&1 || true)
echo "$output" | grep -q "Do not commit .env files" && echo "PASS: .env blocked" || echo "FAIL: .env not blocked"
git reset HEAD .env.test-commit
rm .env.test-commit
```

**Test: lint-staged runs biome on .ts files**

```bash
# Create a file with lint issues
echo "const x =    1;" > /tmp/test-lint.ts
cp /tmp/test-lint.ts apps/web/src/test-lint-staged.ts
git add apps/web/src/test-lint-staged.ts
git commit -m "test lint" 2>&1
# After commit, file should be formatted
grep -q "const x = 1;" apps/web/src/test-lint-staged.ts && echo "PASS: biome formatted" || echo "FAIL"
git reset HEAD~1
rm apps/web/src/test-lint-staged.ts
```

---

## Story 2: Harden `.gitignore`

### User Story

As a developer, I want `.gitignore` to exclude all known sensitive and generated file patterns so that secrets, backup files, and local data are never accidentally committed.

### Acceptance Criteria

- [ ] `.gitignore` includes `.env` and `.env.*` patterns.
- [ ] `.gitignore` explicitly un-ignores `.env.example` with `!.env.example`.
- [ ] `.gitignore` includes `keys/` and `*.pem`.
- [ ] `.gitignore` includes `apps/web/data/`.
- [ ] `.gitignore` includes `**/*.bak` and `**/.tmp-*`.
- [ ] All patterns are grouped under a clear `# Secrets & local data` comment section.

### Tasks

#### Task 2.1: Update `.gitignore`

**File:** `.gitignore`

Append the following section:

```gitignore
# Secrets & local data
.env
.env.*
!.env.example
keys/
*.pem
apps/web/data/
**/*.bak
**/.tmp-*
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Open `.gitignore` and check for existing env patterns | 2 min |
| 2.1.2 | Append secrets & local data section | 5 min |
| 2.1.3 | Verify `.env.example` is NOT ignored: `git check-ignore .env.example` should return nothing | 2 min |
| 2.1.4 | Verify `.env` IS ignored: `git check-ignore .env` should return `.env` | 2 min |
| 2.1.5 | Verify `apps/web/data/test.json` IS ignored | 2 min |
| 2.1.6 | Verify `keys/private.pem` IS ignored | 2 min |

### Tests

**Test: .gitignore patterns work correctly**

```bash
# These should be ignored
git check-ignore .env && echo "PASS: .env ignored" || echo "FAIL"
git check-ignore .env.local && echo "PASS: .env.local ignored" || echo "FAIL"
git check-ignore .env.vercel && echo "PASS: .env.vercel ignored" || echo "FAIL"
git check-ignore keys/secret.pem && echo "PASS: keys/ ignored" || echo "FAIL"
git check-ignore apps/web/data/test.json && echo "PASS: apps/web/data/ ignored" || echo "FAIL"
git check-ignore test.bak && echo "PASS: *.bak ignored" || echo "FAIL"
git check-ignore .tmp-something && echo "PASS: .tmp-* ignored" || echo "FAIL"

# This should NOT be ignored
git check-ignore .env.example 2>&1
test $? -ne 0 && echo "PASS: .env.example not ignored" || echo "FAIL: .env.example is ignored"
```

---

## Story 3: Remove Committed `.env` Files

### User Story

As a security-conscious developer, I want the committed `.env` files removed from git tracking so that local dev credentials are not exposed in the repository history going forward.

### Acceptance Criteria

- [ ] `apps/web/.env` is removed from git index (but preserved on disk).
- [ ] `apps/api/.env` is removed from git index (but preserved on disk).
- [ ] After removal, `git status` shows both files as untracked (and ignored by `.gitignore`).
- [ ] A commit message clearly states why these files were removed.

### Tasks

#### Task 3.1: Remove `.env` files from git tracking

**Commands:**

```bash
git rm --cached apps/web/.env apps/api/.env
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Run `git rm --cached apps/web/.env apps/api/.env` | 1 min |
| 3.1.2 | Verify files still exist on disk: `test -f apps/web/.env && test -f apps/api/.env` | 1 min |
| 3.1.3 | Verify files are untracked: `git status` shows them as deleted from index | 1 min |
| 3.1.4 | Commit with message: `chore: remove committed .env files from tracking` | 1 min |

### Tests

**Test: .env files are no longer tracked**

```bash
# After the commit:
git ls-files apps/web/.env | grep -q ".env" && echo "FAIL: still tracked" || echo "PASS: not tracked"
git ls-files apps/api/.env | grep -q ".env" && echo "FAIL: still tracked" || echo "PASS: not tracked"

# Files still exist on disk
test -f apps/web/.env && echo "PASS: file preserved" || echo "FAIL: file deleted"
test -f apps/api/.env && echo "PASS: file preserved" || echo "FAIL: file deleted"
```

---

## Story 4: Secret Scanning with Gitleaks

### User Story

As a developer, I want a pre-commit secret scanner to catch accidentally staged secrets (API keys, tokens, passwords) so that they never reach the remote repository.

### Acceptance Criteria

- [ ] If `gitleaks` is installed, it runs on staged changes during pre-commit.
- [ ] If `gitleaks` is NOT installed, the hook continues without error (graceful degradation).
- [ ] README documents how to install gitleaks (optional but recommended).
- [ ] A `.gitleaks.toml` config file exists to suppress known false positives.

### Tasks

#### Task 4.1: Gitleaks integration in pre-commit hook

The gitleaks check is already included in `.husky/pre-commit` (Story 1, Task 1.3). This story covers the config file and documentation.

#### Task 4.2: Create `.gitleaks.toml`

**File:** `.gitleaks.toml`

```toml
title = "Retune Gitleaks Config"

[allowlist]
  description = "Known safe patterns"
  paths = [
    '''\.env\.example$''',
    '''docs/''',
  ]
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 4.2.1 | Create `.gitleaks.toml` with allowlist for `.env.example` and docs | 5 min |
| 4.2.2 | Test gitleaks runs without false positives on current codebase | 10 min |

#### Task 4.3: Document gitleaks installation in README

**File:** `README.md`

Add to a "Development Tools" section:

```markdown
### Optional: Secret Scanning

Install [gitleaks](https://github.com/gitleaks/gitleaks) for pre-commit secret detection:

```bash
# macOS
brew install gitleaks

# Linux
sudo apt-get install gitleaks
```

The pre-commit hook will use it automatically if available.
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 4.3.1 | Add gitleaks install instructions to README | 5 min |

### Tests

**Test: Gitleaks graceful degradation**

```bash
# Temporarily hide gitleaks from PATH
(
  export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v gitleaks | tr '\n' ':')
  # The pre-commit hook should still succeed
  echo "test" > /tmp/test-no-gitleaks.ts
  cp /tmp/test-no-gitleaks.ts apps/web/src/test-no-gitleaks.ts
  git add apps/web/src/test-no-gitleaks.ts
  git commit -m "test no gitleaks" 2>&1
  test $? -eq 0 && echo "PASS: hook succeeds without gitleaks" || echo "FAIL"
  git reset HEAD~1
  rm apps/web/src/test-no-gitleaks.ts
)
```

**Test: Gitleaks catches secrets (if installed)**

```bash
if command -v gitleaks &> /dev/null; then
  echo 'OPENAI_API_KEY=sk-proj-realkey123456789' > /tmp/test-secret.ts
  cp /tmp/test-secret.ts apps/web/src/test-secret.ts
  git add apps/web/src/test-secret.ts
  output=$(git commit -m "test secret" 2>&1 || true)
  test $? -ne 0 && echo "PASS: gitleaks blocked secret" || echo "FAIL: secret not caught"
  git reset HEAD apps/web/src/test-secret.ts
  rm apps/web/src/test-secret.ts
fi
```

---

## Summary

| Story | Files Created/Modified | Effort Estimate |
|-------|----------------------|-----------------|
| 1. Husky + lint-staged | `package.json`, `.husky/pre-commit` | 0.5 day |
| 2. Harden `.gitignore` | `.gitignore` | 0.25 day |
| 3. Remove committed `.env` | `apps/web/.env`, `apps/api/.env` (untrack) | 0.25 day |
| 4. Secret scanning | `.gitleaks.toml`, `README.md` | 0.25 day |
| **Total** | | **1.25 days** |
