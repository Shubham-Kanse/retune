/**
 * TheoryOfMindSpecialist — temporo-parietal junction (TPJ) + right superior temporal sulcus.
 *
 * Explicitly models the RECRUITER's belief state about this candidate.
 *
 * Unlike the CriticEnsemble (commit #11) which asks "what would a recruiter score?",
 * this specialist asks "what does the recruiter BELIEVE about this candidate after
 * reading the resume?" — constructing a mental model of the recruiter's internal
 * representation of the applicant.
 *
 * The distinction matters: a recruiter may score a resume 70/100 but still believe
 * the candidate is overqualified, or under-confident, or a flight risk. These
 * belief-level signals influence hiring decisions in ways raw scores don't capture.
 *
 * Theory of mind layers (PRD §11):
 *   1. **Epistemic state** — what does the recruiter KNOW about this candidate from the resume?
 *   2. **Confidence calibration** — how certain is the recruiter about their beliefs?
 *   3. **Attributions** — what causal story does the recruiter construct about career trajectory?
 *   4. **Counterfactual projection** — "what would the recruiter ask in a screen?"
 *
 * Output: `RecruiterBeliefState` written to `hypotheses.recruiter_belief_state`.
 * Used by SequentialBulletComposer (commit #10) to front-load claims that close
 * the largest gaps in recruiter knowledge.
 *
 * Goal kind: `model_recruiter_beliefs` (v2.0 — own kind; previously collided
 * with `select_arc` which CriticEnsemble owns). NarrativeArcProposer emits
 * BOTH `model_recruiter_beliefs` and `select_arc` as child goals so this
 * specialist runs first and the critic ensemble consumes its output.
 *
 * Implementation: Haiku call with forced tool_use. Cost ~$0.0008 per generation.
 *
 * @brain temporo-parietal junction (TPJ): theory of mind + mental state attribution
 * @thinking social_cognition
 * @cellType mirror
 * @neurotransmitter serotonin
 */

import type { Goal, GoalKind, NarrativeArcCandidate } from "@retune/types";
import { createMessageWithTool, getModels } from "../lib/anthropic";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["model_recruiter_beliefs"];

// ──────────── Output types ────────────

export interface KnowledgeGap {
  topic: string;
  gap_severity: "critical" | "moderate" | "minor";
  evidence_in_resume: boolean;
  recruiter_question: string;
}

export interface RecruiterBeliefState {
  inferred_candidate_level: string;
  inferred_domain: string;
  perceived_strengths: string[];
  perceived_gaps: KnowledgeGap[];
  narrative_coherence_score: number;
  flight_risk_signal: "none" | "low" | "moderate" | "high";
  overqualification_signal: boolean;
  hiring_intent_prediction: "likely_screen" | "maybe_screen" | "unlikely_screen";
  projected_first_question: string;
  belief_confidence: number;
}

// ──────────── Tool schema ────────────

const BELIEF_STATE_TOOL = {
  name: "model_recruiter_beliefs",
  description:
    "Model what a recruiter would believe about this candidate after a 6-second resume scan.",
  input_schema: {
    type: "object" as const,
    required: [
      "inferred_candidate_level",
      "inferred_domain",
      "perceived_strengths",
      "perceived_gaps",
      "narrative_coherence_score",
      "flight_risk_signal",
      "overqualification_signal",
      "hiring_intent_prediction",
      "projected_first_question",
      "belief_confidence",
    ],
    properties: {
      inferred_candidate_level: {
        type: "string",
        description:
          "What level would a recruiter assume this candidate is? (junior/mid/senior/staff/director)",
      },
      inferred_domain: {
        type: "string",
        description: "What domain/specialization would a recruiter infer from the resume?",
      },
      perceived_strengths: {
        type: "array",
        items: { type: "string" },
        maxItems: 5,
        description: "Top 3-5 strengths a recruiter would perceive from the resume.",
      },
      perceived_gaps: {
        type: "array",
        items: {
          type: "object",
          required: ["topic", "gap_severity", "evidence_in_resume", "recruiter_question"],
          properties: {
            topic: { type: "string" },
            gap_severity: { type: "string", enum: ["critical", "moderate", "minor"] },
            evidence_in_resume: { type: "boolean" },
            recruiter_question: {
              type: "string",
              description: "The question a recruiter would ask about this gap.",
            },
          },
        },
        maxItems: 6,
        description: "Gaps the recruiter would notice and likely probe in a screen.",
      },
      narrative_coherence_score: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "How coherent is the career narrative to a recruiter? 1.0 = crystal clear, 0 = confusing.",
      },
      flight_risk_signal: {
        type: "string",
        enum: ["none", "low", "moderate", "high"],
        description: "Would a recruiter perceive flight risk? (e.g. too many short stints)",
      },
      overqualification_signal: {
        type: "boolean",
        description: "Would a recruiter worry this candidate is overqualified?",
      },
      hiring_intent_prediction: {
        type: "string",
        enum: ["likely_screen", "maybe_screen", "unlikely_screen"],
        description: "Overall hiring intent after a recruiter reads this resume.",
      },
      projected_first_question: {
        type: "string",
        description:
          "The single most likely first question in a recruiter screen for this candidate.",
      },
      belief_confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "How confident is this belief model? Based on resume completeness.",
      },
    },
  },
};

// ──────────── Specialist ────────────

export class TheoryOfMindSpecialist implements Specialist {
  readonly id = "theory_of_mind";
  readonly display_name = "Theory of Mind (Recruiter Belief Modeler)";
  readonly brain_region = "temporo_parietal_junction";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.0008;
  readonly estimated_latency_ms = 1200;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { hypotheses, draft, evidence_graph } = ctx.blackboard;

    const arc = hypotheses.chosen_narrative_arc;
    const role_schema = hypotheses.role_schema;

    if (!arc) {
      return this.empty_result(
        goal,
        t0,
        "no chosen_narrative_arc — NarrativeArcProposer must run first",
      );
    }

    const bullet_texts = Object.values(draft.bullets)
      .map((b) => (b as { text?: string }).text)
      .filter(Boolean) as string[];

    const context = this.build_context(arc, role_schema, bullet_texts, hypotheses, evidence_graph);

    const models = getModels();
    let belief: RecruiterBeliefState;
    try {
      belief = await createMessageWithTool<RecruiterBeliefState>(
        this.id,
        {
          model: models.fast,
          max_tokens: 1024,
          system: `You are a senior recruiter at a top-tier tech company with 10+ years of hiring experience.
You have seen thousands of resumes. You're fast, pattern-matching, and skeptical — but fair.
Your job is to model your own belief state after reading this resume. Be honest about what you'd believe, not what would be flattering.`,
          messages: [{ role: "user", content: context }],
          tools: [BELIEF_STATE_TOOL],
          tool_choice: { type: "tool", name: BELIEF_STATE_TOOL.name },
        },
        BELIEF_STATE_TOOL.name,
      );
    } catch (err) {
      return this.error_result(goal, t0, err);
    }

    const inputs_hash = AuditTrail.hash({
      arc: arc.archetype,
      role: role_schema?.display_name ?? "unknown",
      n_bullets: bullet_texts.length,
    });

    return {
      writes: [{ path: "hypotheses.recruiter_belief_state", value: belief }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "belief_state_inference",
        inputs_hash,
        output_hash: AuditTrail.hash({
          level: belief.inferred_candidate_level,
          intent: belief.hiring_intent_prediction,
          n_gaps: belief.perceived_gaps.length,
          coherence: belief.narrative_coherence_score,
          confidence: belief.belief_confidence,
        }),
        justification: `recruiter believes: level=${belief.inferred_candidate_level}, intent=${belief.hiring_intent_prediction}, coherence=${belief.narrative_coherence_score.toFixed(2)}, flight_risk=${belief.flight_risk_signal}, ${belief.perceived_gaps.length} knowledge gaps, first Q: "${belief.projected_first_question.slice(0, 80)}"`,
        model_version: models.fast,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["hypotheses.recruiter_belief_state"],
      },
    };
  }

  private build_context(
    arc: NarrativeArcCandidate,
    role_schema: { display_name: string; level: string; yoe_band: [number, number] } | null,
    bullets: string[],
    hypotheses: {
      cultural_vector: readonly number[] | null;
      hidden_disqualifiers: string[] | null;
    },
    evidence_graph: { span_ids: string[] },
  ): string {
    let ctx = `## Resume Content to Analyze\n\n`;
    ctx += `**Target Role**: ${role_schema?.display_name ?? "Unknown"} (${role_schema?.level ?? "mid"}-level)\n\n`;
    ctx += `**Narrative Arc**: ${arc.archetype} — "${arc.thesis}"\n\n`;

    if (bullets.length > 0) {
      ctx += `**Experience Bullets**:\n`;
      for (const b of bullets.slice(0, 8)) {
        ctx += `- ${b}\n`;
      }
      ctx += "\n";
    }

    ctx += `**Evidence span count**: ${evidence_graph.span_ids.length} verified claims\n\n`;

    const disqualifiers = hypotheses.hidden_disqualifiers ?? [];
    if (disqualifiers.length > 0) {
      ctx += `**JD requirements the candidate flagged**: ${disqualifiers.join(", ")}\n\n`;
    }

    ctx += `\nModel your belief state as a recruiter who just read this resume. Focus on what you'd ACTUALLY believe, not what's polite.`;
    return ctx;
  }

  private empty_result(goal: Goal, t0: number, reason: string): SpecialistResult {
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "no_input",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
        output_hash: AuditTrail.hash({ empty: true }),
        justification: reason,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }

  private error_result(goal: Goal, t0: number, err: unknown): SpecialistResult {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "llm_error",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
        output_hash: AuditTrail.hash({ error: msg }),
        justification: `ToM inference failed: ${msg}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
