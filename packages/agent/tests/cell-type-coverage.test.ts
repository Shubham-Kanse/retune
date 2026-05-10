/**
 * Cell-type coverage test (technical-2.0 §27.2).
 *
 * Proves every registered specialist file has @cellType and
 * @neurotransmitter JSDoc metadata.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";

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

function is_specialist_file(content: string): boolean {
  return (
    /class\s+\w+.*implements\s+(Specialist|EventListener)/.test(content) ||
    (/readonly\s+id\s*=/.test(content) && /readonly\s+brain_region\s*=/.test(content))
  );
}

test("every specialist has @cellType and @neurotransmitter tags", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const dirs = [
    path.join(root, "packages/agent/src/specialists"),
    path.join(root, "packages/agent/src/comprehension"),
  ];
  const missing_cell: string[] = [];
  const missing_neuro: string[] = [];

  for (const dir of dirs) {
    for (const file of walk_ts(dir)) {
      if (file.endsWith("index.ts") || file.endsWith("registry.ts")) continue;
      const content = fs.readFileSync(file, "utf-8");
      if (!is_specialist_file(content)) continue;

      const rel = path.relative(root, file);
      if (!/@cellType\s+\w+/.test(content)) missing_cell.push(rel);
      if (!/@neurotransmitter\s+\w+/.test(content)) missing_neuro.push(rel);
    }
  }

  assert.deepEqual(missing_cell, [], `Missing @cellType: ${missing_cell.join(", ")}`);
  assert.deepEqual(missing_neuro, [], `Missing @neurotransmitter: ${missing_neuro.join(", ")}`);
});
