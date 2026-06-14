/**
 * BYOK (bring-your-own-key) — request-scoped provider credentials.
 *
 * Users can store their own Anthropic / OpenAI API keys; generations for
 * that user then bill against THEIR provider account instead of the
 * platform's. Three pieces live here:
 *
 *   1. An AsyncLocalStorage context (`withProviderKeys`) that scopes key
 *      overrides to one generation run. Providers consult
 *      `activeKeyOverride()` before falling back to process env, so
 *      concurrent generations from different users never share keys.
 *
 *   2. AES-256-GCM encryption for keys at rest (`encryptApiKey` /
 *      `decryptApiKey`). The data key is derived from
 *      `RETUNE_BYOK_ENCRYPTION_KEY` (>= 32 chars). Ciphertext format is
 *      versioned (`v1:<iv>:<tag>:<ct>`, base64url) so the scheme can be
 *      rotated without a data migration.
 *
 *   3. Display/validation helpers (`maskKey`, `keyLast4`).
 *
 * Never log, return, or echo a plaintext key anywhere outside the
 * provider call itself.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// ──────────────────── request-scoped key context ────────────────────

export interface ProviderKeyOverrides {
  anthropic?: string;
  openai?: string;
}

const keyContext = new AsyncLocalStorage<ProviderKeyOverrides>();

/**
 * Run `fn` with the given provider keys active. Every LLM call made
 * (transitively) inside `fn` uses these keys instead of process env.
 * Passing an empty object is a no-op wrapper (platform keys apply).
 */
export function withProviderKeys<T>(keys: ProviderKeyOverrides, fn: () => T): T {
  return keyContext.run(keys, fn);
}

/** The key override active for `provider` in this async context, if any. */
export function activeKeyOverride(provider: keyof ProviderKeyOverrides): string | undefined {
  const value = keyContext.getStore()?.[provider];
  return value && value.length > 0 ? value : undefined;
}

/** True when the current async context carries any BYOK override. */
export function byokActive(): boolean {
  const store = keyContext.getStore();
  return Boolean(store && (store.anthropic || store.openai));
}

// ──────────────────── encryption at rest ────────────────────

const CIPHER_VERSION = "v1";

/** True when the encryption secret is configured (BYOK storable). */
export function byokEncryptionConfigured(): boolean {
  return (process.env.RETUNE_BYOK_ENCRYPTION_KEY ?? "").length >= 32;
}

function dataKey(): Buffer {
  const secret = process.env.RETUNE_BYOK_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("RETUNE_BYOK_ENCRYPTION_KEY must be set (>= 32 chars) to store BYOK keys");
  }
  // Normalise an arbitrary-length secret to a 32-byte AES key.
  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(":");
}

/** Returns null on any failure (wrong secret, tampered blob, bad format). */
export function decryptApiKey(blob: string): string | null {
  try {
    const [version, ivB64, tagB64, ctB64] = blob.split(":");
    if (version !== CIPHER_VERSION || !ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}

// ──────────────────── display helpers ────────────────────

export function keyLast4(plaintext: string): string {
  return plaintext.slice(-4);
}

/** "sk-ant-…abcd" style display string. Safe for UI and logs. */
export function maskKey(last4: string, provider: keyof ProviderKeyOverrides): string {
  const prefix = provider === "anthropic" ? "sk-ant-" : "sk-";
  return `${prefix}…${last4}`;
}
