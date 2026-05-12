export const EXPERIENCE_LEVELS = ["entry", "early", "mid", "senior", "staff"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EDUCATION_STATUSES = ["completed", "in_progress"] as const;
export type EducationStatus = (typeof EDUCATION_STATUSES)[number];

export const ONBOARDING_STAGES = ["upload", "conversation", "complete", "skipped"] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export const IMPORT_SOURCES = ["onboarding_upload", "profile_upload", "manual_patch"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const RESUME_PROCESSING_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export type ResumeProcessingStatus = (typeof RESUME_PROCESSING_STATUSES)[number];

export const QUESTION_PRIORITIES = ["high", "medium", "low"] as const;
export type QuestionPriority = (typeof QUESTION_PRIORITIES)[number];
