import type { ProfileNormalized } from "@/lib/profile-domain/contracts";

// ─── Profile Field Wrapper ────────────────────────────────────────────────────

export type ProfileFieldSource = "resume" | "user" | "ai_inferred" | "system";

export interface ProfileFieldEdit<T> {
  previousValue: T;
  nextValue: T;
  source: ProfileFieldSource;
  reason: string;
  actor: "user" | "router" | "extractor" | "system";
  at: string;
}

export interface ProfileEvidence {
  source: "resume_text" | "resume_file" | "user_message" | "ai_inference";
  quote?: string;
  page?: number;
  messageId?: string;
  confidence: number;
}

export interface ProfileField<T> {
  value: T;
  source: ProfileFieldSource;
  confidence: number;
  confirmed: boolean;
  lastUpdatedAt: string;
  evidence: ProfileEvidence[];
  editHistory: ProfileFieldEdit<T>[];
}

export function makeField<T>(value: T, source: ProfileField<T>["source"] = "system", confidence = 1): ProfileField<T> {
  return {
    value,
    source,
    confidence,
    confirmed: false,
    lastUpdatedAt: new Date().toISOString(),
    evidence: [],
    editHistory: [],
  };
}

export function emptyField<T>(defaultValue: T): ProfileField<T> {
  return {
    value: defaultValue,
    source: "system",
    confidence: 0,
    confirmed: false,
    lastUpdatedAt: "",
    evidence: [],
    editHistory: [],
  };
}

// ─── Onboarding Phases ───────────────────────────────────────────────────────

export type OnboardingPhase =
  | "orb_intro"
  | "resume_upload"
  | "resume_parsing"
  | "resume_summary"
  | "identity_confirm"
  | "experience_confirm"
  | "education_confirm"
  | "skills_confirm"
  | "projects_certifications_review"
  | "professional_identity"
  | "career_direction"
  | "role_interests"
  | "market_preferences"
  | "work_preferences"
  | "seniority_comfort"
  | "industries_of_interest"
  | "emphasis_preferences"
  | "de_emphasis_preferences"
  | "tone_preferences"
  | "profile_gap_fill"
  | "profile_ready"
  | "profile_enhancement"
  | "dashboard_handoff";

// ─── Question / Pill / Card ──────────────────────────────────────────────────

export interface OnboardingQuestion {
  phase: OnboardingPhase;
  field: string;
  questionKey: string;
  prompt: string;
  answerType: "single_select" | "multi_select" | "text" | "confirm";
  pills: Pill[];
  cards?: DisplayCard[];
  skipAllowed: boolean;
  whyAsked?: string;
}

export interface Pill {
  label: string;
  value: string;
  action: "set_field" | "confirm_field" | "ask_text" | "skip" | "navigate" | "edit_card" | "remove_card";
  field?: string;
  recommended?: boolean;
  selected?: boolean;
  reason?: string;
}

export interface DisplayCard {
  type:
    | "identity"
    | "experience"
    | "education"
    | "skill_group"
    | "career_intent"
    | "project"
    | "certification"
    | "summary"
    | "language"
    | "award"
    | "publication"
    | "volunteering";
  id?: string;
  title: string;
  subtitle?: string;
  metadata?: string[];
  confidence?: number;
  status?: "extracted" | "confirmed" | "needs_review" | "missing";
}

// ─── Experience / Education / Project / Certification ─────────────────────────

export interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  responsibilities: string[];
  achievements: string[];
  metrics?: Array<{ metric?: string; value?: string; context?: string; direction?: string }>;
  tools: string[];
  skills: string[];
  domain?: string;
  industry?: string;
  teamSize?: number;
  confidence?: number;
}

export interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  graduationYear?: string;
  location?: string;
  grade?: string;
  coursework?: string[];
  capstone?: string;
}

export interface CertificationEntry { id?: string; name: string; issuer: string; year?: string; expiresAt?: string; }
export interface ProjectEntry {
  id?: string;
  title: string;
  description: string;
  techStack?: string[];
  link?: string;
  impact?: string;
  role?: string;
  year?: string;
}

export interface ParseQuality {
  score: number;
  textExtractionMethod: "pdf_text" | "docx_text" | "openai_file" | "manual_paste" | "unknown";
  hasIdentity: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  hasSkills: boolean;
  hasProjects: boolean;
  weakAreas: string[];
  warnings: string[];
}

// ─── User Career Profile ─────────────────────────────────────────────────────

export interface CareerProfileV1 {
  schemaVersion: "career-profile-v1";
  id: string;
  userId: string;

  identity: {
    fullName: ProfileField<string>;
    email: ProfileField<string>;
    phone: ProfileField<string>;
    location: ProfileField<string>;
    linkedin: ProfileField<string>;
    github: ProfileField<string>;
    portfolio: ProfileField<string>;
    website: ProfileField<string>;
  };

  professionalProfile: {
    currentTitles: ProfileField<string[]>;
    professionalIdentities: ProfileField<string[]>;
    yearsOfExperience: ProfileField<number | null>;
    summarySignals: ProfileField<string[]>;
    domainExperience: ProfileField<string[]>;
    careerHighlights: ProfileField<string[]>;
  };

  experience: ProfileField<ExperienceEntry[]>;
  education: ProfileField<EducationEntry[]>;

  skills: {
    technical: ProfileField<string[]>;
    tools: ProfileField<string[]>;
    business: ProfileField<string[]>;
    methodologies: ProfileField<string[]>;
    softSkills: ProfileField<string[]>;
    domainSkills: ProfileField<string[]>;
  };

  projects: ProfileField<ProjectEntry[]>;
  certifications: ProfileField<CertificationEntry[]>;
  languages: ProfileField<string[]>;
  awards: ProfileField<string[]>;
  publications: ProfileField<string[]>;
  volunteering: ProfileField<string[]>;

  careerIntent: {
    interestedRoles: ProfileField<string[]>;
    careerDirection: ProfileField<"same" | "slight_shift" | "major_switch" | "not_sure" | "">;
    preferredMarkets: ProfileField<string[]>;
    workPreference: ProfileField<"remote" | "hybrid" | "onsite" | "open" | "">;
    seniorityComfort: ProfileField<string[]>;
    industriesOfInterest: ProfileField<string[]>;
    roleDealbreakers: ProfileField<string[]>;
  };

  resumeWritingPreferences: {
    emphasisAreas: ProfileField<string[]>;
    deEmphasisAreas: ProfileField<string[]>;
    toneSignals: ProfileField<string[]>;
    styleConstraints: ProfileField<string[]>;
  };

  onboarding: {
    currentPhase: OnboardingPhase;
    parseQuality: ParseQuality;
    readiness: ProfileReadiness | null;
    resumeUploaded: boolean;
    resumeParsed: boolean;
    resumeSummarized: boolean;
    educationNotApplicable: boolean;
    completedAt: string | null;
  };

  createdAt: string;
  updatedAt: string;
}

export type UserCareerProfile = CareerProfileV1;

// ─── Onboarding Meta ─────────────────────────────────────────────────────────

export interface OnboardingMeta {
  currentPhase: OnboardingPhase;
  lastQuestionKey?: string;
  answeredQuestionKeys: string[];
  skippedQuestionKeys: SkippedQuestion[];
  resumeUploaded: boolean;
  resumeParsed: boolean;
  resumeSummarized: boolean;
  identityConfirmed: boolean;
  experienceConfirmed: boolean;
  educationConfirmed: boolean;
  skillsConfirmed: boolean;
  projectsCertificationsReviewed: boolean;
  educationNotApplicable: boolean;
  optionalTonePrompted: boolean;
  pendingTextInput?: PendingTextInput;
  enhancementTurns: number;
  resetCount: number;
  status: "draft" | "ready" | "completed";
  resumeFileHash?: string | null;
  extractionStatus?: "pending" | "processing" | "done" | "failed" | null;
  completedAt?: string | null;
}

export interface SkippedQuestion {
  questionKey: string;
  field: string;
  skippedAt: string;
  skipScope?: "this_session" | "this_profile" | "ask_later";
}

export interface PendingTextInput {
  field: string;
  questionKey: string;
  expectedFormat: "name" | "email" | "phone" | "location" | "experience" | "education" | "skills" | "role" | "market" | "general_text";
}

// ─── Profile Readiness ───────────────────────────────────────────────────────

export interface ProfileReadiness {
  canEnterDashboard: boolean;
  score: number;
  blockers: string[];
  warnings: string[];
  suggestions: string[];
  completedCategories: {
    identity: number;
    experience: number;
    experienceOrProjects?: number;
    education: number;
    educationOrNotApplicable?: number;
    skills: number;
    professionalProfile: number;
    careerIntent: number;
    resumeWritingSignals: number;
    resumeWritingPreferences?: number;
    qualityAndConfirmation?: number;
  };
}

// ─── Stored Message ──────────────────────────────────────────────────────────

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
  questionKey?: string;
  cards?: DisplayCard[];
  pills?: Pill[];
}

export interface OnboardingTurnPayload {
  stage: OnboardingPhase;
  message?: string;
  question?: OnboardingQuestion | null;
  cards?: DisplayCard[];
  profilePreview?: unknown;
  readiness?: ProfileReadiness;
  hardMinimumMet?: boolean;
}

export type ProfileDraft = Partial<ProfileNormalized> & {
  professionalIdentities?: string[];
  careerDirection?: "same" | "slight_shift" | "major_switch" | "not_sure";
  interestedRoles?: string[];
  preferredMarkets?: string[];
  workPreference?: "remote" | "hybrid" | "onsite" | "open";
  seniorityComfort?: string[];
  industriesOfInterest?: string[];
  emphasisAreas?: string[];
  deEmphasisAreas?: string[];
  toneSignals?: string[];
};

// ─── Session State ───────────────────────────────────────────────────────────

export interface SessionState {
  id: string;
  userId: string;
  responseChainId: string | null;
  profile: UserCareerProfile;
  meta: OnboardingMeta;
  messages: StoredMessage[];
  turnCount: number;
  version: number;
  status: "draft" | "ready" | "completed";
  resumeFileHash?: string | null;
  extractionStatus?: "pending" | "processing" | "done" | "failed" | null;
  completedAt?: string | null;
}
