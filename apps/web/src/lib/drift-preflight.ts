export const DRIFT_LEVEL_OPTIONS = [
  { value: "no", label: "No" },
  { value: "theory", label: "Theory only" },
  { value: "basic", label: "Basic knowledge" },
  { value: "hands_on", label: "Hands-on" },
  { value: "strong", label: "Yes (strong)" },
  { value: "similar_stack", label: "Similar tech stack" },
] as const;

export type DriftLevel = (typeof DRIFT_LEVEL_OPTIONS)[number]["value"];

export interface StructuredJd {
  role_title: string;
  must_have_skills: string[];
  good_to_have_skills: string[];
  inferred_skills: string[];
  responsibilities: string[];
  soft_skills: string[];
}

export interface DriftQuestion {
  skill: string;
  reason: "must_have" | "good_to_have" | "inferred";
  prompt: string;
  options: readonly DriftLevel[];
  why_flagged?: string;
}

export interface DriftSummary {
  severity: "none" | "slight" | "major";
  missing_must_have: string[];
  missing_good_to_have: string[];
  matched_skills: string[];
}

export interface PreflightDetectResponse {
  structured_jd: StructuredJd;
  jd_hash?: string;
  drift_summary: DriftSummary;
  questions: DriftQuestion[];
  profile_snapshot: {
    current_title: string;
    known_skills: string[];
  };
}

export interface DriftAnswer {
  skill: string;
  level: DriftLevel;
}

export interface PreflightResolveResponse {
  ok: true;
  updatedSkills: number;
  preflight_token: string;
}
