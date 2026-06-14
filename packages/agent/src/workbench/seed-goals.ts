/**
 * seed_initial_goals — shared goal seeding for the cognitive cycle.
 *
 * Called by both `workbench-runtime.ts` (in-process path) and
 * `temporal/activities/make-activities.ts` (Temporal path) to ensure
 * the two paths seed identical entry-point goals.
 *
 * §2.2: extracting this prevents drift between the API runtime and the
 * Temporal substrate that would cause `specialist-registration-parity.test.ts`
 * to fail.
 */

import type { GoalStack } from "../workbench/goal-stack";

export interface SeedGoalsPayload {
  jd_title?: string;
  company?: string;
  jd_text?: string;
  profile_text?: string;
  /** Full CareerProfileV1 JSON (003 §6.2). */
  career_profile?: unknown;
  /** Derived CareerUnderstandingV1 JSON (004 §11.4). */
  career_understanding?: unknown;
}

export function seed_initial_goals(goals: GoalStack, payload: SeedGoalsPayload): void {
  // ── Comprehension layer (priority 70–80) ──────────────────────────────────
  // These run first and populate the blackboard with role/company schema,
  // evidence spans, discourse map, voice fingerprint, and honesty calibration.

  // 003 §6.2 — hydrate the SOTA candidate memory FIRST so production
  // specialists declaring `requires: ["sota.candidate_model"]` can run.
  // Seeded at priority 90 so it always runs before extract_voice_fingerprint
  // and the strategy chain.
  if (payload.profile_text || payload.career_profile) {
    goals.add({
      kind: "hydrate_candidate_memory",
      priority: 90,
      emitted_by: "api",
      semantic_key: "hydrate_candidate_memory:sota",
      payload: {
        career_profile: payload.career_profile,
        profile_text: payload.profile_text,
        // 004 §11.4 — pass derived understanding alongside facts so future
        // strategy specialists can use it without re-running interpretation.
        career_understanding: payload.career_understanding,
      },
    });
    // Lock the ledger right after hydration but before drafting starts.
    goals.add({
      kind: "build_candidate_model",
      priority: 88,
      emitted_by: "api",
      semantic_key: "build_candidate_model:sota_lock",
      requires: ["sota.claim_ledger"],
      payload: {},
    });
    // Plan proof-gap questions once we have both the candidate model
    // and (optionally) the job model. The interviewer skips gracefully
    // if either is missing.
    goals.add({
      kind: "plan_proof_questions",
      priority: 65,
      emitted_by: "api",
      semantic_key: "plan_proof_questions:sota",
      requires: ["sota.claim_ledger"],
      payload: {},
    });
    // Tournament runs after the ledger is locked.
    goals.add({
      kind: "generate_draft_variants",
      priority: 22,
      emitted_by: "api",
      semantic_key: "generate_draft_variants:sota",
      requires: ["sota.claim_ledger"],
      payload: {},
    });
  }

  if (payload.jd_title) {
    goals.add({
      kind: "analyze_jd",
      priority: 80,
      emitted_by: "api",
      payload: { jd_title: payload.jd_title },
    });
  }
  if (payload.company) {
    goals.add({
      kind: "analyze_company",
      priority: 80,
      emitted_by: "api",
      payload: { company: payload.company },
    });
  }
  if (payload.jd_text && payload.jd_text.length >= 50) {
    goals.add({
      kind: "extract_spans",
      priority: 75,
      emitted_by: "api",
      payload: {
        text: payload.jd_text,
        source_doc_kind: "rendered_document",
        span_kinds: [],
        profile_text: payload.profile_text ?? "",
      },
    });
    // Discourse classification runs in parallel with span extraction.
    // DiscourseClassifier (or StubDiscourseClassifier) writes discourse_map
    // and emits strip_discourse_boilerplate + calibrate_cultural_vector.
    goals.add({
      kind: "classify_discourse",
      priority: 74,
      emitted_by: "api",
      payload: { jd_text: payload.jd_text },
    });
    // 003 §6.3 — SOTA job model build (deterministic, runs in parallel
    // with the legacy comprehension layer).
    goals.add({
      kind: "build_job_model",
      priority: 70,
      emitted_by: "api",
      semantic_key: "build_job_model:sota",
      payload: {
        jd_text: payload.jd_text,
        jd_title: payload.jd_title,
      },
    });
  }
  if (payload.company) {
    // 003 §6.3 — SOTA company context research. We don't grant web
    // search consent here by default — that's a per-request flag set
    // by the API layer when the user opts in.
    goals.add({
      kind: "research_company_context",
      priority: 68,
      emitted_by: "api",
      semantic_key: `research_company_context:${payload.company.toLowerCase()}`,
      payload: {
        display_name: payload.company,
        consent_web_research: false,
      },
    });
  }
  if (payload.profile_text) {
    if (payload.profile_text.length >= 50) {
      goals.add({
        kind: "extract_spans",
        priority: 75,
        emitted_by: "api",
        payload: {
          text: payload.profile_text,
          source_doc_kind: "profile",
          span_kinds: [],
        },
      });
    }
    goals.add({
      kind: "extract_voice_fingerprint",
      priority: 60,
      emitted_by: "api",
      payload: { profile_texts: [payload.profile_text] },
    });
  }
  // Honesty calibration always runs — cheap, no ML calls.
  goals.add({
    kind: "calibrate_honesty",
    priority: 55,
    emitted_by: "api",
    payload: {},
  });

  // ── Production chain (priority 40–10) ────────────────────────────────────
  // Seeded at lower priority so comprehension goals run first. The
  // AttentionScheduler picks the highest-priority pending goal each tick,
  // so these only fire once the blackboard has the evidence they need.
  //
  // Chain: map_gaps → solve_evidence → propose_arcs → select_arc
  //        → compose_resume → render_documents → decide_refuse_or_ship

  goals.add({
    kind: "map_gaps",
    priority: 40,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "solve_evidence",
    priority: 35,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "propose_arcs",
    priority: 30,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "select_arc",
    priority: 25,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "compose_resume",
    priority: 20,
    emitted_by: "api",
    payload: {},
  });
  // Post-composition: cover letter, ATS patch, strategy all run at the same
  // priority so the attention scheduler can interleave them. All three run
  // after compose_resume (priority 20) and before render_documents (priority 15).
  goals.add({
    kind: "compose_cover_letter",
    priority: 18,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "patch_ats",
    priority: 18,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "compose_strategy",
    priority: 18,
    emitted_by: "api",
    payload: {},
  });
  goals.add({
    kind: "render_documents",
    priority: 15,
    emitted_by: "api",
    payload: {},
  });
  // 003 §6.8 — verify render integrity right after rendering. The
  // ApplicationPackageRenderer specialist handles both kinds; seeding
  // both means parseability is checked even if the legacy
  // DocumentRenderer claims the render_documents slot first.
  goals.add({
    kind: "verify_render_integrity",
    priority: 14,
    emitted_by: "api",
    semantic_key: "verify_render_integrity:sota",
    requires: ["sota.claim_ledger"],
    payload: {},
  });
  goals.add({
    kind: "decide_refuse_or_ship",
    priority: 10,
    emitted_by: "api",
    payload: {},
  });
}
