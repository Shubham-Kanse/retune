/**
 * Security audit log helper (Charter 01 Epic 07).
 *
 * Persists security-sensitive events to the `security_audit_log` table.
 * Best-effort: a failure to write the audit log MUST NOT fail the
 * underlying request — security audit is observational, not blocking.
 *
 * Call sites (target list, see Charter 01 Epic 07):
 *   - apps/api `internal-auth.ts` — every auth pass/fail
 *   - apps/api `ssrf-guard.ts`     — every SSRF rejection
 *   - apps/api `generate-route`     — every generation start/abort/delete
 *   - apps/web `auth/*`             — every login/signup/reset/verify
 *   - apps/web `api-handler`        — every CSRF reject + rate-limit exceed
 *   - apps/web `account/route`      — every account delete + GDPR export
 *   - packages/billing              — every plan upgrade/downgrade
 */

import { security_audit_log } from "@retune/db/pg";
import type { Logger } from "pino";
import { acquire_durability } from "../runtime/persistence-factory";

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
export async function recordSecurityEvent(input: SecurityEventInput, log?: Logger): Promise<void> {
  try {
    const durability = await acquire_durability();
    if (!durability) return; // persistence-off: audit goes to logger only

    await durability.db.insert(security_audit_log).values({
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
    log?.error(
      { event: "security_audit_log_failed", err: err instanceof Error ? err.message : String(err) },
      "failed to persist security audit event",
    );
  }
}
