/**
 * ApplicationStrategyComposer — orbitofrontal cortex (prospective planning).
 *
 * Synthesises all blackboard signals into a structured markdown strategy
 * document the candidate can act on immediately: referral paths, outreach
 * templates, interview prep questions, and a submission timeline.
 *
 * Goal kind: `compose_strategy`
 *
 * Reads:
 *   - hypotheses.company_schema
 *   - hypotheses.role_schema
 *   - hypotheses.chosen_narrative_arc
 *   - hypotheses.cultural_vector
 *   - evidence_graph.gap_map (missable + transferable items surface as prep topics)
 *   - outcome_estimate (sets urgency tone)
 *   - blackboard.market
 *
 * Writes:
 *   - draft.strategy_text
 *
 * @brain orbitofrontal cortex: prospective planning + outcome valuation
 * @thinking prospective_planning
 * @cellType pyramidal
 * @neurotransmitter dopamine
 */

import type { Goal, GoalKind } from "@retune/types";
import { createMessageWithTool, getModels } from "../lib/anthropic";
import { loadPromptFile } from "../prompts/loader";
import { register, renderPrompt } from "../prompts/registry";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { GapMap } from "./gap-mapper";

// Charter 09 Epic 01 — module-level registration.
try {
  const loaded = loadPromptFile("application-strategy-composer.system.md");
  register({
    name: loaded.name,
    version: Math.max(loaded.version, 2),
    model_hint: loaded.model_hint,
    body: loaded.body,
  });
} catch {
  // best-effort
}

const HANDLES: readonly GoalKind[] = ["compose_strategy"];

// ──────────── Tool schema ────────────

const STRATEGY_TOOL = {
  name: "write_application_strategy",
  description: "Write the structured application strategy document",
  input_schema: {
    type: "object" as const,
    required: [
      "referral_queries",
      "linkedin_outreach_template",
      "hiring_manager_note",
      "behavioural_questions",
      "technical_prep_topics",
      "submission_timeline",
      "full_markdown",
    ],
    properties: {
      referral_queries: {
        type: "array",
        description: "3–5 LinkedIn search queries to find warm connections at this company.",
        items: { type: "string" },
      },
      linkedin_outreach_template: {
        type: "string",
        description:
          "150-word LinkedIn connection note template personalised to this role and company.",
      },
      hiring_manager_note: {
        type: "string",
        description: "100-word cold outreach note to send directly to the hiring manager if found.",
      },
      behavioural_questions: {
        type: "array",
        description:
          "5 behavioural interview questions tailored to this role and arc, each with a one-line answer hint.",
        items: {
          type: "object",
          required: ["question", "hint"],
          properties: {
            question: { type: "string" },
            hint: { type: "string", description: "One-line answer direction using STAR/CAR." },
          },
        },
      },
      technical_prep_topics: {
        type: "array",
        description: "3–6 technical topics the candidate should brush up on based on gap analysis.",
        items: { type: "string" },
      },
      submission_timeline: {
        type: "array",
        description: "Ordered action steps with day offsets from submission day.",
        items: {
          type: "object",
          required: ["day_offset", "action"],
          properties: {
            day_offset: { type: "number", description: "Days from today (0 = today)." },
            action: { type: "string" },
          },
        },
      },
      full_markdown: {
        type: "string",
        description:
          "Complete strategy document in markdown. Includes all sections above formatted for readability.",
      },
    },
  },
} as const;

type StrategyOutput = {
  referral_queries: string[];
  linkedin_outreach_template: string;
  hiring_manager_note: string;
  behavioural_questions: Array<{ question: string; hint: string }>;
  technical_prep_topics: string[];
  submission_timeline: Array<{ day_offset: number; action: string }>;
  full_markdown: string;
};

// ──────────── Prompt builders ────────────

function build_system(market: "US" | "UK"): string {
  const locale = market === "UK" ? "British English" : "American English";
  return renderPrompt("application-strategy-composer.system", { locale });
}

function build_user(
  company_name: string,
  role_name: string,
  arc_thesis: string,
  arc_archetype: string,
  gap_topics: string[],
  cultural_signals: string[],
  outcome_point: number | null,
  market: "US" | "UK",
): string {
  const urgency =
    outcome_point !== null && outcome_point < 0.4
      ? "⚠️ Predicted callback rate is below 40% — emphasise referral and outreach urgency."
      : "";

  return `## Application Context
Role: ${role_name} at ${company_name}
Market: ${market}
Narrative Arc: ${arc_archetype} — "${arc_thesis}"

## Culture Signals
${cultural_signals.length > 0 ? cultural_signals.map((s) => `• ${s}`).join("\n") : "(use role and company name to infer)"}

## Topics Needing Preparation (from gap analysis)
${gap_topics.length > 0 ? gap_topics.map((t) => `• ${t}`).join("\n") : "(no significant gaps identified)"}

${urgency}

Write the complete application strategy using the write_application_strategy tool.
Make every piece of advice specific to ${company_name} and the ${role_name} role.`;
}

// ──────────── Specialist ────────────

export class ApplicationStrategyComposer implements Specialist {
  readonly id = "application_strategy_composer";
  readonly display_name = "Application Strategy Composer";
  readonly brain_region = "orbitofrontal";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.003;
  readonly estimated_latency_ms = 4000;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { hypotheses, evidence_graph, outcome_estimate, market } = ctx.blackboard;

    const arc = hypotheses.chosen_narrative_arc;
    const company_name = hypotheses.company_schema?.display_name ?? "the company";
    const role_name = hypotheses.role_schema?.display_name ?? "this role";

    const gap_map = (evidence_graph as unknown as { gap_map?: GapMap }).gap_map ?? null;

    // Topics needing prep = missable + transferable requirements
    const gap_topics = gap_map
      ? gap_map.entries
          .filter((e) => e.disposition === "missable" || e.disposition === "transferable")
          .map((e) => e.requirement_text)
          .slice(0, 8)
      : [];

    // Cultural signals from cultural_vector (8-dim: autonomy, async, rigor, consensus, depth, risk, mission, agency)
    const cv = hypotheses.cultural_vector;
    const cultural_signals: string[] = [];
    if (cv) {
      const labels = [
        "autonomy",
        "async work",
        "rigor",
        "consensus",
        "technical depth",
        "risk tolerance",
        "mission-driven",
        "high agency",
      ];
      cv.forEach((v, i) => {
        if (v > 0.65) cultural_signals.push(labels[i] ?? `dimension_${i}`);
      });
    }

    const effective_market: "US" | "UK" = market === "UK" ? "UK" : "US";
    const arc_thesis = arc?.thesis ?? "";
    const arc_archetype = arc?.archetype ?? "unknown";
    const outcome_point = outcome_estimate?.point ?? null;

    const inputs_hash = AuditTrail.hash({
      company: company_name,
      role: role_name,
      arc: arc_archetype,
      n_gap_topics: gap_topics.length,
      outcome_point,
    });

    const models = getModels();
    let output: StrategyOutput;
    try {
      output = await createMessageWithTool<StrategyOutput>(
        this.id,
        {
          model: models.smart,
          max_tokens: 2048,
          system: build_system(effective_market),
          messages: [
            {
              role: "user",
              content: build_user(
                company_name,
                role_name,
                arc_thesis,
                arc_archetype,
                gap_topics,
                cultural_signals,
                outcome_point,
                effective_market,
              ),
            },
          ],
          tools: [STRATEGY_TOOL],
          tool_choice: { type: "tool", name: STRATEGY_TOOL.name },
        },
        STRATEGY_TOOL.name,
      );
    } catch (err) {
      return this.error_result(goal, t0, err);
    }

    if (!output.full_markdown?.trim()) {
      return this.skip_result(goal, t0, "model returned empty strategy");
    }

    return {
      writes: [{ path: "draft.strategy_text", value: output.full_markdown.trim() }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "strategy_composition",
        inputs_hash,
        output_hash: AuditTrail.hash({
          n_referral_queries: output.referral_queries.length,
          n_behavioural: output.behavioural_questions.length,
          n_timeline: output.submission_timeline.length,
        }),
        justification: [
          `company=${company_name}`,
          `arc=${arc_archetype}`,
          `${output.referral_queries.length} referral queries`,
          `${output.behavioural_questions.length} behavioural questions`,
          `${output.technical_prep_topics.length} prep topics`,
          `${output.submission_timeline.length} timeline steps`,
        ].join(" | "),
        model_version: models.smart,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["draft.strategy_text"],
      },
    };
  }

  private skip_result(goal: Goal, t0: number, reason: string): SpecialistResult {
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "skipped",
        inputs_hash: AuditTrail.hash({ reason }),
        output_hash: AuditTrail.hash({}),
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
        micro_stage: "error",
        inputs_hash: AuditTrail.hash({ error: msg }),
        output_hash: AuditTrail.hash({}),
        justification: `strategy composition failed: ${msg}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
