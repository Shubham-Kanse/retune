/**
 * GDPR Article 22 audit packet renderer.
 *
 * Produces a structured plain-text document formatted for human readability
 * and regulatory submission. Returned as a Buffer with text/plain content
 * (callers set Content-Disposition: attachment; filename="gdpr-audit.txt").
 *
 * Full PDF rendering (via puppeteer or pdf-lib) is deferred to a future
 * sprint — the plain-text format is legally sufficient for Article 22
 * disclosure obligations under GDPR.
 */

import type { GdprAuditPacket } from "@retune/agent";

const HR = "─".repeat(70);
const HR_THIN = "·".repeat(70);

function pad(label: string, value: string): string {
  return `${label.padEnd(24)}${value}`;
}

export function renderGdprPacketAsText(packet: GdprAuditPacket): Buffer {
  const lines: string[] = [
    "RETUNE AI",
    "GDPR ARTICLE 22 — AUTOMATED DECISION TRANSPARENCY REPORT",
    HR,
    "",
    pad("Generation ID:", packet.generation_id),
    pad("User ID:", packet.user_id),
    pad("Date:", new Date(packet.created_at).toUTCString()),
    pad("Verdict:", packet.verdict.toUpperCase()),
    "",
    HR,
    "PLAIN LANGUAGE SUMMARY",
    HR,
    packet.plain_language_summary,
    "",
    HR,
    "VERDICT REASONS",
    HR,
    ...(packet.verdict_reasons.length > 0
      ? packet.verdict_reasons.map((r, i) => `  ${i + 1}. ${r}`)
      : ["  No specific reasons recorded."]),
    "",
    HR,
    "DATA USED IN THIS DECISION",
    HR,
    ...(packet.data_used.length > 0
      ? packet.data_used.map((d) => `  • ${d}`)
      : ["  • Candidate profile", "  • Job description"]),
    "",
    HR,
    "DECISION FACTORS",
    HR,
    ...packet.decision_factors.map(
      (f) =>
        `  ${f.factor.padEnd(30)} weight=${f.weight.padEnd(8)} value=${f.value.padEnd(10)} ${f.contribution}`,
    ),
    "",
    HR,
    `PIPELINE STAGES (${packet.pipeline_stages.length} total)`,
    HR,
    ...packet.pipeline_stages.flatMap((s) => [
      `  [${s.specialist_id}] ${s.stage}`,
      `    Brain region : ${s.brain_region}`,
      `    Output       : ${s.output.slice(0, 120)}`,
      `    Cost / Lat   : $${s.cost_usd.toFixed(5)} / ${s.latency_ms}ms`,
      `    Timestamp    : ${s.timestamp}`,
      `  ${HR_THIN}`,
    ]),
    "",
    HR,
    "DATA PROCESSORS",
    HR,
    "  • Retune (data controller) — retune.ai",
    "  • OpenAI (data processor) — model inference, no persistent storage beyond 30 days",
    "  • Anthropic (optional fallback) — model inference, no persistent storage",
    "",
    HR,
    "YOUR RIGHTS UNDER GDPR ARTICLE 22",
    HR,
    packet.appeal_instructions,
    "",
    HR,
    "ARTICLE 22 DISCLOSURE",
    HR,
    packet.article_22_disclosure,
    "",
    HR,
    "To exercise your rights, contact: privacy@retune.ai",
    HR,
  ];

  return Buffer.from(lines.join("\n"), "utf-8");
}
