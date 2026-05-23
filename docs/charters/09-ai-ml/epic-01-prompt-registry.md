# Epic 01: Prompt Registry

**Charter:** AI/ML Excellence  
**Priority:** P1 — Sprint 1  
**Complexity:** L  
**Owner:** AI Platform Engineer

---

## Goal

Extract all specialist prompts from inline template literals into versioned markdown files, loaded at runtime via a `PromptRegistry` class. This enables prompt versioning, auditability, and future A/B testing without code changes.

## Definition of Done

- [ ] `packages/agent/src/prompts/registry.ts` exports a `PromptRegistry` class
- [ ] `registry.get('bullet-composer')` returns the latest version prompt as a string
- [ ] `registry.get('bullet-composer', 'v1')` returns the v1 prompt explicitly
- [ ] Main prompts extracted from `bullet-composer.ts`, `gap-mapper.ts`, and `refuse-or-ship-gate.ts` into versioned markdown files
- [ ] Each specialist uses `registry.get(name)` instead of inline template literals for its main system prompt
- [ ] All existing agent tests pass (212/212)
- [ ] New registry-specific tests pass

---

## Context: Current Problem

### Inline Prompts in Specialist Source Files

**File: `packages/agent/src/specialists/bullet-composer.ts` (26KB)**

```typescript
// CURRENT — prompt embedded as template literal:
const systemPrompt = `You are a resume bullet composer...
[800+ lines of prompt instructions embedded directly in TypeScript]
...`;
```

This pattern repeats across all specialists:
- `gap-mapper.ts` (31KB) — prompts inline
- `refuse-or-ship-gate.ts` (24KB) — prompts inline
- `narrative-arc-proposer.ts` (20KB) — prompts inline
- `cover-letter-composer.ts` (10KB) — prompts inline

Problems:
1. **No versioning** — changing a prompt requires a code change, rebuild, and deploy.
2. **No auditability** — git blame on a 26KB file doesn't isolate prompt changes from logic changes.
3. **No A/B testing** — impossible to run two prompt versions simultaneously.
4. **Code bloat** — specialist files are 50–80% prompt text, obscuring the actual logic.

### Unused Prompt Cache

**File: `packages/agent/src/caching/prompt-cache.ts` (4885 bytes)**

```typescript
export function createCachedSystemPrompt(text: string): CachedSystemPrompt {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}
```

This exists but is never called from any specialist. The registry will provide the integration point for wiring this in later.

---

## Story 1.1: Create Prompt Registry Class

**As a** platform engineer,  
**I want** a `PromptRegistry` class that loads prompts from versioned files on disk,  
**so that** specialists can retrieve prompts by name and version without embedding them inline.

**Acceptance Criteria:**
- [ ] `packages/agent/src/prompts/registry.ts` exports `PromptRegistry` class
- [ ] Constructor accepts an optional `basePath` (defaults to `packages/agent/src/prompts/versions/`)
- [ ] `get(name: string, version?: string): string` method loads the prompt file
- [ ] When `version` is omitted, returns the highest version (lexicographic sort of `v1`, `v2`, etc.)
- [ ] When `version` is specified, returns that exact version
- [ ] Throws `PromptNotFoundError` if the prompt name or version does not exist
- [ ] Prompts are cached in memory after first load (no repeated filesystem reads)
- [ ] Exported singleton `promptRegistry` instance for use across specialists

### Task 1.1.1: Create directory structure

**Owner:** AI Platform Engineer  
**Deliverable:** Directory scaffold  
**Effort:** 0.5h

##### Subtask: Create prompt directories

```bash
packages/agent/src/prompts/
packages/agent/src/prompts/versions/
packages/agent/src/prompts/versions/bullet-composer/
packages/agent/src/prompts/versions/gap-mapper/
packages/agent/src/prompts/versions/refuse-or-ship-gate/
packages/agent/src/prompts/versions/narrative-arc-proposer/
packages/agent/src/prompts/versions/cover-letter-composer/
```

**Effort:** 5 min

### Task 1.1.2: Implement PromptRegistry class

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/prompts/registry.ts`  
**Effort:** 2h

##### Subtask: Write the registry implementation

Create `packages/agent/src/prompts/registry.ts`:

```typescript
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export class PromptNotFoundError extends Error {
  constructor(name: string, version?: string) {
    super(
      version
        ? `Prompt "${name}" version "${version}" not found`
        : `Prompt "${name}" not found`,
    );
    this.name = "PromptNotFoundError";
  }
}

export class PromptRegistry {
  private cache = new Map<string, string>();
  private readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? resolve(__dirname, "versions");
  }

  get(name: string, version?: string): string {
    const cacheKey = `${name}:${version ?? "latest"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const promptDir = join(this.basePath, name);
    if (!existsSync(promptDir)) {
      throw new PromptNotFoundError(name);
    }

    const resolvedVersion = version ?? this.getLatestVersion(promptDir);
    const filePath = join(promptDir, `${resolvedVersion}.md`);

    if (!existsSync(filePath)) {
      throw new PromptNotFoundError(name, resolvedVersion);
    }

    const content = readFileSync(filePath, "utf-8");
    this.cache.set(cacheKey, content);
    return content;
  }

  private getLatestVersion(dir: string): string {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""))
      .sort();

    if (files.length === 0) {
      throw new PromptNotFoundError(dir);
    }

    return files[files.length - 1];
  }
}

export const promptRegistry = new PromptRegistry();
```

**Effort:** 1.5h

##### Subtask: Create barrel export

Create `packages/agent/src/prompts/index.ts`:

```typescript
export { PromptRegistry, PromptNotFoundError, promptRegistry } from "./registry";
```

**Effort:** 5 min

### Task 1.1.3: Write registry unit tests

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/prompts/registry.test.ts`  
**Effort:** 1.5h

##### Subtask: Write test file

Create `packages/agent/src/prompts/registry.test.ts`:

```typescript
import { describe, it, beforeAll } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { PromptRegistry, PromptNotFoundError } from "./registry";

const TEST_DIR = join(__dirname, "__test_prompts__");

describe("PromptRegistry", () => {
  let registry: PromptRegistry;

  beforeAll(() => {
    // Setup test fixture
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, "bullet-composer"), { recursive: true });
    writeFileSync(join(TEST_DIR, "bullet-composer", "v1.md"), "You are a bullet composer v1.");
    writeFileSync(join(TEST_DIR, "bullet-composer", "v2.md"), "You are a bullet composer v2.");
    registry = new PromptRegistry(TEST_DIR);
  });

  it("get(name) returns latest version", () => {
    const prompt = registry.get("bullet-composer");
    assert.equal(prompt, "You are a bullet composer v2.");
  });

  it("get(name, 'v1') returns v1 explicitly", () => {
    const prompt = registry.get("bullet-composer", "v1");
    assert.equal(prompt, "You are a bullet composer v1.");
  });

  it("get(name) returns a non-empty string", () => {
    const prompt = registry.get("bullet-composer");
    assert.ok(prompt.length > 0);
  });

  it("get(name, 'v1') returns the same string on repeated calls (caching)", () => {
    const first = registry.get("bullet-composer", "v1");
    const second = registry.get("bullet-composer", "v1");
    assert.equal(first, second);
  });

  it("throws PromptNotFoundError for unknown prompt", () => {
    assert.throws(
      () => registry.get("nonexistent-specialist"),
      PromptNotFoundError,
    );
  });

  it("throws PromptNotFoundError for unknown version", () => {
    assert.throws(
      () => registry.get("bullet-composer", "v99"),
      PromptNotFoundError,
    );
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | `registry.get('bullet-composer')` returns non-empty string | `prompt.length > 0` |
| 2 | `registry.get('bullet-composer')` returns latest (v2) | `=== "You are a bullet composer v2."` |
| 3 | `registry.get('bullet-composer', 'v1')` returns v1 | `=== "You are a bullet composer v1."` |
| 4 | Repeated `get` calls return same reference (cache hit) | `first === second` |
| 5 | Unknown name throws `PromptNotFoundError` | `throws PromptNotFoundError` |
| 6 | Unknown version throws `PromptNotFoundError` | `throws PromptNotFoundError` |

**Effort:** 1.5h

---

## Story 1.2: Extract bullet-composer Prompt

**As a** platform engineer,  
**I want** the main system prompt from `bullet-composer.ts` extracted into a versioned markdown file,  
**so that** the prompt can be versioned and modified independently of the specialist logic.

**Acceptance Criteria:**
- [ ] `packages/agent/src/prompts/versions/bullet-composer/v1.md` contains the full system prompt previously inline in `bullet-composer.ts`
- [ ] `bullet-composer.ts` imports `promptRegistry` and calls `promptRegistry.get('bullet-composer')` where the inline prompt was
- [ ] The specialist produces identical output (existing tests pass unchanged)
- [ ] The `bullet-composer.ts` file size decreases by at least 40%

### Task 1.2.1: Extract the prompt text

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/prompts/versions/bullet-composer/v1.md`  
**Effort:** 1h

##### Subtask: Identify and copy the system prompt

1. Open `packages/agent/src/specialists/bullet-composer.ts`
2. Locate the main system prompt template literal (the large string passed as `system` to the AI provider)
3. Copy the full text content into `packages/agent/src/prompts/versions/bullet-composer/v1.md`
4. Preserve all formatting, instructions, and variable placeholders (e.g., `${variableName}` becomes `{{variableName}}` in the markdown)

**Effort:** 45 min

##### Subtask: Verify prompt content matches original

Diff the extracted markdown against the original template literal to confirm no content was lost or corrupted.

**Effort:** 15 min

### Task 1.2.2: Update bullet-composer.ts to use registry

**Owner:** AI Platform Engineer  
**Deliverable:** Modified `packages/agent/src/specialists/bullet-composer.ts`  
**Effort:** 1h

##### Subtask: Replace inline prompt with registry call

In `packages/agent/src/specialists/bullet-composer.ts`:

```typescript
// BEFORE:
const systemPrompt = `You are a resume bullet composer...
[hundreds of lines]
...`;

// AFTER:
import { promptRegistry } from "../prompts";

const systemPromptTemplate = promptRegistry.get("bullet-composer");
// If the prompt uses interpolation variables, apply them:
const systemPrompt = systemPromptTemplate
  .replace("{{voice_fingerprint}}", voiceFingerprint)
  .replace("{{honesty_tier}}", honestyTier);
```

**Effort:** 45 min

##### Subtask: Run existing bullet-composer tests

```bash
pnpm --filter @retune/agent test -- --grep "bullet-composer"
```

All existing tests must pass without modification.

**Effort:** 15 min

### Task 1.2.3: Write integration test for registry + specialist

**Owner:** AI Platform Engineer  
**Deliverable:** Test assertion in `packages/agent/src/prompts/registry.test.ts`  
**Effort:** 30 min

##### Subtask: Add integration assertion

Append to `packages/agent/src/prompts/registry.test.ts`:

```typescript
describe("PromptRegistry integration", () => {
  it("bullet-composer v1 prompt loads from real versions directory", () => {
    const { promptRegistry } = require("./registry");
    const prompt = promptRegistry.get("bullet-composer");
    assert.ok(prompt.length > 100, "Prompt should be substantial (>100 chars)");
    assert.ok(prompt.includes("bullet") || prompt.includes("resume"),
      "Prompt should contain domain-relevant keywords");
  });

  it("bullet-composer v1 explicit version matches latest", () => {
    const { promptRegistry } = require("./registry");
    const latest = promptRegistry.get("bullet-composer");
    const v1 = promptRegistry.get("bullet-composer", "v1");
    assert.equal(latest, v1, "With only v1 available, latest should equal v1");
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | `promptRegistry.get('bullet-composer')` returns string > 100 chars | `prompt.length > 100` |
| 2 | Prompt contains domain keywords | `includes("bullet")` or `includes("resume")` |
| 3 | Latest equals v1 when only v1 exists | `latest === v1` |

**Effort:** 30 min

---

## Story 1.3: Extract gap-mapper Prompt

**As a** platform engineer,  
**I want** the main system prompt from `gap-mapper.ts` extracted into a versioned markdown file,  
**so that** the prompt can be versioned independently.

**Acceptance Criteria:**
- [ ] `packages/agent/src/prompts/versions/gap-mapper/v1.md` contains the full system prompt previously inline in `gap-mapper.ts`
- [ ] `gap-mapper.ts` imports `promptRegistry` and calls `promptRegistry.get('gap-mapper')` where the inline prompt was
- [ ] The specialist produces identical output (existing tests pass unchanged)
- [ ] The `gap-mapper.ts` file size decreases by at least 40%

### Task 1.3.1: Extract the prompt text

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/prompts/versions/gap-mapper/v1.md`  
**Effort:** 1h

##### Subtask: Identify and copy the system prompt

1. Open `packages/agent/src/specialists/gap-mapper.ts`
2. Locate the main system prompt template literal
3. Copy the full text content into `packages/agent/src/prompts/versions/gap-mapper/v1.md`
4. Convert `${variable}` interpolations to `{{variable}}` placeholders

**Effort:** 45 min

##### Subtask: Verify prompt content matches original

Diff the extracted markdown against the original template literal.

**Effort:** 15 min

### Task 1.3.2: Update gap-mapper.ts to use registry

**Owner:** AI Platform Engineer  
**Deliverable:** Modified `packages/agent/src/specialists/gap-mapper.ts`  
**Effort:** 1h

##### Subtask: Replace inline prompt with registry call

In `packages/agent/src/specialists/gap-mapper.ts`:

```typescript
// BEFORE:
const systemPrompt = `You are a gap analysis specialist...
[hundreds of lines]
...`;

// AFTER:
import { promptRegistry } from "../prompts";

const systemPromptTemplate = promptRegistry.get("gap-mapper");
const systemPrompt = systemPromptTemplate
  .replace("{{role_schema}}", JSON.stringify(roleSchema))
  .replace("{{evidence_summary}}", evidenceSummary);
```

**Effort:** 45 min

##### Subtask: Run existing gap-mapper tests

```bash
pnpm --filter @retune/agent test -- --grep "gap-mapper"
```

All existing tests must pass without modification.

**Effort:** 15 min

### Task 1.3.3: Write integration test

**Owner:** AI Platform Engineer  
**Deliverable:** Test assertion  
**Effort:** 30 min

##### Subtask: Add integration assertion

```typescript
it("gap-mapper v1 prompt loads from real versions directory", () => {
  const { promptRegistry } = require("./registry");
  const prompt = promptRegistry.get("gap-mapper");
  assert.ok(prompt.length > 100, "Prompt should be substantial (>100 chars)");
  assert.ok(prompt.includes("gap") || prompt.includes("analysis"),
    "Prompt should contain domain-relevant keywords");
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | `promptRegistry.get('gap-mapper')` returns string > 100 chars | `prompt.length > 100` |
| 2 | Prompt contains domain keywords | `includes("gap")` or `includes("analysis")` |

**Effort:** 30 min

---

## Story 1.4: Extract refuse-or-ship-gate Prompt

**As a** platform engineer,  
**I want** the main system prompt from `refuse-or-ship-gate.ts` extracted into a versioned markdown file,  
**so that** the prompt can be versioned independently.

**Acceptance Criteria:**
- [ ] `packages/agent/src/prompts/versions/refuse-or-ship-gate/v1.md` contains the full system prompt previously inline in `refuse-or-ship-gate.ts`
- [ ] `refuse-or-ship-gate.ts` imports `promptRegistry` and calls `promptRegistry.get('refuse-or-ship-gate')` where the inline prompt was
- [ ] The specialist produces identical output (existing tests pass unchanged)
- [ ] The `refuse-or-ship-gate.ts` file size decreases by at least 30%

### Task 1.4.1: Extract the prompt text

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/prompts/versions/refuse-or-ship-gate/v1.md`  
**Effort:** 1h

##### Subtask: Identify and copy the system prompt

1. Open `packages/agent/src/specialists/refuse-or-ship-gate.ts`
2. Locate the main system prompt template literal
3. Copy the full text content into `packages/agent/src/prompts/versions/refuse-or-ship-gate/v1.md`
4. Convert `${variable}` interpolations to `{{variable}}` placeholders

**Effort:** 45 min

##### Subtask: Verify prompt content matches original

Diff the extracted markdown against the original template literal.

**Effort:** 15 min

### Task 1.4.2: Update refuse-or-ship-gate.ts to use registry

**Owner:** AI Platform Engineer  
**Deliverable:** Modified `packages/agent/src/specialists/refuse-or-ship-gate.ts`  
**Effort:** 1h

##### Subtask: Replace inline prompt with registry call

In `packages/agent/src/specialists/refuse-or-ship-gate.ts`:

```typescript
// BEFORE:
const systemPrompt = `You are the refuse-or-ship quality gate...
[hundreds of lines]
...`;

// AFTER:
import { promptRegistry } from "../prompts";

const systemPromptTemplate = promptRegistry.get("refuse-or-ship-gate");
const systemPrompt = systemPromptTemplate
  .replace("{{quality_thresholds}}", JSON.stringify(thresholds));
```

**Effort:** 45 min

##### Subtask: Run existing refuse-or-ship-gate tests

```bash
pnpm --filter @retune/agent test -- --grep "refuse-or-ship"
```

All existing tests must pass without modification.

**Effort:** 15 min

### Task 1.4.3: Write integration test

**Owner:** AI Platform Engineer  
**Deliverable:** Test assertion  
**Effort:** 30 min

##### Subtask: Add integration assertion

```typescript
it("refuse-or-ship-gate v1 prompt loads from real versions directory", () => {
  const { promptRegistry } = require("./registry");
  const prompt = promptRegistry.get("refuse-or-ship-gate");
  assert.ok(prompt.length > 100, "Prompt should be substantial (>100 chars)");
  assert.ok(prompt.includes("refuse") || prompt.includes("ship") || prompt.includes("gate"),
    "Prompt should contain domain-relevant keywords");
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | `promptRegistry.get('refuse-or-ship-gate')` returns string > 100 chars | `prompt.length > 100` |
| 2 | Prompt contains domain keywords | `includes("refuse")` or `includes("ship")` or `includes("gate")` |

**Effort:** 30 min

---

## Story 1.5: Verify Full Test Suite Passes

**As a** platform engineer,  
**I want** confirmation that all 212 agent tests still pass after the prompt extraction,  
**so that** I know the refactoring introduced no regressions.

**Acceptance Criteria:**
- [ ] `pnpm --filter @retune/agent test` exits with code 0
- [ ] 212/212 tests pass
- [ ] New registry tests (6+ assertions) all pass
- [ ] No specialist behavior changes detected

### Task 1.5.1: Run full agent test suite

**Owner:** AI Platform Engineer  
**Deliverable:** Green test run  
**Effort:** 30 min

##### Subtask: Execute and verify

```bash
pnpm --filter @retune/agent test
```

Expected output: `212 pass, 0 fail`

If any tests fail, investigate whether the failure is due to:
1. Prompt content mismatch (fix the extracted markdown)
2. Variable interpolation differences (fix the replacement logic)
3. File path resolution issues (fix the `basePath` in registry)

**Effort:** 30 min (plus debugging if needed)

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 1.1: Create Prompt Registry Class | 4h |
| 1.2: Extract bullet-composer Prompt | 2.5h |
| 1.3: Extract gap-mapper Prompt | 2.5h |
| 1.4: Extract refuse-or-ship-gate Prompt | 2.5h |
| 1.5: Verify Full Test Suite | 0.5h |
| **Total** | **12h** |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Template literal interpolation uses complex expressions | Convert to named `{{placeholder}}` tokens; specialist applies `.replace()` with computed values |
| File I/O at import time slows cold start | Registry caches after first read; prompts are small text files (< 50KB each) |
| Prompt extraction misses conditional branches | Some specialists may have multiple prompt variants; extract each as a separate version or named prompt |
| Path resolution differs in test vs production | Registry constructor accepts explicit `basePath`; tests use fixture directory |
