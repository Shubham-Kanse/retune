/**
 * Audit trail.
 *
 * Every committed write to the blackboard produces exactly one AuditEntry,
 * timestamped, hashed, and ordered by a monotonically increasing sequence
 * number. The audit trail is the substrate for:
 *
 *   - reasoning-trace UI (PRD §3.3)
 *   - GDPR Article 22 disclosure (PRD §12.4)
 *   - replay-based debugging (PRD §C7)
 *   - cost attribution per specialist × micro-stage (PRD §C10)
 *   - distillation training-data harvesting (PRD §11.2)
 *
 */

import { createHash } from "node:crypto";
import type { AuditEntry } from "@retune/types";

export class AuditTrail {
  private readonly entries: AuditEntry[] = [];
  private seq = 0;

  /**
   * Append a new audit entry. Returns the assigned sequence number.
   * The orchestrator (NOT the specialist) calls this; specialists return
   * a partial AuditEntry via `SpecialistResult.audit`.
   */
  append(partial: Omit<AuditEntry, "seq" | "timestamp">): AuditEntry {
    const entry: AuditEntry = {
      ...partial,
      seq: this.seq++,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  list(): readonly AuditEntry[] {
    return this.entries;
  }

  /**
   * Rehydrate from persisted entries. Sets the internal seq counter so
   * the next `append()` continues monotonically past the loaded range.
   * Used during resume-from-crash.
   */
  hydrate(entries: readonly AuditEntry[]): void {
    this.entries.length = 0;
    for (const e of entries) this.entries.push(e);
    const last = entries[entries.length - 1];
    this.seq = last ? last.seq + 1 : 0;
  }

  /** Total spent across all entries. */
  total_cost_usd(): number {
    let total = 0;
    for (const e of this.entries) total += e.cost_usd;
    return total;
  }

  /** Per-specialist cost breakdown. */
  cost_by_specialist(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      out[e.specialist] = (out[e.specialist] ?? 0) + e.cost_usd;
    }
    return out;
  }

  /** Compute a content hash of an arbitrary value, stable across runs. */
  static hash(value: unknown): string {
    const json = JSON.stringify(value, Object.keys(value as object).sort());
    return createHash("sha256").update(json).digest("hex").slice(0, 16);
  }
}
