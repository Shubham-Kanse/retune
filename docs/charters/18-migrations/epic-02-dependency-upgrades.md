# Epic 02 — Dependency Upgrades

## Overview

Configure automated dependency management with Renovate, consolidate the zod version split (v3 → v4), and establish a process for safe major version upgrades across the monorepo.

---

## Story 1: Configure Renovate

### User Story

As a developer, I want automated dependency update PRs so that I don't manually track outdated packages.

### Acceptance Criteria

- `.github/renovate.json` exists with valid configuration
- Patch updates are automerged
- Zod packages are grouped into a single PR
- Renovate creates PRs within 24h of new releases (once the GitHub App is installed)

### Tasks

#### Task 1.1: Create `.github/renovate.json`

**Effort:** 15 min  
**File:** `.github/renovate.json`

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "labels": ["dependencies"],
  "rangeStrategy": "pin",
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "automerge": true
    },
    {
      "matchPackageNames": ["zod"],
      "groupName": "zod"
    },
    {
      "matchPackageNames": ["openai"],
      "groupName": "openai"
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["dependencies", "breaking"]
    }
  ],
  "schedule": ["before 7am on Monday"]
}
```

#### Task 1.2: Document Renovate setup in `docs/charters/18-migrations/renovate-setup.md`

**Effort:** 10 min

Document:
- Install the Renovate GitHub App on the repository
- Renovate will create an onboarding PR with detected dependencies
- Merge the onboarding PR to activate

### Tests

**File:** `.github/__tests__/renovate.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('renovate.json', () => {
  it('is valid JSON with required fields', () => {
    const content = readFileSync(resolve(__dirname, '../renovate.json'), 'utf8');
    const config = JSON.parse(content);
    expect(config.$schema).toContain('renovatebot.com');
    expect(config.extends).toContain('config:base');
    expect(config.packageRules).toBeDefined();
    expect(Array.isArray(config.packageRules)).toBe(true);
  });

  it('has patch automerge rule', () => {
    const content = readFileSync(resolve(__dirname, '../renovate.json'), 'utf8');
    const config = JSON.parse(content);
    const patchRule = config.packageRules.find(
      (r: any) => r.matchUpdateTypes?.includes('patch')
    );
    expect(patchRule).toBeDefined();
    expect(patchRule.automerge).toBe(true);
  });

  it('groups zod packages', () => {
    const content = readFileSync(resolve(__dirname, '../renovate.json'), 'utf8');
    const config = JSON.parse(content);
    const zodRule = config.packageRules.find(
      (r: any) => r.matchPackageNames?.includes('zod')
    );
    expect(zodRule).toBeDefined();
    expect(zodRule.groupName).toBe('zod');
  });
});
```

---

## Story 2: Consolidate Zod Versions

### User Story

As a developer, I want a single zod version across the monorepo so that type inference is consistent and bundle size is minimized.

### Acceptance Criteria

- All packages use `zod@^4.4.3` (no zod@3 references remain)
- `pnpm install` succeeds without errors
- All existing tests pass after the upgrade
- Breaking API changes from zod v3→v4 are addressed

### Tasks

#### Task 2.1: Identify packages using zod@3

**Effort:** 10 min

```bash
grep -r '"zod": "3' packages/*/package.json apps/*/package.json
grep -r '"zod": "\^3' packages/*/package.json apps/*/package.json
```

Expected affected packages (based on current state):
- `packages/types/package.json`
- `packages/agent/package.json`
- `apps/api/package.json`
- Any others found by the grep

#### Task 2.2: Update each package.json to zod@4

**Effort:** 15 min

For each affected `package.json`, change:

```json
// Before:
"zod": "^3.25.76"

// After:
"zod": "^4.4.3"
```

#### Task 2.3: Run install and fix resolution

**Effort:** 10 min

```bash
pnpm install
```

If there are peer dependency conflicts, add `pnpm.overrides` to root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "zod": "^4.4.3"
    }
  }
}
```

#### Task 2.4: Fix breaking changes

**Effort:** 60 min

Zod v4 breaking changes to address:

1. **`z.object().strict()` → default behavior changed** — review usages
2. **`z.enum` type inference** — verify enum schemas still infer correctly
3. **`.parse()` error format** — `ZodError.issues` structure is the same, but check custom error handling
4. **Import path** — `import { z } from 'zod'` remains the same

Search for patterns:

```bash
grep -rn "z\.object" packages/ apps/ --include="*.ts" | head -20
grep -rn "ZodError" packages/ apps/ --include="*.ts"
grep -rn "\.safeParse" packages/ apps/ --include="*.ts" | head -20
```

Fix each file where the API has changed.

#### Task 2.5: Run full test suite

**Effort:** 15 min

```bash
pnpm test
```

Fix any remaining failures.

### Tests

**File:** `packages/types/src/__tests__/zod-version.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { z } from 'zod';

describe('zod v4 compatibility', () => {
  it('z.string().parse works', () => {
    expect(z.string().parse('test')).toBe('test');
  });

  it('z.object works with inference', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = schema.parse({ name: 'test', age: 25 });
    expect(result.name).toBe('test');
    expect(result.age).toBe(25);
  });

  it('z.enum works', () => {
    const schema = z.enum(['a', 'b', 'c']);
    expect(schema.parse('a')).toBe('a');
  });

  it('safeParse returns expected shape', () => {
    const schema = z.string();
    const result = schema.safeParse(123);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
```

**File:** `packages/agent/src/__tests__/zod-version.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { z } from 'zod';

describe('zod v4 in agent package', () => {
  it('z.string().parse works', () => {
    expect(z.string().parse('hello')).toBe('hello');
  });
});
```

**File:** `apps/api/src/__tests__/zod-version.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { z } from 'zod';

describe('zod v4 in api package', () => {
  it('z.string().parse works', () => {
    expect(z.string().parse('hello')).toBe('hello');
  });
});
```

---

## Story 3: Verify OpenAI SDK Compatibility

### User Story

As a developer, I want the OpenAI SDK to work with the consolidated zod@4 so that structured outputs and function calling still work.

### Acceptance Criteria

- `openai@6.36.0` resolves against `zod@4.4.3` without peer dependency warnings
- Structured output schemas (if used) still compile and work at runtime
- No duplicate openai versions in the lockfile

### Tasks

#### Task 3.1: Check openai peer dependency on zod

**Effort:** 10 min

```bash
pnpm why zod
pnpm ls zod --depth 3
```

Verify openai@6.36.0 accepts zod@4. If not, check if a newer openai version is needed.

#### Task 3.2: Update openai if needed

**Effort:** 15 min

```bash
pnpm --filter @retune/agent update openai
pnpm --filter @retune/api update openai
```

#### Task 3.3: Verify structured output usage

**Effort:** 20 min

Search for `zodResponseFormat` or `response_format` usage:

```bash
grep -rn "zodResponseFormat\|zodFunction\|response_format.*zod" packages/ apps/ --include="*.ts"
```

Verify each usage compiles and the schema is accepted.

### Tests

**File:** `packages/agent/src/__tests__/openai-zod-compat.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { z } from 'zod';

describe('openai + zod v4 compatibility', () => {
  it('can create a schema compatible with openai structured outputs', () => {
    const schema = z.object({
      name: z.string(),
      skills: z.array(z.string()),
    });

    // Verify the schema produces valid JSON schema (used by openai)
    const parsed = schema.parse({ name: 'test', skills: ['a', 'b'] });
    expect(parsed.name).toBe('test');
    expect(parsed.skills).toEqual(['a', 'b']);
  });
});
```

---

## Story 4: Add pnpm Catalog / Workspace Version Enforcement

### User Story

As a developer, I want shared dependencies pinned at the workspace root so that version drift cannot recur.

### Acceptance Criteria

- Root `package.json` has `pnpm.overrides` for `zod` pinned to `^4.4.3`
- A CI check verifies no duplicate major versions of key packages exist
- Documentation explains how to add new shared dependencies

### Tasks

#### Task 4.1: Add overrides to root `package.json`

**Effort:** 10 min  
**File:** `package.json` (root)

```json
{
  "pnpm": {
    "overrides": {
      "zod": "^4.4.3"
    }
  }
}
```

#### Task 4.2: Create CI check script `scripts/check-duplicate-deps.sh`

**Effort:** 20 min  
**File:** `scripts/check-duplicate-deps.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

CRITICAL_DEPS=("zod" "openai")
EXIT_CODE=0

for dep in "${CRITICAL_DEPS[@]}"; do
  VERSIONS=$(pnpm ls "$dep" --depth 0 -r --json 2>/dev/null | \
    grep -o "\"version\":\"[^\"]*\"" | sort -u | wc -l)
  if [[ "$VERSIONS" -gt 1 ]]; then
    echo "ERROR: Multiple versions of $dep detected"
    pnpm ls "$dep" --depth 0 -r
    EXIT_CODE=1
  fi
done

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ No duplicate critical dependency versions"
fi

exit $EXIT_CODE
```

#### Task 4.3: Add to CI workflow

**Effort:** 5 min  
**File:** `.github/workflows/ci.yml`

```yaml
- name: Check duplicate dependencies
  run: bash scripts/check-duplicate-deps.sh
```

### Tests

Manual verification:
1. Run `bash scripts/check-duplicate-deps.sh` — should pass after zod consolidation
2. Temporarily add `"zod": "^3.0.0"` to one package, run again — should fail

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 1 — Configure Renovate | 25 min |
| 2 — Consolidate Zod | 110 min |
| 3 — OpenAI Compatibility | 45 min |
| 4 — Version Enforcement | 35 min |
| **Total** | **~3.5 hours** |
