/**
 * NarrativeArcProposer — default mode network (self-narrative formation).
 *
 * The first LLM-driven specialist in the cognitive pipeline. Given:
 *   - evidence_graph.gap_map (from GapMapper, commit #9)
 *   - evidence_graph.solver_solution (from EvidenceSolver, commit #9)
 *   - hypotheses.role_schema (from TitleSchemaRetriever, commit #2)
 *   - hypotheses.voice_fingerprint (from VoiceFingerprintExtractor, commit #8)
 *   - hypotheses.honesty_calibration (from HonestyCalibrator, commit #8)
 *   - evidence_graph.span_ids (all extracted evidence)
 *
 * Proposes 5–8 candidate narrative arcs from the 7 archetypes (PRD §7.1.2):
 *   1. Deep specialist — narrow, deep
 *   2. Scaled it — took something from N to 10N
 *   3. Built from zero — green-field with shipping cred
 *   4. Fixed the mess — turnaround / rescue
 *   5. Led the team — people-first ascent
 *   6. Cross-functional bridge — sits between domains
 *   7. Domain pivoter — credible re-entry into related space
 *   8. No-history high-potential (new-grad only)
 *
 * Each arc gets a 1–2 sentence concrete thesis for THIS candidate, with
 * lead evidence span IDs and a feasibility confidence interval. The top
 * arc is selected by the downstream arc-selector specialist (commit #11);
 * alternates are retained for user choice.
 *
 * Implementation: Sonnet call with forced tool_use returning structured
 * NarrativeArcCandidate[]. Post-validated against honesty calibration
 * (arcs requiring over-claimed skills are penalized).
 *
 * Goal kind: `propose_arcs`
 *
 * Writes:
 *   - hypotheses.narrative_arcs_candidates
 *   - hypotheses.chosen_narrative_arc (best by feasibility — overridden in #11)
 *
 * Emits child goal: `compose_resume` (priority - 1)
 *
 * @brain default mode network: self-narrative formation + episodic integration
 * @thinking analogical_reasoning
 * @cellType pyramidal
 * @neurotransmitter dopamine
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind, NarrativeArcArchetype } from "@retune/types";
import { intervalConfidence } from "@retune/types";
import { createMessageWithTool, getModels } from "../lib/anthropic";
import { loadPromptFile } from "../prompts/loader";
import { register, renderPrompt } from "../prompts/registry";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { SolverSolution } from "./evidence-solver";

// Charter 09 Epic 01 — register this specialist's prompt at module
// load so direct-import tests (provider-parity) don't need the global
// bootstrap.
try {
  const loaded = loadPromptFile("narrative-arc-proposer.draft.md");
  register({
    name: loaded.name,
    version: Math.max(loaded.version, 2),
    model_hint: loaded.model_hint,
    body: loaded.body,
  });
} catch {
  // best-effort
}
import type { GapMap } from "./gap-mapper";

const HANDLES: readonly GoalKind[] = ["propose_arcs"];

// ──────────── Archetype library ────────────

interface ArchetypeDefinition {
  id: NarrativeArcArchetype;
  label: string;
  thesis_template: string;
  signals: string[];
  incompatible_with: NarrativeArcArchetype[];
  min_yoe: number;
}

const ARCHETYPES: readonly ArchetypeDefinition[] = [
  {
    id: "deep_specialist",
    label: "Deep Specialist",
    thesis_template:
      "A focused expert in {domain} who has gone deeper than most, with {years} of concentrated work in {area}.",
    signals: [
      "single-domain tenure",
      "increasing depth",
      "publications/talks",
      "tool mastery",
      "niche reputation",
    ],
    incompatible_with: ["cross_functional_bridge", "domain_pivoter"],
    min_yoe: 3,
  },
  {
    id: "scaled_it",
    label: "Scaled It",
    thesis_template:
      "Grew {thing} from {before} to {after}, proving the ability to take what works and make it work at 10× scale.",
    signals: [
      "N→10N metric",
      "team growth",
      "infrastructure scaling",
      "revenue growth",
      "user count growth",
    ],
    incompatible_with: [],
    min_yoe: 2,
  },
  {
    id: "built_from_zero",
    label: "Built From Zero",
    thesis_template:
      "Created {thing} from scratch and shipped it, demonstrating green-field execution and full-stack ownership.",
    signals: [
      "0→1 product",
      "founded/co-founded",
      "first engineer",
      "designed from scratch",
      "launched new product",
    ],
    incompatible_with: [],
    min_yoe: 1,
  },
  {
    id: "fixed_the_mess",
    label: "Fixed The Mess",
    thesis_template:
      "Walked into {situation} and turned it around through systematic improvement and relentless execution.",
    signals: [
      "turnaround",
      "legacy rescue",
      "tech debt paydown",
      "incident response",
      "performance fix",
      "reliability improvement",
    ],
    incompatible_with: ["no_history_high_potential"],
    min_yoe: 2,
  },
  {
    id: "led_the_team",
    label: "Led The Team",
    thesis_template:
      "Built and grew a team of {size}, developing people while delivering {outcome}.",
    signals: ["hired", "mentored", "grew team", "managed", "direct reports", "career development"],
    incompatible_with: ["no_history_high_potential"],
    min_yoe: 3,
  },
  {
    id: "cross_functional_bridge",
    label: "Cross-Functional Bridge",
    thesis_template:
      "Uniquely positioned between {domain_a} and {domain_b}, translating needs and accelerating delivery across the boundary.",
    signals: [
      "multiple domains",
      "stakeholder translation",
      "cross-team projects",
      "diverse roles",
      "bridge position",
    ],
    incompatible_with: ["deep_specialist"],
    min_yoe: 2,
  },
  {
    id: "domain_pivoter",
    label: "Domain Pivoter",
    thesis_template:
      "Bringing {years} of {source_domain} expertise to {target_domain}, with transferable {skill} as the bridge.",
    signals: ["career change", "industry switch", "adjacent domain", "transferable skills"],
    incompatible_with: ["deep_specialist"],
    min_yoe: 0,
  },
  {
    id: "no_history_high_potential",
    label: "No-History High Potential",
    thesis_template:
      "A high-signal candidate with {evidence} demonstrating capability beyond their experience level.",
    signals: [
      "strong education",
      "impressive internships",
      "open source",
      "publications",
      "competitions",
      "side projects",
    ],
    incompatible_with: ["fixed_the_mess", "led_the_team", "scaled_it"],
    min_yoe: 0,
  },
] as const;

// ──────────── LLM tool schema (JSON Schema for forced tool_use) ────────────

const ARC_PROPOSAL_TOOL = {
  name: "propose_narrative_arcs",
  description:
    "Propose 5-8 narrative arc candidates for this candidate/role combination. Each arc must be grounded in specific evidence spans.",
  input_schema: {
    type: "object" as const,
    required: ["arcs"],
    properties: {
      arcs: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: {
          type: "object",
          required: [
            "archetype",
            "thesis",
            "lead_evidence_span_ids",
            "feasibility_point",
            "rationale",
          ],
          properties: {
            archetype: {
              type: "string",
              enum: [
                "deep_specialist",
                "scaled_it",
                "built_from_zero",
                "fixed_the_mess",
                "led_the_team",
                "cross_functional_bridge",
                "domain_pivoter",
                "no_history_high_potential",
              ],
            },
            thesis: {
              type: "string",
              description:
                "1-2 sentence concrete framing for THIS specific candidate. Must reference their actual experience.",
              minLength: 30,
              maxLength: 300,
            },
            lead_evidence_span_ids: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 5,
              description: "UUIDs of the evidence spans that most strongly support this arc.",
            },
            feasibility_point: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description:
                "How feasible is this arc given the evidence? 0.9+ = slam dunk, 0.5-0.7 = requires framing, <0.5 = stretch.",
            },
            rationale: {
              type: "string",
              description:
                "Brief explanation of why this arc fits (or doesn't perfectly fit) this candidate.",
            },
          },
        },
      },
    },
  },
};

// ──────────── Specialist ────────────

export class NarrativeArcProposer implements Specialist {
  readonly id = "narrative_arc_proposer";
  readonly display_name = "Narrative Arc Proposer";
  readonly brain_region = "default_mode_network";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.003;
  readonly estimated_latency_ms = 2500;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { evidence_graph, hypotheses } = ctx.blackboard;

    const gap_map = (evidence_graph as unknown as { gap_map?: GapMap }).gap_map;
    const solver = (evidence_graph as unknown as { solver_solution?: SolverSolution })
      .solver_solution;

    if (!gap_map || !solver) {
      return this.empty_result(
        goal,
        t0,
        "gap_map or solver_solution missing — GapMapper + EvidenceSolver must run first",
      );
    }

    const role_schema = hypotheses.role_schema;
    const honesty_cal = hypotheses.honesty_calibration ?? {};
    const span_ids = evidence_graph.span_ids;

    // Build context for the LLM
    const system_prompt = this.build_system_prompt(role_schema, gap_map, solver);
    const user_prompt = this.build_user_prompt(gap_map, solver, span_ids);

    const inputs_hash = AuditTrail.hash({
      n_requirements: gap_map.entries.length,
      n_bullets: solver.bullets.length,
      role_level: role_schema?.level ?? "unknown",
      n_spans: span_ids.length,
    });

    // LLM call: Sonnet with forced tool_use
    let raw_arcs: Array<{
      archetype: string;
      thesis: string;
      lead_evidence_span_ids: string[];
      feasibility_point: number;
      rationale: string;
    }>;

    const models = getModels();
    try {
      const response = await createMessageWithTool<{ arcs: typeof raw_arcs }>(
        this.id,
        {
          model: models.smart,
          max_tokens: 2048,
          system: system_prompt,
          messages: [{ role: "user", content: user_prompt }],
          tools: [ARC_PROPOSAL_TOOL],
          tool_choice: { type: "tool", name: ARC_PROPOSAL_TOOL.name },
        },
        ARC_PROPOSAL_TOOL.name,
      );
      raw_arcs = response.arcs;
    } catch (err) {
      return this.error_result(goal, t0, err);
    }

    // Post-processing: validate span IDs, apply honesty haircut, compute confidence intervals
    const valid_span_set = new Set(span_ids);
    const candidates = raw_arcs
      .filter((arc) => this.is_valid_archetype(arc.archetype))
      .map((arc) => {
        // Filter to valid span IDs only
        const valid_leads = arc.lead_evidence_span_ids.filter((id) => valid_span_set.has(id));
        if (valid_leads.length === 0) {
          // If LLM hallucinated span IDs, use first N available spans
          const fallback_spans = span_ids.slice(0, Math.min(3, span_ids.length));
          valid_leads.push(...fallback_spans);
        }

        // Honesty haircut on feasibility
        const haircut = this.compute_arc_honesty_haircut(arc.archetype, honesty_cal);
        const adjusted_feasibility = arc.feasibility_point * haircut;

        // Build confidence interval (wider for lower feasibility)
        const width = 0.15 * (1 - adjusted_feasibility);
        const feasibility = intervalConfidence(
          adjusted_feasibility,
          Math.max(0, adjusted_feasibility - width),
          Math.min(1, adjusted_feasibility + width),
          0.95,
        );

        return {
          archetype: arc.archetype as NarrativeArcArchetype,
          thesis: arc.thesis,
          lead_evidence_span_ids: valid_leads,
          feasibility,
          predicted_callback: undefined,
          recruiter_critic_score: undefined,
          hiring_manager_critic_score: undefined,
        };
      })
      .sort((a, b) => b.feasibility.point - a.feasibility.point);

    if (candidates.length === 0) {
      return this.empty_result(goal, t0, "LLM returned no valid arc candidates");
    }

    // Best arc becomes chosen_narrative_arc (will be overridden by critic ensemble in #11)
    const chosen = candidates[0];
    if (!chosen) {
      throw new Error("narrative-arc-proposer: no candidates after scoring");
    }

    // v2.0 §7.1: emit BOTH `model_recruiter_beliefs` and `select_arc` so the
    // ToM specialist runs first (higher priority) and CriticEnsemble consumes
    // its output. Previously we jumped straight to compose_resume which
    // skipped both critique stages.
    const now = new Date().toISOString();
    const base_priority = Math.max(0, (goal.priority ?? 80) - 1);
    const tom_goal: Goal = {
      id: randomUUID(),
      kind: "model_recruiter_beliefs",
      priority: base_priority,
      emitted_by: this.id,
      payload: { chosen_arc: chosen.archetype },
      status: "pending",
      satisfied_by: [],
      parent_goal_id: goal.id,
      created_at: now,
      updated_at: now,
    };
    const critic_goal: Goal = {
      id: randomUUID(),
      kind: "select_arc",
      priority: Math.max(0, base_priority - 1),
      emitted_by: this.id,
      payload: { chosen_arc: chosen.archetype },
      status: "pending",
      satisfied_by: [],
      parent_goal_id: goal.id,
      created_at: now,
      updated_at: now,
    };

    return {
      writes: [
        { path: "hypotheses.narrative_arcs_candidates", value: candidates },
        { path: "hypotheses.chosen_narrative_arc", value: chosen },
      ],
      new_goals: [tom_goal, critic_goal],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "llm_arc_proposal",
        inputs_hash,
        output_hash: AuditTrail.hash({
          n_candidates: candidates.length,
          chosen_archetype: chosen.archetype,
          chosen_feasibility: chosen.feasibility.point,
        }),
        justification: `proposed ${candidates.length} arcs, chose "${chosen.archetype}" (feasibility=${chosen.feasibility.point.toFixed(3)}, thesis="${chosen.thesis.slice(0, 80)}...")`,
        model_version: models.smart,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["hypotheses.narrative_arcs_candidates", "hypotheses.chosen_narrative_arc"],
      },
    };
  }

  // ──────────── System prompt construction ────────────

  private build_system_prompt(
    role_schema: {
      level: string;
      family: string;
      display_name: string;
      yoe_band: [number, number];
    } | null,
    gap_map: GapMap,
    solver: SolverSolution,
  ): string {
    const level = role_schema?.level ?? "mid";
    const family = role_schema?.family ?? "swe";
    const display = role_schema?.display_name ?? "Software Engineer";

    const archetype_descriptions = ARCHETYPES.filter((a) => this.is_archetype_eligible(a, level))
      .map(
        (a) =>
          `- **${a.label}** (${a.id}): ${a.thesis_template}\n  Signals: ${a.signals.join(", ")}`,
      )
      .join("\n");

    const level_emphasis =
      level === "junior" || level === "intern"
        ? "prefer no_history_high_potential and built_from_zero"
        : "prefer deep_specialist, scaled_it, and led_the_team";

    return renderPrompt("narrative-arc-proposer.draft", {
      display,
      level,
      family,
      direct_hits: gap_map.summary.direct_hits,
      implied_hits: gap_map.summary.implied_hits,
      transferable: gap_map.summary.transferable,
      total_requirements: gap_map.summary.total_requirements,
      coverage_pct: gap_map.summary.coverage_pct.toFixed(1),
      bullet_slots: solver.bullets.length,
      archetype_descriptions,
      level_emphasis,
    });
  }

  private build_user_prompt(gap_map: GapMap, solver: SolverSolution, span_ids: string[]): string {
    // Summarize evidence for the LLM
    const top_evidence = solver.bullets
      .slice(0, 8)
      .map(
        (b, i) =>
          `Bullet ${i + 1}: ${b.assignments.map((a) => `[${a.disposition}] ${a.requirement_text} (conf=${a.confidence.toFixed(2)})`).join("; ")}`,
      )
      .join("\n");

    const available_spans = span_ids.slice(0, 20).join(", ");

    return `## Candidate Evidence (from solver output)

${top_evidence}

## Available evidence_span_ids (use these in lead_evidence_span_ids):
${available_spans}

## Gap Map Summary
- Direct hits: ${gap_map.summary.direct_hits}
- Implied: ${gap_map.summary.implied_hits}
- Transferable: ${gap_map.summary.transferable}
- Cover letter: ${gap_map.summary.cover_letter}
- Must omit: ${gap_map.summary.must_omit}

## Hard requirements met: ${gap_map.summary.hard_requirements_met}/${gap_map.summary.hard_requirements_total}

Propose the narrative arcs now. For each, provide a specific thesis grounded in the evidence above.`;
  }

  // ──────────── Honesty haircut per arc ────────────

  private compute_arc_honesty_haircut(
    archetype: string,
    honesty_cal: Record<string, number>,
  ): number {
    if (Object.keys(honesty_cal).length === 0) return 1.0;

    // Map archetypes to the claim types they rely on most heavily
    const arc_claim_deps: Record<string, string[]> = {
      deep_specialist: ["skill_usage", "technical_depth"],
      scaled_it: ["metric", "scope"],
      built_from_zero: ["achievement", "technical_depth"],
      fixed_the_mess: ["achievement", "metric"],
      led_the_team: ["leadership", "scope"],
      cross_functional_bridge: ["scope", "skill_usage"],
      domain_pivoter: ["skill_usage", "duration"],
      no_history_high_potential: ["achievement"],
    };

    const deps = arc_claim_deps[archetype] ?? [];
    if (deps.length === 0) return 1.0;

    // Average trust across dependent claim types
    let trust_sum = 0;
    let trust_count = 0;
    for (const dep of deps) {
      const trust = honesty_cal[dep];
      if (trust !== undefined) {
        trust_sum += trust;
        trust_count++;
      }
    }

    if (trust_count === 0) return 1.0;
    const avg_trust = trust_sum / trust_count;

    // Haircut: 0.7 + 0.3 * trust (floor 0.7, ceiling 1.0)
    return 0.7 + 0.3 * avg_trust;
  }

  // ──────────── Archetype eligibility ────────────

  private is_archetype_eligible(def: ArchetypeDefinition, level: string): boolean {
    const level_yoe: Record<string, number> = {
      intern: 0,
      junior: 0,
      mid: 2,
      senior: 5,
      staff: 8,
      principal: 12,
      manager: 4,
      director: 8,
    };
    const yoe = level_yoe[level] ?? 3;
    return yoe >= def.min_yoe;
  }

  private is_valid_archetype(archetype: string): boolean {
    return ARCHETYPES.some((a) => a.id === archetype);
  }

  // ──────────── Error / empty results ────────────

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
        justification: `LLM call failed: ${msg}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
