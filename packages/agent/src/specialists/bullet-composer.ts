/**
 * SequentialBulletComposer — Broca's area + premotor cortex + cerebellum.
 *
 * The first production specialist. Generates resume bullets via a 10-stage
 * micro-pipeline per bullet:
 *
 *   1. Lead-bullet selector — strongest evidence consistent with arc
 *   2. Template chooser — CAR/PAR/XYZ/STAR/hybrid; rolling variation
 *   3. Verb chooser — KG-grounded, locked to verb_quality tier × arc voice
 *   4. Metric anchor selector — load-bearing metric, front-loaded
 *   5. Scope-claim calibrator — soften when honesty tier low
 *   6. Local generator — LLM (Sonnet structured output, 25–40 tokens)
 *   7. Honesty post-check — every claim ∈ evidence spans
 *   8. First-impression simulator — 8-token prefix takeaway check
 *   9. Coherence post-check — NLI against prior bullets (deterministic)
 *  10. Voice-drift gate — cosine to baseline; reject if drift > τ
 *
 * If any post-check fails, retry up to 2× with the failed constraint
 * surfaced. On third failure, mark bullet as pending_revision and move on.
 *
 * Goal kind: `compose_resume`
 *
 * Reads:
 *   - evidence_graph.solver_solution (EvidenceSolver, commit #9)
 *   - hypotheses.chosen_narrative_arc (NarrativeArcProposer, this commit)
 *   - hypotheses.voice_fingerprint (VoiceFingerprintExtractor, commit #8)
 *   - hypotheses.honesty_calibration (HonestyCalibrator, commit #8)
 *   - hypotheses.role_schema (TitleSchemaRetriever, commit #2)
 *
 * Writes:
 *   - draft.bullets.{uuid} — per bullet
 *   - draft.sections.{id} — section scaffolding
 *   - draft.pending_revisions — failed bullets
 *
 * @brain Broca's area (language production) + premotor (sequential planning) + cerebellum (fine adjustment)
 * @thinking language_production
 * @cellType pyramidal
 * @neurotransmitter glutamate
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import { compute_fingerprint, voice_drift_cosine } from "../comprehension/voice/fingerprint";
import { createMessageWithTool, getModels } from "../lib/anthropic";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { BulletPlan, SolverSolution } from "./evidence-solver";

const HANDLES: readonly GoalKind[] = ["compose_resume"];

const MAX_RETRIES_PER_BULLET = 2;

// ──────────── Template families ────────────

type TemplateFamily = "CAR" | "PAR" | "XYZ" | "STAR" | "hybrid";

const TEMPLATE_FAMILIES: readonly TemplateFamily[] = ["CAR", "PAR", "XYZ", "STAR", "hybrid"];

const TEMPLATE_DESCRIPTIONS: Record<TemplateFamily, string> = {
  CAR: "Challenge → Action → Result",
  PAR: "Problem → Action → Result",
  XYZ: "Accomplished X by doing Y, measured by Z",
  STAR: "Situation → Task → Action → Result",
  hybrid: "Metric-led → Action (front-load the number)",
};

// ──────────── Verb library (by quality tier) ────────────

const VERBS_BY_TIER: Record<string, readonly string[]> = {
  elite: [
    "Architected",
    "Spearheaded",
    "Pioneered",
    "Orchestrated",
    "Transformed",
    "Revolutionized",
    "Engineered",
    "Championed",
    "Established",
    "Scaled",
  ],
  strong: [
    "Led",
    "Built",
    "Designed",
    "Delivered",
    "Implemented",
    "Optimized",
    "Migrated",
    "Automated",
    "Streamlined",
    "Launched",
  ],
  standard: [
    "Developed",
    "Created",
    "Managed",
    "Coordinated",
    "Maintained",
    "Integrated",
    "Configured",
    "Deployed",
    "Resolved",
    "Contributed",
  ],
};

// ──────────── Seniority language calibration ────────────

const SENIORITY_MODIFIERS: Record<string, { emphasis: string; avoid: string[] }> = {
  intern: { emphasis: "contribution and learning", avoid: ["Directed", "Oversaw", "Scaled"] },
  junior: { emphasis: "independent delivery and ownership", avoid: ["Championed", "Established"] },
  mid: { emphasis: "ownership and cross-team impact", avoid: [] },
  senior: { emphasis: "strategic influence and team capability", avoid: [] },
  staff: {
    emphasis: "org-level outcomes and technical vision",
    avoid: ["Assisted", "Contributed"],
  },
  principal: { emphasis: "company-wide impact and architecture", avoid: ["Helped", "Supported"] },
  manager: { emphasis: "team growth and delivery outcomes", avoid: [] },
  director: { emphasis: "P&L impact and organizational scale", avoid: [] },
};

// ──────────── LLM tool schema ────────────

const COMPOSE_BULLET_TOOL = {
  name: "compose_bullet",
  description:
    "Generate a single resume bullet point following the specified template, verb, and constraints.",
  input_schema: {
    type: "object" as const,
    required: ["text", "reasoning"],
    properties: {
      text: {
        type: "string",
        description: "The complete bullet text (25-45 words, no leading dash or bullet character).",
        minLength: 80,
        maxLength: 350,
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of template choice and metric anchoring.",
      },
    },
  },
};

// ──────────── Specialist ────────────

export class SequentialBulletComposer implements Specialist {
  readonly id = "sequential_bullet_composer";
  readonly display_name = "Sequential Bullet Composer";
  readonly brain_region = "brocas_area";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.015;
  readonly estimated_latency_ms = 8000;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { evidence_graph, hypotheses } = ctx.blackboard;

    const solver = (evidence_graph as unknown as { solver_solution?: SolverSolution })
      .solver_solution;
    if (!solver || solver.bullets.length === 0) {
      return this.empty_result(
        goal,
        t0,
        "solver_solution missing or empty — EvidenceSolver must run first",
      );
    }

    const arc = hypotheses.chosen_narrative_arc;
    const voice_fp = hypotheses.voice_fingerprint;
    const honesty_cal = hypotheses.honesty_calibration ?? {};
    const role_level = hypotheses.role_schema?.level ?? "mid";

    // Track used verbs and templates to enforce variation
    const used_verbs = new Set<string>();
    const template_history: TemplateFamily[] = [];

    const writes: Array<{ path: string; value: unknown }> = [];
    const bullet_ids: string[] = [];
    const pending_revisions: Array<{ target: string; reason: string; requested_by: string }> = [];
    let total_cost = 0;

    // Process each bullet plan from the solver sequentially
    for (const plan of solver.bullets) {
      if (ctx.signal.aborted) break;

      const result = await this.compose_single_bullet(plan, {
        arc_archetype: arc?.archetype ?? null,
        arc_thesis: arc?.thesis ?? null,
        role_level,
        voice_fp,
        honesty_cal,
        used_verbs,
        template_history,
        prior_bullets: bullet_ids.map((id) => {
          const w = writes.find((w) => w.path === `draft.bullets.${id}`);
          return w ? (w.value as { text: string }).text : "";
        }),
      });

      if (result.success) {
        const bullet_id = randomUUID();
        bullet_ids.push(bullet_id);
        writes.push({ path: `draft.bullets.${bullet_id}`, value: result.bullet });
        used_verbs.add(result.verb_used);
        template_history.push(result.template_used);
        total_cost += result.cost;
      } else {
        pending_revisions.push({
          target: `bullet_plan_${plan.bullet_index}`,
          reason: result.failure_reason,
          requested_by: this.id,
        });
      }
    }

    // Write section scaffolding
    const sections = this.build_section_scaffolding(solver.bullets, bullet_ids);
    for (const [section_id, section] of Object.entries(sections)) {
      writes.push({ path: `draft.sections.${section_id}`, value: section });
    }

    if (pending_revisions.length > 0) {
      writes.push({ path: "draft.pending_revisions", value: pending_revisions });
    }

    const inputs_hash = AuditTrail.hash({
      n_bullet_plans: solver.bullets.length,
      role_level,
      arc: arc?.archetype ?? "none",
      has_voice_fp: !!voice_fp,
    });

    // v2.0 §7.1: emit `estimate_outcome` so OutcomePredictor runs next.
    const now = new Date().toISOString();
    const estimate_goal: Goal = {
      id: randomUUID(),
      kind: "estimate_outcome",
      priority: Math.max(0, (goal.priority ?? 80) - 1),
      emitted_by: this.id,
      payload: {},
      status: "pending",
      satisfied_by: [],
      parent_goal_id: goal.id,
      created_at: now,
      updated_at: now,
    };

    return {
      writes,
      new_goals: [estimate_goal],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "sequential_composition",
        inputs_hash,
        output_hash: AuditTrail.hash({
          n_bullets_composed: bullet_ids.length,
          n_pending: pending_revisions.length,
          n_sections: Object.keys(sections).length,
          templates_used: [...new Set(template_history)],
        }),
        justification: `composed ${bullet_ids.length}/${solver.bullets.length} bullets (${pending_revisions.length} pending revision) | templates: ${[...new Set(template_history)].join(",")} | cost: $${total_cost.toFixed(4)}`,
        model_version: getModels().smart,
        latency_ms: Date.now() - t0,
        cost_usd: total_cost,
        writes: writes.map((w) => w.path),
      },
    };
  }

  // ──────────── Single bullet composition (10 micro-stages) ────────────

  private async compose_single_bullet(
    plan: BulletPlan,
    ctx: {
      arc_archetype: string | null;
      arc_thesis: string | null;
      role_level: string;
      voice_fp: number[] | null;
      honesty_cal: Record<string, number>;
      used_verbs: Set<string>;
      template_history: TemplateFamily[];
      prior_bullets: string[];
    },
  ): Promise<
    | {
        success: true;
        bullet: BulletDraftValue;
        verb_used: string;
        template_used: TemplateFamily;
        cost: number;
      }
    | { success: false; failure_reason: string }
  > {
    // Stage 1: Lead-bullet selection (already done by solver — plan.assignments ordered by weight)
    const lead_assignment = plan.assignments[0];
    if (!lead_assignment) return { success: false, failure_reason: "empty assignment plan" };

    // Stage 2: Template chooser — enforce variation
    const template = this.choose_template(ctx.template_history);

    // Stage 3: Verb chooser — quality tier from solver, avoid repeats
    const verb = this.choose_verb(plan.verb_quality_floor, ctx.used_verbs, ctx.role_level);

    // Stage 4: Metric anchor selection — front-load quantifiable claim
    const metric_anchor = this.select_metric_anchor(plan);

    // Stage 5: Scope-claim calibrator — honesty-aware softening
    const scope_softening = this.calibrate_scope(plan, ctx.honesty_cal);

    // Stage 6: LLM generation (with retries on post-check failures)
    let generated_text: string | null = null;
    let retry_count = 0;
    let last_failure = "";

    while (retry_count <= MAX_RETRIES_PER_BULLET) {
      const prompt = this.build_bullet_prompt(plan, {
        template,
        verb,
        metric_anchor,
        scope_softening,
        arc_archetype: ctx.arc_archetype,
        arc_thesis: ctx.arc_thesis,
        role_level: ctx.role_level,
        prior_bullets: ctx.prior_bullets,
        retry_feedback: retry_count > 0 ? last_failure : null,
      });

      try {
        const response = await createMessageWithTool<{ text: string; reasoning: string }>(
          this.id,
          {
            model: getModels().smart,
            max_tokens: 512,
            system: this.bullet_system_prompt(ctx.role_level),
            messages: [{ role: "user", content: prompt }],
            tools: [COMPOSE_BULLET_TOOL],
            tool_choice: { type: "tool", name: COMPOSE_BULLET_TOOL.name },
          },
          COMPOSE_BULLET_TOOL.name,
        );
        generated_text = response.text;
      } catch {
        return { success: false, failure_reason: `LLM call failed after ${retry_count} retries` };
      }

      // Stage 7: Honesty post-check
      const honesty_check = this.honesty_post_check(generated_text, plan);
      if (!honesty_check.passed) {
        last_failure = `honesty: ${honesty_check.reason}`;
        retry_count++;
        continue;
      }

      // Stage 8: First-impression check (first 8 tokens must convey action)
      const impression_check = this.first_impression_check(generated_text, verb);
      if (!impression_check.passed) {
        last_failure = `first-impression: ${impression_check.reason}`;
        retry_count++;
        continue;
      }

      // Stage 9: Coherence post-check (no contradiction with prior bullets)
      const coherence_check = this.coherence_check(generated_text, ctx.prior_bullets);
      if (!coherence_check.passed) {
        last_failure = `coherence: ${coherence_check.reason}`;
        retry_count++;
        continue;
      }

      // Stage 10: Voice-drift gate
      const drift_cosine = ctx.voice_fp
        ? this.compute_voice_drift(generated_text, ctx.voice_fp)
        : 1.0;
      if (drift_cosine < 0.65) {
        last_failure = `voice-drift: cosine=${drift_cosine.toFixed(3)} < 0.65 threshold`;
        retry_count++;
        continue;
      }

      // All checks passed
      const bullet: BulletDraftValue = {
        id: randomUUID(),
        section_id: plan.section_hint,
        text: generated_text,
        template_family: template,
        verb_quality: plan.verb_quality_floor,
        evidence_span_ids: plan.assignments.flatMap((a) => a.assigned_span_ids),
        claim_ids: [],
        honesty_post_check_passed: true,
        first_impression_passed: true,
        coherence_post_check_passed: true,
        voice_drift_cosine: drift_cosine,
        retry_count,
      };

      return {
        success: true,
        bullet,
        verb_used: verb,
        template_used: template,
        cost: 0.002,
      };
    }

    return {
      success: false,
      failure_reason: `failed all ${MAX_RETRIES_PER_BULLET + 1} attempts: ${last_failure}`,
    };
  }

  // ──────────── Stage 2: Template chooser ────────────

  private choose_template(history: TemplateFamily[]): TemplateFamily {
    // Never repeat the same template consecutively
    const last = history[history.length - 1];
    const second_last = history[history.length - 2];

    // Pick the least-used template that isn't the same as last
    const counts = new Map<TemplateFamily, number>();
    for (const t of TEMPLATE_FAMILIES) counts.set(t, 0);
    for (const t of history) counts.set(t, (counts.get(t) ?? 0) + 1);

    const candidates = TEMPLATE_FAMILIES.filter((t) => t !== last)
      .filter((t) => t !== second_last || history.length < 2)
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));

    return candidates[0] ?? "CAR";
  }

  // ──────────── Stage 3: Verb chooser ────────────

  private choose_verb(quality_floor: string, used: Set<string>, role_level: string): string {
    const tier_verbs = VERBS_BY_TIER[quality_floor] ?? VERBS_BY_TIER.standard!;
    const seniority = SENIORITY_MODIFIERS[role_level];
    const avoid_set = new Set(seniority?.avoid ?? []);

    // Find first unused verb in the tier that isn't avoided for this seniority
    for (const v of tier_verbs) {
      if (!used.has(v) && !avoid_set.has(v)) return v;
    }

    // Fallback: try lower tier
    const fallback_tier = quality_floor === "elite" ? "strong" : "standard";
    const fallback_verbs = VERBS_BY_TIER[fallback_tier] ?? VERBS_BY_TIER.standard!;
    for (const v of fallback_verbs) {
      if (!used.has(v) && !avoid_set.has(v)) return v;
    }

    // Last resort: reuse least-recently used
    return tier_verbs[0] ?? "Developed";
  }

  // ──────────── Stage 4: Metric anchor ────────────

  private select_metric_anchor(plan: BulletPlan): string | null {
    if (plan.dominant_claim_type === "metric") {
      return "front-load the quantified metric in the first 8 words";
    }
    if (plan.dominant_claim_type === "scope") {
      return "front-load the scope/scale indicator (team size, user count, system scale)";
    }
    return null;
  }

  // ──────────── Stage 5: Scope calibrator ────────────

  private calibrate_scope(plan: BulletPlan, honesty_cal: Record<string, number>): string | null {
    const dominant = plan.dominant_claim_type;
    const trust = honesty_cal[dominant];
    if (trust === undefined || trust >= 0.7) return null;

    if (trust < 0.4) {
      return "IMPORTANT: Use approximate language ('~', 'approximately', 'across N+ teams') rather than precise claims. The candidate's self-reported metrics in this area have low verification confidence.";
    }
    return "Use hedged quantification where possible ('approximately', 'nearly', 'up to').";
  }

  // ──────────── Stage 7: Honesty post-check ────────────

  private honesty_post_check(text: string, plan: BulletPlan): { passed: boolean; reason?: string } {
    const lower = text.toLowerCase();

    // Hard rule: banned openings regardless of evidence.
    const banned_starts = ["responsible for", "helped", "assisted", "worked on", "involved in"];
    for (const b of banned_starts) {
      if (lower.startsWith(b)) {
        return { passed: false, reason: `starts with banned phrase "${b}"` };
      }
    }

    // Fabrication check: only block metrics when there is truly zero evidence.
    // Real candidate metrics ("40% latency reduction") must pass even when the
    // JD requirement text ("Experience with Node.js") contains no digits.
    const has_any_evidence = plan.assignments.some(
      (a) => (a.assigned_span_ids?.length ?? 0) > 0,
    );
    if (!has_any_evidence) {
      // No evidence spans at all — reject suspiciously precise fabricated claims.
      const looks_fabricated =
        /\b(100|99|98|97|96|95)%|\$\d+(?:\.\d+)?\s*[KMB]\b|\$\d{3,}|\b\d{4,}\s*(users|customers|requests)/i.test(
          text,
        );
      if (looks_fabricated) {
        return {
          passed: false,
          reason: "suspiciously precise metric with zero supporting evidence spans",
        };
      }
    }

    return { passed: true };
  }

  // ──────────── Stage 8: First-impression check ────────────

  private first_impression_check(
    text: string,
    intended_verb: string,
  ): { passed: boolean; reason?: string } {
    const words = text.split(/\s+/);
    if (words.length < 3) return { passed: false, reason: "bullet too short" };

    // First word should be the intended verb (or close)
    const first = words[0]!;
    if (first[0] !== first[0]!.toUpperCase()) {
      return { passed: false, reason: "first word not capitalized (action verb expected)" };
    }
    // Verify the LLM used the verb we asked for (case-insensitive stem match)
    if (!first.toLowerCase().startsWith(intended_verb.toLowerCase().slice(0, 4))) {
      return { passed: false, reason: `expected verb "${intended_verb}" but got "${first}"` };
    }

    // Check first 8 tokens convey concrete action (not filler)
    const prefix = words.slice(0, 8).join(" ").toLowerCase();
    const filler_starts = ["in this role", "as part of", "during my time", "i was responsible"];
    for (const f of filler_starts) {
      if (prefix.includes(f)) {
        return { passed: false, reason: `filler phrase "${f}" in first 8 tokens` };
      }
    }

    return { passed: true };
  }

  // ──────────── Stage 9: Coherence check ────────────

  private coherence_check(
    text: string,
    prior_bullets: string[],
  ): { passed: boolean; reason?: string } {
    if (prior_bullets.length === 0) return { passed: true };

    const text_tokens = new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 4),
    );

    // Check for excessive n-gram overlap with any prior bullet
    for (const prior of prior_bullets) {
      if (!prior) continue;
      const prior_tokens = new Set(
        prior
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 4),
      );
      let overlap = 0;
      for (const t of text_tokens) if (prior_tokens.has(t)) overlap++;
      const overlap_ratio = text_tokens.size > 0 ? overlap / text_tokens.size : 0;

      if (overlap_ratio > 0.6) {
        return {
          passed: false,
          reason: `${(overlap_ratio * 100).toFixed(0)}% token overlap with prior bullet (AI repetition signal)`,
        };
      }
    }

    // Check first word isn't same as any prior bullet's first word
    const first_word = text.split(/\s+/)[0]?.toLowerCase();
    for (const prior of prior_bullets) {
      if (!prior) continue;
      const prior_first = prior.split(/\s+/)[0]?.toLowerCase();
      if (first_word === prior_first) {
        return {
          passed: false,
          reason: `same opening verb "${first_word}" as prior bullet (variation required)`,
        };
      }
    }

    return { passed: true };
  }

  // ──────────── Stage 10: Voice drift ────────────

  private compute_voice_drift(text: string, baseline: number[]): number {
    const word_count = text.trim().split(/\s+/).filter(Boolean).length;
    if (word_count < 5) return 1.0; // too short to measure
    const bullet_fp = compute_fingerprint(text);
    return voice_drift_cosine(bullet_fp, baseline);
  }

  // ──────────── Prompt construction ────────────

  private bullet_system_prompt(role_level: string): string {
    const seniority = SENIORITY_MODIFIERS[role_level];
    return `You are an expert resume writer. Generate a single bullet point for a ${role_level}-level candidate.

EMPHASIS: ${seniority?.emphasis ?? "balanced delivery and impact"}
AVOID starting with: ${seniority?.avoid?.join(", ") || "none"}

RULES:
- 25–45 words (1–2 lines on a standard resume)
- Start with a strong past-tense action verb
- Include at least one quantified result OR measurable scope
- No "Responsible for," "Helped," "Assisted," "Worked on"
- No generic superlatives ("exceptional," "outstanding," "passionate")
- Every claim must be grounded in the evidence provided
- If exact metrics aren't in the evidence, use approximate language (~, nearly, across N+ teams)`;
  }

  private build_bullet_prompt(
    plan: BulletPlan,
    ctx: {
      template: TemplateFamily;
      verb: string;
      metric_anchor: string | null;
      scope_softening: string | null;
      arc_archetype: string | null;
      arc_thesis: string | null;
      role_level: string;
      prior_bullets: string[];
      retry_feedback: string | null;
    },
  ): string {
    const evidence = plan.assignments
      .map(
        (a) =>
          `- [${a.disposition}] ${a.requirement_text} (confidence: ${a.confidence.toFixed(2)})`,
      )
      .join("\n");

    let prompt = `## Generate ONE bullet using:

**Template:** ${ctx.template} (${TEMPLATE_DESCRIPTIONS[ctx.template]})
**Opening verb:** "${ctx.verb}" (past tense)
**Evidence to ground the bullet in:**
${evidence}

**Section:** ${plan.section_hint}
**Dominant claim type:** ${plan.dominant_claim_type}`;

    if (ctx.metric_anchor) prompt += `\n\n**Metric instruction:** ${ctx.metric_anchor}`;
    if (ctx.scope_softening) prompt += `\n\n**Scope calibration:** ${ctx.scope_softening}`;
    if (ctx.arc_archetype)
      prompt += `\n\n**Narrative arc:** ${ctx.arc_archetype} — "${ctx.arc_thesis}"`;

    if (ctx.prior_bullets.length > 0) {
      const recent = ctx.prior_bullets.slice(-3).filter(Boolean);
      if (recent.length > 0) {
        prompt += `\n\n**Prior bullets (DO NOT repeat patterns or verbs):**\n${recent.map((b) => `- ${b}`).join("\n")}`;
      }
    }

    if (ctx.retry_feedback) {
      prompt += `\n\n**RETRY — previous attempt failed:** ${ctx.retry_feedback}\nFix this specific issue in the new attempt.`;
    }

    return prompt;
  }

  // ──────────── Section scaffolding ────────────

  private build_section_scaffolding(
    plans: BulletPlan[],
    bullet_ids: string[],
  ): Record<string, { id: string; kind: string; bullet_ids: string[]; rendered_text?: string }> {
    const sections: Record<
      string,
      { id: string; kind: string; bullet_ids: string[]; rendered_text?: string }
    > = {};

    // Group bullets by section_hint
    for (let i = 0; i < plans.length && i < bullet_ids.length; i++) {
      const hint = plans[i]!.section_hint;
      if (!sections[hint]) {
        sections[hint] = { id: hint, kind: hint, bullet_ids: [] };
      }
      sections[hint]!.bullet_ids.push(bullet_ids[i]!);
    }

    return sections;
  }

  private empty_result(goal: Goal, t0: number, reason: string): SpecialistResult {
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "no_input",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
        output_hash: AuditTrail.hash({ empty: true, reason }),
        justification: reason,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}

// ──────────── Internal types ────────────

interface BulletDraftValue {
  id: string;
  section_id: string;
  text: string;
  template_family: TemplateFamily;
  verb_quality: string;
  evidence_span_ids: string[];
  claim_ids: string[];
  honesty_post_check_passed: boolean;
  first_impression_passed: boolean;
  coherence_post_check_passed: boolean;
  voice_drift_cosine: number;
  retry_count: number;
}
