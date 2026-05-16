/**
 * Phase 8 SOTA artifact scoring tests.
 *
 * Proves:
 *   - Eval refuses (passed=false) when the claim ledger is not locked.
 *   - Eval refuses when a winning variant references claim ids outside
 *     the locked ledger (fabrication detection at the artifact layer).
 *   - Eval refuses when a metric appears in the rendered markdown that
 *     does not appear in any consumed metric claim's text or evidence.
 *   - Eval refuses when a winning variant uses an `unsafe` claim.
 *   - Eval passes when every gate is satisfied.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { score_sota_artifacts } from "../src/metrics/sota-artifact-scoring";

const NOW = new Date().toISOString();

interface SotaInputBlock {
  claim_ledger?: unknown;
  draft_variants?: unknown[];
  rendered_package?: unknown;
}

function fixture(overrides: Partial<SotaInputBlock> = {}): { sota: SotaInputBlock } {
  const c1 = makeClaim({
    id: "c1",
    kind: "metric",
    text: "10k qps in production",
    evidence_quotes: [{ source_id: "src1", quote: "Built systems handling 10k qps", confidence: 0.9 }],
  });
  const c2 = makeClaim({
    id: "c2",
    kind: "leadership",
    text: "Led a team of 4",
    evidence_quotes: [{ source_id: "src1", quote: "Led a team of 4 engineers", confidence: 0.7 }],
  });

  const winnerId = randomUUID();
  const variant = {
    id: winnerId,
    flavor: "ats_forward",
    markdown: "# Resume\n\n- Built systems handling 10k qps\n- Led a team of 4\n",
    claim_ids: ["c1", "c2"],
    scores: {
      ats: 0.8,
      recruiter: 0.8,
      hiring_manager: 0.8,
      voice: 0.85,
      defensibility: 0.85,
      formatting: 0.85,
      market_fit: 0.7,
      fairness: 0.95,
    },
    total_score: 0.82,
    red_team_findings: [],
    reason_won: "test fixture",
    is_final: true,
    created_at: NOW,
  };

  const ledger = {
    schema_version: "sota-v3",
    generation_id: "11111111-1111-4111-8111-111111111111",
    claims: [c1, c2],
    locked: true,
    locked_at: NOW,
    locked_hash: "abc123",
  };

  const pkg = {
    schema_version: "sota-v3",
    generation_id: "11111111-1111-4111-8111-111111111111",
    artifacts: [
      {
        id: "a1",
        kind: "resume_markdown",
        uri: "inline:resume_markdown",
        bytes: 100,
        sha256: "f".repeat(64),
        parseable: true,
        rendered_at: NOW,
      },
    ],
    finalized: true,
    finalized_at: NOW,
  };

  return {
    sota: {
      claim_ledger: ledger,
      draft_variants: [variant],
      rendered_package: pkg,
      ...overrides,
    },
  };
}

function makeClaim(overrides: Record<string, unknown>) {
  return {
    id: "claim-x",
    kind: "skill",
    text: "TypeScript",
    normalized_text: "typescript",
    source_ids: ["src1"],
    evidence_quotes: [],
    confidence: 0.7,
    verified_by_user: false,
    defensibility: "moderate",
    interview_defense_prompt: "Tell me about TypeScript usage.",
    allowed_uses: ["resume"],
    forbidden_uses: [],
    created_at: NOW,
    ...overrides,
  };
}

test("score_sota_artifacts passes when every gate is satisfied", () => {
  const result = score_sota_artifacts(fixture());
  assert.equal(result.passed, true, `findings: ${result.findings.join(",")}`);
  assert.equal(result.gates.ledger_locked, true);
  assert.equal(result.gates.package_finalized, true);
  assert.equal(result.gates.every_claim_resolves, true);
  assert.equal(result.gates.every_metric_grounded, true);
  assert.equal(result.gates.no_unsafe_claim_in_winner, true);
});

test("score_sota_artifacts FAILS when claim ledger is not locked", () => {
  const f = fixture();
  (f.sota.claim_ledger as Record<string, unknown>).locked = false;
  (f.sota.claim_ledger as Record<string, unknown>).locked_hash = null;
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  assert.equal(result.gates.ledger_locked, false);
  assert.ok(result.findings.includes("claim_ledger_not_locked"));
});

test("score_sota_artifacts FAILS on dangling claim ids (fabrication detection)", () => {
  const f = fixture();
  const variants = f.sota.draft_variants as Array<Record<string, unknown>>;
  variants[0]!.claim_ids = ["c1", "fake-claim-id-no-source"];
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  assert.equal(result.gates.every_claim_resolves, false);
  assert.ok(result.findings.some((f) => f.startsWith("claim_ids_dangling")));
});

test("score_sota_artifacts FAILS on missing claim IDs (no claim_ids array)", () => {
  const f = fixture();
  const variants = f.sota.draft_variants as Array<Record<string, unknown>>;
  variants[0]!.claim_ids = [];
  // The variant becomes the winner but has zero claims → metrics in
  // markdown can't be grounded.
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  // Either every_metric_grounded fails OR every_claim_resolves still
  // passes vacuously — but the rendered metric "10k qps" cannot match
  // any claim corpus, so the metric gate fails.
  assert.equal(result.gates.every_metric_grounded, false);
});

test("score_sota_artifacts FAILS on ungrounded metric in markdown (fabricated metric)", () => {
  const f = fixture();
  const variants = f.sota.draft_variants as Array<Record<string, unknown>>;
  // Inject a fabricated metric that has no source.
  variants[0]!.markdown = "# Resume\n\n- Built systems handling 10k qps\n- Saved $42M annually\n";
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  assert.equal(result.gates.every_metric_grounded, false);
  assert.ok(result.findings.some((f) => f.startsWith("ungrounded_metrics")));
});

test("score_sota_artifacts FAILS when a winning variant uses an unsafe claim", () => {
  const f = fixture();
  const ledger = f.sota.claim_ledger as Record<string, unknown>;
  const claims = ledger.claims as Array<Record<string, unknown>>;
  // Mark the second claim as unsafe.
  claims[1]!.defensibility = "unsafe";
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  assert.equal(result.gates.no_unsafe_claim_in_winner, false);
  assert.ok(result.findings.some((f) => f.startsWith("unsafe_claims_in_winner")));
});

test("score_sota_artifacts FAILS when rendered_package is not finalized", () => {
  const f = fixture();
  const pkg = f.sota.rendered_package as Record<string, unknown>;
  pkg.finalized = false;
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  assert.equal(result.gates.package_finalized, false);
  assert.ok(result.findings.includes("rendered_package_not_finalized"));
});

test("score_sota_artifacts FAILS when an artifact is not parseable", () => {
  const f = fixture();
  const pkg = f.sota.rendered_package as Record<string, unknown>;
  const artifacts = pkg.artifacts as Array<Record<string, unknown>>;
  artifacts[0]!.parseable = false;
  const result = score_sota_artifacts(f);
  assert.equal(result.passed, false);
  assert.equal(result.gates.package_finalized, false);
});

test("score_sota_artifacts numeric scores reflect the gate outcomes", () => {
  const result = score_sota_artifacts(fixture());
  assert.equal(result.scores.provenance_rate, 1);
  assert.equal(result.scores.grounded_metric_rate, 1);
  assert.ok(result.scores.locked_claim_share > 0);
});
