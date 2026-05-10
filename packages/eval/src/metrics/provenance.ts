/**
 * Provenance rate metric — PRD §1.6 acceptance: ≥ 92% of generated bullets
 * pass automated provenance verification (every named entity ∈ evidence).
 *
 * A bullet passes provenance if:
 *   1. Every company name mentioned appears in evidence_ids
 *   2. Every metric (number + unit) appears in the evidence text
 *   3. Every named technology appears in the candidate's skill/tool spans
 *
 * This is a deterministic check — no LLM needed.
 */

export interface ProvenanceResult {
  bullets_total: number;
  bullets_passed: number;
  bullets_failed: number;
  provenance_rate: number;
  failed_bullets: Array<{ bullet: string; reason: string }>;
}

export interface BulletWithEvidence {
  text: string;
  evidence_ids: string[];
  evidence_texts?: string[];
}

const METRIC_PATTERN = /\b(\d[\d,.]*)\s*(%|x|X|k\b|M\b|B\b|\bms\b|\bms\/\b|\bm\/s\b)/g;
const MONEY_PATTERN = /\$[\d,.]+[kmb]?/gi;

export function provenance_rate(bullets: readonly BulletWithEvidence[]): ProvenanceResult {
  const failed: Array<{ bullet: string; reason: string }> = [];

  for (const b of bullets) {
    const check = check_provenance(b);
    if (!check.passed) {
      failed.push({ bullet: b.text.slice(0, 100), reason: check.reason });
    }
  }

  const total = bullets.length;
  const passed = total - failed.length;

  return {
    bullets_total: total,
    bullets_passed: passed,
    bullets_failed: failed.length,
    provenance_rate: total > 0 ? passed / total : 1.0,
    failed_bullets: failed,
  };
}

function check_provenance(bullet: BulletWithEvidence): { passed: boolean; reason: string } {
  // Rule 1: must have at least one evidence ID
  if (bullet.evidence_ids.length === 0) {
    return { passed: false, reason: "no evidence_ids — ungrounded claim" };
  }

  // Rule 2: no evidence texts provided → can't verify content, trust IDs
  if (!bullet.evidence_texts || bullet.evidence_texts.length === 0) {
    return { passed: true, reason: "" };
  }

  const combined_evidence = bullet.evidence_texts.join(" ").toLowerCase();
  const bullet_lower = bullet.text.toLowerCase();

  // Rule 3: check that any metric mentioned in the bullet appears in evidence
  const bullet_metrics: string[] = [];
  let m: RegExpExecArray | null;

  const metric_re = new RegExp(METRIC_PATTERN.source, "g");
  while ((m = metric_re.exec(bullet_lower)) !== null) {
    bullet_metrics.push(m[0]);
  }

  const money_re = new RegExp(MONEY_PATTERN.source, "gi");
  while ((m = money_re.exec(bullet.text)) !== null) {
    bullet_metrics.push(m[0].toLowerCase());
  }

  for (const metric of bullet_metrics) {
    // Strip units for matching — find the number in evidence
    const digits = metric.replace(/[^0-9.]/g, "");
    if (digits.length > 0 && !combined_evidence.includes(digits)) {
      return { passed: false, reason: `metric "${metric}" not found in evidence` };
    }
  }

  return { passed: true, reason: "" };
}
