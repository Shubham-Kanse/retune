/**
 * Shared product types — referenced by apps/web for profile editor,
 * onboarding, and resume rendering. These describe the *shape of the
 * profile JSON* (stored as text in `profiles.profile_markdown` and
 * structured fields like `experience`); they are not Drizzle table
 * types.
 */

export interface ExperienceEntry {
  company: string;
  title: string;
  titleForResume?: string;
  startDate: string;
  endDate: string | "present";
  description: string;
  metrics: MetricEntry[];
  tools: string[];
  teamSize?: number;
  client?: string;
  industry?: string;
}

export interface MetricEntry {
  metric: string;
  value: string;
  context: string;
  direction: "improved" | "reduced" | "achieved";
}

export interface EducationEntry {
  degree: string;
  institution: string;
  startDate: string;
  endDate: string;
  coursework?: string[];
  capstone?: string;
  status: "completed" | "in_progress";
}

export interface ProjectEntry {
  name: string;
  type: "university" | "personal" | "open-source";
  year: number;
  description: string;
  technologies: string[];
  role: string;
  keyMetric?: string;
}

export interface SkillEntry {
  name: string;
  evidence: string;
  years?: number;
}

export interface CandidateProfile {
  fullName: string;
  email: string;
  phone?: string;
  linkedin?: string;
  location: string;
  visaStatus?: string;
  relocationPreferences?: string[];
  targetRoles: string[];
  experienceLevel: "entry" | "early" | "mid" | "senior" | "staff";
  currentTitle?: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications?: string[];
  projects?: ProjectEntry[];
  skillsTier1: SkillEntry[];
  skillsTier2: SkillEntry[];
  skillsTier3: SkillEntry[];
  voiceNotes?: string;
}

export type ApplicationStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";

export type PipelineStep =
  | "company_research"
  | "jd_analysis"
  | "resume_writing"
  | "ats_optimization"
  | "quality_gate"
  | "document_generation"
  | "cover_letter"
  | "application_strategy";

export type Plan = "free" | "pro";
export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "expired";
