/**
 * Portable cognitive pipeline runner — no database deps.
 *
 * Runs the full cognitive workbench with all specialists but without
 * PostgreSQL persistence or an MLClient. Designed for:
 *   - eval harness --live mode
 *   - unit/integration tests
 *   - local dev runs without the ML server
 *
 * For the production path (with persistence + ML), use
 * apps/api/src/runtime/workbench-runtime.ts.
 */

import { randomUUID } from "node:crypto";
import type { Blackboard } from "@retune/types";
import { BoilerplateStripper } from "./comprehension";
import { CompanySchemaRetriever } from "./comprehension";
import { CredibilityScanner } from "./comprehension";
import { HonestyCalibrator } from "./comprehension";
import { TitleSchemaRetriever } from "./comprehension";
import { VoiceFingerprintExtractor } from "./comprehension";
import { StubDiscourseClassifier } from "./comprehension/discourse";
import { StubJdSpanExtractor } from "./comprehension/spans";
import { OntologyResolver } from "./memory";
import { ActiveQuestionHandler } from "./specialists/active-question-handler";
import { ApplicationStrategyComposer } from "./specialists/application-strategy-composer";
import { AtsPatchLoop } from "./specialists/ats-patch-loop";
import { SequentialBulletComposer } from "./specialists/bullet-composer";
import { CoverLetterComposer } from "./specialists/cover-letter-composer";
import { CriticEnsemble } from "./specialists/critic-ensemble";
import { DocumentRenderer } from "./specialists/document-renderer";
import { EmotionalStateModeler } from "./specialists/emotional-state-modeler";
import { EvidenceSolver } from "./specialists/evidence-solver";
import { FairnessMonitor } from "./specialists/fairness-monitor";
import { GapMapper } from "./specialists/gap-mapper";
import { MoodFingerprintSpecialist } from "./specialists/mood-fingerprint";
import { MotivationModulator } from "./specialists/motivation-modulator";
import { NarrativeArcProposer } from "./specialists/narrative-arc-proposer";
import { Narrator } from "./specialists/narrator";
import { OutcomePredictor } from "./specialists/outcome-predictor";
import { RefuseOrShipGate } from "./specialists/refuse-or-ship-gate";
import { SpecialistRegistry } from "./specialists/registry";
import { TheoryOfMindSpecialist } from "./specialists/theory-of-mind";
import { VoiceDriftMonitor } from "./specialists/voice-drift-monitor";
import { WellBeingMonitor } from "./specialists/well-being-monitor";
import { AttentionScheduler } from "./workbench/attention-scheduler";
import { AuditTrail } from "./workbench/audit-trail";
import { BlackboardStore } from "./workbench/blackboard";
import { BudgetController } from "./workbench/budget-controller";
import { ConflictStagingQueue } from "./workbench/conflict-staging";
import { GoalStack } from "./workbench/goal-stack";
import { Orchestrator } from "./workbench/orchestrator";
import type { TraceBus } from "./workbench/trace-bus";
import { TriggerBus } from "./workbench/trigger-bus";
import type { Specialist } from "./workbench/types";

export interface CognitiveRunInput {
  jd_title?: string;
  company?: string;
  market?: "US" | "UK";
  jd_text?: string;
  profile_text?: string;
}

function empty_blackboard(
  generation_id: string,
  user_id: string,
  jd_id: string,
  market: "US" | "UK" = "US",
): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id,
    user_id,
    jd_id,
    market,
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
      ceiling_usd: 0.2,
      hard_kill_usd: 0.5,
      per_specialist_spent: {},
    },
    audit_trail: [],
    created_at: now,
    updated_at: now,
  };
}

/**
 * Run the cognitive pipeline without persistence.
 * Results are communicated entirely via the TraceBus.
 */
export async function run_cognitive_pipeline(input: {
  generation_id: string;
  payload: CognitiveRunInput;
  bus: TraceBus;
  external_signal?: AbortSignal;
}): Promise<void> {
  const { generation_id, payload, bus, external_signal } = input;

  const user_id = randomUUID();
  const jd_id = randomUUID();

  const trigger_bus = new TriggerBus();
  const blackboard = new BlackboardStore(
    empty_blackboard(generation_id, user_id, jd_id, payload.market),
    trigger_bus,
  );
  const goals = new GoalStack();
  const resolver = new OntologyResolver();
  const registry = new SpecialistRegistry();

  const specialists: Specialist[] = [
    new TitleSchemaRetriever(resolver),
    new CompanySchemaRetriever(resolver),
    new ActiveQuestionHandler({ record: async () => {} }),
    new StubJdSpanExtractor(),
    new StubDiscourseClassifier(),
    new VoiceFingerprintExtractor(null),
    new HonestyCalibrator(null),
    new CredibilityScanner(),
    new BoilerplateStripper(),
    new GapMapper(),
    new EvidenceSolver(),
    new EmotionalStateModeler(),
    new MoodFingerprintSpecialist(),
    new MotivationModulator(),
    new NarrativeArcProposer(),
    new SequentialBulletComposer(),
    new CoverLetterComposer(),
    new AtsPatchLoop(),
    new ApplicationStrategyComposer(),
    new TheoryOfMindSpecialist(),
    new CriticEnsemble(),
    new OutcomePredictor(),
    new RefuseOrShipGate(),
    new DocumentRenderer(),
    new Narrator(),
  ];
  registry.register_all(specialists);

  const conflict_staging = new ConflictStagingQueue();

  trigger_bus.subscribe(
    new FairnessMonitor(
      (concern) => {
        bus.publish({
          kind: "trace",
          event: {
            seq: -1,
            timestamp: new Date().toISOString(),
            specialist: "fairness_monitor",
            brain_region: "right_vlpfc",
            micro_stage: "fairness_concern",
            justification: `${concern.conflict.severity} ${concern.conflict.payload.category as string}: ${concern.matched_text} @ ${concern.matched_path}`,
            cost_usd: 0,
            latency_ms: 0,
            writes_count: 0,
            conflicts_count: 1,
          },
        });
      },
      "**",
      conflict_staging,
    ),
  );

  const voice_drift = new VoiceDriftMonitor({ staging_queue: conflict_staging });
  trigger_bus.subscribe(voice_drift);
  trigger_bus.subscribe({
    id: "voice_baseline_setter",
    path_glob: "hypotheses.voice_fingerprint",
    listener_kind: "monitor",
    on_event: (ev) => {
      if (ev.type === "write" && Array.isArray(ev.after)) {
        voice_drift.set_baseline(ev.after as number[]);
      }
    },
  });
  trigger_bus.subscribe(new WellBeingMonitor({ staging_queue: conflict_staging }));

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.2,
      hard_kill_usd: 0.5,
      per_specialist_spent: {},
    }),
    persistence: undefined,
    conflict_staging,
  });

  const { seed_initial_goals } = await import("./workbench/seed-goals");
  seed_initial_goals(goals, payload);

  try {
    const result = await orchestrator.run({
      external_signal,
      on_trace: (event) => bus.publish({ kind: "trace", event }),
    });
    bus.publish({
      kind: "done",
      summary: {
        termination: result.termination,
        ticks_executed: result.ticks_executed,
        total_cost_usd: result.total_cost_usd,
        total_latency_ms: result.total_latency_ms,
      },
    });
  } catch (err) {
    bus.publish({
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
