/**
 * Thinking coverage test (technical-2.0 §25.2).
 *
 * Proves all 17 thinking components from the taxonomy are covered by
 * at least one registered specialist.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
const THINKING_COMPONENTS = [
  "perception",
  "attention",
  "working_memory",
  "long_term_memory",
  "pattern_recognition",
  "causal_reasoning",
  "analogical_reasoning",
  "planning",
  "decision_making",
  "metacognition",
  "language_production",
  "language_comprehension",
  "social_cognition",
  "emotional_processing",
  "motor_sequencing",
  "inhibition",
  "cognitive_flexibility",
] as const;

function walk_ts(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk_ts(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function extract_thinking_tags(root: string): Set<string> {
  const dirs = [
    path.join(root, "packages/agent/src/specialists"),
    path.join(root, "packages/agent/src/comprehension"),
  ];
  const found = new Set<string>();
  for (const dir of dirs) {
    for (const file of walk_ts(dir)) {
      const content = fs.readFileSync(file, "utf-8");
      const match = content.match(/@thinking\s+(\w+)/);
      if (match?.[1]) found.add(match[1]);
    }
  }
  return found;
}

test("all 17 thinking components are covered by at least one specialist", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const found = extract_thinking_tags(root);
  const missing = THINKING_COMPONENTS.filter((c) => !found.has(c));
  assert.deepEqual(
    missing,
    [],
    `Missing thinking components (no specialist covers them): ${missing.join(", ")}`,
  );
});
