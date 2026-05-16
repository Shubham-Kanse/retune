import type {
  ExperienceLevel,
  ImportSource,
  OnboardingStage,
  QuestionPriority,
  ResumeProcessingStatus,
} from "../enums";

export const PROFILE_CONTRACT_VERSION = "v1" as const;

export interface SkillEntry {
  name: string;
  evidence?: string;
  years?: number;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  titleForResume?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  metrics?: Array<{ metric?: string; value?: string; context?: string; direction?: string }>;
  tools?: string[];
  teamSize?: number;
  client?: string;
  industry?: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  coursework?: string[];
  capstone?: string;
}

export interface ProjectEntry {
  name?: string;
  type?: string;
  year?: number;
  description?: string;
  technologies?: string[];
  role?: string;
  keyMetric?: string;
  context?: string;
  tools?: string[];
  outcome?: string;
}

export interface ProfileNormalized {
  fullName: string;
  email: string;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  website: string | null;
  location: string;
  visaStatus: string | null;
  currentTitle: string | null;
  yearsOfExperience: number | null;
  professionalSummary: string | null;
  summarySignals: string[];
  domainExperience: string[];
  careerHighlights: string[];
  relocationPreferences: string[];
  targetRoles: string[];
  experienceLevel: ExperienceLevel;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: string[];
  projects: ProjectEntry[];
  languages: string[];
  awards: string[];
  publications: string[];
  volunteering: string[];
  technicalSkills: string[];
  tools: string[];
  methodologies: string[];
  softSkills: string[];
  domainSkills: string[];
  professionalSkills: string[];
  skillsTier1: SkillEntry[];
  skillsTier2: SkillEntry[];
  skillsTier3: SkillEntry[];
  voiceNotes: string | null;
  summary?: string;
}

export interface ProfilePersistInput {
  userId: string;
  sessionEmail: string;
  sessionFullName?: string | null;
  profile: Partial<ProfileNormalized> & Record<string, unknown>;
  markOnboardingCompleted: boolean;
}

export interface ResumeIngestionRecord {
  id: string;
  userId: string;
  source: ImportSource;
  status: ResumeProcessingStatus;
  stage: OnboardingStage;
  filename: string;
  sizeBytes: number;
  contentHash: string;
}

export interface ResumeImportResult {
  profile: ProfileNormalized;
  missingQuestions: MissingFieldQuestion[];
  completenessScore: number;
}

export interface MissingFieldQuestion {
  field:
    | "fullName"
    | "currentTitle"
    | "experienceLevel"
    | "location"
    | "targetRoles"
    | "experience"
    | "education"
    | "skills"
    | "summary";
  question: string;
  reason: string;
  priority: QuestionPriority;
  answerType: "text" | "single_select" | "multi_select" | "list";
}
