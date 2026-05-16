/**
 * Preview tokens.
 *
 * The /preview route generates a candidate patch and returns a signed
 * token. The /apply route trusts only the token, not the body, so the
 * client cannot smuggle a different patch into apply.
 *
 * Tokens are short-lived (5 minutes by default) and scoped to user +
 * profile fingerprint + understanding revision so they cannot be replayed
 * after the user has edited the profile.
 *
 * We use HS256 with a server-only secret. If `RETUNE_PREVIEW_SECRET` is
 * not set, we fall back to `RETUNE_INTERNAL_API_KEY`, then to a
 * process-stable random secret. The fallback is ONLY safe for dev/test —
 * production should always set the env var.
 */

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { CareerUnderstandingPatch } from "./types";

const TOKEN_TTL_SECONDS = 5 * 60;
const ALGORITHM = "HS256";

let _processSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  const explicit = process.env.RETUNE_PREVIEW_SECRET ?? process.env.RETUNE_INTERNAL_API_KEY;
  if (explicit) return new TextEncoder().encode(explicit);
  if (!_processSecret) {
    _processSecret = new Uint8Array(randomBytes(32));
    if (process.env.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.warn(
        "[career-understanding] RETUNE_PREVIEW_SECRET not set — falling back to a process-local secret.",
      );
    }
  }
  return _processSecret;
}

export interface PreviewTokenPayload {
  /** Stable preview id used for client-side cache keys. */
  previewId: string;
  /** Authenticated user id the preview belongs to. */
  userId: string;
  /** Source profile fingerprint at preview time. */
  profileFingerprint: string;
  /** Understanding revision at preview time. */
  understandingRevision: number;
  /** The exact patch the apply route should re-apply. */
  patch: CareerUnderstandingPatch;
  /** Exposed to the UI for display. */
  changeSummary: string[];
  /** Token expiry in seconds. */
  ttlSeconds?: number;
}

export interface PreviewTokenIssued {
  previewId: string;
  token: string;
  expiresAt: string;
}

export async function issuePreviewToken(payload: PreviewTokenPayload): Promise<PreviewTokenIssued> {
  const ttl = payload.ttlSeconds ?? TOKEN_TTL_SECONDS;
  const expiresAtSec = Math.floor(Date.now() / 1000) + ttl;
  const token = await new SignJWT({
    sub: payload.userId,
    pid: payload.previewId,
    fp: payload.profileFingerprint,
    rev: payload.understandingRevision,
    patch: payload.patch as unknown as Record<string, unknown>,
    summary: payload.changeSummary,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(expiresAtSec)
    .setAudience("retune-career-understanding")
    .setIssuer("retune.web")
    .sign(getSecret());
  return {
    previewId: payload.previewId,
    token,
    expiresAt: new Date(expiresAtSec * 1000).toISOString(),
  };
}

export interface VerifiedPreview {
  previewId: string;
  userId: string;
  profileFingerprint: string;
  understandingRevision: number;
  patch: CareerUnderstandingPatch;
  changeSummary: string[];
}

export async function verifyPreviewToken(token: string): Promise<VerifiedPreview | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      audience: "retune-career-understanding",
      issuer: "retune.web",
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.pid !== "string" ||
      typeof payload.fp !== "string" ||
      typeof payload.rev !== "number" ||
      !payload.patch ||
      typeof payload.patch !== "object"
    ) {
      return null;
    }
    return {
      previewId: payload.pid,
      userId: payload.sub,
      profileFingerprint: payload.fp,
      understandingRevision: payload.rev,
      patch: payload.patch as unknown as CareerUnderstandingPatch,
      changeSummary: Array.isArray(payload.summary)
        ? (payload.summary as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/** Test-only — reset the cached fallback secret so tests can reseed it. */
export function _resetProcessSecret(): void {
  _processSecret = null;
}
