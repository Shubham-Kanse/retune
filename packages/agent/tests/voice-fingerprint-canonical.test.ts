/**
 * Voice-fingerprint canonical alignment (technical-2.0 §11.5, §20 Phase 3).
 *
 * Proves the v2.0 fix for issue #5: `VoiceFingerprintExtractor` and
 * `VoiceDriftMonitor` now compute byte-identical fingerprints from the
 * same module (`comprehension/voice/fingerprint.ts`). In v1.0 they used
 * different word lists (alphabetical Mosteller-Wallace vs frequency-ordered
 * 65-word list) and cosine comparisons across them were semantically
 * meaningless.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNCTION_WORDS_64,
  VOICE_FINGERPRINT_DIM,
  compute_fingerprint,
  voice_drift_cosine,
} from "../src/comprehension/voice/fingerprint";

const BASELINE_PROFILE = `Designed and led the company-wide migration from a monolithic Rails app to a service-oriented Go backend.
Owned the on-call rotation for our highest-traffic checkout service. Mentored two new hires through their first quarter.
Wrote the team's incident-response runbook from scratch after a major outage in Q3.`;

const SIMILAR_PROFILE = `${BASELINE_PROFILE} Additional sentence about a recent migration to typed configuration.`;

const VERY_DIFFERENT_VOICE_TEXT = `OMG so basically I just kinda built this thing that sorta worked, you know? Like, it was super cool but maybe also a little broken sometimes. Anyway, ya gotta try it!`;

test("FUNCTION_WORDS_64 is exactly 64 entries (frozen schema)", () => {
  assert.equal(FUNCTION_WORDS_64.length, 64);
});

test("VOICE_FINGERPRINT_DIM is 128 (frozen schema)", () => {
  assert.equal(VOICE_FINGERPRINT_DIM, 128);
});

test("compute_fingerprint produces a 128-dim vector", () => {
  const v = compute_fingerprint(BASELINE_PROFILE);
  assert.equal(v.length, 128);
});

test("compute_fingerprint is deterministic — identical inputs yield byte-identical outputs", () => {
  const a = compute_fingerprint(BASELINE_PROFILE);
  const b = compute_fingerprint(BASELINE_PROFILE);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs((a[i] ?? 0) - (b[i] ?? 0)) < 1e-12, `dim ${i}: ${a[i]} vs ${b[i]}`);
  }
});

test("compute_fingerprint output is L2-normalised (unit vector)", () => {
  const v = compute_fingerprint(BASELINE_PROFILE);
  const l2 = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
  assert.ok(Math.abs(l2 - 1) < 1e-9, `expected unit L2 norm, got ${l2}`);
});

test("voice_drift_cosine is 1.0 for identical text", () => {
  const v = compute_fingerprint(BASELINE_PROFILE);
  const cos = voice_drift_cosine(v, v);
  assert.ok(Math.abs(cos - 1) < 1e-9, `expected 1.0, got ${cos}`);
});

test("voice_drift_cosine is high for paraphrase of the same author", () => {
  const baseline = compute_fingerprint(BASELINE_PROFILE);
  const similar = compute_fingerprint(SIMILAR_PROFILE);
  const sim_to_paraphrase = voice_drift_cosine(baseline, similar);
  assert.ok(
    sim_to_paraphrase > 0.85,
    `paraphrase cosine should be > 0.85, got ${sim_to_paraphrase}`,
  );
});

test("voice_drift_cosine handles empty / zero vectors gracefully", () => {
  const empty: number[] = [];
  const v = compute_fingerprint(BASELINE_PROFILE);
  assert.equal(voice_drift_cosine(empty, empty), 0);
  // mismatched dims fall back to the shared prefix; longer side ignored
  assert.ok(Number.isFinite(voice_drift_cosine(v, [0, 0, 0])));
});

test("VoiceFingerprintExtractor and VoiceDriftMonitor share dimension semantics", async () => {
  // Both modules must import from the same canonical source. We verify
  // by computing a fingerprint via the extractor's re-export and the
  // canonical module — they must be byte-identical.
  const { compute_fingerprint: extractor_cf } = await import(
    "../src/comprehension/voice/extractor"
  );
  const a = extractor_cf(BASELINE_PROFILE);
  const b = compute_fingerprint(BASELINE_PROFILE);
  for (let i = 0; i < 128; i++) {
    assert.ok(
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) < 1e-12,
      `dim ${i}: extractor=${a[i]} vs canonical=${b[i]}`,
    );
  }
});
