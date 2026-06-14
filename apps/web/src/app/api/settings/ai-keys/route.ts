/**
 * BYOK key management.
 *
 *   GET    → masked list of the caller's stored provider keys
 *   POST   → validate a key live against the provider, encrypt, upsert
 *   DELETE → remove a provider's key
 *
 * Plaintext keys exist only transiently in this handler: validated,
 * encrypted (AES-256-GCM, see @retune/agent byok), and discarded. They
 * are never logged and never returned to the client.
 */

import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { byokEncryptionConfigured, encryptApiKey, keyLast4, maskKey } from "@retune/agent/web";
import { db, user_ai_keys } from "@retune/db";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const PROVIDERS = ["anthropic", "openai"] as const;
type Provider = (typeof PROVIDERS)[number];

const SaveSchema = z.object({
  provider: z.enum(PROVIDERS),
  api_key: z.string().min(20).max(400),
});

const DeleteSchema = z.object({
  provider: z.enum(PROVIDERS),
});

/**
 * Cheapest authenticated call each provider offers: list models.
 * 401/403 → bad key; network failure → indeterminate (rejected so the
 * user retries rather than storing a key we couldn't verify).
 */
async function validateKey(
  provider: Provider,
  apiKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res =
      provider === "anthropic"
        ? await fetch("https://api.anthropic.com/v1/models", {
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            signal: AbortSignal.timeout(8_000),
          })
        : await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(8_000),
          });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "The provider rejected this key. Check it and try again." };
    }
    return { ok: false, reason: `Provider returned ${res.status}; try again in a moment.` };
  } catch {
    return { ok: false, reason: "Could not reach the provider to verify the key. Try again." };
  }
}

export const GET = withAuth(async (_request, session) => {
  const rows = await db
    .select({
      provider: user_ai_keys.provider,
      key_last4: user_ai_keys.key_last4,
      status: user_ai_keys.status,
      last_validated_at: user_ai_keys.last_validated_at,
      created_at: user_ai_keys.created_at,
    })
    .from(user_ai_keys)
    .where(eq(user_ai_keys.user_id, session.userId));

  return NextResponse.json({
    byok_available: byokEncryptionConfigured(),
    keys: rows.map((r) => ({
      provider: r.provider,
      masked: maskKey(r.key_last4, r.provider as Provider),
      status: r.status,
      last_validated_at: r.last_validated_at,
      created_at: r.created_at,
    })),
  });
});

export const POST = withAuth(async (request, session) => {
  if (!byokEncryptionConfigured()) {
    return NextResponse.json(
      { error: "byok_not_configured", message: "Key storage is not enabled on this deployment." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { provider, api_key } = parsed.data;

  const verdict = await validateKey(provider, api_key);
  if (!verdict.ok) {
    return NextResponse.json({ error: "invalid_key", message: verdict.reason }, { status: 422 });
  }

  await db
    .insert(user_ai_keys)
    .values({
      user_id: session.userId,
      provider,
      encrypted_key: encryptApiKey(api_key),
      key_last4: keyLast4(api_key),
      status: "active",
      last_validated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [user_ai_keys.user_id, user_ai_keys.provider],
      set: {
        encrypted_key: encryptApiKey(api_key),
        key_last4: keyLast4(api_key),
        status: "active",
        last_validated_at: new Date(),
        updated_at: sql`now()`,
      },
    });

  return NextResponse.json({
    ok: true,
    provider,
    masked: maskKey(keyLast4(api_key), provider),
  });
});

export const DELETE = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request");
  }

  await db
    .delete(user_ai_keys)
    .where(
      and(
        eq(user_ai_keys.user_id, session.userId),
        eq(user_ai_keys.provider, parsed.data.provider),
      ),
    );

  return NextResponse.json({ ok: true });
});
