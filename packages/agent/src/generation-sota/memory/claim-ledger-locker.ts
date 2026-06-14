/**
 * ClaimLedgerLocker (003 §5.5 Phase E gate).
 *
 * Runs after candidate memory hydration and before the strategy /
 * production phase. Its job is the safety boundary every downstream
 * draft variant has to clear:
 *
 *   1. Validate that every claim has source_ids and an
 *      interview_defense_prompt.
 *   2. Stamp `locked: true` and compute a stable `locked_hash` over
 *      the canonical ledger fingerprint.
 *   3. Emit a fabrication conflict for any claim that fails the
 *      defensibility floor — the refuse-or-ship gate then refuses if
 *      a hard JD requirement maps onto an unsafe claim.
 *
 * Brain region: anterior cingulate cortex (error monitoring) +
 * dorsolateral prefrontal cortex (rule enforcement).
 *
 * Cost: $0 (deterministic).
 */

import { randomUUID } from "node:crypto";
import {
  type ClaimLedger,
  ClaimLedgerSchema,
  type ConflictRecord,
  type Goal,
  type GoalKind,
} from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";
import { findUnsafeClaims, lockClaimLedger } from "./build-claim-ledger";

const HANDLES: readonly GoalKind[] = ["build_candidate_model"];

export class ClaimLedgerLocker implements Specialist {
  readonly id = "claim_ledger_locker";
  readonly display_name = "Claim Ledger Locker";
  readonly brain_region = "acc_dlpfc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 10;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();

    const ledgerRaw = (ctx.blackboard as unknown as { sota?: { claim_ledger?: unknown } })?.sota
      ?.claim_ledger;
    const parsed = ClaimLedgerSchema.safeParse(ledgerRaw);
    if (!parsed.success) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "ledger_missing",
          inputs_hash: AuditTrail.hash({ has_ledger: !!ledgerRaw }),
          output_hash: AuditTrail.hash({ status: "missing" }),
          justification: "no claim ledger on blackboard — skipping lock",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const ledger: ClaimLedger = parsed.data;
    const locked = lockClaimLedger(ledger);
    const unsafe = findUnsafeClaims(locked);

    const conflicts: ConflictRecord[] = unsafe.map((u) => ({
      id: randomUUID(),
      monitor: "fabrication",
      severity: u.reason === "defensibility_unsafe" ? "high" : "medium",
      payload: { claim_id: u.id, reason: u.reason },
      resolved_by: null,
      resolution_log: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
    }));

    const writes: Array<{ path: string; value: unknown }> = [
      { path: "sota.claim_ledger", value: locked },
    ];

    return {
      writes,
      conflicts,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "lock_ledger",
        inputs_hash: AuditTrail.hash({
          n_claims: ledger.claims.length,
        }),
        output_hash: AuditTrail.hash({
          locked_hash: locked.locked_hash,
          n_unsafe: unsafe.length,
        }),
        justification: `locked ledger with ${locked.claims.length} claims; ${unsafe.length} unsafe`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: writes.map((w) => w.path),
      },
    };
  }
}
