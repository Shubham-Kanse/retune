// ─── Profile Field Wrapper ────────────────────────────────────────────────────

export interface ProfileField<T> {
  value: T;
  source: "resume" | "user" | "ai_inferred" | "system";
  confidence: number;
  confirmed: boolean;
  lastUpdatedAt: string;
}

export function makeField<T>(value: T, source: ProfileField<T>["source"] = "system", confidence = 1): ProfileField<T> {
  return { value, source, confidence, confirmed: false, lastUpdatedAt: new Date().toISOString() };
}

export function emptyField<T>(defaultValue: T): ProfileField<T> {
  return { value: defaultValue, source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" };
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
  | "professional_identity"
  | "career_direction"
  | "role_interests"
  | "market_preferences"
  | "work_preferences"
  | "seniority_comfort"
  | "emphasis_preferences"
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
  recommended?: boolean;
}

export interface DisplayCard {
  type: "identity" | "experience" | "education" | "skill_group" | "project" | "certification";
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
  tools: string[];
  skills: string[];
  domain?: string;
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
}

export interface CertificationEntry { name: string; issuer: string; year?: string; }
export interface ProjectEntry { title: string; description: string; techStack?: string[]; link?: string; impact?: string; }

// ─── User Career Profile ─────────────────────────────────────────────────────

export interface UserCareerProfile {
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
  };

  professionalProfile: {
    currentTitles: ProfileField<string[]>;
    professionalIdentities: ProfileField<string[]>;
    yearsOfExperience: ProfileField<number>;
    domainExperience: ProfileField<string[]>;
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

  careerIntent: {
    interestedRoles: ProfileField<string[]>;
    careerDirection: ProfileField<"same" | "slight_shift" | "major_switch" | "not_sure" | "">;
    preferredMarkets: ProfileField<string[]>;
    workPreference: ProfileField<"remote" | "hybrid" | "onsite" | "open" | "">;
    seniorityComfort: ProfileField<string[]>;
    industriesOfInterest: ProfileField<string[]>;
  };

  resumeWritingPreferences: {
    emphasisAreas: ProfileField<string[]>;
    deEmphasisAreas: ProfileField<string[]>;
  };
}

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
  pendingTextInput?: PendingTextInput;
  enhancementTurns: number;
  resetCount: number;
}

export interface SkippedQuestion {
  questionKey: string;
  field: string;
  skippedAt: string;
}

export interface PendingTextInput {
  field: string;
  questionKey: string;
  expectedFormat: "name" | "email" | "phone" | "location" | "experience" | "education" | "skills" | "role" | "market" | "general_text";
}

// ─── Parse Quality ───────────────────────────────────────────────────────────

export interface ParseQuality {
  score: number;
  hasIdentity: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  hasSkills: boolean;
  weakAreas: string[];
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
    education: number;
    skills: number;
    professionalProfile: number;
    careerIntent: number;
    resumeWritingSignals: number;
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

// ─── Session State ───────────────────────────────────────────────────────────

export interface SessionState {
  id: string;
  userId: string;
  responseChainId: string | null;
  profile: UserCareerProfile;
  meta: OnboardingMeta;
  messages: StoredMessage[];
  turnCount: number;
}
