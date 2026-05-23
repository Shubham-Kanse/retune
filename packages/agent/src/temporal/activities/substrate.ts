/**
 * Shared substrate builder used by runGeneration + resumeGeneration.
 *
 * Keeps the activity layer thin — all the cognitive-substrate wiring
 * concentrates here so workflow tests exercise the exact same code path
 * as production.
 *
 * @brain DLPFC wiring: substrate assembly
 */

import type { PgDb } from "@retune/db/pg";
import type { Blackboard } from "@retune/types";
import {
  BoilerplateStripper,
  CompanySchemaRetriever,
  CredibilityScanner,
  CulturalCalibrator,
  DiscourseClassifier,
  type ExtractedSpansSink,
  type HonestyCalibrationStore,
  HonestyCalibrator,
  JdSpanExtractor,
  TitleSchemaRetriever,
  VoiceFingerprintExtractor,
  type VoiceFingerprintSink,
} from "../../comprehension";
import { OntologyResolver } from "../../memory";
import type { MLClient } from "../../ml-client";
import {
  type PostgresPersistence,
  type RehydratedSubstrate,
  rehydrate_substrate,
} from "../../persistence";
import { ActiveQuestionHandler } from "../../specialists/active-question-handler";
import { SequentialBulletComposer } from "../../specialists/bullet-composer";
import { CriticEnsemble } from "../../specialists/critic-ensemble";
import { DocumentRenderer } from "../../specialists/document-renderer";
import { EmotionalStateModeler } from "../../specialists/emotional-state-modeler";
import { EvidenceSolver } from "../../specialists/evidence-solver";
import { FairnessMonitor } from "../../specialists/fairness-monitor";
import { GapMapper } from "../../specialists/gap-mapper";
import { NarrativeArcProposer } from "../../specialists/narrative-arc-proposer";
import { OutcomePredictor } from "../../specialists/outcome-predictor";
import { RefuseOrShipGate } from "../../specialists/refuse-or-ship-gate";
import { SpecialistRegistry } from "../../specialists/registry";
import { TheoryOfMindSpecialist } from "../../specialists/theory-of-mind";
import { VoiceDriftMonitor } from "../../specialists/voice-drift-monitor";
import { WellBeingMonitor } from "../../specialists/well-being-monitor";
import { AttentionScheduler } from "../../workbench/attention-scheduler";
import { AuditTrail } from "../../workbench/audit-trail";
import { BlackboardStore } from "../../workbench/blackboard";
import { BudgetController } from "../../workbench/budget-controller";
import { ConflictStagingQueue } from "../../workbench/conflict-staging";
import { GoalStack } from "../../workbench/goal-stack";
import { Orchestrator } from "../../workbench/orchestrator";
import { TriggerBus } from "../../workbench/trigger-bus";
import type { Specialist } from "../../workbench/types";

export interface SubstrateDeps {
  db: PgDb;
  persistence: PostgresPersistence;
  /**
   * Optional ML client. When provided, the JdSpanExtractor specialist
   * is registered. When omitted, span-extracting goals are abandoned
   * (the orchestrator emits a "no specialist" termination), which is
   * acceptable for in-memory dev runs.
   */
  ml_client?: MLClient;
  /**
   * Optional sink for extracted spans. Defaults to one that writes to
   * `evidence_spans` via `persistence.record_extracted_spans`. Tests
   * can pass an in-memory sink to assert on writes.
   */
  spans_sink?: ExtractedSpansSink;
}

function build_blackboard(input: {
  generation_id: string;
  user_id: string;
  jd_id: string;
  market?: "US" | "UK";
}): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id: input.generation_id,
    user_id: input.user_id,
    jd_id: input.jd_id,
    market: input.market ?? "US",
    ontology_version: "0.0.1",
    goals: [],
    hypotheses: {
      role_schema: null,
      company_schema: null,
      discourse_map: null,
      hidden_disqualifiers: null,
      desperation_index: null,
      cultural_vector: null,
      candidate_credibility_prior: null,
      voice_fingerprint: null,
      honesty_calibration: null,
      narrative_arcs_candidates: [],
      chosen_narrative_arc: null,
    },
    evidence_graph: { span_ids: [], requirement_matches: [] },
    draft: { sections: {}, bullets: {}, claims: {}, pending_revisions: [] },
    conflicts: [],
    outcome_estimate: null,
    blocking_factors: [],
    cost_budget: {
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    },
    audit_trail: [],
    created_at: now,
    updated_at: now,
  };
}

function build_registry(deps: SubstrateDeps): SpecialistRegistry {
  const { persistence } = deps;
  const resolver = new OntologyResolver();
  const registry = new SpecialistRegistry();
  const specialists: Specialist[] = [
    new TitleSchemaRetriever(resolver),
    new CompanySchemaRetriever(resolver),
    new ActiveQuestionHandler({
      record: async (inp) => persistence.record_active_question(inp),
    }),
  ];
  if (deps.ml_client) {
    const sink: ExtractedSpansSink =
      deps.spans_sink ??
      ({
        record: async (inp) => persistence.record_extracted_spans(inp),
      } satisfies ExtractedSpansSink);
    specialists.push(new JdSpanExtractor(deps.ml_client, sink));
    specialists.push(new DiscourseClassifier(deps.ml_client));
    specialists.push(new BoilerplateStripper());
    specialists.push(new CulturalCalibrator(deps.ml_client));
  }
  // Pure-cognition specialists added in commit #8 — always registered.
  const voice_sink: VoiceFingerprintSink = {
    record: async (inp) => persistence.record_voice_fingerprint(inp),
  };
  specialists.push(new VoiceFingerprintExtractor(voice_sink));
  const honesty_store: HonestyCalibrationStore = {
    load: async (uid) => {
      const cals = await persistence.load_honesty_calibrations(uid);
      const out: Record<string, { verified: number; unverified: number }> = {};
      for (const [kind, c] of Object.entries(cals)) {
        const verified = Math.round(c.trust_factor * c.sample_size);
        out[kind] = { verified, unverified: c.sample_size - verified };
      }
      return out;
    },
    record: async (inp) => persistence.record_honesty_calibration(inp),
  };
  specialists.push(new HonestyCalibrator(honesty_store));
  specialists.push(new CredibilityScanner());
  // Strategy specialists (commit #9) — deterministic, no deps.
  specialists.push(new GapMapper());
  specialists.push(new EvidenceSolver());
  specialists.push(new EmotionalStateModeler());
  // Production specialists (commit #10) — LLM-driven.
  specialists.push(new NarrativeArcProposer());
  specialists.push(new SequentialBulletComposer());
  // Critic ensemble (commit #11) — theory-of-mind trio.
  specialists.push(new CriticEnsemble());
  // Outcome predictor (commit #12) — conformal prediction.
  specialists.push(new OutcomePredictor());
  // Refuse-or-ship gate (commit #13) — meta-cognitive supervisor + GDPR disclosure.
  specialists.push(new RefuseOrShipGate());
  // Document renderer — marks render_documents goal satisfied so the orchestrator
  // can terminate cleanly; actual DOCX/PDF generation happens in apps/web.
  specialists.push(new DocumentRenderer());
  // Theory of mind (commit #14) — recruiter belief state modeler.
  specialists.push(new TheoryOfMindSpecialist());
  registry.register_all(specialists);
  return registry;
}

/**
 * Substrate wired fresh — for `runGeneration` (tick 0).
 */
export function build_fresh_substrate(input: {
  deps: SubstrateDeps;
  generation_id: string;
  user_id: string;
  jd_id: string;
  market?: "US" | "UK";
}): {
  orchestrator: Orchestrator;
  goal_stack: GoalStack;
  blackboard: BlackboardStore;
} {
  const bus = new TriggerBus();

  // Shared staging queue (technical-2.0 §9). All three listeners push
  // detected concerns here; the orchestrator drains them at the top of
  // every tick.
  const conflict_staging = new ConflictStagingQueue();

  // FairnessMonitor: trigger-bus listener watching all user-facing
  // language paths. In Temporal mode we don't have a TraceBus in scope,
  // so the default no-op handler is used; concerns are still recorded
  // in the monitor's in-memory buffer AND staged into the conflicts queue.
  bus.subscribe(new FairnessMonitor(() => {}, "**", conflict_staging));
  // VoiceDriftMonitor: watches draft.bullets.* writes for stylometric
  // divergence from the candidate's voice fingerprint. Baseline is set
  // lazily once VoiceFingerprintExtractor has run.
  const voice_drift = new VoiceDriftMonitor({ staging_queue: conflict_staging });
  bus.subscribe(voice_drift);
  bus.subscribe({
    id: "voice_baseline_setter",
    path_glob: "hypotheses.voice_fingerprint",
    listener_kind: "monitor",
    on_event: (ev) => {
      if (ev.type === "write" && Array.isArray(ev.after)) {
        voice_drift.set_baseline(ev.after as number[]);
      }
    },
  });
  // WellBeingMonitor: detects candidate distress signals.
  bus.subscribe(new WellBeingMonitor({ staging_queue: conflict_staging }));
  const blackboard = new BlackboardStore(
    build_blackboard({
      generation_id: input.generation_id,
      user_id: input.user_id,
      jd_id: input.jd_id,
      market: input.market,
    }),
    bus,
  );
  const goal_stack = new GoalStack();
  const registry = build_registry(input.deps);
  const scheduler = new AttentionScheduler();
  const audit = new AuditTrail();
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.05,
    hard_kill_usd: 0.2,
    per_specialist_spent: {},
  });
  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry,
    scheduler,
    audit_trail: audit,
    budget,
    persistence: input.deps.persistence,
    conflict_staging,
    // Charter 08-Data-Integrity Epic 02 — wire extended_persistence so
    // GDPR packets and conflicts persist in Temporal mode (production
    // target). Without this, gdpr_packets writes are silently dropped
    // on the Temporal path. Mirrors the wiring in
    // `apps/api/src/runtime/workbench-runtime.ts`.
    extended_persistence: {
      record_gdpr_packet: (inp) => input.deps.persistence.record_gdpr_packet(inp),
      record_conflict: (inp) => input.deps.persistence.record_conflict(inp),
      record_model_calls: (inp) => input.deps.persistence.record_model_calls(inp),
    },
  });
  return { orchestrator, goal_stack, blackboard };
}

/**
 * Substrate rehydrated from persisted state — for `resumeGeneration`.
 */
export async function build_resumed_substrate(input: {
  deps: SubstrateDeps;
  generation_id: string;
}): Promise<RehydratedSubstrate | null> {
  const replayed = await input.deps.persistence.load(input.generation_id);
  if (!replayed) return null;
  const registry = build_registry(input.deps);
  return rehydrate_substrate({
    replayed,
    registry,
    scheduler: new AttentionScheduler(),
    persistence: input.deps.persistence,
    // Charter 08-Data-Integrity Epic 02 — preserve extended persistence
    // wiring across rehydration so a resumed generation also writes
    // GDPR packets + conflicts to durable storage.
    extended_persistence: {
      record_gdpr_packet: (inp) => input.deps.persistence.record_gdpr_packet(inp),
      record_conflict: (inp) => input.deps.persistence.record_conflict(inp),
      record_model_calls: (inp) => input.deps.persistence.record_model_calls(inp),
    },
  });
}
