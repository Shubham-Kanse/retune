# Epic 02 — Dependency Rationalisation

## Goal

Consolidate duplicate dependency versions across the monorepo and add CI guards that prevent version drift, so that the dependency tree is predictable, bundle sizes are minimised, and type conflicts are eliminated.

---

## Story 1: Audit Current Dependency State

### User Story

As a **developer**, I want to confirm which packages have duplicate versions installed so that I have a clear baseline before making changes.

### Acceptance Criteria

- [ ] Output of `pnpm ls --depth=0` confirms dual zod versions (3.25.76 and 4.4.3)
- [ ] A list of all `package.json` files referencing `"zod": "^3"` is documented
- [ ] No other critical duplicate major versions are identified

### Tasks

#### Task 1.1: Run dependency audit

**Commands:**

```bash
# Confirm dual zod versions
pnpm ls --depth=0 2>&1 | grep -E 'zod|openai'

# Find all package.json files with zod ^3
grep -r '"zod"' . --include='package.json' | grep -v node_modules
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Run `pnpm ls` and capture output | 2 min |
| 1.1.2 | Run grep to find all zod references | 2 min |
| 1.1.3 | Document findings (which packages use zod 3 vs 4) | 5 min |

### Tests

```bash
# Verify dual versions exist (pre-condition)
pnpm ls --depth=0 2>&1 | grep -c 'zod'
# Expected: 2 (confirms the problem exists)
```

---

## Story 2: Consolidate to Zod 4

### User Story

As a **developer**, I want a single version of zod across the monorepo so that there are no type conflicts between packages that import zod schemas from each other.

### Acceptance Criteria

- [ ] All `package.json` files reference `"zod": "^4.4.3"` (or compatible)
- [ ] `pnpm install` resolves to a single zod version
- [ ] `pnpm ls --depth=0 2>&1 | grep -c 'zod'` returns 1
- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm test` passes with no failures

### Tasks

#### Task 2.1: Update all package.json files

**Files to update** (update `"zod": "^3.*"` to `"zod": "^4.4.3"`):

- `packages/types/package.json`
- `packages/db/package.json`
- `packages/agent/package.json`
- `packages/auth/package.json`
- `packages/billing/package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `apps/worker/package.json`
- Any other `package.json` referencing zod 3

**Command:**

```bash
# For each package.json that has zod ^3:
sed -i '' 's/"zod": "\^3[^"]*"/"zod": "^4.4.3"/g' <file>
```

#### Task 2.2: Run pnpm install

```bash
pnpm install
```

#### Task 2.3: Fix breaking changes

Zod 4 breaking changes to address:

- `z.object().strict()` → verify still works (it does in zod 4)
- `z.enum()` — API unchanged
- `.parse()` / `.safeParse()` — API unchanged
- `z.infer<>` — API unchanged
- Check for any usage of removed/renamed APIs

**Commands:**

```bash
pnpm typecheck
# Fix any type errors that appear
```

#### Task 2.4: Run full test suite

```bash
pnpm test
# Fix any test failures
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Identify all package.json files with zod ^3 | 5 min |
| 2.1.2 | Update each to `"zod": "^4.4.3"` | 10 min |
| 2.2.1 | Run `pnpm install` | 2 min |
| 2.3.1 | Run `pnpm typecheck` and fix errors | 30 min |
| 2.3.2 | Address any zod 4 API changes in source | 30 min |
| 2.4.1 | Run `pnpm test` and fix failures | 30 min |
| 2.4.2 | Commit with message `chore: consolidate to zod 4.4.3` | 1 min |

### Tests

```bash
# Verify single zod version
pnpm ls --depth=0 2>&1 | grep -c 'zod'
# Expected: 1

# Verify typecheck
pnpm typecheck
# Expected: exit 0

# Verify tests
pnpm test
# Expected: exit 0

# Verify no zod 3 references remain
grep -r '"zod": "\^3' . --include='package.json' | grep -v node_modules | wc -l
# Expected: 0
```

---

## Story 3: CI Guard Against Duplicate Dependencies

### User Story

As a **maintainer**, I want CI to fail if duplicate major versions of critical dependencies are detected so that version drift doesn't silently reoccur.

### Acceptance Criteria

- [ ] CI step checks for duplicate zod versions and fails if more than one is found
- [ ] The check is generic enough to extend to other packages in the future
- [ ] The check runs on every PR

### Tasks

#### Task 3.1: Add dependency duplication check to CI

**File:** `.github/workflows/ci.yml` (or equivalent CI config)

Add step:

```yaml
- name: Check for duplicate critical dependencies
  run: |
    # Check zod - should have exactly 1 version
    ZOD_COUNT=$(pnpm ls --depth=0 2>&1 | grep -c 'zod' || true)
    if [ "$ZOD_COUNT" -gt 1 ]; then
      echo "ERROR: Multiple zod versions detected ($ZOD_COUNT)"
      pnpm ls --depth=0 2>&1 | grep 'zod'
      exit 1
    fi
    echo "✓ Single zod version confirmed"
```

**Alternative inline command for local verification:**

```bash
pnpm ls --depth=0 2>&1 | grep -c 'zod' | xargs -I{} test {} -eq 1
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Add CI step to workflow file | 5 min |
| 3.1.2 | Test locally that the check passes | 2 min |
| 3.1.3 | Commit with message `ci: add duplicate dependency guard` | 1 min |

### Tests

```bash
# Verify the check passes after consolidation
pnpm ls --depth=0 2>&1 | grep -c 'zod' | xargs -I{} test {} -eq 1
# Expected: exit 0 (exactly 1 zod version)

# Verify CI step would catch a regression (manual test)
# Temporarily add zod@3 to one package, run check, verify it fails
```

---

## Total Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: Audit current state | 10 min |
| Story 2: Consolidate to zod 4 | 1.5 hr |
| Story 3: CI guard | 10 min |
| **Total** | **~2 hr** |

## Notes

- This epic coordinates with Charter 18 (Zod Migration) which may handle the broader zod 3→4 migration. If Charter 18 lands first, this epic's Story 2 becomes a verification-only task.
- The `pnpm ls` command output format may vary — the CI check should be tested against the actual pnpm version used in CI.
