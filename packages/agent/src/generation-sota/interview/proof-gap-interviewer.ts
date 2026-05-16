/**
 * ProofGapInterviewer (003 §6.4 Phase D).
 *
 * Asks the user only questions whose answers will change the
 * ship/revise/refuse decision. Decision algorithm:
 *
 *   1. For every hard JD requirement (job_model.requirements with
 *      criticality=hard_filter or must_have AND is_hard_filter=true),
 *      check whether the claim ledger already contains a claim that
 *      provably covers it. Coverage uses normalised-text overlap so
 *      "production Kubernetes ownership" matches a "kubernetes" skill
 *      claim with at-least-moderate defensibility.
 *
 *   2. If a hard requirement is uncovered AND no equivalent question
 *      is already in the question_plan, generate a sharp question.
 *
 *   3. Stop when budget_remaining hits zero.
 *
 * The output is a `QuestionPlan` written to `sota.question_plan` and a
 * `request_user_input` goal per drafted question. The Temporal workflow
 * already knows how to suspend on `request_user_input` (see §6.4 of
 * the spec) so the system pauses for the user's reply.
 */

import { randomUUID } from "node:crypto";
import {
  type ClaimLedger,
  ClaimLedgerSchema,
  type Goal,
  type GoalKind,
  type JobModel,
  JobModelSchema,
  type ProofQuestion,
  type QuestionPlan,
  QuestionPlanSchema,
} from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["plan_proof_questions"];

const DEFAULT_MAX_QUESTIONS = 3;

/** Minimum EV-of-information to merit asking. */
const EVOI_FLOOR = 0.4;

export class ProofGapInterviewer implements Specialist {
  readonly id = "proof_gap_interviewer";
  readonly display_name = "Proof Gap Interviewer";
  readonly brain_region = "dlpfc_acc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 20;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const sotaRaw = (ctx.blackboard as unknown as { sota?: { job_model?: unknown; claim_ledger?: unknown; question_plan?: unknown } }).sota ?? {};

    const jmParsed = JobModelSchema.safeParse(sotaRaw.job_model);
    const clParsed = ClaimLedgerSchema.safeParse(sotaRaw.claim_ledger);

    if (!jmParsed.success || !clParsed.success) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "missing_inputs",
          inputs_hash: AuditTrail.hash({ has_job_model: jmParsed.success, has_ledger: clParsed.success }),
          output_hash: AuditTrail.hash({ status: "skipped" }),
          justification: "missing job_model or claim_ledger — no questions planned",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const jobModel: JobModel = jmParsed.data;
    const ledger: ClaimLedger = clParsed.data;
    const existingPlan = QuestionPlanSchema.safeParse(sotaRaw.question_plan);
    const maxQuestions =
      typeof goal.payload?.max_questions === "number"
        ? Math.max(0, Math.min(10, goal.payload.max_questions))
        : DEFAULT_MAX_QUESTIONS;

    const previous: ProofQuestion[] = existingPlan.success ? existingPlan.data.questions : [];
    const previousNormalized = new Set(previous.map((q) => q.question_text.toLowerCase().slice(0, 80)));
    const askedCount = previous.filter((q) => q.status === "asked" || q.status === "answered").length;
    let budget_remaining = Math.max(0, maxQuestions - askedCount);

    const new_questions: ProofQuestion[] = [];
    const new_goals: Goal[] = [];

    for (const req of jobModel.requirements) {
      if (budget_remaining <= 0) break;
      if (!req.is_hard_filter && req.criticality !== "must_have") continue;

      const covered = isRequirementCovered(req.normalized, ledger);
      if (covered) continue;

      const evoi = scoreEvoi(req, ledger);
      if (evoi < EVOI_FLOOR) continue;

      const question_text = formulateQuestion(req);
      const norm = question_text.toLowerCase().slice(0, 80);
      if (previousNormalized.has(norm)) continue;

      const q: ProofQuestion = {
        id: randomUUID(),
        question_text,
        target_path: "sota.claim_ledger",
        links: [req.id],
        expected_value: evoi,
        cost: 0.34,
        status: "draft",
        asked_at: null,
        answered_at: null,
        answer_text: null,
      };
      new_questions.push(q);
      previousNormalized.add(norm);
      budget_remaining--;

      // Push a `request_user_input` goal — the existing
      // ActiveQuestionHandler already knows how to surface it via
      // active_questions table + Temporal signal flow.
      new_goals.push({
        id: randomUUID(),
        kind: "request_user_input",
        priority: 95,
        emitted_by: this.id,
        payload: {
          question: question_text,
          target_field: "sota.claim_ledger",
          source: "proof_gap_interviewer",
          requirement_id: req.id,
          expected_value: evoi,
        },
        status: "pending",
        satisfied_by: [],
        parent_goal_id: goal.id,
        semantic_key: `request_user_input:proof_gap:${req.id}`,
        max_attempts: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const plan: QuestionPlan = {
      schema_version: "sota-v3",
      generation_id: ctx.blackboard.generation_id,
      budget_remaining,
      questions: [...previous, ...new_questions],
    };

    const writes = [{ path: "sota.question_plan", value: QuestionPlanSchema.parse(plan) }];

    return {
      writes,
      new_goals: new_goals.length > 0 ? new_goals : undefined,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "plan_questions",
        inputs_hash: AuditTrail.hash({ n_reqs: jobModel.requirements.length, n_claims: ledger.claims.length }),
        output_hash: AuditTrail.hash({ n_new_questions: new_questions.length, budget_remaining }),
        justification: `planned ${new_questions.length} new question(s); ${budget_remaining} of ${maxQuestions} budget remaining`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["sota.question_plan"],
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage / EVOI heuristics
// ─────────────────────────────────────────────────────────────────────────────

function isRequirementCovered(reqNormalized: string, ledger: ClaimLedger): boolean {
  if (reqNormalized.length === 0) return false;
  const reqTokens = new Set(reqNormalized.split(/\s+/).filter((t) => t.length >= 3));
  if (reqTokens.size === 0) return false;
  for (const c of ledger.claims) {
    if (c.defensibility === "weak" || c.defensibility === "unsafe") continue;
    const text = c.normalized_text;
    let hits = 0;
    for (const t of reqTokens) {
      if (text.includes(t)) hits++;
    }
    if (hits / reqTokens.size >= 0.6) return true;
  }
  return false;
}

function scoreEvoi(req: import("@retune/types").Requirement, ledger: ClaimLedger): number {
  // Higher when the requirement is hard, the years_min is high, and the
  // ledger has zero direct candidates.
  let evoi = 0.5;
  if (req.is_hard_filter) evoi += 0.3;
  if (req.years_min !== null) evoi += 0.1;
  // Penalise when there's at least a weak-defensibility claim that
  // partially overlaps — the question would just feel redundant.
  for (const c of ledger.claims) {
    if (c.normalized_text.includes(req.normalized.split(" ").slice(0, 2).join(" "))) {
      evoi -= 0.2;
      break;
    }
  }
  return Math.max(0, Math.min(1, evoi));
}

function formulateQuestion(req: import("@retune/types").Requirement): string {
  const role = req.text.replace(/^[•·\-\*\d\.\s]+/, "").trim();
  const yearsHint = req.years_min ? ` (the JD asks for ${req.years_min}+ years)` : "";
  return `Have you owned production work that you could defend in interview against this requirement: "${role}"?${yearsHint} A short concrete example, including measurable outcome if possible.`;
}
