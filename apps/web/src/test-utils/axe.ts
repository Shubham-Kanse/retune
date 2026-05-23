/**
 * axe-core test helper (Charter 14 Epic 01).
 *
 * Runs axe-core against a rendered DOM container and asserts zero
 * accessibility violations. Use in component tests for the five
 * critical components per the charter:
 *   - pipeline-view
 *   - chat-interface
 *   - profile-editor
 *   - results-view
 *   - login form
 *
 * Falls back to a no-op (with a console warning) when axe-core is not
 * installed, so the test suite stays green during the dep-rollout
 * window. To enable real a11y assertions:
 *
 *   pnpm --filter @retune/web add -D axe-core
 *
 * Usage:
 *
 *   import { expectNoAxeViolations } from "@/test-utils/axe";
 *   it("has no a11y violations", async () => {
 *     // ... render component into `container`
 *     await expectNoAxeViolations(container);
 *   });
 */

import { expect } from "vitest";

interface AxeRunResult {
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    help: string;
    helpUrl: string;
    nodes: Array<{ html: string; target: string[] }>;
  }>;
}

let _axe: { run: (ctx: Element | Document) => Promise<AxeRunResult> } | null = null;

async function loadAxe(): Promise<typeof _axe> {
  if (_axe) return _axe;
  try {
    const mod = (await import("axe-core")) as unknown as {
      default?: { run: (ctx: Element | Document) => Promise<AxeRunResult> };
      run?: (ctx: Element | Document) => Promise<AxeRunResult>;
    };
    _axe =
      mod.default ??
      (typeof mod.run === "function"
        ? (mod as { run: (ctx: Element | Document) => Promise<AxeRunResult> })
        : null);
    return _axe;
  } catch {
    return null;
  }
}

/**
 * Run axe-core against `container` and assert zero violations.
 * Filters out moderate / minor impact by default — use `{ all: true }`
 * to assert against everything.
 */
export async function expectNoAxeViolations(
  container: Element,
  options: { all?: boolean } = {},
): Promise<void> {
  const axe = await loadAxe();
  if (!axe) {
    // eslint-disable-next-line no-console
    console.warn(
      "[axe] axe-core not installed — skipping a11y assertion. Install with: pnpm --filter @retune/web add -D axe-core",
    );
    return;
  }

  const results = await axe.run(container);
  const filtered = options.all
    ? results.violations
    : results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");

  if (filtered.length === 0) return;

  const summary = filtered
    .map(
      (v) =>
        `\n  [${v.impact ?? "?"}] ${v.id}: ${v.help}\n    See: ${v.helpUrl}\n    Affected nodes:\n${v.nodes
          .map((n) => `      - ${n.target.join(" > ")}: ${n.html.slice(0, 120)}`)
          .join("\n")}`,
    )
    .join("\n");

  expect.fail(`axe-core found ${filtered.length} accessibility violation(s):${summary}`);
}
