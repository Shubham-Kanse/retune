import type { Goal, GoalKind, NarrativeArcCandidate } from "@retune/types";
import { createMessageWithTool, getModels } from "../lib/anthropic";
import { loadPromptFile } from "../prompts/loader";
import { register, renderPrompt } from "../prompts/registry";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { GapMap } from "./gap-mapper";

// Charter 09 Epic 01 — module-level registration.
try {
  const loaded = loadPromptFile("cover-letter-composer.system.md");
  register({
    name: loaded.name,
    version: Math.max(loaded.version, 2),
    model_hint: loaded.model_hint,
    body: loaded.body,
  });
} catch {
  // best-effort
}

const HANDLES: readonly GoalKind[] = ["compose_cover_letter"];

// ──────────── Tool schema ────────────

const COVER_LETTER_TOOL = {
  name: "write_cover_letter",
  description: "Write the complete cover letter body",
  input_schema: {
    type: "object" as const,
    required: ["hook", "value_bridge_p1", "value_bridge_p2", "close", "full_text", "word_count"],
    properties: {
      hook: {
        type: "string",
        description:
          "Opening paragraph: specific company reference + strongest achievement bridge. First word must NOT be 'I'.",
      },
      value_bridge_p1: {
        type: "string",
        description: "Most relevant achievement cluster with metric.",
      },
      value_bridge_p2: {
        type: "string",
        description: "What the candidate uniquely brings beyond what the JD states explicitly.",
      },
      close: {
        type: "string",
        description:
          "Confident, specific ask referencing the role. No 'I look forward to hearing from you'.",
      },
      full_text: {
        type: "string",
        description:
          "Complete cover letter — all paragraphs joined. 250–350 words (US) or 300–400 words (UK).",
      },
      word_count: { type: "number", description: "Word count of full_text." },
    },
  },
} as const;

type CoverLetterOutput = {
  hook: string;
  value_bridge_p1: string;
  value_bridge_p2: string;
  close: string;
  full_text: string;
  word_count: number;
};

// ──────────── Prompt builders ────────────

function build_system(market: "US" | "UK"): string {
  const lang = market === "UK" ? "British English" : "American English";
  const words = market === "UK" ? "300–400" : "250–350";
  return renderPrompt("cover-letter-composer.system", { lang, words });
}

function build_user(
  arc: NarrativeArcCandidate,
  gap_map: GapMap | null,
  top_bullets: string[],
  company_name: string,
  role_name: string,
  cultural_tone: string,
  market: "US" | "UK",
  honesty_avg: number,
): string {
  const cover_items = gap_map
    ? gap_map.entries
        .filter((e) => e.disposition === "must_address_in_cover_letter")
        .map((e) => `• ${e.requirement_text}`)
        .join("\n")
    : "";

  const bullet_sample = top_bullets
    .slice(0, 5)
    .map((b) => `• ${b}`)
    .join("\n");

  const honesty_note =
    honesty_avg < 0.6
      ? "\n⚠️ Honesty calibration low — soften scope claims; use 'approximately', 'contributed to', 'helped scale'."
      : "";

  return `## Role
${role_name} at ${company_name}
Tone: ${cultural_tone} | Market: ${market}

## Chosen Narrative Arc
Archetype: ${arc.archetype}
Thesis: ${arc.thesis}

## Requirements to Address in Cover Letter
${cover_items || "(none flagged — weave in top achievements naturally)"}

## Top Resume Bullets (voice reference — mirror style)
${bullet_sample || "(no bullets yet — infer voice from arc thesis)"}
${honesty_note}

Write the cover letter using the write_cover_letter tool. Ground every claim in the evidence above.`;
}

// ──────────── Specialist ────────────

/**
 * CoverLetterComposer — Broca's area + left vlPFC (language production
 * tuned to a recipient's mental model). LLM-driven; consumes the chosen
 * narrative arc, gap map, and recruiter belief state to produce a
 * voice-aligned cover letter.
 *
 * @brain left vlPFC + Broca's area: language production + addressee modelling
 * @thinking language_production
 * @cellType pyramidal
 * @neurotransmitter glutamate
 */
export class CoverLetterComposer implements Specialist {
  readonly id = "cover_letter_composer";
  readonly display_name = "Cover Letter Composer";
  readonly brain_region = "left_vlpfc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.004;
  readonly estimated_latency_ms = 4000;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { hypotheses, evidence_graph, draft, market } = ctx.blackboard;

    const arc = hypotheses.chosen_narrative_arc;
    if (!arc) {
      return this.skip_result(
        goal,
        t0,
        "no chosen_narrative_arc — NarrativeArcProposer must run first",
      );
    }

    const gap_map = (evidence_graph as unknown as { gap_map?: GapMap }).gap_map ?? null;
    const company_name = hypotheses.company_schema?.display_name ?? "the company";
    const role_name = hypotheses.role_schema?.display_name ?? "this role";

    // Infer cultural tone from cultural_vector (index 4 = depth/technical, index 7 = mission)
    const cv = hypotheses.cultural_vector;
    let cultural_tone = "professional";
    if (cv) {
      if ((cv[7] ?? 0) > 0.6) cultural_tone = "mission-driven";
      else if ((cv[4] ?? 0) > 0.6) cultural_tone = "technical";
      else if ((cv[0] ?? 0) > 0.6) cultural_tone = "startup";
      else if ((cv[2] ?? 0) > 0.6) cultural_tone = "enterprise";
    }

    // Top bullets for voice reference (up to 5 strongest)
    const top_bullets = Object.values(draft.bullets)
      .filter(
        (b) =>
          (b as { verb_quality?: string }).verb_quality === "elite" ||
          (b as { verb_quality?: string }).verb_quality === "strong",
      )
      .slice(0, 5)
      .map((b) => (b as { text: string }).text);

    // Average honesty calibration
    const hcal = hypotheses.honesty_calibration ?? {};
    const hcal_values = Object.values(hcal);
    const honesty_avg =
      hcal_values.length > 0 ? hcal_values.reduce((a, b) => a + b, 0) / hcal_values.length : 0.8;

    const effective_market: "US" | "UK" = market === "UK" ? "UK" : "US";

    const inputs_hash = AuditTrail.hash({
      arc: arc.archetype,
      company: company_name,
      role: role_name,
      n_cover_items:
        gap_map?.entries.filter((e) => e.disposition === "must_address_in_cover_letter").length ??
        0,
      market: effective_market,
    });

    const models = getModels();
    let output: CoverLetterOutput;
    try {
      output = await createMessageWithTool<CoverLetterOutput>(
        this.id,
        {
          model: models.smart,
          max_tokens: 1024,
          system: build_system(effective_market),
          messages: [
            {
              role: "user",
              content: build_user(
                arc,
                gap_map,
                top_bullets,
                company_name,
                role_name,
                cultural_tone,
                effective_market,
                honesty_avg,
              ),
            },
          ],
          tools: [COVER_LETTER_TOOL],
          tool_choice: { type: "tool", name: COVER_LETTER_TOOL.name },
        },
        COVER_LETTER_TOOL.name,
      );
    } catch (err) {
      return this.error_result(goal, t0, err);
    }

    if (!output.full_text?.trim()) {
      return this.skip_result(goal, t0, "model returned empty cover letter");
    }

    const full_text = output.full_text.trim();

    return {
      writes: [{ path: "draft.cover_letter_text", value: full_text }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "cover_letter_composition",
        inputs_hash,
        output_hash: AuditTrail.hash({ word_count: output.word_count, len: full_text.length }),
        justification: `wrote ${output.word_count}w cover letter | arc=${arc.archetype} | company=${company_name} | tone=${cultural_tone}`,
        model_version: models.smart,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["draft.cover_letter_text"],
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
        justification: `cover letter composition failed: ${msg}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
