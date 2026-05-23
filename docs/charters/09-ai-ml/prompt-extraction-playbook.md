# Prompt registry — migration playbook

Charter 09 Epic 01.

## Status

- ✅ Registry library shipped: `packages/agent/src/prompts/registry.ts`
  with `register()`, `getPrompt()`, `renderPrompt()` (`{{placeholder}}`
  substitution), `listPrompts()`, version pinning. 9 unit tests pass.
- ✅ Provider fallback router shipped: `packages/agent/src/lib/provider-fallback.ts`
  with 6 unit tests (rate-limit/overload/5xx detection, capabilities
  inheritance).
- ✅ Cost telemetry persisted: `record_model_calls` writer on
  `PostgresPersistence` + orchestrator drains buffer per-tick.
- 🟡 **Specialist prompt migration: NOT YET DONE.** Specialists still
  import inline template literals. The mechanical extraction — moving
  every prompt into a `*.md` registered at module load — is documented
  here so the next contributor can run it.

## Why we didn't ship the full extraction

It's mechanical but invasive:

- ~30 specialist files in `packages/agent/src/specialists/`.
- The five biggest (per architect addendum): `bullet-composer.ts`
  (26KB), `gap-mapper.ts` (31KB), `refuse-or-ship-gate.ts` (24KB),
  `narrative-arc-proposer.ts` (20KB), `cover-letter-composer.ts`
  (10KB).
- Each prompt is interpolated with multiple parameters that need to
  become `{{placeholder}}` keys.
- A bad replacement (missing a `\n`, mishandling backticks inside
  template literals, dropping a multi-line indent) silently changes
  generation quality. The eval suite (Charter 21) catches that, but
  it's expensive to discover after-the-fact.

The registry + the tests + the provider plumbing are the hard part.
The extraction is a focused 1-day push by someone who knows the
specialists.

## Migration playbook — per specialist

### Step 1 — extract

Pull the inline prompt template literal out of the `.ts` file into a
sibling `.md` file under `packages/agent/src/specialists/prompts/`.
Frontmatter:

```markdown
---
name: bullet-composer.refine
version: 1
model_hint: smart
---

You are an expert resume writer. Given the following…

## Inputs

{{candidate_summary}}

## Constraints

{{tone_constraints}}
```

### Step 2 — register at module load

Each specialist file gains a small block:

```ts
import { register, renderPrompt } from "../prompts/registry";
import bulletComposerRefine from "./prompts/bullet-composer.refine.md?raw";

register({
  name: "bullet-composer.refine",
  version: 1,
  model_hint: "smart",
  body: bulletComposerRefine,
});
```

(The `?raw` import suffix needs Vite/esbuild support; for `tsx --test`
runs we use a `fs.readFileSync` fallback wrapped in a small loader.)

### Step 3 — replace inline use

```ts
// Before
const prompt = `You are an expert resume writer. Given ${candidateSummary}…`;

// After
const prompt = renderPrompt("bullet-composer.refine", {
  candidate_summary: candidateSummary,
  tone_constraints: toneConstraints,
});
```

### Step 4 — capture in eval

Charter 21 eval cases reference prompts by `(name, version)`. New
prompt versions are A/B-tested by registering them at `version: 2`
and switching the eval cases over case-by-case until parity is
verified.

## Cadence

Run the migration in PRs of ~3-5 specialists at a time. Each PR:

- Extracts the prompts.
- Re-runs the mock-mode eval (Charter 21) and asserts no
  quality-score regression > 1pp.
- Lands.

Estimated timeline: 1 sprint (~1 week of focused work) for all 30.

## Why this still helps

Even without the extraction done, the registry library exists and is
the contract. New specialists added today should use it from the
start — they don't have to wait for the legacy migration.

## References

- `packages/agent/src/prompts/registry.ts`
- `packages/agent/tests/prompt-registry.test.ts`
- `docs/charters/09-ai-ml/README.md`
- ADR-004 (AI provider): `docs/adr/ADR-004-ai-provider.md`
