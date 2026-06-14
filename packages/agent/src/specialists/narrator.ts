/**
 * Narrator — left inferior frontal gyrus (language production).
 *
 * Produces plain-language narrative paragraphs explaining what the
 * cognitive pipeline is doing, why, and what it decided. These
 * paragraphs are streamed to the frontend via SSE as
 * `narrative_paragraph` events for the LiveNarrativeStream widget.
 *
 * The Narrator operates per-layer: it can narrate comprehension,
 * strategy, production, or decision phases. It reads the most recent
 * audit trail entries and the current blackboard state to produce a
 * human-readable explanation.
 *
 * Goal kind: `narrate_layer`
 *
 * Reads:
 *   - audit_trail (recent entries for context)
 *   - hypotheses.* (current state for explanation)
 *   - hypotheses.ship_decision (if narrating decision layer)
 *
 * Writes:
 *   - hypotheses.narrative_paragraphs (appends)
 *
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["narrate_layer"];

type NarrativeLayer = "comprehension" | "strategy" | "production" | "critique" | "decision";

export interface NarrativeParagraph {
  layer: NarrativeLayer;
  text: string;
  generated_at: string;
  tick: number;
}

const LAYER_TEMPLATES: Record<NarrativeLayer, (ctx: SpecialistContext) => string> = {
  comprehension: (ctx) => {
    const h = ctx.blackboard.hypotheses;
    const parts: string[] = [];
    if (h.role_schema) {
      parts.push(
        `I identified the role as "${h.role_schema.display_name}" at the ${h.role_schema.level} level.`,
      );
    }
    if (h.company_schema) {
      parts.push(
        `The target company is ${h.company_schema.display_name} (${h.company_schema.industries.join(", ")}).`,
      );
    }
    if (h.discourse_map && h.discourse_map.length > 0) {
      const filters = h.discourse_map.filter((s) => s.function === "filter").length;
      const tests = h.discourse_map.filter((s) => s.function === "actual_test").length;
      parts.push(
        `The job description contains ${filters} filtering requirement(s) and ${tests} actual test(s) of competence.`,
      );
    }
    return parts.length > 0
      ? parts.join(" ")
      : "Analyzing the job description and building a model of what this role requires.";
  },

  strategy: (ctx) => {
    const h = ctx.blackboard.hypotheses;
    if (h.chosen_narrative_arc) {
      return `I chose the "${h.chosen_narrative_arc.archetype}" narrative arc because it best aligns your experience with what this role requires.`;
    }
    if (h.narrative_arcs_candidates.length > 0) {
      return `Evaluating ${h.narrative_arcs_candidates.length} possible narrative arcs to find the strongest story for your background.`;
    }
    return "Mapping your experience to the role's requirements and planning the strongest narrative.";
  },

  production: (ctx) => {
    const n_bullets = Object.keys(ctx.blackboard.draft.bullets).length;
    const n_sections = Object.keys(ctx.blackboard.draft.sections).length;
    if (n_bullets > 0) {
      return `Composed ${n_bullets} bullet(s) across ${n_sections} section(s). Each bullet is grounded in specific evidence from your profile.`;
    }
    return "Composing resume bullets from your experience evidence.";
  },

  critique: (ctx) => {
    const conflicts = ctx.blackboard.conflicts ?? [];
    const unresolved = conflicts.filter((c) => !c.resolved_by).length;
    if (unresolved > 0) {
      return `The review panel flagged ${unresolved} concern(s) that need attention before this document is ready.`;
    }
    return "Running quality checks from the recruiter, hiring manager, and self-image perspectives.";
  },

  decision: (ctx) => {
    const decision = (ctx.blackboard.hypotheses as Record<string, unknown>).ship_decision as
      | { verdict: string; interview_ready_score?: number }
      | undefined;
    if (decision) {
      if (decision.verdict === "ship") {
        return `Decision: SHIP. Interview-ready score: ${decision.interview_ready_score ?? "N/A"}/100. The document meets all quality thresholds.`;
      }
      if (decision.verdict === "refuse") {
        return "Decision: REFUSE. The quality signals indicate this application would not serve you well. I'll explain why.";
      }
      return "Decision: REVISE. There are addressable issues that would significantly improve your chances.";
    }
    return "Evaluating whether this document meets the quality threshold for submission.";
  },
};

export class Narrator implements Specialist {
  readonly id = "narrator";
  readonly display_name = "Writing your summary";
  readonly brain_region = "left inferior frontal gyrus";
  readonly handles_goal_kinds: readonly GoalKind[] = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 2;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const layer = (goal.payload?.layer as NarrativeLayer) ?? this.infer_layer(ctx);
    const text = LAYER_TEMPLATES[layer](ctx);

    const paragraph: NarrativeParagraph = {
      layer,
      text,
      generated_at: new Date().toISOString(),
      tick: ctx.tick,
    };

    const existing = ((ctx.blackboard.hypotheses as Record<string, unknown>).narrative_paragraphs ??
      []) as NarrativeParagraph[];
    const updated = [...existing, paragraph];

    return {
      writes: [{ path: "hypotheses.narrative_paragraphs", value: updated }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: `narrate_${layer}`,
        inputs_hash: AuditTrail.hash({ layer, tick: ctx.tick }),
        output_hash: AuditTrail.hash({ text_len: text.length }),
        justification: `Narrated ${layer} layer: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.narrative_paragraphs"],
      },
    };
  }

  private infer_layer(ctx: SpecialistContext): NarrativeLayer {
    const trail = ctx.blackboard.audit_trail;
    if (trail.length === 0) return "comprehension";
    const last = trail[trail.length - 1]!;
    if (last.specialist.includes("gate") || last.specialist.includes("refuse")) return "decision";
    if (last.specialist.includes("critic") || last.specialist.includes("drift")) return "critique";
    if (last.specialist.includes("bullet") || last.specialist.includes("composer"))
      return "production";
    if (last.specialist.includes("arc") || last.specialist.includes("gap")) return "strategy";
    return "comprehension";
  }
}
