/**
 * CriticEnsemble — theory-of-mind trio (TPJ: temporo-parietal junction).
 *
 * Three independent critic minds modeled simultaneously (PRD §7.1.5):
 *
 *   1. **Recruiter screener** — 6-second scan, filter logic. Does this resume
 *      survive the first-pass screen? Evaluates: headline match, years match,
 *      keyword density, formatting cleanliness, ATS compatibility signals.
 *
 *   2. **Hiring manager** — deep technical read, fit signal. Would this person
 *      succeed in the role? Evaluates: depth of relevant experience, evidence
 *      quality, narrative coherence, seniority calibration, team fit signals.
 *
 *   3. **Candidate's self-image** — what the user thinks their best story is.
 *      Does this resume represent the candidate authentically? Evaluates: arc
 *      alignment with stated preferences, voice authenticity, emphasis balance.
 *
 * When (1)+(2) recommend a different lead/arc than (3), the divergence is
 * surfaced to the user as an actionable recommendation rather than silently
 * overriding their preference.
 *
 * Architecture:
 *   - Three parallel Haiku calls (cheap, fast, independent viewpoints)
 *   - Structured tool_use forces each critic into a typed rubric
 *   - Majority vote determines the "ensemble verdict"
 *   - On 3-way tie or high divergence, escalation to frontier teacher (Opus)
 *   - Divergence between professional critics vs self-image → user surfacing
 *
 * Goal kind: `select_arc`
 *
 * Reads:
 *   - hypotheses.narrative_arcs_candidates (NarrativeArcProposer, commit #10)
 *   - hypotheses.chosen_narrative_arc (preliminary choice from commit #10)
 *   - draft.bullets.* (composed bullets from SequentialBulletComposer)
 *   - hypotheses.role_schema (job requirements context)
 *   - hypotheses.cultural_vector (company culture context)
 *
 * Writes:
 *   - hypotheses.chosen_narrative_arc (overrides commit #10 preliminary)
 *   - conflicts (critic_divergence if self-image diverges)
 *
 * May emit: `request_user_input` goal if divergence exceeds threshold.
 *
 * @brain temporo-parietal junction (TPJ): theory of mind + perspective taking
 * @thinking social_cognition
 * @cellType mirror
 * @neurotransmitter serotonin
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind, NarrativeArcCandidate } from "@retune/types";
import { createMessageWithTool, getModels } from "../lib/anthropic";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["select_arc"];

// ──────────── Critic identities ────────────

type CriticRole = "recruiter" | "hiring_manager" | "self_image";

interface CriticVerdict {
  role: CriticRole;
  preferred_arc: string;
  score: number;
  reasoning: string;
  top_concern: string | null;
  confidence: number;
}

interface EnsembleResult {
  recruiter: CriticVerdict;
  hiring_manager: CriticVerdict;
  self_image: CriticVerdict;
  consensus_arc: string;
  divergence_detected: boolean;
  divergence_description: string | null;
  escalated_to_frontier: boolean;
  frontier_verdict: string | null;
}

// ──────────── Critic system prompts ────────────

const CRITIC_PROMPTS: Record<CriticRole, string> = {
  recruiter: `You are a recruiter screener reviewing a resume for the first time. You have 6 seconds.

YOUR MENTAL MODEL:
- You scan top-to-bottom: name, title line, first 3 skills, most recent role's first bullet
- You're pattern-matching against the job requirements you were given
- You want: exact keyword matches, years alignment, no red flags, clean formatting
- You don't read beyond page 1 unless the first scan passes

YOUR SCORING CRITERIA:
- Headline matches the JD role title? (+20)
- Years of experience in range? (+15)
- Top 3 JD keywords visible in first scan? (+20)
- Most recent role is clearly relevant? (+20)
- No formatting red flags (gaps, typos, walls of text)? (+15)
- Would you forward this to the hiring manager? (+10)

Score 0-100. Be ruthless — you see 200 resumes a day.`,

  hiring_manager: `You are a hiring manager doing a deep technical read of a resume that passed recruiter screening.

YOUR MENTAL MODEL:
- You're evaluating: can this person actually DO the job on day 1-90?
- You look for: depth of relevant experience, quality of evidence, progression
- You're suspicious of: vague claims, scope inflation, buzzword density without substance
- You want to see: specific systems, quantified outcomes, leadership signals (if senior)

YOUR SCORING CRITERIA:
- Technical depth matches role requirements? (+25)
- Evidence quality: specific, verifiable claims? (+25)
- Seniority calibration: language matches claimed level? (+15)
- Narrative coherence: story makes sense? (+15)
- Would you phone-screen this person? (+20)

Score 0-100. You have high standards — you're building your team.`,

  self_image: `You are the CANDIDATE reviewing your own resume. You know your real story.

YOUR MENTAL MODEL:
- You know what you're actually good at and what you've actually done
- You have a preferred narrative: how you see your career trajectory
- You're checking: does this resume represent ME authentically?
- You're sensitive to: overstatement (embarrassing in interviews), understatement (selling short)

YOUR SCORING CRITERIA:
- Does the chosen narrative arc match how I see my career? (+25)
- Are the claims honest — would I be comfortable defending each one in an interview? (+25)
- Is the emphasis on the right things (what I actually want to be known for)? (+25)
- Does it sound like me, not a generic AI-generated resume? (+25)

Score 0-100. Be honest with yourself — not what sounds impressive, what IS you.`,
};

// ──────────── Critic tool schema ────────────

const CRITIC_TOOL = {
  name: "critic_verdict",
  description: "Provide your assessment of the resume/arc from your specific perspective.",
  input_schema: {
    type: "object" as const,
    required: ["preferred_arc", "score", "reasoning", "top_concern", "confidence"],
    properties: {
      preferred_arc: {
        type: "string",
        description: "Which narrative arc archetype is strongest from your perspective?",
      },
      score: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description: "Overall score 0-100 from your perspective.",
      },
      reasoning: {
        type: "string",
        description: "2-3 sentence explanation of your verdict.",
        maxLength: 500,
      },
      top_concern: {
        type: "string",
        nullable: true,
        description: "Single biggest concern from your perspective, or null if none.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "How confident are you in this assessment? 0.9+ = very sure, 0.5-0.7 = uncertain.",
      },
    },
  },
};

// ──────────── Divergence thresholds ────────────

const SCORE_DIVERGENCE_THRESHOLD = 25;
const ARC_DIVERGENCE_REQUIRES_SURFACING = true;
const FRONTIER_ESCALATION_THRESHOLD = 30;

// ──────────── Specialist ────────────

export class CriticEnsemble implements Specialist {
  readonly id = "critic_ensemble";
  readonly display_name = "Critic Ensemble (TPJ)";
  readonly brain_region = "temporo_parietal_junction";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.005;
  readonly estimated_latency_ms = 3000;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { hypotheses, draft } = ctx.blackboard;

    const candidates = hypotheses.narrative_arcs_candidates;
    const current_arc = hypotheses.chosen_narrative_arc;

    if (!current_arc || candidates.length === 0) {
      return this.empty_result(
        goal,
        t0,
        "no narrative arc candidates — NarrativeArcProposer must run first",
      );
    }

    // Collect composed bullet texts for context
    const bullet_texts = Object.values(draft.bullets)
      .map((b) => (b as { text?: string }).text)
      .filter(Boolean) as string[];

    const role_schema = hypotheses.role_schema;
    const cultural_vector = hypotheses.cultural_vector;

    // Build shared context for all critics
    const shared_context = this.build_shared_context(
      candidates,
      current_arc,
      bullet_texts,
      role_schema,
      cultural_vector,
    );

    const inputs_hash = AuditTrail.hash({
      n_candidates: candidates.length,
      current_arc: current_arc.archetype,
      n_bullets: bullet_texts.length,
      role: role_schema?.display_name ?? "unknown",
    });

    // Run 3 critics in parallel
    let verdicts: [CriticVerdict, CriticVerdict, CriticVerdict];
    try {
      const [recruiter, hiring_manager, self_image] = await Promise.all([
        this.run_critic("recruiter", shared_context, candidates),
        this.run_critic("hiring_manager", shared_context, candidates),
        this.run_critic("self_image", shared_context, candidates),
      ]);
      verdicts = [recruiter, hiring_manager, self_image];
    } catch (err) {
      return this.error_result(goal, t0, err);
    }

    const [recruiter, hiring_manager, self_image] = verdicts;

    // Determine ensemble consensus
    const ensemble = this.compute_ensemble(recruiter, hiring_manager, self_image, candidates);

    // Build writes
    const writes: Array<{ path: string; value: unknown }> = [];
    const new_goals: Goal[] = [];

    // Override chosen_narrative_arc if ensemble disagrees
    if (ensemble.consensus_arc !== current_arc.archetype) {
      const new_arc = candidates.find((c) => c.archetype === ensemble.consensus_arc);
      if (new_arc) {
        writes.push({ path: "hypotheses.chosen_narrative_arc", value: new_arc });
      }
    }

    // Surface divergence if self-image disagrees with professional critics
    if (ensemble.divergence_detected && ARC_DIVERGENCE_REQUIRES_SURFACING) {
      // Raise a conflict
      const conflict = {
        id: randomUUID(),
        monitor: "coherence" as const,
        severity: "medium" as const,
        payload: {
          type: "critic_divergence",
          recruiter_arc: recruiter.preferred_arc,
          recruiter_score: recruiter.score,
          hiring_manager_arc: hiring_manager.preferred_arc,
          hiring_manager_score: hiring_manager.score,
          self_image_arc: self_image.preferred_arc,
          self_image_score: self_image.score,
          description: ensemble.divergence_description,
          recommendation: `Professional critics recommend "${ensemble.consensus_arc}" but your self-model prefers "${self_image.preferred_arc}". Consider: ${ensemble.divergence_description}`,
        },
        resolved_by: null,
        resolution_log: null,
        created_at: new Date().toISOString(),
        resolved_at: null,
      };

      writes.push({
        path: `conflicts`,
        value: [...ctx.blackboard.conflicts, conflict],
      });

      // Emit request_user_input goal if divergence is high
      const score_diff = Math.abs((recruiter.score + hiring_manager.score) / 2 - self_image.score);
      if (score_diff >= SCORE_DIVERGENCE_THRESHOLD) {
        new_goals.push({
          id: randomUUID(),
          kind: "request_user_input" as const,
          priority: Math.max(0, (goal.priority ?? 80) + 5),
          emitted_by: this.id,
          payload: {
            question: `Your preferred narrative emphasis ("${self_image.preferred_arc}") differs from what our analysis suggests would maximize your callback rate ("${ensemble.consensus_arc}"). Would you like to lead with ${ensemble.consensus_arc}?`,
            options: [ensemble.consensus_arc, self_image.preferred_arc],
            context: ensemble.divergence_description,
          },
          status: "pending" as const,
          satisfied_by: [],
          parent_goal_id: goal.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Store ensemble result for audit/downstream
    writes.push({
      path: "hypotheses.critic_ensemble_result",
      value: ensemble,
    });

    // v2.0 §7.1 chain: after `select_arc`, emit `compose_resume` so the
    // SequentialBulletComposer runs next. (Previously, NarrativeArcProposer
    // emitted compose_resume directly, which skipped both critique stages.)
    const compose_now = new Date().toISOString();
    new_goals.push({
      id: randomUUID(),
      kind: "compose_resume",
      priority: Math.max(0, (goal.priority ?? 80) - 1),
      emitted_by: this.id,
      payload: { chosen_arc: ensemble.consensus_arc },
      status: "pending",
      satisfied_by: [],
      parent_goal_id: goal.id,
      created_at: compose_now,
      updated_at: compose_now,
    });

    return {
      writes,
      new_goals: new_goals.length > 0 ? new_goals : undefined,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: ensemble.escalated_to_frontier ? "ensemble_with_frontier" : "ensemble_vote",
        inputs_hash,
        output_hash: AuditTrail.hash({
          consensus: ensemble.consensus_arc,
          divergence: ensemble.divergence_detected,
          escalated: ensemble.escalated_to_frontier,
          scores: [recruiter.score, hiring_manager.score, self_image.score],
        }),
        justification: `critics: recruiter=${recruiter.score}/100 (${recruiter.preferred_arc}), HM=${hiring_manager.score}/100 (${hiring_manager.preferred_arc}), self=${self_image.score}/100 (${self_image.preferred_arc}) → consensus="${ensemble.consensus_arc}"${ensemble.divergence_detected ? ` [DIVERGENCE: ${ensemble.divergence_description}]` : ""}${ensemble.escalated_to_frontier ? " [FRONTIER ESCALATED]" : ""}`,
        model_version: getModels().fast,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: writes.map((w) => w.path),
      },
    };
  }

  // ──────────── Single critic invocation ────────────

  private async run_critic(
    role: CriticRole,
    context: string,
    candidates: readonly NarrativeArcCandidate[],
  ): Promise<CriticVerdict> {
    const arc_options = candidates.map((c) => `- ${c.archetype}: "${c.thesis}"`).join("\n");

    const response = await createMessageWithTool<{
      preferred_arc: string;
      score: number;
      reasoning: string;
      top_concern: string | null;
      confidence: number;
    }>(
      `${this.id}/${role}`,
      {
        model: getModels().fast,
        max_tokens: 512,
        system: CRITIC_PROMPTS[role],
        messages: [
          {
            role: "user",
            content: `${context}\n\n## Available narrative arcs:\n${arc_options}\n\nProvide your verdict.`,
          },
        ],
        tools: [CRITIC_TOOL],
        tool_choice: { type: "tool", name: CRITIC_TOOL.name },
      },
      CRITIC_TOOL.name,
    );

    return {
      role,
      preferred_arc: response.preferred_arc,
      score: Math.max(0, Math.min(100, response.score)),
      reasoning: response.reasoning,
      top_concern: response.top_concern,
      confidence: Math.max(0, Math.min(1, response.confidence)),
    };
  }

  // ──────────── Ensemble computation ────────────

  private compute_ensemble(
    recruiter: CriticVerdict,
    hiring_manager: CriticVerdict,
    self_image: CriticVerdict,
    _candidates: readonly NarrativeArcCandidate[],
  ): EnsembleResult {
    // Majority vote on preferred arc
    const arc_votes = new Map<string, number>();
    for (const v of [recruiter, hiring_manager, self_image]) {
      arc_votes.set(v.preferred_arc, (arc_votes.get(v.preferred_arc) ?? 0) + 1);
    }

    // Find majority arc (2+ votes) or highest-confidence if no majority
    let consensus_arc: string;
    const majority = [...arc_votes.entries()].find(([_, count]) => count >= 2);
    if (majority) {
      consensus_arc = majority[0];
    } else {
      // 3-way tie: weight by confidence
      const weighted = [recruiter, hiring_manager, self_image].sort(
        (a, b) => b.confidence * b.score - a.confidence * a.score,
      );
      consensus_arc = weighted[0]!.preferred_arc;
    }

    // Detect divergence: professional critics vs self-image
    const professional_consensus =
      recruiter.preferred_arc === hiring_manager.preferred_arc ? recruiter.preferred_arc : null;
    const divergence_detected =
      professional_consensus !== null && professional_consensus !== self_image.preferred_arc;

    let divergence_description: string | null = null;
    if (divergence_detected) {
      const prof_avg = (recruiter.score + hiring_manager.score) / 2;
      divergence_description =
        `Professional critics (recruiter: ${recruiter.score}, HM: ${hiring_manager.score}, avg: ${prof_avg.toFixed(0)}) ` +
        `prefer "${professional_consensus}" but self-image (${self_image.score}) prefers "${self_image.preferred_arc}". ` +
        `Recruiter concern: ${recruiter.top_concern ?? "none"}. HM concern: ${hiring_manager.top_concern ?? "none"}.`;
    }

    // Frontier escalation: high divergence in scores
    const score_spread =
      Math.max(recruiter.score, hiring_manager.score, self_image.score) -
      Math.min(recruiter.score, hiring_manager.score, self_image.score);
    const escalated = score_spread >= FRONTIER_ESCALATION_THRESHOLD && !majority;

    return {
      recruiter,
      hiring_manager,
      self_image,
      consensus_arc,
      divergence_detected,
      divergence_description,
      escalated_to_frontier: escalated,
      frontier_verdict: null, // Frontier teacher call deferred to when Opus is wired
    };
  }

  // ──────────── Shared context builder ────────────

  private build_shared_context(
    _candidates: readonly NarrativeArcCandidate[],
    current_arc: NarrativeArcCandidate,
    bullet_texts: string[],
    role_schema: { display_name: string; level: string; yoe_band: [number, number] } | null,
    cultural_vector: readonly number[] | null,
  ): string {
    let context = `## Target Role\n${role_schema?.display_name ?? "Unknown"} (${role_schema?.level ?? "mid"}, ${role_schema?.yoe_band?.[0] ?? 0}-${role_schema?.yoe_band?.[1] ?? 10} YoE)\n\n`;

    context += `## Current Narrative Arc\n**${current_arc.archetype}**: "${current_arc.thesis}"\nFeasibility: ${current_arc.feasibility.point.toFixed(2)}\n\n`;

    if (bullet_texts.length > 0) {
      context += `## Composed Bullets (${bullet_texts.length} total, showing first 6):\n`;
      for (const b of bullet_texts.slice(0, 6)) {
        context += `- ${b}\n`;
      }
      context += "\n";
    }

    if (cultural_vector && cultural_vector.length === 8) {
      const axes = [
        "autonomy",
        "async",
        "rigor",
        "consensus",
        "depth",
        "risk-tolerance",
        "mission",
        "agency",
      ];
      const strong = axes.filter((_, i) => Math.abs(cultural_vector[i]!) > 0.5);
      if (strong.length > 0) {
        context += `## Company Culture Signals: ${strong.join(", ")}\n\n`;
      }
    }

    return context;
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
        micro_stage: "critic_error",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
        output_hash: AuditTrail.hash({ error: msg }),
        justification: `critic ensemble failed: ${msg}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
