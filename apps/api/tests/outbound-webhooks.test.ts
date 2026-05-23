import assert from "node:assert/strict";
import test from "node:test";
import {
  WEBHOOK_RETRY_SCHEDULE_MS,
  isTerminalFailure,
  signWebhookDelivery,
  verifyWebhookDelivery,
} from "../src/lib/outbound-webhooks";

const SECRET = "test-webhook-secret-32-character-padding";

const event = {
  id: "evt_test_001",
  type: "generation.completed" as const,
  created_at: "2026-05-23T00:00:00.000Z",
  user_id: "00000000-0000-4000-8000-000000000001",
  data: { generation_id: "gen_001", outcome: "shipped" },
};

test("signWebhookDelivery → verifyWebhookDelivery round-trip succeeds", () => {
  const delivery = signWebhookDelivery({
    url: "https://example.com/hook",
    secret: SECRET,
    event,
    attempt: 1,
    now: 1_700_000_000_000,
  });

  assert.equal(delivery.method, "POST");
  assert.equal(delivery.headers["x-retune-event"], "generation.completed");
  assert.equal(delivery.headers["x-retune-event-id"], "evt_test_001");
  assert.equal(delivery.headers["x-retune-attempt"], "1");

  const result = verifyWebhookDelivery(
    delivery.body,
    delivery.headers["x-retune-signature"] ?? "",
    SECRET,
    // Tolerance long enough to accept the test's frozen timestamp.
    1_000_000_000,
  );
  assert.equal(result.valid, true);
});

test("verifyWebhookDelivery rejects mismatched signature", () => {
  const delivery = signWebhookDelivery({
    url: "https://example.com/hook",
    secret: SECRET,
    event,
    attempt: 1,
    now: 1_700_000_000_000,
  });

  const result = verifyWebhookDelivery(
    delivery.body,
    delivery.headers["x-retune-signature"] ?? "",
    "different-webhook-secret-32-character-pad",
    1_000_000_000,
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature_mismatch");
});

test("verifyWebhookDelivery rejects timestamp outside tolerance", () => {
  const delivery = signWebhookDelivery({
    url: "https://example.com/hook",
    secret: SECRET,
    event,
    attempt: 1,
    now: 1_700_000_000_000,
  });

  const result = verifyWebhookDelivery(
    delivery.body,
    delivery.headers["x-retune-signature"] ?? "",
    SECRET,
    300, // 5 min — far too short for an ancient frozen timestamp
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, "timestamp_outside_tolerance");
});

test("signWebhookDelivery rejects weak secret", () => {
  assert.throws(() =>
    signWebhookDelivery({
      url: "https://example.com/hook",
      secret: "too-short",
      event,
      attempt: 1,
    }),
  );
});

test("legacy-secret rotation: subscriber accepts EITHER key", () => {
  const delivery = signWebhookDelivery({
    url: "https://example.com/hook",
    secret: SECRET,
    legacy_secret: "previous-webhook-secret-32-char-pad-old",
    event,
    attempt: 2,
    now: 1_700_000_000_000,
  });

  // New key works.
  const v_new = verifyWebhookDelivery(
    delivery.body,
    delivery.headers["x-retune-signature"] ?? "",
    SECRET,
    1_000_000_000,
  );
  assert.equal(v_new.valid, true);

  // Legacy key also works during rollover.
  const v_old = verifyWebhookDelivery(
    delivery.body,
    delivery.headers["x-retune-signature"] ?? "",
    "previous-webhook-secret-32-char-pad-old",
    1_000_000_000,
  );
  assert.equal(v_old.valid, true);
});

test("isTerminalFailure: 4xx is terminal except 408/429", () => {
  assert.equal(isTerminalFailure(200), false);
  assert.equal(isTerminalFailure(400), true);
  assert.equal(isTerminalFailure(401), true);
  assert.equal(isTerminalFailure(403), true);
  assert.equal(isTerminalFailure(404), true);
  assert.equal(isTerminalFailure(408), false); // request timeout: retry
  assert.equal(isTerminalFailure(429), false); // rate limited: retry
  assert.equal(isTerminalFailure(500), false);
  assert.equal(isTerminalFailure(503), false);
});

test("WEBHOOK_RETRY_SCHEDULE_MS is monotonically increasing", () => {
  for (let i = 1; i < WEBHOOK_RETRY_SCHEDULE_MS.length; i++) {
    const prev = WEBHOOK_RETRY_SCHEDULE_MS[i - 1] ?? 0;
    const cur = WEBHOOK_RETRY_SCHEDULE_MS[i] ?? 0;
    assert.ok(cur > prev, `schedule[${i}] (${cur}) must be > schedule[${i - 1}] (${prev})`);
  }
});
