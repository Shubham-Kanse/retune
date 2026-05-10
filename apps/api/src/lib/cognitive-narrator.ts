/**
 * Generates a plain-language "How I thought about this" summary from pipeline traces.
 * Deterministic — no LLM call.
 */

import type { TraceEvent } from "@retune/agent";

export function generateCognitiveSummary(traces: TraceEvent[]): string {
  if (traces.length === 0) return "";

  const specialists = [...new Set(traces.map((t) => t.specialist))];
  const totalCost = traces.reduce((s, t) => s + (t.cost_usd ?? 0), 0);
  const totalLatencyMs = traces.reduce((s, t) => s + (t.latency_ms ?? 0), 0);

  const hasVoice = specialists.includes("voice_fingerprint_extractor");
  const hasOutcome = specialists.includes("outcome_predictor");
  const hasTheoryOfMind = specialists.includes("theory_of_mind");
  const hasCritic = specialists.includes("critic_ensemble");
  const hasGapMapper = specialists.includes("gap_mapper");

  const outcomeTrace = [...traces].reverse().find((t) => t.specialist === "outcome_predictor");
  const shipTrace = [...traces].reverse().find((t) => t.specialist === "refuse_or_ship_gate");

  const parts: string[] = [];

  parts.push(
    `Analyzed your profile using ${specialists.length} cognitive modules across ${Math.round(totalLatencyMs / 1000)}s.`,
  );

  if (hasGapMapper) {
    parts.push(
      "Mapped every job requirement against your actual experience to prevent fabrication.",
    );
  }

  if (hasVoice) {
    parts.push(
      "Extracted your natural writing voice and used it to keep the resume sounding like you.",
    );
  }

  if (hasTheoryOfMind) {
    parts.push("Modeled how a recruiter will read and evaluate your application.");
  }

  if (hasCritic) {
    parts.push("A critic ensemble reviewed the output from multiple perspectives before shipping.");
  }

  if (hasOutcome && outcomeTrace) {
    const justification = outcomeTrace.justification ?? "";
    const probMatch = justification.match(/(\d+(?:\.\d+)?)\s*%/);
    if (probMatch) {
      parts.push(`Estimated interview call probability: ${probMatch[1]}%.`);
    }
  }

  if (shipTrace) {
    const verdict = shipTrace.justification?.includes("ship")
      ? "cleared all quality gates"
      : "flagged issues for your review";
    parts.push(`Final quality check: ${verdict}.`);
  }

  if (totalCost > 0) {
    parts.push(`Total compute cost: $${totalCost.toFixed(4)}.`);
  }

  return parts.join(" ");
}
