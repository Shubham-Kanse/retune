/**
 * Specialist registration parity (technical-2.0 §15.7, §20 Phase 2).
 *
 * Two static safety nets:
 *
 *   1. Every cognitive specialist that ships in `@retune/agent` (i.e. is
 *      part of the v2.0 baseline 14-specialist set) has a unique
 *      `handles_goal_kinds` set — no two specialists handle the same goal
 *      kind. This is the fix for issue #3 (TheoryOfMindSpecialist + CriticEnsemble
 *      both handling `select_arc` in v1.0).
 *
 *   2. The 14 v2.0 cognitive specialists each appear at least once in the
 *      enumerated baseline registry. The Temporal substrate (`build_registry`
 *      in `temporal/activities/substrate.ts`) and the API runtime
 *      (`apps/api/src/runtime/workbench-runtime.ts`) both register this same
 *      set; this test ensures the source of truth (the specialist class set
 *      itself) matches the §6 catalogue.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { OntologyResolver } from "../src/memory";
import type { MLClient } from "../src/ml-client";
import {
  ActiveQuestionHandler,
  BoilerplateStripper,
  CompanySchemaRetriever,
  CredibilityScanner,
  CriticEnsemble,
  CulturalCalibrator,
  DiscourseClassifier,
  EvidenceSolver,
  type ExtractedSpansSink,
  GapMapper,
  HonestyCalibrator,
  JdSpanExtractor,
  NarrativeArcProposer,
  OutcomePredictor,
  RefuseOrShipGate,
  SequentialBulletComposer,
  type Specialist,
  TheoryOfMindSpecialist,
  TitleSchemaRetriever,
  VoiceFingerprintExtractor,
} from "../src/sota-exports";
import { SpecialistRegistry } from "../src/specialists/registry";

// Build a registry that mirrors the API runtime + Temporal substrate.
// Stub out external dependencies — we do not run the specialists here,
// only inspect their static metadata.
function buildBaselineRegistry(): SpecialistRegistry {
  const reg = new SpecialistRegistry();
  const resolver = new OntologyResolver();
  const stub_ml: MLClient = {} as unknown as MLClient;
  const stub_sink: ExtractedSpansSink = {
    record: async () => [],
  };

  const specialists: Specialist[] = [
    // Comprehension
    new TitleSchemaRetriever(resolver),
    new CompanySchemaRetriever(resolver),
    new JdSpanExtractor(stub_ml, stub_sink),
    new DiscourseClassifier(stub_ml),
    new BoilerplateStripper(),
    new CulturalCalibrator(stub_ml),
    // Reflection
    new VoiceFingerprintExtractor(null),
    new HonestyCalibrator(null),
    new CredibilityScanner(),
    // Strategy
    new GapMapper(),
    new EvidenceSolver(),
    // Production
    new NarrativeArcProposer(),
    new SequentialBulletComposer(),
    // Critique
    new TheoryOfMindSpecialist(),
    new CriticEnsemble(),
    // Decision
    new OutcomePredictor(),
    new RefuseOrShipGate(),
    // Auxiliary
    new ActiveQuestionHandler({
      record: async () => undefined,
    }),
  ];
  reg.register_all(specialists);
  return reg;
}

test("no two specialists handle the same goal kind", () => {
  const reg = buildBaselineRegistry();
  const goal_kind_to_specialists = new Map<string, string[]>();

  for (const sp of reg.list()) {
    for (const kind of sp.handles_goal_kinds) {
      const existing = goal_kind_to_specialists.get(kind) ?? [];
      existing.push(sp.id);
      goal_kind_to_specialists.set(kind, existing);
    }
  }

  for (const [kind, owners] of goal_kind_to_specialists) {
    // `predict_outcome` and `estimate_outcome` are both handled by
    // OutcomePredictor (single-specialist multi-kind for v1.0/v2.0
    // migration); that's fine. What we forbid is *multiple specialists*
    // claiming the same kind.
    assert.equal(
      owners.length,
      1,
      `Goal kind "${kind}" is handled by multiple specialists: ${owners.join(", ")}`,
    );
  }
});

test("baseline cognitive specialists are all registered", () => {
  const reg = buildBaselineRegistry();
  const expected = [
    // Comprehension (6)
    "title_schema_retriever",
    "company_schema_retriever",
    "jd_span_extractor",
    "discourse_classifier",
    "boilerplate_stripper",
    "cultural_calibrator",
    // Reflection (3)
    "voice_fingerprint_extractor",
    "honesty_calibrator",
    "credibility_scanner",
    // Strategy (2)
    "gap_mapper",
    "evidence_solver",
    // Production (2)
    "narrative_arc_proposer",
    "sequential_bullet_composer",
    // Critique (2)
    "theory_of_mind",
    "critic_ensemble",
    // Decision (2)
    "outcome_predictor",
    "refuse_or_ship_gate",
    // Auxiliary
    "active_question_handler",
  ];

  const got = reg
    .list()
    .map((s) => s.id)
    .sort();
  for (const id of expected) {
    assert.ok(got.includes(id), `expected specialist "${id}" in registry, got: ${got.join(", ")}`);
  }
});

test("TheoryOfMindSpecialist owns model_recruiter_beliefs (v2.0 fix for issue #3)", () => {
  const tom = new TheoryOfMindSpecialist();
  assert.deepEqual([...tom.handles_goal_kinds], ["model_recruiter_beliefs"]);
});

test("CriticEnsemble owns select_arc (no longer collides with TheoryOfMindSpecialist)", () => {
  const ce = new CriticEnsemble();
  assert.deepEqual([...ce.handles_goal_kinds], ["select_arc"]);
});

test("OutcomePredictor accepts both v1.0 predict_outcome and v2.0 estimate_outcome", () => {
  const op = new OutcomePredictor();
  assert.ok(op.handles_goal_kinds.includes("estimate_outcome"));
  assert.ok(op.handles_goal_kinds.includes("predict_outcome"));
});
