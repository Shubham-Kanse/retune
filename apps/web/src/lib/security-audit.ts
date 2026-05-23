/**
 * Web-side security audit helper (Charter 01 Epic 07).
 *
 * Mirrors `apps/api/src/lib/security-audit.ts`. Persists
 * security-sensitive events to the `security_audit_log` table.
 * Best-effort: a failure to write the audit log MUST NOT fail the
 * underlying request.
 *
 * Call sites:
 *   - apps/web/src/app/api/auth/login                   — login success/fail
 *   - apps/web/src/app/api/auth/signup                  — signup success/fail
 *   - apps/web/src/app/api/auth/forgot-password         — reset requested
 *   - apps/web/src/app/api/auth/reset-password          — reset applied
 *   - apps/web/src/app/api/auth/verify-email            — email verified
 *   - apps/web/src/app/api/auth/logout                  — logout
 *   - apps/web/src/lib/api-handler.ts                   — CSRF reject + rate-limit exceed (via withAuth wrapper)
 *   - apps/web/src/app/api/account/route.ts             — account delete
 *   - apps/web/src/app/api/account/export/route.ts      — GDPR export
 *   - apps/web/src/app/api/billing/{checkout,portal,webhooks/stripe} — plan changes
 *
 * For the web side we intentionally use a fire-and-forget pattern:
 * the call returns immediately and a microtask handles persistence.
 */

import { db, security_audit_log } from "@retune/db";

export type SecurityActorKind = "user" | "service_role" | "anonymous" | "system";
export type SecurityOutcome = "success" | "denied" | "error";

export interface SecurityEventInput {
  event_type: string;
  user_id?: string | null;
  actor_kind: SecurityActorKind;
  target_kind?: string | null;
  target_id?: string | null;
  request_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  outcome?: SecurityOutcome;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit write. Returns immediately on success; logs
 * (but does not throw) on failure so the caller's hot path is never
 * blocked or broken by audit unavailability.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    await db.insert(security_audit_log).values({
      event_type: input.event_type,
      user_id: input.user_id ?? null,
      actor_kind: input.actor_kind,
      target_kind: input.target_kind ?? null,
      target_id: input.target_id ?? null,
      request_id: input.request_id ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      outcome: input.outcome ?? "success",
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[security-audit] write failed", {
      event_type: input.event_type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Pull standard observability fields out of a Next.js Request.
 * Extracts ip, user-agent, request-id from headers for inclusion in
 * the audit row.
 */
export function extractRequestContext(request: Request): {
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
} {
  // Defensive: tests sometimes pass Request-like objects without headers.
  const headers =
    request &&
    typeof request === "object" &&
    "headers" in request &&
    request.headers &&
    typeof (request.headers as Headers).get === "function"
      ? (request.headers as Headers)
      : null;
  return {
    ip: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers?.get("x-real-ip") ?? null,
    user_agent: headers?.get("user-agent") ?? null,
    request_id: headers?.get("x-request-id") ?? null,
  };
}
