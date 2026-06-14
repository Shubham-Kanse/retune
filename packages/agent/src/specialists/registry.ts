/**
 * Specialist registry.
 *
 * Central catalog of every cognitive specialist the workbench can run.
 * The attention scheduler asks the registry for candidates per goal kind;
 * specialists self-declare which goal kinds they handle via their
 * `handles_goal_kinds` field.
 *
 * Registration is explicit and ordered — duplicate ids throw. This keeps
 * the workbench predictable and makes the registry trivially auditable
 * for compliance (PRD §12.4: "factor disclosure on request").
 *
 */

import type { GoalKind } from "@retune/types";
import type { Specialist } from "../workbench/types";

export class SpecialistRegistry {
  private readonly by_id = new Map<string, Specialist>();

  register(specialist: Specialist): void {
    if (this.by_id.has(specialist.id)) {
      throw new Error(
        `specialist id "${specialist.id}" already registered (display_name="${this.by_id.get(specialist.id)?.display_name}")`,
      );
    }
    this.by_id.set(specialist.id, specialist);
  }

  /**
   * Bulk register. Order is preserved for deterministic test runs.
   */
  register_all(specialists: readonly Specialist[]): void {
    for (const s of specialists) this.register(s);
  }

  get(id: string): Specialist {
    const s = this.by_id.get(id);
    if (!s) throw new Error(`specialist not found: "${id}"`);
    return s;
  }

  has(id: string): boolean {
    return this.by_id.has(id);
  }

  /**
   * Candidate specialists for a given goal kind, in registration order.
   * The attention scheduler ranks among these by EV.
   */
  candidates_for(goal_kind: GoalKind): Specialist[] {
    const out: Specialist[] = [];
    for (const s of this.by_id.values()) {
      if (s.handles_goal_kinds.includes(goal_kind)) out.push(s);
    }
    return out;
  }

  /** Snapshot — for the manifest / debugging UI. */
  list(): Specialist[] {
    return Array.from(this.by_id.values());
  }

  size(): number {
    return this.by_id.size;
  }
}
