/**
 * CareerUnderstandingV1 — Retune's derived interpretation of a candidate's
 * canonical career facts (CareerProfileV1).
 *
 * This is the second of three layers in the 004 Career Profile architecture:
 *
 *   1. Facts          → CareerProfileV1
 *   2. Interpretation → CareerUnderstandingV1 (this file)
 *   3. Generation fuel → API payloads to the cognitive cycle
 *
 * Keep this model strictly separate from CareerProfileV1. AI-derived
 * interpretation must never mutate user facts directly. Instead, the
 * understanding model carries summary, positioning, evidence map, and
 * resume-fuel signals that are explicitly tied back to source profile
 * paths via EvidenceRef.
 */

export const CAREER_UNDERSTANDING_VERSION = "career-understanding-v1" as const;

/** The named sections an understanding update can touch. */
export type UnderstandingSection =
  | "summary"
  | "positioning"
  | "evidence"
  | "resume_fuel"
  | "skills_interpretation"
  | "resume_strategy";

/** The scopes the user can pick when tuning an understanding. */
export type UnderstandingScope =
  | "summary"
  | "selected_positioning"
  | "all_positioning"
  | "evidence_map"
  | "resume_fuel"
  | "skills_interpretation"
  | "resume_strategy"
  | "everything_affected";

/** Provenance / source of a piece of evidence. */
export type EvidenceRefSource = "resume" | "user" | "ai_inferred" | "system";

/** A pointer to a piece of profile data that supports an interpretation. */
export interface EvidenceRef {
  id: string;
  /** Dot-path into CareerProfileV1, e.g. "experience[0].responsibilities" */
  profilePath: string;
  source: EvidenceRefSource;
  label: string;
  quote?: string;
  confidence?: number;
}

/** The headline summary block. */
export interface UnderstandingSummary {
  headline: string;
  narrative: string;
  confidenceLabel: "low" | "medium" | "high";
  caveats: string[];
  sourceRefs: EvidenceRef[];
  confirmed: boolean;
}

/** A single positioning angle Retune can use for resume strategy. */
export interface PositioningOption {
  id: string;
  kind: "primary" | "alternative" | "stretch";
  title: string;
  description: string;
  bestFor: string[];
  emphasize: string[];
  deEmphasize: string[];
  risks: string[];
  evidenceRefs: EvidenceRef[];
  userDecision: "accepted" | "rejected" | "use_sometimes" | "undecided";
}

/** The set of positioning options plus the user's chosen default. */
export interface PositioningModel {
  selectedId: string | null;
  options: PositioningOption[];
}

/** A concrete signal Retune is using to interpret the profile. */
export interface EvidenceSignal {
  id: string;
  label: string;
  interpretation: string;
  strength: "strong" | "medium" | "weak";
  sourceRefs: EvidenceRef[];
  actionHint?: string;
}

/** The grouped evidence map shown to the user for trust and audit. */
export interface EvidenceMap {
  strongestSignals: EvidenceSignal[];
  supportingSignals: EvidenceSignal[];
  weakSignals: EvidenceSignal[];
  inferredUnconfirmed: EvidenceSignal[];
}

/** Resume-fuel section names — used to route improvement actions. */
export type ResumeFuelSection =
  | "identity"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "career_intent"
  | "writing_preferences";

/** A single resume-fuel signal — what is ready or what needs sharpening. */
export interface ResumeFuelItem {
  id: string;
  label: string;
  whyItMatters: string;
  section: ResumeFuelSection;
  severity: "info" | "warning" | "blocker";
  sourceRefs: EvidenceRef[];
}

/** Resume-fuel grouping — translates profile quality into resume usefulness. */
export interface ResumeFuelModel {
  ready: ResumeFuelItem[];
  needsSharpening: ResumeFuelItem[];
  risks: ResumeFuelItem[];
  suggestedNextEdits: ResumeFuelItem[];
}

/** A user-supplied free-form note attached to a section. */
export interface UnderstandingFeedbackNote {
  section: UnderstandingSection;
  instruction: string;
  createdAt: string;
}

/** Lightweight feedback the user can submit without a model call. */
export interface UnderstandingFeedback {
  summary: "accurate" | "not_quite" | "different_angle_requested" | null;
  rejectedPositioningIds: string[];
  preferredPositioningIds: string[];
  notes: UnderstandingFeedbackNote[];
}

/** The full canonical understanding document. */
export interface CareerUnderstandingV1 {
  schemaVersion: typeof CAREER_UNDERSTANDING_VERSION;
  id: string;
  userId: string;
  profileId: string | null;
  sourceProfileVersion: string;
  sourceProfileFingerprint: string;
  revision: number;
  status: "draft" | "active" | "stale" | "archived";

  summary: UnderstandingSummary;
  positioning: PositioningModel;
  evidenceMap: EvidenceMap;
  resumeFuel: ResumeFuelModel;
  userFeedback: UnderstandingFeedback;

  generatedAt: string;
  updatedAt: string;
  staleSince: string | null;
}

/** A bounded patch the apply route can use. */
export type CareerUnderstandingPatch =
  | { section: "summary"; summary: UnderstandingSummary }
  | { section: "positioning"; positioning: PositioningModel }
  | { section: "evidence"; evidenceMap: EvidenceMap }
  | { section: "resume_fuel"; resumeFuel: ResumeFuelModel }
  | {
      section: "multiple";
      summary?: UnderstandingSummary;
      positioning?: PositioningModel;
      evidenceMap?: EvidenceMap;
      resumeFuel?: ResumeFuelModel;
    };

/** Slice returned in preview responses for before/after rendering. */
export interface CareerUnderstandingSlice {
  summary?: UnderstandingSummary;
  positioning?: PositioningModel;
  evidenceMap?: EvidenceMap;
  resumeFuel?: ResumeFuelModel;
}

/**
 * The persisted record shape — split from the in-memory CareerUnderstandingV1
 * so the repository can return DB metadata without polluting the type used by
 * the UI.
 */
export interface CareerUnderstandingRecord {
  understanding: CareerUnderstandingV1;
  revision: number;
  fingerprint: string | null;
  staleSince: Date | null;
  updatedAt: Date | null;
}

/**
 * The intent presets a user can pick for a Retune Lens call. Free-form
 * instruction is also allowed.
 */
export type UnderstandingIntentPreset =
  | "accurate"
  | "different_angle"
  | "more_technical"
  | "more_product_focused"
  | "more_senior"
  | "less_exaggerated"
  | "re_read_profile";
