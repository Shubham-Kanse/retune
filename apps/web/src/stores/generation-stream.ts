import { EventRing, StreamClient } from "@/lib/sse";
import type { PipelineEvent, PipelineEventType } from "@/lib/sse/events";
import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerationStatus = "idle" | "connecting" | "streaming" | "complete" | "error";

export interface GenerationStep {
  id: string;
  label: string;
  status: "pending" | "active" | "complete";
  durationMs?: number;
  model?: string;
}

export interface TraceEntry {
  seq: number;
  specialist: string;
  displayName: string;
  latencyMs: number;
  costUsd: number;
  writesCount: number;
  timestamp: number;
}

export interface BrainTraceEvent {
  specialist: string;
  brain_region: string;
  micro_stage: string;
  cost_usd: number;
  latency_ms: number;
}

export interface ConflictRecord {
  id: string;
  monitor: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export interface UserActionState {
  action: string;
  message: string;
  data: Record<string, unknown>;
}

export interface PipelineCompletionData {
  submissionConfidence: number | null;
  interviewReadyScore: number | null;
  shipVerdict: string | null;
  outcomeEstimate: { point: number; lower: number | null; upper: number | null } | null;
  wellBeingConcerns: Array<{
    kind: string;
    message: string;
    nudge: string;
    severity: string;
  }> | null;
  recruiterBeliefState: {
    hiring_intent_prediction: string;
    projected_first_question: string;
    perceived_gaps: Array<{ topic: string; gap_severity: string; recruiter_question: string }>;
    flight_risk_signal: string;
  } | null;
  gdprSummary: string | null;
}

export interface ActivityEntry {
  message: string;
}

// ─── Store shape ──────────────────────────────────────────────────────────────

interface GenerationStreamState {
  status: GenerationStatus;
  applicationId: string | null;
  events: EventRing;
  steps: GenerationStep[];
  startedAt: number | null;
  userActionRequired: UserActionState | null;
  failedStep: string | null;
  activity: ActivityEntry[];
  liveResume: { summary?: string; skills?: string; experience?: string };
  retryCount: number;
  // scores
  atsScore: number | null;
  interviewReadyScore: number | null;
  submissionConfidence: number | null;
  errorMessage: string | null;
  completionData: PipelineCompletionData | null;
  // Pipeline B cognitive
  traceEntries: TraceEntry[];
  brainTraces: BrainTraceEvent[];
  currentSpecialist: string | null;
  narrativeParagraphs: string[];
  emotionalState: string | null;
  emotionalStateConfidence: number | null;
  conflicts: ConflictRecord[];
  totalCostUsd: number;

  // Actions
  start: (
    applicationId: string,
    opts?: {
      initialSteps?: Array<{ id: string; label: string }>;
      proceedAnyway?: boolean;
      retryCount?: number;
    },
  ) => void;
  retry: (proceedAnyway?: boolean) => void;
  stop: () => void;
  reset: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

function makeInitial(): Omit<GenerationStreamState, "start" | "retry" | "stop" | "reset"> {
  return {
    status: "idle",
    applicationId: null,
    events: new EventRing(),
    steps: [],
    startedAt: null,
    userActionRequired: null,
    failedStep: null,
    activity: [],
    liveResume: {},
    retryCount: 0,
    atsScore: null,
    interviewReadyScore: null,
    submissionConfidence: null,
    errorMessage: null,
    completionData: null,
    traceEntries: [],
    brainTraces: [],
    currentSpecialist: null,
    narrativeParagraphs: [],
    emotionalState: null,
    emotionalStateConfidence: null,
    conflicts: [],
    totalCostUsd: 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPECIALIST_BRAIN_MAP: Record<string, string> = {
  jd_analyzer: "prefrontal_cortex",
  company_researcher: "hippocampus",
  profile_mapper: "anterior_cingulate",
  summary_writer: "dlpfc",
  skills_writer: "parietal_lobe",
  experience_writer: "temporal_lobe",
  ats_patcher: "basal_ganglia",
  quality_gate: "dorsal_acc",
  cover_letter_writer: "vlpfc",
  strategy_planner: "default_mode_network",
  validator: "thalamus",
  orchestrator: "salience_network",
};

function sanitizeAgentMsg(msg: string): string | null {
  const c = msg.replace(/\s+/g, " ").trim();
  if (!c) return null;

  // Block internal/technical strings that should never surface as loading messages
  const blocked = [
    /^(bash|python3|sed|skill)\b/i, // shell commands
    /(\/api\/|\.md|\.py|--| -[a-z])/, // file paths / CLI flags
    /^(role fit|resume quality|quality gate|resume validation|validation error|areas to address|profile improvement)/i,
    /\b(score|verdict|fitScore|confidence|blockingIssues)\b.*\d+/i, // raw metric dumps
    /proceeding.*despite|proceeding.*warning/i, // internal gate bypass messages
    /preparing canonical docx/i,
    /could not parse profile/i,
    /jd analysis updated application metadata/i,
    /warning: could not/i,
  ];

  if (blocked.some((re) => re.test(c))) return null;
  return c;
}

function buildUrl(appId: string, retryCount: number, proceedAnyway: boolean): string {
  const qs = `?retry=${retryCount}${proceedAnyway ? "&proceedAnyway=1" : ""}`;
  return `/api/generate/${appId}/stream${qs}`;
}

// Module-level client — only one generation runs at a time
let activeClient: StreamClient | null = null;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGenerationStream = create<GenerationStreamState>((set, get) => ({
  ...makeInitial(),

  start(applicationId, opts = {}) {
    const { initialSteps = [], proceedAnyway = false, retryCount = 0 } = opts;

    // Tear down any existing connection
    activeClient?.close();
    activeClient = null;

    set({
      ...makeInitial(),
      events: new EventRing(),
      status: "connecting",
      applicationId,
      retryCount,
      steps: initialSteps.map((s) => ({ ...s, status: "pending" as const })),
    });

    activeClient = new StreamClient({
      url: buildUrl(applicationId, retryCount, proceedAnyway),
      onEvent: (event) => handleEvent(event, set, get),
      onError: (err) =>
        set({
          status: "error",
          errorMessage: err.message ?? "Connection failed. Please retry.",
          failedStep: get().steps.find((s) => s.status === "active")?.label ?? null,
        }),
      onClose: () => {
        // StreamClient fires this after max reconnect attempts, not on clean close
      },
    });

    activeClient.connect();
    set({ status: "streaming" });
  },

  retry(proceedAnyway = false) {
    const { applicationId, steps, retryCount } = get();
    if (!applicationId) return;
    get().start(applicationId, {
      initialSteps: steps.map((s) => ({ id: s.id, label: s.label })),
      proceedAnyway,
      retryCount: retryCount + 1,
    });
  },

  stop() {
    const { applicationId } = get();
    // Tell the API to abort the orchestrator before closing the SSE connection.
    // Fire-and-forget — we don't wait for the response.
    if (applicationId) {
      fetch(`/api/generate/${applicationId}`, { method: "DELETE" }).catch(() => {});
    }
    activeClient?.close();
    activeClient = null;
    set({ status: "idle" });
  },

  reset() {
    activeClient?.close();
    activeClient = null;
    set({ ...makeInitial(), events: new EventRing() });
  },
}));

// ─── Event handler ────────────────────────────────────────────────────────────

function handleEvent(
  event: PipelineEvent,
  set: (partial: Partial<GenerationStreamState>) => void,
  get: () => GenerationStreamState,
): void {
  const state = get();
  state.events.push(event);

  const type = event.type as PipelineEventType;
  const data = event.data as Record<string, unknown>;

  switch (type) {
    // ── Pipeline A ───────────────────────────────────────────────────────────

    case "step_start": {
      const stepId = data.step as string;
      const label = (data.label as string) ?? stepId;
      const model = (data.model as string) ?? undefined;
      const exists = state.steps.some((s) => s.id === stepId);

      // Mark matching step active; any currently-active step → complete
      const markActive = (s: GenerationStep): GenerationStep =>
        s.id === stepId
          ? { ...s, status: "active", model }
          : s.status === "active"
            ? { ...s, status: "complete" }
            : s;

      set({
        status: "streaming",
        startedAt: state.startedAt ?? Date.now(),
        steps: exists
          ? state.steps.map(markActive)
          : [
              ...state.steps.map((s) =>
                s.status === "active" ? { ...s, status: "complete" as const } : s,
              ),
              { id: stepId, label, status: "active", model },
            ],
      });
      break;
    }

    case "step_complete":
      set({
        steps: state.steps.map((s) =>
          s.id === (data.step as string)
            ? { ...s, status: "complete", durationMs: data.durationMs as number | undefined }
            : s,
        ),
      });
      break;

    case "ats_score":
      set({ atsScore: data.score as number });
      break;

    case "agent_log": {
      const safe = sanitizeAgentMsg(String(data.message ?? ""));
      if (safe) {
        set({
          activity: [...state.activity.slice(-4), { message: safe }],
          narrativeParagraphs: [...state.narrativeParagraphs, safe],
        });
      }
      break;
    }

    case "content_chunk": {
      const section = String(data.section ?? "");
      const markdown = String(data.markdown ?? "");
      if (section && markdown) {
        set({ liveResume: { ...state.liveResume, [section]: markdown } });
      }
      break;
    }

    case "user_action_required":
      set({
        userActionRequired: {
          action: String(data.action ?? "user_action_required"),
          message: String(data.message ?? "Action required before generation can continue."),
          data,
        },
        errorMessage: null,
      });
      // Pipeline has halted server-side; close connection
      activeClient?.close();
      activeClient = null;
      break;

    case "error":
      set({
        status: "error",
        errorMessage: String(data.message ?? "Generation failed"),
        failedStep: state.steps.find((s) => s.status === "active")?.label ?? null,
      });
      break;

    case "complete":
      set({
        status: "complete",
        interviewReadyScore:
          typeof data.interviewReadyScore === "number" ? data.interviewReadyScore : null,
        submissionConfidence:
          typeof data.submissionConfidence === "number" ? data.submissionConfidence : null,
        atsScore:
          typeof (data.atsReport as Record<string, unknown> | null)?.score === "number"
            ? ((data.atsReport as Record<string, unknown>).score as number)
            : state.atsScore,
        completionData: {
          submissionConfidence:
            typeof data.submissionConfidence === "number" ? data.submissionConfidence : null,
          interviewReadyScore:
            typeof data.interviewReadyScore === "number" ? data.interviewReadyScore : null,
          shipVerdict: typeof data.shipVerdict === "string" ? data.shipVerdict : null,
          outcomeEstimate:
            (data.outcomeEstimate as PipelineCompletionData["outcomeEstimate"]) ?? null,
          wellBeingConcerns: Array.isArray(data.wellBeingConcerns)
            ? (data.wellBeingConcerns as PipelineCompletionData["wellBeingConcerns"])
            : null,
          recruiterBeliefState:
            (data.recruiterBeliefState as PipelineCompletionData["recruiterBeliefState"]) ?? null,
          gdprSummary: typeof data.gdprSummary === "string" ? data.gdprSummary : null,
        },
        // Mark any still-active/pending steps as complete
        steps: state.steps.map((s) =>
          s.status === "active" || s.status === "pending"
            ? { ...s, status: "complete" as const }
            : s,
        ),
      });
      break;

    // ── Cognitive backend trace events ───────────────────────────────────────
    // The backend emits named SSE `event: trace` with the specialist payload
    // directly in the data object (not nested). Map these to traceEntries so
    // the UI can show live progress and the pulse effect.

    case "trace": {
      const specialist = (data.specialist as string) ?? "unknown";
      const brainRegion =
        (data.brain_region as string) ?? SPECIALIST_BRAIN_MAP[specialist] ?? "prefrontal_cortex";
      set({
        status: "streaming",
        startedAt: state.startedAt ?? Date.now(),
        currentSpecialist: specialist,
        totalCostUsd: state.totalCostUsd + ((data.cost_usd as number) ?? 0),
        traceEntries: [
          ...state.traceEntries,
          {
            seq: (data.seq as number) ?? event.seq,
            specialist,
            displayName: specialist.replace(/_/g, " "),
            latencyMs: (data.latency_ms as number) ?? 0,
            costUsd: (data.cost_usd as number) ?? 0,
            writesCount: (data.writes_count as number) ?? 0,
            timestamp: event.timestamp,
          },
        ],
        brainTraces: [
          ...state.brainTraces,
          {
            specialist,
            brain_region: brainRegion,
            micro_stage: (data.micro_stage as string) ?? specialist,
            cost_usd: (data.cost_usd as number) ?? 0,
            latency_ms: (data.latency_ms as number) ?? 0,
          },
        ],
      });
      break;
    }

    case "done": {
      // Backend signals generation complete with a summary object
      const confidence = (data.submission_confidence as number) ?? null;
      set({
        status: "complete",
        currentSpecialist: null,
        submissionConfidence: confidence,
        steps: state.steps.map((s) =>
          s.status === "active" ? { ...s, status: "complete" as const } : s,
        ),
      });
      break;
    }

    // ── Pipeline B / cognitive ────────────────────────────────────────────────

    case "specialist_picked":
      set({ currentSpecialist: data.display_name as string });
      break;

    case "tick_end": {
      const specialist = (data.specialist as string) ?? "unknown";
      const brainRegion = SPECIALIST_BRAIN_MAP[specialist] ?? "prefrontal_cortex";
      set({
        currentSpecialist: null,
        traceEntries: [
          ...state.traceEntries,
          {
            seq: event.seq,
            specialist,
            displayName: state.currentSpecialist ?? specialist,
            latencyMs: (data.latency_ms as number) ?? 0,
            costUsd: (data.cost_usd as number) ?? 0,
            writesCount: (data.writes_count as number) ?? 0,
            timestamp: event.timestamp,
          },
        ],
        brainTraces: [
          ...state.brainTraces,
          {
            specialist,
            brain_region: brainRegion,
            micro_stage: specialist,
            cost_usd: (data.cost_usd as number) ?? 0,
            latency_ms: (data.latency_ms as number) ?? 0,
          },
        ],
      });
      break;
    }

    case "cost_charge":
      set({ totalCostUsd: data.total_spent_usd as number });
      break;

    case "narrative_paragraph":
      set({
        narrativeParagraphs: [...state.narrativeParagraphs, data.text as string],
      });
      break;

    case "emotional_state_changed":
      set({
        emotionalState: data.primary_emotion as string,
        emotionalStateConfidence: data.confidence as number,
      });
      break;

    case "conflict_emitted": {
      const sev = data.severity as string;
      const safeSev = (
        ["low", "medium", "high", "critical"].includes(sev) ? sev : "low"
      ) as ConflictRecord["severity"];
      set({
        conflicts: [
          ...state.conflicts,
          {
            id: data.id as string,
            monitor: data.monitor as string,
            severity: safeSev,
            message: data.message as string,
          },
        ],
      });
      break;
    }

    case "outcome_predicted":
      set({ submissionConfidence: data.point as number });
      break;

    default:
      break;
  }
}
