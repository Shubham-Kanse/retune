/**
 * BYOK key loading — DB row → decrypted ProviderKeyOverrides.
 *
 * Called once at generation start (and by the web preflight) to resolve
 * the user's stored keys into the AsyncLocalStorage context consumed by
 * the providers. Failures degrade silently to platform keys: a broken
 * BYOK row must never block a generation.
 */

import type { PgDb } from "@retune/db/pg";
import { user_ai_keys } from "@retune/db/pg";
import { and, eq } from "drizzle-orm";
import { type ProviderKeyOverrides, byokEncryptionConfigured, decryptApiKey } from "./byok";

export async function loadProviderKeyOverrides(
  db: PgDb,
  user_id: string,
): Promise<ProviderKeyOverrides> {
  if (!byokEncryptionConfigured()) return {};
  try {
    const rows = await db
      .select({ provider: user_ai_keys.provider, encrypted_key: user_ai_keys.encrypted_key })
      .from(user_ai_keys)
      .where(and(eq(user_ai_keys.user_id, user_id), eq(user_ai_keys.status, "active")));

    const overrides: ProviderKeyOverrides = {};
    for (const row of rows) {
      const plain = decryptApiKey(row.encrypted_key);
      if (!plain) continue;
      if (row.provider === "anthropic") overrides.anthropic = plain;
      if (row.provider === "openai") overrides.openai = plain;
    }
    return overrides;
  } catch {
    // Table missing / decrypt failure / transient DB error → platform keys.
    return {};
  }
}
