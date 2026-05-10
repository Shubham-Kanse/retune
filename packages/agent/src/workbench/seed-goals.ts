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
}

export function seed_initial_goals(goals: GoalStack, payload: SeedGoalsPayload): void {
  // ── Comprehension layer (priority 70–80) ──────────────────────────────────
  // These run first and populate the blackboard with role/company schema,
  // evidence spans, discourse map, voice fingerprint, and honesty calibration.

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
    goals.add({
      kind: "infer_emotional_state",
      priority: 52,
      emitted_by: "api",
      payload: {},
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
  goals.add({
    kind: "decide_refuse_or_ship",
    priority: 10,
    emitted_by: "api",
    payload: {},
  });
}
