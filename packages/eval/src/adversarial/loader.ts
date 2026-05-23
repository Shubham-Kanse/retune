/**
 * Adversarial corpus loader + validator (Charter 26 Epic 02).
 *
 * Loads `packages/eval/cases/adversarial.jsonl`, validates schema, and
 * surfaces aggregate stats. Runs in mock mode (no LLM calls) so it can
 * gate every PR cheaply.
 *
 * The full live-pipeline-vs-expected-refusal evaluation is a larger
 * deliverable tracked under Charter 21 Epic 02; this validator is the
 * structural baseline that ensures the corpus stays well-formed as
 * cases are added.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_REFUSAL_REASONS } from "@retune/agent";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Attack-class taxonomy. Aligned with the adversarial corpus README in
// docs/charters/26-ai-safety/epic-02-adversarial-corpus.md.
export const ATTACK_CLASSES = [
  "direct_prompt_injection_jd",
  "indirect_prompt_injection_profile",
  "fabrication_elicitation",
  "role_policy_abuse",
  "encoding_bypass",
  "jailbreak_template",
  "low_quality_input",
  "boundary_case",
] as const;

const RefusalReasonsZ = z.enum([...ALL_REFUSAL_REASONS] as [string, ...string[]]);

export const AdversarialCaseSchema = z.object({
  id: z.string().regex(/^adv-\d{3,}$/, "id must match /adv-\\d{3,}/"),
  attack_class: z.enum(ATTACK_CLASSES),
  payload: z
    .object({
      jd_text: z.string().optional(),
      profile_text: z.string().optional(),
    })
    .refine(
      (p) => Boolean(p.jd_text || p.profile_text),
      "payload must include jd_text or profile_text",
    ),
  expected_outcome: z
    .object({
      refusal: RefusalReasonsZ.optional(),
      ship: z.literal(true).optional(),
      // 'pass' is a synonym for 'ship: true' used in earlier seed cases.
      pass: z.literal(true).optional(),
    })
    .refine(
      (o) => Boolean(o.refusal || o.ship || o.pass),
      "expected_outcome must specify refusal: <reason> or ship: true (or pass: true)",
    ),
  notes: z.string().min(10),
});
export type AdversarialCase = z.infer<typeof AdversarialCaseSchema>;

export function loadAdversarial(path?: string): AdversarialCase[] {
  const file = path ?? resolve(__dirname, "..", "..", "cases", "adversarial.jsonl");
  const raw = readFileSync(file, "utf-8");
  const cases: AdversarialCase[] = [];
  let lineno = 0;
  for (const line of raw.split("\n")) {
    lineno++;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(
        `adversarial case at line ${lineno}: invalid JSON: ${err instanceof Error ? err.message : err}`,
      );
    }
    const result = AdversarialCaseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `adversarial case at line ${lineno} (${(parsed as { id?: string })?.id ?? "no id"}): ${result.error.message}`,
      );
    }
    cases.push(result.data);
  }
  return cases;
}

export interface AdversarialCorpusStats {
  total: number;
  byAttackClass: Record<string, number>;
  byExpectedRefusal: Record<string, number>;
  shipExpected: number;
  unique_ids: boolean;
}

export function summariseAdversarial(cases: AdversarialCase[]): AdversarialCorpusStats {
  const byAttackClass: Record<string, number> = {};
  const byExpectedRefusal: Record<string, number> = {};
  let shipExpected = 0;
  const seen = new Set<string>();
  let dup = false;
  for (const c of cases) {
    if (seen.has(c.id)) dup = true;
    seen.add(c.id);
    byAttackClass[c.attack_class] = (byAttackClass[c.attack_class] ?? 0) + 1;
    if (c.expected_outcome.refusal) {
      byExpectedRefusal[c.expected_outcome.refusal] =
        (byExpectedRefusal[c.expected_outcome.refusal] ?? 0) + 1;
    }
    if (c.expected_outcome.ship || c.expected_outcome.pass) shipExpected++;
  }
  return {
    total: cases.length,
    byAttackClass,
    byExpectedRefusal,
    shipExpected,
    unique_ids: !dup,
  };
}
