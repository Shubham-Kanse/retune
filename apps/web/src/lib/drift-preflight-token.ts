import { createHmac, timingSafeEqual } from "node:crypto";

export interface PreflightTokenPayload {
  preflight_id: string;
  user_id: string;
  jd_hash: string;
  resolved_at: number;
  expires_at: number;
}

function secret(): string {
  return process.env.JWT_SECRET ?? "retune-dev-secret-change-me";
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signSegment(segment: string): string {
  return createHmac("sha256", secret()).update(segment).digest("base64url");
}

export function createPreflightToken(payload: PreflightTokenPayload): string {
  const segment = b64url(JSON.stringify(payload));
  const sig = signSegment(segment);
  return `${segment}.${sig}`;
}

export function verifyPreflightToken(token: string): PreflightTokenPayload | null {
  const [segment, sig] = token.split(".");
  if (!segment || !sig) return null;
  const expected = signSegment(segment);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(unb64url(segment)) as PreflightTokenPayload;
    if (!parsed.preflight_id || !parsed.user_id || !parsed.jd_hash || !parsed.expires_at) return null;
    if (Date.now() > parsed.expires_at) return null;
    return parsed;
  } catch {
    return null;
  }
}
