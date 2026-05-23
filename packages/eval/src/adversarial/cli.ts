#!/usr/bin/env tsx

/**
 * Adversarial corpus validator (Charter 26 Epic 02 + Charter 21 Epic 02).
 *
 * Loads the corpus, validates schema, and asserts coverage minimums:
 *   - At least 12 cases (current baseline; bump as the corpus grows).
 *   - At least 6 distinct attack classes covered.
 *   - At least 4 distinct expected refusal reasons covered.
 *   - All ids are unique.
 *
 * Exits 0 on green, 1 on any failure. Runs in pure-JS mode (no LLM
 * calls) so it can gate every PR cheaply. The full pipeline-level
 * evaluation against this corpus runs in the nightly eval-live job.
 */

import { loadAdversarial, summariseAdversarial } from "./loader";

const MIN_CASES = 12;
const MIN_ATTACK_CLASSES = 6;
const MIN_REFUSAL_REASONS = 4;

function main(): void {
  const cases = loadAdversarial();
  const stats = summariseAdversarial(cases);

  console.log("── Adversarial Corpus ─────────────────────────────────");
  console.log(`Total cases:      ${stats.total}`);
  console.log(`Unique IDs:       ${stats.unique_ids ? "yes" : "DUPLICATES FOUND"}`);
  console.log("Attack classes:");
  for (const [k, v] of Object.entries(stats.byAttackClass).sort()) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }
  console.log("Expected refusal reasons:");
  for (const [k, v] of Object.entries(stats.byExpectedRefusal).sort()) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }
  if (stats.shipExpected > 0) {
    console.log(`Boundary "ship" cases: ${stats.shipExpected}`);
  }

  // Coverage gates.
  const failures: string[] = [];
  if (stats.total < MIN_CASES) {
    failures.push(`corpus has ${stats.total} cases, minimum is ${MIN_CASES}`);
  }
  if (Object.keys(stats.byAttackClass).length < MIN_ATTACK_CLASSES) {
    failures.push(
      `corpus covers ${Object.keys(stats.byAttackClass).length} attack classes, minimum is ${MIN_ATTACK_CLASSES}`,
    );
  }
  if (Object.keys(stats.byExpectedRefusal).length < MIN_REFUSAL_REASONS) {
    failures.push(
      `corpus covers ${Object.keys(stats.byExpectedRefusal).length} refusal reasons, minimum is ${MIN_REFUSAL_REASONS}`,
    );
  }
  if (!stats.unique_ids) {
    failures.push("corpus has duplicate ids — every case must have a unique adv-NNN id");
  }

  if (failures.length === 0) {
    console.log("\n✅ adversarial corpus passes all coverage gates");
    process.exit(0);
  }
  console.log("\n❌ adversarial corpus failed coverage gates:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

main();
