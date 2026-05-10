/**
 * Canonical eval-set loader.
 *
 * The canonical set lives at `src/canonical/cases.jsonl`. Each line is a
 * tuple of (jd, profile, expert_package, outcome) used to evaluate the
 * full pipeline end-to-end. PRD §15.1 commits to 200 cases by week 8;
 * commit #1 seeds 3.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ExpertBulletSchema = z.object({
  text: z.string().min(1),
  evidence_ids: z.array(z.string()).min(1),
});

export const ExpertPackageSchema = z.object({
  summary: z.string(),
  experience_bullets: z.array(ExpertBulletSchema),
  cover_letter: z.string(),
});

export const ExpectedOutcomeSchema = z.object({
  callback_at_human_baseline: z.boolean(),
  notes: z.string().optional(),
});

export const CanonicalCaseSchema = z.object({
  id: z.string().min(1),
  persona: z.enum([
    "new_grad",
    "experienced",
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "executive",
  ]),
  market: z.enum(["US", "UK", "EU", "IN", "CA", "AU"]),
  industry: z.enum(["saas", "fintech", "healthcare", "legal", "manufacturing"]).optional(),
  role_family: z.string(),
  jd_text: z.string().min(50),
  profile_markdown: z.string().min(50),
  expert_package: ExpertPackageSchema,
  expected_outcome: ExpectedOutcomeSchema,
  rationale: z.string().optional(),
});
export type CanonicalCase = z.infer<typeof CanonicalCaseSchema>;

export function load_canonical(path?: string): CanonicalCase[] {
  const file = path ?? resolve(__dirname, "cases.jsonl");
  const raw = readFileSync(file, "utf-8");
  const cases: CanonicalCase[] = [];
  let lineno = 0;
  for (const line of raw.split("\n")) {
    lineno++;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`canonical case at line ${lineno}: invalid JSON: ${describe(err)}`);
    }
    const result = CanonicalCaseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `canonical case at line ${lineno}: schema validation failed: ${result.error.message}`,
      );
    }
    cases.push(result.data);
  }
  return cases;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
