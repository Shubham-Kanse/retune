import { applications, db } from "@retune/db";
import { and, eq } from "drizzle-orm";
import { createHmac } from "node:crypto";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function getSecret(): string {
  const secret = process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("RETUNE_INTERNAL_GENERATION_ACCESS_SECRET must be set (>=16 chars)");
  }
  return secret;
}

export async function userOwnsGeneration(params: {
  userId: string;
  generationId: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, params.generationId), eq(applications.userId, params.userId)))
    .limit(1);
  return Boolean(rows[0]);
}

export function signGenerationAccessToken(params: {
  generationId: string;
  userId: string;
  ttlSeconds?: number;
}): string {
  const ttlSeconds = params.ttlSeconds ?? 5 * 60;
  const payload = {
    generation_id: params.generationId,
    user_id: params.userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

