/**
 * BYOK — encryption at rest + request-scoped key context.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  activeKeyOverride,
  byokActive,
  byokEncryptionConfigured,
  decryptApiKey,
  encryptApiKey,
  keyLast4,
  maskKey,
  withProviderKeys,
} from "../src/lib/byok";

const SECRET = "byok-test-secret-0123456789-0123456789";

function withSecret<T>(fn: () => T): T {
  const prev = process.env.RETUNE_BYOK_ENCRYPTION_KEY;
  process.env.RETUNE_BYOK_ENCRYPTION_KEY = SECRET;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.RETUNE_BYOK_ENCRYPTION_KEY;
    else process.env.RETUNE_BYOK_ENCRYPTION_KEY = prev;
  }
}

test("encrypt → decrypt roundtrips the plaintext", () => {
  withSecret(() => {
    const key = "sk-ant-api03-fake-key-for-tests-000111222333";
    const blob = encryptApiKey(key);
    assert.notEqual(blob, key);
    assert.ok(blob.startsWith("v1:"));
    assert.equal(decryptApiKey(blob), key);
  });
});

test("each encryption uses a fresh IV (no deterministic ciphertext)", () => {
  withSecret(() => {
    const key = "sk-same-key";
    assert.notEqual(encryptApiKey(key), encryptApiKey(key));
  });
});

test("tampered ciphertext fails closed (returns null)", () => {
  withSecret(() => {
    const blob = encryptApiKey("sk-victim");
    const parts = blob.split(":");
    const ct = parts[3] as string;
    const flipped = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    const tampered = [parts[0], parts[1], parts[2], flipped].join(":");
    assert.equal(decryptApiKey(tampered), null);
    assert.equal(decryptApiKey("garbage"), null);
    assert.equal(decryptApiKey("v2:a:b:c"), null);
  });
});

test("decryption with a different secret fails closed", () => {
  const blob = withSecret(() => encryptApiKey("sk-cross-secret"));
  const prev = process.env.RETUNE_BYOK_ENCRYPTION_KEY;
  process.env.RETUNE_BYOK_ENCRYPTION_KEY = "a-completely-different-secret-0123456789";
  try {
    assert.equal(decryptApiKey(blob), null);
  } finally {
    if (prev === undefined) delete process.env.RETUNE_BYOK_ENCRYPTION_KEY;
    else process.env.RETUNE_BYOK_ENCRYPTION_KEY = prev;
  }
});

test("byokEncryptionConfigured requires a >= 32 char secret", () => {
  const prev = process.env.RETUNE_BYOK_ENCRYPTION_KEY;
  try {
    delete process.env.RETUNE_BYOK_ENCRYPTION_KEY;
    assert.equal(byokEncryptionConfigured(), false);
    process.env.RETUNE_BYOK_ENCRYPTION_KEY = "short";
    assert.equal(byokEncryptionConfigured(), false);
    process.env.RETUNE_BYOK_ENCRYPTION_KEY = SECRET;
    assert.equal(byokEncryptionConfigured(), true);
  } finally {
    if (prev === undefined) delete process.env.RETUNE_BYOK_ENCRYPTION_KEY;
    else process.env.RETUNE_BYOK_ENCRYPTION_KEY = prev;
  }
});

test("withProviderKeys scopes overrides to the async context", async () => {
  assert.equal(activeKeyOverride("anthropic"), undefined);
  assert.equal(byokActive(), false);

  await withProviderKeys({ anthropic: "sk-user-a" }, async () => {
    assert.equal(activeKeyOverride("anthropic"), "sk-user-a");
    assert.equal(activeKeyOverride("openai"), undefined);
    assert.equal(byokActive(), true);
    // Survives awaits.
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(activeKeyOverride("anthropic"), "sk-user-a");
  });

  assert.equal(activeKeyOverride("anthropic"), undefined);
});

test("concurrent contexts do not leak keys across users", async () => {
  const seen: Array<string | undefined> = [];
  await Promise.all([
    withProviderKeys({ anthropic: "sk-user-1" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      seen.push(activeKeyOverride("anthropic"));
    }),
    withProviderKeys({ anthropic: "sk-user-2" }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      seen.push(activeKeyOverride("anthropic"));
    }),
  ]);
  assert.deepEqual(seen.sort(), ["sk-user-1", "sk-user-2"]);
});

test("empty-string overrides are treated as absent", async () => {
  await withProviderKeys({ anthropic: "" }, async () => {
    assert.equal(activeKeyOverride("anthropic"), undefined);
    assert.equal(byokActive(), false);
  });
});

test("mask helpers never expose more than the last 4 chars", () => {
  const key = "sk-ant-api03-secret-secret-abcd";
  assert.equal(keyLast4(key), "abcd");
  const masked = maskKey("abcd", "anthropic");
  assert.ok(masked.includes("abcd"));
  assert.ok(!masked.includes("secret"));
});
