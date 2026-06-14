/**
 * TitleSchemaRetriever (specialist S1, PRD §6).
 *
 * Resolves a JD's surface-form title (e.g. "Sr. SWE II") into the canonical
 * role-schema node from semantic memory. Writes the resolved schema into
 * `hypotheses.role_schema` on the blackboard.
 *
 * Sub-stages (PRD §S1, micro-circuit decomposition):
 *   1. surface-form normalization (handled in OntologyResolver)
 *   2. canonical lookup
 *   3. inflation flag (always false for now; the inflation detector ships
 *      in commit #5 alongside the credibility scanner)
 *   4. confidence emission
 *   5. on miss → push goal `request_user_input` so the orchestrator can
 *      surface an active question instead of fabricating
 *
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import type { OntologyResolver } from "../../memory/semantic/ontology-resolver";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["analyze_jd"];

export class TitleSchemaRetriever implements Specialist {
  readonly id = "title_schema_retriever";
  readonly display_name = "Title Schema Retriever";
  readonly brain_region = "angular_gyrus";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0; // KG read only
  readonly estimated_latency_ms = 5;

  constructor(private readonly resolver: OntologyResolver) {}

  async run(_ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();

    // Pull title from goal payload (orchestrator places it there) or from
    // the blackboard's draft state (when rerun by meta-cognition).
    const title_input = readTitle(goal);
    if (!title_input) {
      return refuse_unknown_input(goal, this.id);
    }

    const resolution = this.resolver.resolve_role(title_input);
    const inputs_hash = AuditTrail.hash({ title: title_input });

    if (!resolution) {
      const newGoal: Goal = build_active_question_goal({
        question: `What's the canonical role family for the title "${title_input}"? (e.g. SWE / ML / Frontend / Data)`,
        target_field: "hypotheses.role_schema",
        emitted_by: this.id,
        parent_goal_id: goal.id,
      });
      return {
        writes: [],
        new_goals: [newGoal],
        audit: {
          specialist: this.id,
          micro_stage: "miss_to_active_question",
          inputs_hash,
          output_hash: AuditTrail.hash({ resolved: false, surfaced_question: true }),
          justification: `no canonical role for surface "${title_input}" — surfacing active question rather than fabricating`,
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const role_schema = {
      canonical_role_id: resolution.role.canonical_id,
      display_name: resolution.role.display_name,
      family: resolution.role.family,
      level: resolution.role.level,
      yoe_band: resolution.role.yoe_band as readonly [number, number],
      archetype: resolution.role.archetype,
      // Inflation detection lands in commit #5 (credibility-context-aware).
      inflated: false,
    };

    return {
      writes: [{ path: "hypotheses.role_schema", value: role_schema }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "canonical_resolve",
        inputs_hash,
        output_hash: AuditTrail.hash(role_schema),
        justification: `resolved "${title_input}" → ${resolution.role.canonical_id} (${resolution.match_kind} match, conf=${resolution.confidence.point.toFixed(2)})`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.role_schema"],
      },
    };
  }
}

// ──────────── helpers ────────────

function readTitle(goal: Goal): string | null {
  const t = goal.payload?.jd_title;
  if (typeof t === "string" && t.trim().length > 0) return t.trim();
  return null;
}

function refuse_unknown_input(goal: Goal, specialist_id: string): SpecialistResult {
  return {
    writes: [],
    audit: {
      specialist: specialist_id,
      micro_stage: "missing_input",
      inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
      output_hash: AuditTrail.hash({ refused: true }),
      justification: "no jd_title in goal payload — cannot run; orchestrator must abandon goal",
      latency_ms: 0,
      cost_usd: 0,
      writes: [],
    },
    // Don't satisfy or push subgoals; orchestrator will mark abandoned.
  };
}

function build_active_question_goal(input: {
  question: string;
  target_field: string;
  emitted_by: string;
  parent_goal_id: string;
}): Goal {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind: "request_user_input",
    priority: 90, // user input is high-priority and blocks downstream work
    emitted_by: input.emitted_by,
    payload: { question: input.question, target_field: input.target_field },
    status: "pending",
    satisfied_by: [],
    parent_goal_id: input.parent_goal_id,
    created_at: now,
    updated_at: now,
  };
}
