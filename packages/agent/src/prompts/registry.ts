/**
 * Prompt registry (Charter 09 Epic 01).
 *
 * Centralised, versioned store for specialist prompts. Replaces inline
 * template literals scattered across `packages/agent/src/specialists/`.
 *
 * Why:
 *   - Prompts versioned independently of code so prompt-only A/B tests
 *     don't require shipping a new agent build.
 *   - Single source of truth for prompt observability — every LLM call
 *     records the prompt id + version it ran with.
 *   - Easier diffing: prompt diffs land as small PRs to plain markdown
 *     instead of buried in TypeScript template literals.
 *
 * Design:
 *   - `register(name, version, body)` registers a prompt.
 *   - `get(name)` returns the active version (highest registered) by
 *     default; `get(name, version)` pins to a specific version.
 *   - All prompts are rendered as plain strings; specialists fill in
 *     parameters via simple `{{placeholder}}` substitution.
 *
 * Prompts live in `packages/agent/src/specialists/prompts/` as `.md`
 * files with frontmatter:
 *
 *   ---
 *   name: bullet-composer.refine
 *   version: 3
 *   model_hint: smart
 *   ---
 *   You are an expert resume writer...
 *
 * The build pipeline collects every `.md` and calls `register()` at
 * module load. Specialists then call `getPrompt("bullet-composer.refine")`.
 */

export interface PromptRecord {
  name: string;
  version: number;
  /** Loose hint to specialists about which model tier to use. */
  model_hint?: "smart" | "fast" | "frontier";
  body: string;
}

const _registry = new Map<string, PromptRecord[]>();

/**
 * Register a prompt. Higher versions take precedence on `get()`.
 * Re-registering the same (name, version) is a no-op.
 */
export function register(record: PromptRecord): void {
  const list = _registry.get(record.name) ?? [];
  if (list.some((r) => r.version === record.version)) return;
  list.push(record);
  list.sort((a, b) => b.version - a.version); // highest first
  _registry.set(record.name, list);
}

/**
 * Look up a prompt by name. By default returns the highest-registered
 * version; pass `version` to pin.
 */
export function getPrompt(name: string, version?: number): PromptRecord {
  const list = _registry.get(name);
  if (!list || list.length === 0) {
    throw new Error(`Unknown prompt: ${name}. Did you forget to register it at module load?`);
  }
  if (version === undefined) {
    const head = list[0];
    if (!head) throw new Error(`Prompt list is empty for ${name}`);
    return head;
  }
  const found = list.find((r) => r.version === version);
  if (!found) {
    throw new Error(
      `Prompt ${name} v${version} not found. Registered versions: ${list.map((r) => r.version).join(", ")}`,
    );
  }
  return found;
}

/**
 * Render a prompt by substituting `{{key}}` placeholders. Unknown
 * placeholders fail loudly so we don't ship malformed prompts to the
 * model.
 */
export function renderPrompt(
  recordOrName: string | PromptRecord,
  params: Record<string, string | number | boolean | null>,
): string {
  const record = typeof recordOrName === "string" ? getPrompt(recordOrName) : recordOrName;
  return record.body.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in params)) {
      throw new Error(
        `Prompt ${record.name} v${record.version} references unknown placeholder {{${k}}}`,
      );
    }
    const v = params[k];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

/**
 * Test-only — clear all registered prompts so tests start from a known state.
 */
export function _resetPromptRegistryForTests(): void {
  _registry.clear();
}

/**
 * List all registered prompts. Useful for the admin / observability
 * dashboard.
 */
export function listPrompts(): Array<{ name: string; versions: number[] }> {
  return Array.from(_registry.entries()).map(([name, list]) => ({
    name,
    versions: list.map((r) => r.version),
  }));
}
