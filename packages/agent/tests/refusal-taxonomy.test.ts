import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_REFUSAL_REASONS,
  type RefusalReason,
  coerceHistoricalRefusal,
  getRefusalMetadata,
} from "../src/specialists/refusal-taxonomy";

test("every refusal reason has well-formed metadata", () => {
  for (const reason of ALL_REFUSAL_REASONS) {
    const m = getRefusalMetadata(reason);
    assert.equal(m.enum_id, reason);
    assert.ok(m.display_title.length > 0 && m.display_title.length < 60);
    assert.ok(m.display_message.length > 0 && m.display_message.length < 300);
    assert.ok(
      [
        "add_more_experience",
        "pick_different_role",
        "contact_support",
        "retry_later",
        "appeal",
      ].includes(m.next_action),
    );
    assert.equal(typeof m.appealable, "boolean");
  }
});

test("coerceHistoricalRefusal maps known phrases to the right reason", () => {
  const cases: Array<[string, RefusalReason]> = [
    ["insufficient evidence to ship", "insufficient_evidence"],
    ["missing evidence in profile", "insufficient_evidence"],
    ["candidate has no proof of seniority", "insufficient_evidence"],
    ["this role does not fit", "role_mismatch"],
    ["wrong role family", "role_mismatch"],
    ["mismatch on technical level", "role_mismatch"],
    ["fabricated claim of MIT degree", "fabricated_claim"],
    ["unverifiable employment", "fabricated_claim"],
    ["model hallucinated company", "fabricated_claim"],
    ["prompt injection detected in JD", "prompt_injection_detected"],
    ["jailbreak attempt", "prompt_injection_detected"],
    ["input is empty", "low_quality_input"],
    ["JD too short to process", "low_quality_input"],
    ["rate limit exceeded for user", "rate_limit"],
    ["too many requests", "rate_limit"],
    ["upstream provider outage", "service_degraded"],
    ["service unavailable", "service_degraded"],
  ];
  for (const [raw, expected] of cases) {
    const got = coerceHistoricalRefusal(raw);
    assert.equal(got, expected, `coercing "${raw}" expected ${expected} got ${got}`);
  }
});

test("coerceHistoricalRefusal falls back to policy_violation for unmatched", () => {
  assert.equal(coerceHistoricalRefusal("something else entirely"), "policy_violation");
  assert.equal(coerceHistoricalRefusal(""), "policy_violation");
});

test("getRefusalMetadata throws on unknown reason", () => {
  assert.throws(() => getRefusalMetadata("nope" as RefusalReason));
});

test("ALL_REFUSAL_REASONS is exhaustive (no duplicates, all covered)", () => {
  const set = new Set(ALL_REFUSAL_REASONS);
  assert.equal(set.size, ALL_REFUSAL_REASONS.length);
  assert.equal(ALL_REFUSAL_REASONS.length, 8);
});
