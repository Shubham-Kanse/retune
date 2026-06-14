/**
 * Blackboard — the cognitive workbench's working-memory store.
 *
 * In-process, transactional, typed graph that holds the entire state of
 * one cognitive cycle. Specialists do NOT mutate it directly; the
 * orchestrator commits SpecialistResult patches atomically and emits one
 * BlackboardEvent per write to the trigger bus.
 *
 * Invariants enforced here (commit #1; persistence + consistency model
 * in commit #2 once Postgres mirror lands):
 *
 *   1. Writes are sequenced (monotonic seq number).
 *   2. Every write produces exactly one BlackboardEvent.
 *   3. Snapshots are deep-frozen copies; specialists cannot mutate the
 *      blackboard via their context.
 *   4. Path resolution is dot-separated: "draft.bullets.<id>".
 *
 */

import type { AuditEntry, Blackboard, BlackboardEvent, ConflictRecord, Goal } from "@retune/types";
import type { TriggerBus } from "./trigger-bus";

export class BlackboardStore {
  private state: Blackboard;
  private seq = 0;

  constructor(
    initial: Blackboard,
    private readonly bus: TriggerBus,
  ) {
    this.state = initial;
  }

  /** Read-only deep-frozen snapshot for specialists. */
  snapshot(): Readonly<Blackboard> {
    // Structured clone gives us a defensive copy; deep-freeze prevents
    // accidental mutation from specialist code.
    const cloned = structuredClone(this.state);
    deep_freeze(cloned);
    return cloned;
  }

  /**
   * Apply a list of write patches in a single atomic commit, emitting
   * one BlackboardEvent per write. Audit-trail integration is the
   * orchestrator's responsibility (it stamps the AuditEntry before
   * calling here).
   *
   * Returns the resulting AuditEntry (with seq + timestamp filled in).
   */
  async commit(input: {
    by_specialist: string;
    writes: Array<{ path: string; value: unknown }>;
    conflicts?: ConflictRecord[];
    new_goals?: Goal[];
    audit_entry: AuditEntry;
  }): Promise<void> {
    const events: BlackboardEvent[] = [];
    const ts = new Date().toISOString();

    // 1. Apply writes.
    for (const w of input.writes) {
      const before = read_path(this.state, w.path);
      this.state = write_path(this.state, w.path, w.value);
      events.push({
        type: "write",
        path: w.path,
        before,
        after: w.value,
        by_specialist: input.by_specialist,
        seq: this.seq++,
        timestamp: ts,
      });
    }

    // 2. Append conflicts.
    if (input.conflicts && input.conflicts.length > 0) {
      this.state = {
        ...this.state,
        conflicts: [...this.state.conflicts, ...input.conflicts],
      };
      for (const c of input.conflicts) {
        events.push({
          type: "conflict_raised",
          path: `conflicts.${c.id}`,
          before: null,
          after: c,
          by_specialist: input.by_specialist,
          seq: this.seq++,
          timestamp: ts,
        });
      }
    }

    // 3. Append new goals.
    if (input.new_goals && input.new_goals.length > 0) {
      this.state = {
        ...this.state,
        goals: [...this.state.goals, ...input.new_goals],
      };
      for (const g of input.new_goals) {
        events.push({
          type: "goal_pushed",
          path: `goals.${g.id}`,
          before: null,
          after: g,
          by_specialist: input.by_specialist,
          seq: this.seq++,
          timestamp: ts,
        });
      }
    }

    // 4. Append the audit entry.
    this.state = {
      ...this.state,
      audit_trail: [...this.state.audit_trail, input.audit_entry],
      updated_at: ts,
    };

    // 5. Publish all events. Listener errors are caught by the bus.
    for (const ev of events) {
      await this.bus.publish(ev);
    }
  }

  /** Direct read of a dot-path. Returns `undefined` on miss. */
  get(path: string): unknown {
    return read_path(this.state, path);
  }
}

// ────────────────────── path utilities ──────────────────────

/**
 * Read a dot-path from a nested object. Returns undefined on miss.
 * Supports map-like access (objects) and array index access (numeric).
 */
export function read_path(root: unknown, path: string): unknown {
  if (path === "") return root;
  const parts = path.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Immutably write a dot-path into a nested object, returning a new root.
 * Creates missing object segments as needed. Does NOT support array
 * index syntax — use object-keyed maps instead (e.g. `bullets.<id>`).
 */
export function write_path<T>(root: T, path: string, value: unknown): T {
  if (path === "") return value as T;
  const parts = path.split(".");
  return write_recurse(root as unknown, parts, 0, value) as T;
}

function write_recurse(cur: unknown, parts: readonly string[], i: number, value: unknown): unknown {
  const key = parts[i];
  if (key === undefined) return value;
  const obj = (cur && typeof cur === "object" ? cur : {}) as Record<string, unknown>;
  const next = i === parts.length - 1 ? value : write_recurse(obj[key], parts, i + 1, value);
  return { ...obj, [key]: next };
}

function deep_freeze<T>(o: T): T {
  if (o === null || typeof o !== "object") return o;
  Object.freeze(o);
  for (const k of Object.keys(o as object)) {
    deep_freeze((o as Record<string, unknown>)[k]);
  }
  return o;
}
