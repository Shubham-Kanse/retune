/**
 * Cognitive-tags lint plugin.
 *
 * Enforces that every registered specialist (any .ts file in
 * specialists/ or comprehension/ that exports a class implementing
 * the Specialist or EventListener interface) has the required JSDoc
 * metadata tags:
 *
 *   @brain         — brain region mapping (already present everywhere)
 *   @thinking      — one of the 17 thinking components (technical-2.0 §25.1)
 *   @cellType      — neural cell type analogy (technical-2.0 §27.1)
 *   @neurotransmitter — primary signaling molecule analogy
 *
 * Usage:
 *   npx tsx tools/lint/cognitive-tags.ts [--fix]
 *
 * Exit code 0 = all pass, 1 = violations found.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ──────────── Taxonomies (technical-2.0 §25.1, §27.1) ────────────

export const THINKING_COMPONENTS = [
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

export const CELL_TYPES = [
  "pyramidal",
  "interneuron",
  "stellate",
  "purkinje",
  "granule",
  "mirror",
  "place",
  "grid",
  "spindle",
  "chandelier",
] as const;

export const NEUROTRANSMITTERS = [
  "glutamate",
  "GABA",
  "dopamine",
  "serotonin",
  "norepinephrine",
  "acetylcholine",
  "endorphin",
  "oxytocin",
] as const;

// ──────────── Glia analogues (§27.3) ────────────

export const GLIA_TYPES = {
  astrocyte: "connection pools, resource management",
  oligodendrocyte: "caching layers, memoization",
  microglia: "telemetry, observability, GC",
  ependymal: "data flow, stream routing",
} as const;

// ──────────── Scanner ────────────

interface Violation {
  file: string;
  missing: string[];
  invalid: { tag: string; value: string; allowed: readonly string[] }[];
}

const REQUIRED_TAGS = ["brain", "thinking", "cellType", "neurotransmitter"] as const;

const TAG_VALIDATORS: Record<string, readonly string[]> = {
  thinking: THINKING_COMPONENTS,
  cellType: CELL_TYPES,
  neurotransmitter: NEUROTRANSMITTERS,
};

function extract_jsdoc_tags(content: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const regex = /@(brain|thinking|cellType|neurotransmitter)\s+(.+?)(?:\n|\*\/)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    const val = match[2]?.trim();
    if (key && val) {
      tags[key] = val;
    }
  }
  return tags;
}

function is_specialist_file(content: string): boolean {
  return (
    /class\s+\w+.*implements\s+(Specialist|EventListener)/.test(content) ||
    (/readonly\s+id\s*=/.test(content) && /readonly\s+brain_region\s*=/.test(content))
  );
}

export function lint_cognitive_tags(root_dir: string): Violation[] {
  const violations: Violation[] = [];
  const dirs = [
    path.join(root_dir, "packages/agent/src/specialists"),
    path.join(root_dir, "packages/agent/src/comprehension"),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = walk_ts(dir);
    for (const file of files) {
      if (file.endsWith("index.ts") || file.endsWith("registry.ts")) continue;
      const content = fs.readFileSync(file, "utf-8");
      if (!is_specialist_file(content)) continue;

      const tags = extract_jsdoc_tags(content);
      const missing: string[] = [];
      const invalid: Violation["invalid"] = [];

      for (const tag of REQUIRED_TAGS) {
        if (!tags[tag]) {
          missing.push(`@${tag}`);
        } else if (TAG_VALIDATORS[tag]) {
          const val = tags[tag]!.split(/[,+]/)[0]!.trim();
          const allowed = TAG_VALIDATORS[tag]!;
          if (!allowed.includes(val as (typeof allowed)[number])) {
            invalid.push({ tag: `@${tag}`, value: val, allowed });
          }
        }
      }

      if (missing.length > 0 || invalid.length > 0) {
        violations.push({ file: path.relative(root_dir, file), missing, invalid });
      }
    }
  }

  return violations;
}

function walk_ts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk_ts(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

// ──────────── CLI entrypoint ────────────

if (process.argv[1]?.endsWith("cognitive-tags.ts")) {
  const root = path.resolve(__dirname, "../..");
  const violations = lint_cognitive_tags(root);
  if (violations.length === 0) {
    console.log("✓ All specialist files have required cognitive tags.");
    process.exit(0);
  }
  console.error(`✗ ${violations.length} file(s) missing cognitive tags:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}`);
    if (v.missing.length > 0) console.error(`    missing: ${v.missing.join(", ")}`);
    for (const inv of v.invalid) {
      console.error(`    invalid ${inv.tag}: "${inv.value}" (allowed: ${inv.allowed.join(", ")})`);
    }
  }
  process.exit(1);
}
