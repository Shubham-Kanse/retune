#!/usr/bin/env tsx

/**
 * Adversarial corpus live-pipeline runner (Charter 26 Epic 02 + Charter 21 Epic 02).
 *
 * Runs each adversarial case through the real cognitive pipeline and asserts
 * the verdict matches expected_outcome.refusal (or ship/pass).
 *
 * Usage:
 *   pnpm --filter @retune/eval eval:adversarial-live
 *
 * Requires: AI_PROVIDER + ANTHROPIC_API_KEY or OPENAI_API_KEY in env.
 * Exits 0 if all cases pass, 1 if any fail.
 */

import { TraceBus, run_cognitive_pipeline, coerceHistoricalRefusal } from "@retune/agent";
import { loadAdversarial } from "./loader.js";
import type { AdversarialCase } from "./loader.js";

// ──────────── Types ────────────

interface CaseResult {
  id: string;
  attack_class: string;
  expected: string; // refusal reason or "ship"
  actual_verdict: "ship" | "revise" | "refuse" | "error";
  actual_reason: string | null;
  passed: boolean;
  error?: string;
  latency_ms: number;
}

// ──────────── Pipeline invocation ────────────

async function run_adversarial_case(c: AdversarialCase): Promise<CaseResult> {
  const t0 = Date.now();
  const bus = new TraceBus();

  let gate_verdict: "ship" | "revise" | "refuse" | null = null;
  let gate_reasons: string[] = [];
  let pipeline_error: string | null = null;

  const expected_ship = !!(c.expected_outcome.ship || c.expected_outcome.pass);
  const expected_refusal = c.expected_outcome.refusal ?? null;

  // Collect trace events to extract gate verdict
  const collect = async () => {
    for await (const frame of bus.subscribe()) {
      if (frame.kind === "trace") {
        const ev = frame.event as unknown as Record<string, unknown>;
        if (ev["specialist"] === "refuse_or_ship_gate" && typeof ev["justification"] === "string") {
          const j = ev["justification"];
          const verdictMatch = j.match(/VERDICT:\s*(SHIP|REFUSE|REVISE)/i);
          if (verdictMatch?.[1]) {
            gate_verdict = verdictMatch[1].toLowerCase() as "ship" | "revise" | "refuse";
          }
          // Extract reasons from justification: "N reason(s): <first reason>"
          const reasonMatch = j.match(/reason\(s\):\s*(.+)$/);
          if (reasonMatch?.[1]) {
            gate_reasons = [reasonMatch[1].trim()];
          }
        }
      } else if (frame.kind === "error") {
        pipeline_error = frame.message;
      }
    }
  };

  const collectPromise = collect();

  try {
    await run_cognitive_pipeline({
      generation_id: `adv-eval-${c.id}-${Date.now()}`,
      payload: {
        jd_text: c.payload.jd_text ?? "",
        profile_text: c.payload.profile_text ?? "",
        jd_title: `Adversarial case ${c.id}`,
        company: "eval",
      },
      bus,
    });
  } catch (err) {
    pipeline_error = err instanceof Error ? err.message : String(err);
    bus.publish({ kind: "error", message: pipeline_error });
  }

  await collectPromise;

  const latency_ms = Date.now() - t0;

  if (pipeline_error && !gate_verdict) {
    return {
      id: c.id,
      attack_class: c.attack_class,
      expected: expected_refusal ?? "ship",
      actual_verdict: "error",
      actual_reason: null,
      passed: false,
      error: pipeline_error,
      latency_ms,
    };
  }

  const actual_verdict: "ship" | "revise" | "refuse" | "error" = (
    gate_verdict !== null ? gate_verdict : (pipeline_error ? "error" : "ship")
  ) as "ship" | "revise" | "refuse" | "error";

  // Map gate reasons to a RefusalReason enum value
  let actual_reason: string | null = null;
  if (actual_verdict === "refuse" && gate_reasons.length > 0 && gate_reasons[0]) {
    actual_reason = coerceHistoricalRefusal(gate_reasons[0]);
  }

  // Evaluate pass/fail
  let passed: boolean;
  if (expected_ship) {
    // Expected to ship — pipeline must not refuse
    passed = actual_verdict === "ship";
  } else if (expected_refusal) {
    // Expected a specific refusal reason
    passed = actual_verdict === "refuse" && actual_reason === expected_refusal;
  } else {
    passed = false;
  }

  return {
    id: c.id,
    attack_class: c.attack_class,
    expected: expected_refusal ?? "ship",
    actual_verdict: actual_verdict as "ship" | "revise" | "refuse" | "error",
    actual_reason,
    passed,
    latency_ms,
  };
}

// ──────────── Main ────────────

async function main(): Promise<void> {
  const cases = loadAdversarial();
  console.log(`── Adversarial Live Eval ──────────────────────────────`);
  console.log(`Running ${cases.length} cases through the live pipeline…`);
  console.log(`AI_PROVIDER: ${process.env.AI_PROVIDER ?? "not set"}`);
  console.log();

  const results: CaseResult[] = [];

  for (const c of cases) {
    process.stdout.write(`  ${c.id} (${c.attack_class})… `);
    const result = await run_adversarial_case(c);
    results.push(result);
    const icon = result.passed ? "✅" : "❌";
    const detail = result.passed
      ? `${result.actual_verdict}`
      : `expected=${result.expected} actual=${result.actual_verdict}${result.actual_reason ? `/${result.actual_reason}` : ""}${result.error ? ` err=${result.error.slice(0, 60)}` : ""}`;
    console.log(`${icon} ${detail} (${result.latency_ms}ms)`);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);

  console.log();
  console.log(`── Results ────────────────────────────────────────────`);
  console.log(`Passed: ${passed}/${results.length}`);

  if (failed.length > 0) {
    console.log(`\nFailed cases:`);
    for (const r of failed) {
      console.log(`  ${r.id}: expected=${r.expected} actual=${r.actual_verdict}${r.actual_reason ? `/${r.actual_reason}` : ""}${r.error ? ` [${r.error.slice(0, 80)}]` : ""}`);
    }
    console.log(`\n❌ adversarial live eval FAILED — ${failed.length} case(s) did not match expected outcome`);
    process.exit(1);
  }

  console.log(`\n✅ adversarial live eval PASSED — all ${passed} cases matched expected outcome`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
