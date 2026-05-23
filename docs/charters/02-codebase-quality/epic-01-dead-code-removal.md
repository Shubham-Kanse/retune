# Epic 01 — Dead Code Removal

## Goal

Remove all committed backup files, temporary debug files, unused library stubs, and deprecated framework patterns so that the codebase contains only live, referenced code.

---

## Story 1: Remove Backup (.bak) Files

### User Story

As a **developer**, I want all `.bak` files removed from the repository so that I don't confuse backup artifacts with active source code.

### Acceptance Criteria

- [ ] No `.bak` files exist in the repository
- [ ] `git log` shows a clean removal commit
- [ ] `pnpm build` passes after removal
- [ ] No runtime errors in `apps/web`

### Tasks

#### Task 1.1: Delete all .bak files

**Commands:**

```bash
git rm apps/web/src/app/\(auth\)/layout.tsx.bak
git rm apps/web/src/components/profile/profile-editor.tsx.bak
git rm apps/web/src/components/settings/settings-client.tsx.bak
git rm apps/web/src/components/ui/skeletons.tsx.bak
git rm apps/web/src/app/layout.tsx.bak
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Run `git rm` for each .bak file | 2 min |
| 1.1.2 | Run `pnpm build` to verify no breakage | 3 min |
| 1.1.3 | Commit with message `chore: remove .bak backup files` | 1 min |

### Tests

```bash
# Verify no .bak files remain
find . -name '*.bak' -not -path './node_modules/*' | wc -l
# Expected: 0

# Verify build passes
pnpm build
# Expected: exit 0
```

---

## Story 2: Remove Temporary Debug Files

### User Story

As a **developer**, I want all `.tmp-resume-batch-check*` debug files removed so that the repository doesn't contain one-off debugging artifacts.

### Acceptance Criteria

- [ ] No `.tmp-resume-batch-check*` files exist in the repository
- [ ] `pnpm build` passes after removal

### Tasks

#### Task 2.1: Delete temp debug files

**Commands:**

```bash
git rm apps/web/.tmp-resume-batch-check.ts apps/web/.tmp-resume-batch-check.fresh.ts apps/web/.tmp-resume-batch-check.mjs apps/web/.tmp-resume-batch-check-output.json
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Run `git rm` for all 4 temp files | 1 min |
| 2.1.2 | Run `pnpm build` to verify no breakage | 3 min |
| 2.1.3 | Commit with message `chore: remove temp debug files` | 1 min |

### Tests

```bash
# Verify no temp files remain
find . -name '.tmp-resume-batch-check*' -not -path './node_modules/*' | wc -l
# Expected: 0
```

---

## Story 3: Remove Deprecated Framework Files

### User Story

As a **developer**, I want deprecated Next.js Pages Router and Next.js 12 files removed so that the codebase only contains App Router patterns.

### Acceptance Criteria

- [ ] `apps/web/src/pages/_document.tsx` is deleted
- [ ] `apps/web/src/app/head.tsx` is deleted
- [ ] No Pages Router files exist in `apps/web/src/pages/`
- [ ] `pnpm build` passes after removal

### Tasks

#### Task 3.1: Delete deprecated framework files

**Commands:**

```bash
git rm apps/web/src/pages/_document.tsx
git rm apps/web/src/app/head.tsx
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Verify `_document.tsx` is not imported anywhere: `grep -r '_document' apps/web/src --include='*.ts' --include='*.tsx'` | 1 min |
| 3.1.2 | Verify `head.tsx` is not imported anywhere: `grep -r 'head' apps/web/src/app --include='*.ts' --include='*.tsx' \| grep -v 'metadata'` | 1 min |
| 3.1.3 | Run `git rm` for both files | 1 min |
| 3.1.4 | Run `pnpm build` to verify no breakage | 3 min |
| 3.1.5 | Commit with message `chore: remove deprecated Next.js patterns` | 1 min |

### Tests

```bash
# Verify files are gone
test ! -f apps/web/src/pages/_document.tsx
test ! -f apps/web/src/app/head.tsx
# Expected: both exit 0

# Verify build
pnpm build
# Expected: exit 0
```

---

## Story 4: Remove Misplaced Python Script

### User Story

As a **developer**, I want the Python script in `packages/scripts/` removed since it's not referenced by any TypeScript code and belongs to a different toolchain.

### Acceptance Criteria

- [ ] `packages/scripts/ats_score.py` is deleted
- [ ] No references to `ats_score` exist in TypeScript files

### Tasks

#### Task 4.1: Delete Python script

**Commands:**

```bash
git rm packages/scripts/ats_score.py
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 4.1.1 | Verify no references: `grep -r 'ats_score' . --include='*.ts' --include='*.tsx' --include='*.json' \| grep -v node_modules` | 1 min |
| 4.1.2 | Run `git rm` | 1 min |
| 4.1.3 | Commit with message `chore: remove unused ats_score.py` | 1 min |

### Tests

```bash
# Verify no references
grep -r 'ats_score' . --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules | wc -l
# Expected: 0
```

---

## Story 5: Remove Unused Library Files

### User Story

As a **developer**, I want unused library files in `apps/web/src/lib/` removed so that the codebase doesn't contain dead code that misleads contributors.

### Acceptance Criteria

- [ ] `apps/web/src/lib/collaboration.ts` is deleted (verified no imports)
- [ ] `apps/web/src/lib/ai-suggestions.ts` is deleted (verified no imports)
- [ ] `apps/web/src/lib/websocket.ts` is deleted (verified no imports)
- [ ] `pnpm build` passes after removal

### Tasks

#### Task 5.1: Verify no imports exist

**Commands:**

```bash
grep -r 'collaboration\|ai-suggestions\|websocket' apps/web/src --include='*.ts' --include='*.tsx' | grep -v '__tests__'
```

**Expected output:** No matches (or only the files themselves).

#### Task 5.2: Delete unused library files

**Commands:**

```bash
git rm apps/web/src/lib/collaboration.ts
git rm apps/web/src/lib/ai-suggestions.ts
git rm apps/web/src/lib/websocket.ts
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 5.1.1 | Run grep verification for `collaboration` | 1 min |
| 5.1.2 | Run grep verification for `ai-suggestions` | 1 min |
| 5.1.3 | Run grep verification for `websocket` | 1 min |
| 5.2.1 | Run `git rm` for all 3 files | 1 min |
| 5.2.2 | Run `pnpm build` to verify no breakage | 3 min |
| 5.2.3 | Commit with message `chore: remove unused lib files` | 1 min |

### Tests

```bash
# Verify files are gone
test ! -f apps/web/src/lib/collaboration.ts
test ! -f apps/web/src/lib/ai-suggestions.ts
test ! -f apps/web/src/lib/websocket.ts
# Expected: all exit 0

# Verify no dangling imports
grep -r 'collaboration\|ai-suggestions\|websocket' apps/web/src --include='*.ts' --include='*.tsx' | grep -v '__tests__' | wc -l
# Expected: 0

# Verify build
pnpm build
# Expected: exit 0
```

---

## Story 6: Remove Stub Files Being Replaced

### User Story

As a **developer**, I want stub files that are being replaced by real implementations in other charters removed so that there's no confusion about which implementation is active.

### Acceptance Criteria

- [ ] `apps/web/src/lib/performance.ts` is deleted (no replacement needed, never used)
- [ ] `apps/web/src/lib/csrf.ts` is deleted (real CSRF in Charter 01 Epic 05)
- [ ] `apps/web/src/lib/rate-limiter.ts` is deleted (keep `rate-limit.ts`, update any imports)
- [ ] Any imports of `rate-limiter` are updated to use `rate-limit`
- [ ] `pnpm build` passes after removal

### Tasks

#### Task 6.1: Delete performance.ts stub

**Commands:**

```bash
grep -r 'performance' apps/web/src --include='*.ts' --include='*.tsx' | grep -v 'node_modules' | grep -v 'performance.ts'
# If no imports found:
git rm apps/web/src/lib/performance.ts
```

#### Task 6.2: Delete csrf.ts stub

**Commands:**

```bash
grep -r 'csrf' apps/web/src --include='*.ts' --include='*.tsx' | grep -v 'csrf.ts'
# If no imports found:
git rm apps/web/src/lib/csrf.ts
```

#### Task 6.3: Consolidate rate limiting

**Commands:**

```bash
# Find imports of rate-limiter
grep -r 'rate-limiter' apps/web/src --include='*.ts' --include='*.tsx'
# Update any found imports to use 'rate-limit' instead
# Then delete the duplicate:
git rm apps/web/src/lib/rate-limiter.ts
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 6.1.1 | Verify `performance.ts` has no imports | 1 min |
| 6.1.2 | Delete `performance.ts` | 1 min |
| 6.2.1 | Verify `csrf.ts` has no imports | 1 min |
| 6.2.2 | Delete `csrf.ts` | 1 min |
| 6.3.1 | Find all imports of `rate-limiter` | 2 min |
| 6.3.2 | Update imports to `rate-limit` | 5 min |
| 6.3.3 | Delete `rate-limiter.ts` | 1 min |
| 6.3.4 | Run `pnpm build` | 3 min |
| 6.3.5 | Commit with message `chore: remove stubs, consolidate rate-limit` | 1 min |

### Tests

```bash
# Verify files are gone
test ! -f apps/web/src/lib/performance.ts
test ! -f apps/web/src/lib/csrf.ts
test ! -f apps/web/src/lib/rate-limiter.ts
# Expected: all exit 0

# Verify rate-limit.ts still exists
test -f apps/web/src/lib/rate-limit.ts
# Expected: exit 0

# Verify no broken imports
pnpm build
# Expected: exit 0
```

---

## Story 7: CI Guard Against Dead Code Regression

### User Story

As a **maintainer**, I want CI to catch dead code patterns (`.bak` files, `.tmp-*` files) so that they never get committed again.

### Acceptance Criteria

- [ ] `biome check --no-errors-on-unmatched` exits 0 after all deletions
- [ ] A CI step fails if `.bak` or `.tmp-*` files are found in tracked files

### Tasks

#### Task 7.1: Add dead code check to CI

**File:** `.github/workflows/ci.yml` (or equivalent CI config)

Add step:

```yaml
- name: Check for dead code artifacts
  run: |
    # Fail if any .bak files are tracked
    if git ls-files '*.bak' | grep -q .; then
      echo "ERROR: .bak files found in repository"
      git ls-files '*.bak'
      exit 1
    fi
    # Fail if any .tmp-* files are tracked
    if git ls-files '.tmp-*' '*/.tmp-*' | grep -q .; then
      echo "ERROR: .tmp-* files found in repository"
      git ls-files '.tmp-*' '*/.tmp-*'
      exit 1
    fi
```

#### Task 7.2: Verify biome check passes

**Commands:**

```bash
pnpm biome check --no-errors-on-unmatched
# Expected: exit 0
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 7.1.1 | Add CI step to workflow file | 5 min |
| 7.2.1 | Run biome check locally | 2 min |
| 7.2.2 | Commit with message `ci: add dead code artifact guard` | 1 min |

### Tests

```bash
# Verify biome passes
pnpm biome check --no-errors-on-unmatched
# Expected: exit 0

# Verify no .bak files
git ls-files '*.bak' | wc -l
# Expected: 0

# Verify no .tmp-* files
git ls-files '.tmp-*' '*/.tmp-*' | wc -l
# Expected: 0
```

---

## Total Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: Remove .bak files | 10 min |
| Story 2: Remove temp debug files | 5 min |
| Story 3: Remove deprecated framework files | 10 min |
| Story 4: Remove Python script | 5 min |
| Story 5: Remove unused library files | 10 min |
| Story 6: Remove stubs, consolidate rate-limit | 20 min |
| Story 7: CI guard | 10 min |
| **Total** | **~1.25 hr** |
