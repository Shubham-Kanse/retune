/**
 * In-memory workbench runtime.
 *
 * Wires the cognitive substrate into a single function callable from the
 * /generate route. Spawns a fresh Orchestrator per request, streams
 * trace events into the per-generation TraceBus, and tears down when
 * the cycle completes.
 *
 * Durable, Temporal-backed workflow lands in commit #3.
 */

import { randomUUID } from "node:crypto";
import {
  ActiveQuestionHandler,
  ApplicationStrategyComposer,
  AtsPatchLoop,
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BoilerplateStripper,
  BudgetController,
  CompanySchemaRetriever,
  ConflictStagingQueue,
  CoverLetterComposer,
  CredibilityScanner,
  CriticEnsemble,
  CulturalCalibrator,
  DiscourseClassifier,
  DocumentRenderer,
  EmotionalStateModeler,
  EvidenceSolver,
  type ExtractedSpansSink,
  FairnessMonitor,
  GapMapper,
  GoalStack,
  GrpcTransport,
  type HonestyCalibrationStore,
  HonestyCalibrator,
  HttpTransport,
  JdSpanExtractor,
  MLClient,
  MoodFingerprintSpecialist,
  MotivationModulator,
  NarrativeArcProposer,
  Narrator,
  OntologyResolver,
  Orchestrator,
  OutcomePredictor,
  type PostgresPersistence,
  RefuseOrShipGate,
  SequentialBulletComposer,
  type Specialist,
  SpecialistRegistry,
  StubDiscourseClassifier,
  StubJdSpanExtractor,
  TheoryOfMindSpecialist,
  TitleSchemaRetriever,
  TriggerBus,
  VoiceDriftMonitor,
  VoiceFingerprintExtractor,
  type VoiceFingerprintSink,
  WellBeingMonitor,
  seed_initial_goals,
} from "@retune/agent";
import type { Blackboard } from "@retune/types";
import { dualWriteJobDescription } from "../lib/optimized-dual-write";
import type { TraceBus } from "../lib/trace-bus";
import { acquire_durability } from "./persistence-factory";

export interface GenerateInput {
  jd_title?: string;
  company?: string;
  market?: "US" | "UK";
  /** Free-form JD body. When provided, the JdSpanExtractor specialist runs over it. */
  jd_text?: string;
  /** Free-form profile/resume body. When provided, spans are extracted from it. */
  profile_text?: string;
}

/**
 * ML reachability state.
 *
 * Probed once on the first generation request. If the ML server is
 * unreachable we fall back to stubs automatically — no env var required.
 * `RETUNE_ML_USE_STUBS=true` forces stubs even when the server is up.
 * `RETUNE_ML_DISABLE=1` skips ML entirely (no stubs either).
 */
let _ml_client_singleton: MLClient | null = null;
let _ml_reachable: boolean | null = null; // null = not yet probed

function build_ml_client(): MLClient | null {
  if (process.env.RETUNE_ML_DISABLE === "1") return null;
  if (process.env.RETUNE_ML_TRANSPORT === "grpc") {
    const base_url = process.env.RETUNE_ML_GRPC_BASE ?? "http://localhost:50051";
    return new MLClient({ transport: new GrpcTransport({ base_url }) });
  }
  const base_url = process.env.RETUNE_ML_BASE_URL ?? "http://localhost:8000";
  return new MLClient({ transport: new HttpTransport({ base_url }) });
}

function acquire_ml_client(): MLClient | null {
  if (_ml_client_singleton) return _ml_client_singleton;
  const client = build_ml_client();
  if (client) _ml_client_singleton = client;
  return client;
}

/**
 * Probe the ML server once and cache the result. Returns true when the
 * server is reachable and healthy. Falls back to false on any error.
 * Forced to false when RETUNE_ML_USE_STUBS=true.
 */
async function probe_ml_reachable(): Promise<boolean> {
  if (process.env.RETUNE_ML_USE_STUBS === "true") return false;
  if (process.env.RETUNE_ML_DISABLE === "1") return false;
  if (_ml_reachable !== null) return _ml_reachable;
  const client = acquire_ml_client();
  if (!client) {
    _ml_reachable = false;
    return false;
  }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2000); // 2s probe timeout
    await client.health(ac.signal);
    clearTimeout(timer);
    _ml_reachable = true;
    console.log("[ml] server reachable — using real ML pipeline");
  } catch {
    _ml_reachable = false;
    console.log("[ml] server unreachable — falling back to StubDiscourseClassifier");
  }
  return _ml_reachable;
}

/**
 * Best-effort extraction of job title and company name from raw JD text.
 * Handles common patterns from Jina-rendered job postings (Workday, Lever, Greenhouse, LinkedIn).
 */
function extract_role_and_company(text: string): { jd_title?: string; company?: string } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let jd_title: string | undefined;
  let company: string | undefined;

  // Title: first heading or "Title: X" / "Job Title: X" pattern
  for (const line of lines.slice(0, 30)) {
    if (!jd_title) {
      const heading = line.match(/^#{1,3}\s+(.{5,100})$/);
      if (heading?.[1]) {
        jd_title = heading[1].trim();
        continue;
      }

      const explicit = line.match(/^(?:job\s+)?title[:\s]+(.{3,80})$/i);
      if (explicit?.[1]) {
        jd_title = explicit[1].trim();
        continue;
      }

      // Short capitalised line near top = likely the role
      if (
        line.length < 80 &&
        /^[A-Z][A-Za-z\s/\-–,.()]+$/.test(line) &&
        line.split(" ").length >= 2
      ) {
        jd_title = line;
        continue;
      }
    }
    if (!company) {
      const co = line.match(/^(?:company|employer|organization|at)[:\s]+(.{2,60})$/i);
      if (co?.[1]) {
        company = co[1].trim();
        continue;
      }
    }
    if (jd_title && company) break;
  }

  // Company: "at [Company]" anywhere in first 500 chars
  if (!company) {
    const m = text
      .slice(0, 500)
      .match(/\bat\s+([A-Z][A-Za-z0-9&.,' ]{2,40}?)(?:\s*[,.|]|\s+is\b|\s+are\b|\s+we\b)/);
    if (m?.[1]) company = m[1].trim();
  }

  // URL source line from Jina: "URL Source: https://cisco.wd5.workdayjobs.com/..."
  // Scan all subdomains and pick the first meaningful one (skip generic prefixes)
  if (!company) {
    const urlLine = text.match(/URL Source:\s*https?:\/\/([^/]+)/i);
    if (urlLine?.[1]) {
      const parts = urlLine[1].split(".");
      const co = parts.find(
        (p) =>
          p.length > 3 &&
          !/^(wd\d+|www|jobs|careers|apply|lever|greenhouse|fmr|myworkday)$/i.test(p),
      );
      if (co) company = co.charAt(0).toUpperCase() + co.slice(1);
    }
  }

  return { jd_title, company };
}

const log = (level: "info" | "warn" | "error", id: string, msg: string, meta?: unknown) => {
  const prefix = `[workbench:${id.slice(0, 8)}]`;
  const line = meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else console.log(line);
};

export async function run_generation(input: {
  generation_id: string;
  payload: GenerateInput & { jd_url?: string };
  bus: TraceBus;
  external_signal?: AbortSignal;
}): Promise<void> {
  const { generation_id, bus, external_signal } = input;
  let { payload } = input;
  const maxTicksRaw = Number(process.env.RETUNE_MAX_TICKS ?? "64");
  const maxRuntimeMsRaw = Number(process.env.RETUNE_MAX_RUNTIME_MS ?? "180000");
  const maxTicks = Number.isFinite(maxTicksRaw) && maxTicksRaw > 0 ? Math.floor(maxTicksRaw) : 64;
  const maxRuntimeMs =
    Number.isFinite(maxRuntimeMsRaw) && maxRuntimeMsRaw > 10_000
      ? Math.floor(maxRuntimeMsRaw)
      : 180_000;

  log("info", generation_id, "run_generation started", {
    has_jd_url: !!payload.jd_url,
    has_jd_text: !!payload.jd_text,
    has_profile_text: !!payload.profile_text,
    market: payload.market,
  });

  // If a URL was provided but no text, fetch the JD now server-side via Jina
  if (payload.jd_url && !payload.jd_text) {
    log("info", generation_id, `fetching JD from URL: ${payload.jd_url}`);
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${encodeURIComponent(payload.jd_url)}`, {
        headers: { Accept: "text/markdown", "X-No-Cache": "true" },
        signal: AbortSignal.timeout(15_000),
      });
      if (jinaRes.ok) {
        const md = await jinaRes.text();
        if (md.length >= 50) {
          payload = { ...payload, jd_text: md.slice(0, 50_000) };
          log("info", generation_id, `JD fetched successfully`, { chars: payload.jd_text!.length });
        } else {
          log("warn", generation_id, "JD fetch returned too little content, proceeding without");
        }
      } else {
        log("warn", generation_id, `JD fetch failed status=${jinaRes.status}, proceeding without`);
      }
    } catch (err) {
      log("warn", generation_id, "JD fetch threw, proceeding without", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const durability = await acquire_durability();

  const user_id = durability?.default_user_id ?? randomUUID();
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
  ];
  // ActiveQuestionHandler only makes sense with durability — otherwise
  // there's nowhere to persist the question, so the goal would be
  // silently swallowed.
  if (durability) {
    specialists.push(
      new ActiveQuestionHandler({
        record: async (inp) =>
          (durability.persistence as PostgresPersistence).record_active_question(inp),
      }),
    );
  }
  // JdSpanExtractor — runs whenever an extract_spans goal is seeded
  // (i.e. when payload.jd_text or payload.profile_text is provided).
  // Without persistence, the sink writes to a per-request in-memory map
  // so the workbench can still reason about provenance during dev.
  const ml_client = acquire_ml_client();
  const ml_reachable = await probe_ml_reachable();
  if (ml_client && ml_reachable) {
    const sink: ExtractedSpansSink = durability
      ? {
          record: async (inp) =>
            (durability.persistence as PostgresPersistence).record_extracted_spans(inp),
        }
      : in_memory_spans_sink();
    specialists.push(new JdSpanExtractor(ml_client, sink));
    specialists.push(new DiscourseClassifier(ml_client));
    specialists.push(new BoilerplateStripper());
    specialists.push(new CulturalCalibrator(ml_client));
  } else if (process.env.RETUNE_ML_DISABLE !== "1") {
    // ML server unreachable (or RETUNE_ML_USE_STUBS=true) — use the
    // deterministic stub so the discourse pipeline still produces a
    // well-formed discourse_map for GapMapper and CulturalCalibrator.
    specialists.push(new StubJdSpanExtractor());
    specialists.push(new StubDiscourseClassifier());
    specialists.push(new BoilerplateStripper());
  }
  // Voice / honesty / credibility — pure-cognition specialists that do
  // not need an ML client. They run unconditionally so dev runs without
  // the Python server still exercise these code paths.
  const voice_sink: VoiceFingerprintSink | null = durability
    ? {
        record: async (inp) =>
          (durability.persistence as PostgresPersistence).record_voice_fingerprint(inp),
      }
    : null;
  specialists.push(new VoiceFingerprintExtractor(voice_sink));
  const honesty_store: HonestyCalibrationStore | null = durability
    ? {
        load: async (uid) => {
          const cals = await (
            durability.persistence as PostgresPersistence
          ).load_honesty_calibrations(uid);
          // The store interface expects (verified, unverified) counts,
          // not (trust_factor, sample_size). For commit #8 we don't have
          // outcome data yet, so synthesize a neutral prior with the
          // recorded sample_size as the verified count and 0 unverified.
          const out: Record<string, { verified: number; unverified: number }> = {};
          for (const [kind, c] of Object.entries(cals)) {
            out[kind] = {
              verified: Math.round(c.trust_factor * c.sample_size),
              unverified: c.sample_size - Math.round(c.trust_factor * c.sample_size),
            };
          }
          return out;
        },
        record: async (inp) =>
          (durability.persistence as PostgresPersistence).record_honesty_calibration(inp),
      }
    : null;
  specialists.push(new HonestyCalibrator(honesty_store));
  specialists.push(new CredibilityScanner());
  // Strategy specialists — deterministic, no deps.
  specialists.push(new GapMapper());
  specialists.push(new EvidenceSolver());
  // Affective specialists — pure cognition, no ML deps.
  specialists.push(new EmotionalStateModeler());
  specialists.push(new MoodFingerprintSpecialist());
  specialists.push(new MotivationModulator());
  // Production specialists — LLM-driven.
  specialists.push(new NarrativeArcProposer());
  specialists.push(new SequentialBulletComposer());
  // Post-composition specialists — cover letter, ATS patch, strategy.
  specialists.push(new CoverLetterComposer());
  specialists.push(new AtsPatchLoop());
  specialists.push(new ApplicationStrategyComposer());
  // Critique specialists — theory-of-mind trio + recruiter-belief modeler.
  specialists.push(new TheoryOfMindSpecialist());
  specialists.push(new CriticEnsemble());
  // Decision specialists — outcome prediction + meta-cognitive gate.
  specialists.push(new OutcomePredictor());
  specialists.push(new RefuseOrShipGate());
  specialists.push(new DocumentRenderer());
  // Narrative specialist — produces plain-language explanations for the
  // LiveNarrativeStream widget. Runs on narrate_layer goals emitted by
  // the orchestrator after each phase boundary.
  specialists.push(new Narrator());
  registry.register_all(specialists);

  // ---- Listeners (cross-cutting) ----
  //
  // All three listeners are subscribed in the API runtime so the live SSE
  // trace can surface concerns to the frontend in real time. Each listener
  // also pushes detected concerns into a shared `ConflictStagingQueue`
  // which the orchestrator drains at the top of every tick so concerns
  // land in the durable conflicts table (technical-2.0 §9).
  const conflict_staging = new ConflictStagingQueue();

  const fairness = new FairnessMonitor(
    (concern) => {
      bus.publish({
        kind: "trace",
        event: {
          seq: -1, // listener-driven; orchestrator's tick seq doesn't apply
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
  );
  trigger_bus.subscribe(fairness);

  const voice_drift = new VoiceDriftMonitor({
    staging_queue: conflict_staging,
    on_drift: (m) => {
      bus.publish({
        kind: "trace",
        event: {
          seq: -1,
          timestamp: new Date().toISOString(),
          specialist: "voice_drift_monitor",
          brain_region: "cerebellum",
          micro_stage: "voice_drift",
          justification: `cosine=${m.cosine_similarity.toFixed(3)} on bullet ${m.bullet_id}`,
          cost_usd: 0,
          latency_ms: 0,
          writes_count: 0,
          conflicts_count: m.cosine_similarity < 0.65 ? 1 : 0,
        },
      });
    },
  });
  trigger_bus.subscribe(voice_drift);
  // Lazy baseline setter: when VoiceFingerprintExtractor writes the baseline
  // fingerprint, propagate it into the drift monitor so subsequent bullet
  // writes are scored against it.
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

  const audit = new AuditTrail();
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.2, // full output suite (resume + cover letter + strategy) costs ~$0.05–0.08
    hard_kill_usd: 0.5,
    per_specialist_spent: {},
  });
  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: audit,
    budget,
    persistence: durability?.persistence,
    conflict_staging,
    // §2.3: wire extended_persistence so conflicts and GDPR packets are
    // persisted to the conflicts/gdpr_packets tables when durability is available.
    extended_persistence: durability
      ? {
          record_gdpr_packet: (inp) =>
            (durability.persistence as PostgresPersistence).record_gdpr_packet(inp),
          record_conflict: (inp) =>
            (durability.persistence as PostgresPersistence).record_conflict(inp),
        }
      : undefined,
  });

  // If jd_text is available but jd_title/company were not passed in the payload,
  // extract them heuristically so TitleSchemaRetriever and CompanySchemaRetriever
  // have goals to work on — otherwise role_schema and company_schema stay null
  // and the strategy composer emits placeholder text like "[this role] at [company name]".
  if (payload.jd_text && (!payload.jd_title || !payload.company)) {
    const extracted = extract_role_and_company(payload.jd_text);
    if (extracted.jd_title && !payload.jd_title) {
      payload = { ...payload, jd_title: extracted.jd_title };
      log("info", generation_id, `extracted jd_title="${extracted.jd_title}"`);
    }
    if (extracted.company && !payload.company) {
      payload = { ...payload, company: extracted.company };
      log("info", generation_id, `extracted company="${extracted.company}"`);
    }
  }

  // §2.2: use shared helper so API runtime and Temporal substrate seed identical goals.
  seed_initial_goals(goals, payload);

  // When persistence is wired we also need a jds row so the generation's
  // FK is satisfied. Skipped in off mode.
  if (durability) {
    const { jds } = await import("@retune/db/pg");
    const jdRaw = `${payload.jd_text ?? ""}\n${payload.jd_title ?? ""}\n${payload.company ?? ""}`.trim();
    await durability.db.insert(jds).values({
      id: jd_id,
      source: "api",
      content_hash: generation_id.slice(0, 16),
      raw_text: jdRaw,
    });
    try {
      await dualWriteJobDescription({
        db: durability.db,
        jdId: jd_id,
        userId: user_id,
        jdText: jdRaw,
        title: payload.jd_title ?? null,
        company: payload.company ?? null,
        market: payload.market ?? "US",
      });
    } catch (err) {
      log("warn", generation_id, "optimized job_descriptions dual-write failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log("info", generation_id, "starting orchestrator", {
    specialists: specialists.map((s) => s.constructor.name),
    has_durability: !!durability,
    has_external_signal: !!external_signal,
  });

  try {
    const result = await withTimeout(
      orchestrator.run({
        external_signal,
        max_ticks: maxTicks,
        on_trace: (event) => bus.publish({ kind: "trace", event }),
        generation_context: durability ? { user_id, jd_id, ontology_version: "0.0.1" } : undefined,
      }),
      maxRuntimeMs,
      `generation_timeout: exceeded ${Math.round(maxRuntimeMs / 1000)}s`,
    );
    // Capture the final blackboard snapshot so `GET /generate/:id` can hydrate
    // results (resume/cover_letter/strategy markdown, conflicts, narrative arc)
    // without relying on Postgres being configured. Persistence-backed runs
    // can still fall through to the durable store for older generations.
    try {
      bus.set_final_blackboard(blackboard.snapshot());
    } catch {
      // Snapshot can fail if blackboard was deep-frozen elsewhere — non-fatal.
    }
    log("info", generation_id, "orchestrator finished", {
      termination: result.termination,
      ticks: result.ticks_executed,
      cost_usd: result.total_cost_usd,
      latency_ms: result.total_latency_ms,
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
    log("error", generation_id, "orchestrator threw", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join(" | ") : undefined,
    });
    bus.publish({
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function withTimeout<T>(p: Promise<T>, timeoutMs: number, msg: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(msg)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function in_memory_spans_sink(): ExtractedSpansSink {
  // Used when persistence is OFF. Spans get fabricated UUIDs so the
  // blackboard's `evidence_graph.span_ids` is well-typed; nothing is
  // persisted across runs.
  return {
    async record(input) {
      return input.spans.map(() => randomUUID());
    },
  };
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
