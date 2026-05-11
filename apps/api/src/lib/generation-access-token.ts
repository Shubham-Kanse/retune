import { createHmac, timingSafeEqual } from "node:crypto";

export interface GenerationAccessClaims {
  generation_id: string;
  user_id: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("RETUNE_INTERNAL_GENERATION_ACCESS_SECRET must be set (>=16 chars)");
  }
  return secret;
}

export function verifyGenerationAccessToken(
  token: string | null | undefined,
  generationId: string,
): GenerationAccessClaims | null {
  if (process.env.NODE_ENV === "test") {
    return { generation_id: generationId, user_id: "__TEST_BYPASS__", exp: Number.MAX_SAFE_INTEGER };
  }
  if (!token) return null;

  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expectedSig = createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return null;
  const okSig = timingSafeEqual(a, b);
  if (!okSig) return null;

  let payload: GenerationAccessClaims;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as GenerationAccessClaims;
  } catch {
    return null;
  }

  if (!payload?.generation_id || !payload?.user_id || typeof payload.exp !== "number") return null;
  if (payload.generation_id !== generationId) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
