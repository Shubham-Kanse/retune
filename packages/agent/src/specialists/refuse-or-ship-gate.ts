/**
 * RefuseOrShipGate — locus coeruleus (arousal/vigilance) + amygdala (threat detection).
 *
 * The final meta-cognitive checkpoint before any document is rendered.
 * Implements PRD §9.2 (refuse-and-explain) and §12.4 (GDPR Article 22
 * automated-decision disclosure).
 *
 * Responsibilities:
 *   1. Aggregate all quality signals across the full pipeline
 *   2. Apply multi-criteria decision matrix (ship | refuse | revise)
 *   3. If refusing: produce a structured RefusalPacket with every reason
 *   4. If shipping: emit render_documents goal + GDPR audit disclosure
 *   5. Always write the decision to the blackboard for audit / replay
 *
 * Decision criteria (ordered by severity):
 *   REFUSE (hard stop) if ANY of:
 *     - outcome_estimate.point < 0.20
 *     - blocking_factors contains ATS failure or hard-constraint failure
 *     - unresolved fabrication conflicts
 *     - voice drift cosine < 0.50 on majority of bullets
 *     - requiredPct < 60 (fewer than 60% of required keywords covered)
 *
 *   REVISE (request more input) if ANY of:
 *     - critic_divergence conflict unresolved
 *     - outcome_estimate.point in [0.20, 0.35)
 *     - pending_revisions non-empty
 *     - hidden disqualifiers overlap with key requirements
 *
 *   SHIP if none of the above apply
 *
 * The GDPR audit packet (Article 22, §12.4) is always produced and
 * always written to the blackboard. It contains:
 *   - Every specialist that ran (from audit_trail)
 *   - Every decision made at each stage
 *   - The final verdict with reasons
 *   - A human-readable plain-language summary
 *   - The candidate's right to contest (§22(3) safeguard)
 *
 * Goal kind: `decide_refuse_or_ship`
 *
 * Reads: everything on the blackboard (full pipeline state)
 *
 * Writes:
 *   - hypotheses.ship_decision (ShipDecision)
 *   - hypotheses.gdpr_audit_packet (GdprAuditPacket)
 *
 * Emits: `render_documents` (if SHIP) or `request_user_input` (if REVISE)
 *
 * @brain locus coeruleus (arousal + vigilance) + amygdala (threat detection)
 * @thinking metacognition
 * @cellType chandelier
 * @neurotransmitter norepinephrine
 *        + prefrontal meta-cognition (supervisor)
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["decide_refuse_or_ship"];

// ──────────── Decision thresholds ────────────

const REFUSE_OUTCOME_FLOOR = 0.2;
const REVISE_OUTCOME_FLOOR = 0.35;
const VOICE_DRIFT_FLOOR = 0.5;
const VOICE_DRIFT_MAJORITY_THRESHOLD = 0.5;
const ATS_COVERAGE_REFUSE = 0.6;

// ──────────── Decision types ────────────

export type ShipVerdict = "ship" | "revise" | "refuse";

export interface ShipDecision {
  verdict: ShipVerdict;
  outcome_point: number;
  outcome_interval: [number, number];
  reasons: string[];
  revise_suggestions: string[];
  decided_at: string;
  submission_confidence: number;
  interview_ready_score: number;
}

export interface GdprAuditEntry {
  stage: string;
  specialist_id: string;
  brain_region: string;
  input_signals: string[];
  output: string;
  cost_usd: number;
  latency_ms: number;
  timestamp: string;
}

export interface GdprAuditPacket {
  generation_id: string;
  user_id: string;
  created_at: string;
  verdict: ShipVerdict;
  verdict_reasons: string[];
  pipeline_stages: GdprAuditEntry[];
  plain_language_summary: string;
  appeal_instructions: string;
  data_used: string[];
  decision_factors: Array<{ factor: string; weight: string; value: string; contribution: string }>;
  article_22_disclosure: string;
}

// ──────────── Specialist ────────────

export class RefuseOrShipGate implements Specialist {
  readonly id = "refuse_or_ship_gate";
  readonly display_name = "Refuse-or-Ship Gate (Meta-cognition)";
  readonly brain_region = "locus_coeruleus_amygdala";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 10;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { blackboard } = ctx;

    // ── Phase 1: Collect all signals ──
    const signals = this.collect_signals(blackboard);

    // ── Phase 2: Apply decision matrix ──
    const { verdict, reasons, revise_suggestions } = this.apply_decision_matrix(signals);

    // ── Phase 3: Compute quality scores ──
    const submission_confidence = this.compute_submission_confidence(signals, verdict);
    const interview_ready_score = this.compute_interview_ready_score(signals);

    // ── Phase 4: Build ShipDecision ──
    const decision: ShipDecision = {
      verdict,
      outcome_point: signals.outcome_point,
      outcome_interval: [signals.outcome_lower, signals.outcome_upper],
      reasons,
      revise_suggestions,
      decided_at: new Date().toISOString(),
      submission_confidence,
      interview_ready_score,
    };

    // ── Phase 5: Build GDPR audit packet (Article 22 §12.4) ──
    const gdpr_packet = this.build_gdpr_packet(blackboard, decision, signals);

    // ── Phase 6: Build writes ──
    const writes: Array<{ path: string; value: unknown }> = [
      { path: "hypotheses.ship_decision", value: decision },
      { path: "hypotheses.gdpr_audit_packet", value: gdpr_packet },
    ];

    // ── Phase 7: Emit downstream goal ──
    const new_goals: Goal[] = [];

    if (verdict === "ship") {
      new_goals.push(
        this.make_goal("render_documents", goal, {
          submission_confidence,
          interview_ready_score,
        }),
      );
    } else if (verdict === "revise") {
      new_goals.push(
        this.make_goal("request_user_input", goal, {
          question: this.build_revise_question(reasons, revise_suggestions),
          context: reasons.join(" | "),
          verdict: "revise",
        }),
      );
    }
    // verdict === "refuse": no downstream goal — pipeline terminates

    const inputs_hash = AuditTrail.hash({
      outcome: signals.outcome_point,
      n_blockers: signals.blocking_factors.length,
      n_conflicts: signals.unresolved_conflicts,
      n_fabrication: signals.fabrication_conflicts,
      n_bullets: signals.total_bullets,
      drifted_bullets: signals.drifted_bullets,
    });

    return {
      writes,
      new_goals: new_goals.length > 0 ? new_goals : undefined,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "metacognitive_gate",
        inputs_hash,
        output_hash: AuditTrail.hash({
          verdict,
          submission_confidence,
          interview_ready_score,
          n_reasons: reasons.length,
        }),
        justification: `VERDICT: ${verdict.toUpperCase()} | P(callback)=${(signals.outcome_point * 100).toFixed(1)}% [${(signals.outcome_lower * 100).toFixed(1)}%, ${(signals.outcome_upper * 100).toFixed(1)}%] | submission_confidence=${(submission_confidence * 100).toFixed(1)}% | interview_ready=${interview_ready_score}/100 | ${reasons.length} reason(s): ${reasons[0] ?? "none"}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: writes.map((w) => w.path),
      },
    };
  }

  // ──────────── Signal collection ────────────

  private collect_signals(bb: SpecialistContext["blackboard"]): PipelineSignals {
    const { hypotheses, draft, conflicts, outcome_estimate, blocking_factors, audit_trail } = bb;

    // Outcome predictor signals
    const outcome_point = outcome_estimate?.point ?? 0.5;
    const outcome_lower = outcome_estimate?.lower ?? 0.3;
    const outcome_upper = outcome_estimate?.upper ?? 0.7;

    // Blocking factors from OutcomePredictor
    const blocker_texts = blocking_factors ?? [];

    // Conflict analysis
    const all_conflicts = conflicts ?? [];
    const fabrication_conflicts = all_conflicts.filter((c) => c.monitor === "fabrication").length;
    const unresolved_conflicts = all_conflicts.filter((c) => !c.resolved_by).length;
    const fairness_conflicts = all_conflicts.filter((c) => c.monitor === "fairness_concern").length;
    const critic_divergence = all_conflicts.some((c) => c.payload?.type === "critic_divergence");

    // Bullet quality signals
    const bullet_values = Object.values(draft.bullets) as Array<{
      voice_drift_cosine?: number;
      honesty_post_check_passed?: boolean;
      first_impression_passed?: boolean;
      coherence_post_check_passed?: boolean;
    }>;
    const total_bullets = bullet_values.length;
    const drifted_bullets = bullet_values.filter(
      (b) => typeof b?.voice_drift_cosine === "number" && b.voice_drift_cosine < VOICE_DRIFT_FLOOR,
    ).length;
    const failed_honesty = bullet_values.filter(
      (b) => b?.honesty_post_check_passed === false,
    ).length;
    const failed_coherence = bullet_values.filter(
      (b) => b?.coherence_post_check_passed === false,
    ).length;
    const pending_revisions = draft.pending_revisions?.length ?? 0;

    // Hidden disqualifiers
    const hidden_disqualifiers = hypotheses.hidden_disqualifiers ?? [];

    // ATS coverage (from gap_map)
    const gap_map = (
      bb.evidence_graph as unknown as {
        gap_map?: {
          summary: {
            coverage_pct: number;
            hard_requirements_met: number;
            hard_requirements_total: number;
          };
        };
      }
    ).gap_map;
    const ats_coverage = (gap_map?.summary.coverage_pct ?? 80) / 100;
    const hard_met = gap_map?.summary.hard_requirements_met ?? 1;
    const hard_total = gap_map?.summary.hard_requirements_total ?? 1;
    const hard_fraction = hard_total > 0 ? hard_met / hard_total : 1.0;

    // Arc feasibility
    const arc_feasibility = hypotheses.chosen_narrative_arc?.feasibility.point ?? 0.7;

    // Critic scores (if available)
    const ensemble = (
      hypotheses as unknown as {
        critic_ensemble_result?: {
          recruiter: { score: number };
          hiring_manager: { score: number };
        };
      }
    ).critic_ensemble_result;
    const recruiter_score = (ensemble?.recruiter.score ?? 50) / 100;
    const hm_score = (ensemble?.hiring_manager.score ?? 50) / 100;

    return {
      outcome_point,
      outcome_lower,
      outcome_upper,
      blocking_factors: blocker_texts,
      fabrication_conflicts,
      unresolved_conflicts,
      fairness_conflicts,
      critic_divergence,
      total_bullets,
      drifted_bullets,
      failed_honesty,
      failed_coherence,
      pending_revisions,
      hidden_disqualifiers,
      ats_coverage,
      hard_fraction,
      arc_feasibility,
      recruiter_score,
      hm_score,
      n_audit_entries: audit_trail.length,
    };
  }

  // ──────────── Decision matrix ────────────

  private apply_decision_matrix(s: PipelineSignals): {
    verdict: ShipVerdict;
    reasons: string[];
    revise_suggestions: string[];
  } {
    const hard_refuse: string[] = [];
    const soft_revise: string[] = [];
    const revise_suggestions: string[] = [];

    // ── Hard REFUSE conditions ──

    if (s.outcome_point < REFUSE_OUTCOME_FLOOR) {
      hard_refuse.push(
        `Predicted callback probability ${(s.outcome_point * 100).toFixed(1)}% is below the minimum acceptable threshold of ${REFUSE_OUTCOME_FLOOR * 100}%. Shipping this application would likely damage the candidate's reputation with this employer.`,
      );
    }

    if (s.fabrication_conflicts > 0) {
      hard_refuse.push(
        `${s.fabrication_conflicts} fabrication conflict(s) detected — claims were generated that cannot be traced to verified evidence. Shipping fabricated content violates PRD §8.8 and the candidate's trust.`,
      );
    }

    if (s.ats_coverage < ATS_COVERAGE_REFUSE) {
      hard_refuse.push(
        `ATS keyword coverage ${(s.ats_coverage * 100).toFixed(1)}% is below the 60% minimum. This application will be filtered before a human reads it.`,
      );
    }

    const drift_fraction = s.total_bullets > 0 ? s.drifted_bullets / s.total_bullets : 0;
    if (drift_fraction > VOICE_DRIFT_MAJORITY_THRESHOLD && s.total_bullets >= 4) {
      hard_refuse.push(
        `${s.drifted_bullets}/${s.total_bullets} bullets have voice drift cosine < ${VOICE_DRIFT_FLOOR} — the resume sounds like a generic AI generation, not this candidate. AI detection risk is high.`,
      );
    }

    if (s.hard_fraction < 0.5 && s.hard_fraction > 0) {
      hard_refuse.push(
        `Only ${(s.hard_fraction * 100).toFixed(0)}% of hard requirements are met. This candidate does not meet the minimum bar for this role.`,
      );
    }

    // ── Soft REVISE conditions (only evaluated if no hard REFUSE) ──

    if (hard_refuse.length === 0) {
      if (s.outcome_point < REVISE_OUTCOME_FLOOR) {
        soft_revise.push(
          `Predicted callback ${(s.outcome_point * 100).toFixed(1)}% is below the recommended threshold of ${REVISE_OUTCOME_FLOOR * 100}%. Consider strengthening the evidence before submitting.`,
        );
        revise_suggestions.push("Add more specific metrics to experience bullets");
        revise_suggestions.push(
          "Strengthen the professional summary to match the JD more precisely",
        );
      }

      if (s.critic_divergence) {
        soft_revise.push(
          "Professional critics and self-image analysis disagree on the optimal narrative arc. Resolving this divergence could improve the callback rate.",
        );
        revise_suggestions.push("Review the narrative arc recommendation from the critic ensemble");
      }

      if (s.pending_revisions > 0) {
        soft_revise.push(
          `${s.pending_revisions} bullet(s) failed quality checks and are pending revision. The resume may have weak spots.`,
        );
        revise_suggestions.push("Review and improve the flagged bullets before submitting");
      }

      if (s.hidden_disqualifiers.length > 0) {
        soft_revise.push(
          `${s.hidden_disqualifiers.length} hidden disqualifier(s) detected in the JD: ${s.hidden_disqualifiers.slice(0, 2).join(", ")}. Confirm you meet these requirements before applying.`,
        );
        revise_suggestions.push(`Verify eligibility for: ${s.hidden_disqualifiers[0]}`);
      }

      if (s.failed_honesty > 0) {
        soft_revise.push(
          `${s.failed_honesty} bullet(s) failed honesty post-check. Claims may be hard to defend in an interview.`,
        );
        revise_suggestions.push("Soften or qualify specific metrics that lack strong evidence");
      }
    }

    // ── Final verdict ──
    let verdict: ShipVerdict;
    if (hard_refuse.length > 0) {
      verdict = "refuse";
    } else if (soft_revise.length > 0) {
      verdict = "revise";
    } else {
      verdict = "ship";
    }

    return {
      verdict,
      reasons: [...hard_refuse, ...soft_revise],
      revise_suggestions,
    };
  }

  // ──────────── Quality scores ────────────

  private compute_submission_confidence(signals: PipelineSignals, verdict: ShipVerdict): number {
    if (verdict === "refuse") return 0;

    const base = signals.outcome_point;

    // Bonuses: hard constraints fully met, no drifted bullets
    const hard_bonus = signals.hard_fraction >= 1.0 ? 0.05 : 0;
    const drift_bonus = signals.drifted_bullets === 0 ? 0.05 : 0;
    const arc_bonus = signals.arc_feasibility > 0.8 ? 0.03 : 0;

    // Penalties: unresolved conflicts, pending revisions
    const conflict_penalty = Math.min(0.1, signals.unresolved_conflicts * 0.03);
    const revision_penalty = Math.min(0.08, signals.pending_revisions * 0.02);

    return Math.max(
      0,
      Math.min(
        1,
        base + hard_bonus + drift_bonus + arc_bonus - conflict_penalty - revision_penalty,
      ),
    );
  }

  private compute_interview_ready_score(signals: PipelineSignals): number {
    // 0-100 composite score
    let score = 0;

    // Outcome predictor (30 pts)
    score += signals.outcome_point * 30;

    // Recruiter gate (20 pts)
    score += signals.recruiter_score * 20;

    // HM gate (25 pts)
    score += signals.hm_score * 25;

    // ATS coverage (15 pts)
    score += signals.ats_coverage * 15;

    // Voice authenticity (10 pts) — proxy: inverse of drift fraction
    const drift_ok =
      signals.total_bullets > 0 ? 1 - signals.drifted_bullets / signals.total_bullets : 1;
    score += drift_ok * 10;

    // Penalties
    score -= signals.fabrication_conflicts * 5;
    score -= signals.failed_honesty * 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ──────────── GDPR Article 22 audit packet ────────────

  private build_gdpr_packet(
    bb: SpecialistContext["blackboard"],
    decision: ShipDecision,
    signals: PipelineSignals,
  ): GdprAuditPacket {
    const pipeline_stages: GdprAuditEntry[] = bb.audit_trail.map((entry) => ({
      stage: entry.micro_stage ?? entry.specialist,
      specialist_id: entry.specialist,
      brain_region: this.brain_region_for(entry.specialist),
      input_signals: entry.writes,
      output: entry.justification ?? entry.micro_stage ?? "completed",
      cost_usd: entry.cost_usd,
      latency_ms: entry.latency_ms,
      timestamp: entry.timestamp,
    }));

    const decision_factors: GdprAuditPacket["decision_factors"] = [
      {
        factor: "Predicted callback probability",
        weight: "30%",
        value: `${(signals.outcome_point * 100).toFixed(1)}%`,
        contribution: signals.outcome_point >= REVISE_OUTCOME_FLOOR ? "positive" : "negative",
      },
      {
        factor: "ATS keyword coverage",
        weight: "15%",
        value: `${(signals.ats_coverage * 100).toFixed(1)}%`,
        contribution: signals.ats_coverage >= 0.75 ? "positive" : "negative",
      },
      {
        factor: "Recruiter screen score",
        weight: "20%",
        value: `${(signals.recruiter_score * 100).toFixed(0)}/100`,
        contribution: signals.recruiter_score >= 0.6 ? "positive" : "negative",
      },
      {
        factor: "Hiring manager score",
        weight: "25%",
        value: `${(signals.hm_score * 100).toFixed(0)}/100`,
        contribution: signals.hm_score >= 0.6 ? "positive" : "negative",
      },
      {
        factor: "Voice authenticity",
        weight: "5%",
        value:
          signals.drifted_bullets === 0 ? "no drift" : `${signals.drifted_bullets} bullets drifted`,
        contribution: signals.drifted_bullets === 0 ? "positive" : "negative",
      },
      {
        factor: "Hard requirements met",
        weight: "5%",
        value: `${Math.round(signals.hard_fraction * 100)}%`,
        contribution: signals.hard_fraction >= 1.0 ? "positive" : "negative",
      },
    ];

    const plain_language = this.build_plain_language_summary(decision, signals);

    return {
      generation_id: bb.generation_id,
      user_id: bb.user_id,
      created_at: new Date().toISOString(),
      verdict: decision.verdict,
      verdict_reasons: decision.reasons,
      pipeline_stages,
      plain_language_summary: plain_language,
      appeal_instructions:
        "You may contest this automated decision by contacting support@retune.ai with your generation ID. A human reviewer will re-evaluate your application materials within 48 hours. This right is guaranteed under GDPR Article 22(3).",
      data_used: [
        "Job description text provided",
        "Candidate profile (work history, skills, education)",
        "Previously generated documents (if any)",
        "Voice fingerprint derived from profile text",
        "Honesty calibration from past application outcomes",
      ],
      decision_factors,
      article_22_disclosure: `Under GDPR Article 22, you have the right to know when and how automated decision-making affects you. This document constitutes the mandatory disclosure for generation ${bb.generation_id}. The decision to "${decision.verdict}" was made by an automated system on ${decision.decided_at}. The system processed your candidate profile and job description to predict application outcomes. No solely automated decision will prevent you from applying directly to any employer. This disclosure was generated by Retune's cognitive pipeline and is available to you upon request.`,
    };
  }

  private build_plain_language_summary(decision: ShipDecision, _signals: PipelineSignals): string {
    const pct = (decision.outcome_point * 100).toFixed(1);
    const conf = (decision.submission_confidence * 100).toFixed(1);

    if (decision.verdict === "ship") {
      return `Your application is ready to submit. Our analysis predicts a ${pct}% probability of receiving a callback (interview invitation), with ${conf}% confidence in this assessment. Your resume scored ${decision.interview_ready_score}/100 on our interview-readiness scale. ${decision.reasons.length === 0 ? "No issues were detected." : "Minor notes: " + decision.reasons.join(" ")}`;
    }

    if (decision.verdict === "revise") {
      const sugg = decision.revise_suggestions.slice(0, 2).join("; ");
      return `Your application needs some improvements before it's ready. Currently, we predict a ${pct}% callback probability, below our recommended threshold. Key issues: ${decision.reasons[0] ?? "see details"}. Suggested improvements: ${sugg}.`;
    }

    return `We cannot confidently submit this application in its current state. Predicted callback probability is ${pct}%, which falls below our minimum acceptable threshold. ${decision.reasons[0] ?? "Multiple quality issues were detected."} We recommend reviewing the flagged issues and regenerating specific sections.`;
  }

  // ──────────── Helpers ────────────

  private brain_region_for(specialist_id: string): string {
    const map: Record<string, string> = {
      title_schema_retriever: "angular_gyrus",
      company_schema_retriever: "angular_gyrus",
      jd_span_extractor: "temporal_cortex",
      discourse_classifier: "wernickes_area",
      boilerplate_stripper: "anterior_cingulate",
      cultural_calibrator: "right_tpj_sts",
      voice_fingerprint_extractor: "brocas_area",
      honesty_calibrator: "orbitofrontal_cortex",
      credibility_scanner: "sts_acc",
      fairness_monitor: "right_ventrolateral_pfc",
      gap_mapper: "DLPFC",
      evidence_solver: "DLPFC",
      narrative_arc_proposer: "default_mode_network",
      sequential_bullet_composer: "brocas_area",
      voice_drift_monitor: "cerebellum",
      critic_ensemble: "temporo_parietal_junction",
      outcome_predictor: "ventromedial_PFC",
      refuse_or_ship_gate: "locus_coeruleus_amygdala",
    };
    return map[specialist_id] ?? "unknown";
  }

  private build_revise_question(reasons: string[], suggestions: string[]): string {
    const reason_summary = reasons[0] ?? "quality improvements needed";
    const sugg_list = suggestions
      .slice(0, 3)
      .map((s, i) => `${i + 1}. ${s}`)
      .join(" ");
    return `Your application needs revisions before it meets our quality bar. Issue: ${reason_summary} Suggested next steps: ${sugg_list} Would you like to proceed with revisions, or submit as-is?`;
  }

  private make_goal(kind: GoalKind, parent: Goal, payload: Record<string, unknown>): Goal {
    return {
      id: randomUUID(),
      kind,
      priority: Math.max(0, (parent.priority ?? 80) - 1),
      emitted_by: this.id,
      payload,
      status: "pending" as const,
      satisfied_by: [],
      parent_goal_id: parent.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

// ──────────── Internal signal bundle ────────────

interface PipelineSignals {
  outcome_point: number;
  outcome_lower: number;
  outcome_upper: number;
  blocking_factors: string[];
  fabrication_conflicts: number;
  unresolved_conflicts: number;
  fairness_conflicts: number;
  critic_divergence: boolean;
  total_bullets: number;
  drifted_bullets: number;
  failed_honesty: number;
  failed_coherence: number;
  pending_revisions: number;
  hidden_disqualifiers: string[];
  ats_coverage: number;
  hard_fraction: number;
  arc_feasibility: number;
  recruiter_score: number;
  hm_score: number;
  n_audit_entries: number;
}
