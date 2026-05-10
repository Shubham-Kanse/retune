import { z } from "zod";

export const JDAnalysisSchema = z.object({
  roleName: z.string().min(1, "Role name is required"),
  rawJdText: z.string().min(50, "JD text too short — may be truncated"),
  requiredKeywords: z.array(z.string()).min(1, "At least one required keyword expected"),
  preferredKeywords: z.array(z.string()),
  mustHaveRequirements: z.array(z.string()),
  niceToHaveRequirements: z.array(z.string()),
  seniority: z.enum(["entry", "mid", "senior", "staff", "principal", "director", "vp"]),
  atsTier: z.object({
    t1: z.array(z.string()).min(1, "T1 keywords cannot be empty"),
    t2: z.array(z.string()),
    t3: z.array(z.string()),
  }),
  impliedKeywords: z.array(z.string()),
  teamStructure: z.string().optional(),
  culturalSignals: z.array(z.string()),
  tone: z.enum(["formal", "startup", "enterprise", "technical", "mission-driven"]).optional(),
  companyName: z.string().optional(),
});

export const CompanyIntelSchema = z.object({
  name: z.string(),
  overview: z.string(),
  cultureSignals: z.array(z.string()),
  techStack: z.array(z.string()),
  recentNews: z.string(),
  hiringContext: z.string(),
  industryTone: z.string(),
  calibrationNotes: z.string(),
});

export const BulletSchema = z.object({
  text: z.string(),
});

export const ExperienceEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  period: z.string(),
  bullets: z.array(BulletSchema),
});

export const SkillCategorySchema = z.object({
  label: z.string(),
  items: z.array(z.string()),
});

export const EducationEntrySchema = z.object({
  degree: z.string(),
  institution: z.string(),
  period: z.string(),
});

export const HeaderSchema = z.object({
  name: z.string(),
  title: z.string(),
  contact: z.string(),
});

export const QualityCheckSchema = z.object({
  check: z.string(),
  passed: z.boolean(),
});

export const ResumeDocumentSchema = z.object({
  header: HeaderSchema,
  summary: z.string(),
  experience: z.array(ExperienceEntrySchema),
  skills: z.object({
    categories: z.array(SkillCategorySchema),
  }),
  education: z.array(EducationEntrySchema),
  atsScore: z.number().nullable(),
  qualityChecks: z.array(QualityCheckSchema),
  markdownContent: z.string(),
});

export const CoverLetterSchema = z.object({
  header: z.string(),
  hook: z.string(),
  valueBridge: z.string(),
  close: z.string(),
  fullText: z.string(),
  wordCount: z.number(),
});

export const StarOutlineSchema = z.object({
  question: z.string(),
  starOutline: z.string(),
});

export const InterviewPrepSchema = z.object({
  behavioural: z.array(StarOutlineSchema),
  technical: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
});

export const TimelineItemSchema = z.object({
  day: z.number(),
  action: z.string(),
});

export const ApplicationStrategySchema = z.object({
  roleIntelligence: z.string(),
  referralQueries: z.array(z.string()),
  linkedInTemplate: z.string(),
  emailTemplate: z.string(),
  timeline: z.array(TimelineItemSchema),
  interviewPrep: InterviewPrepSchema,
  markdownContent: z.string(),
});

export const PipelineOutputSchema = z.object({
  jdAnalysis: JDAnalysisSchema,
  companyIntel: CompanyIntelSchema,
  resume: ResumeDocumentSchema,
  coverLetter: CoverLetterSchema,
  strategy: ApplicationStrategySchema,
});

export type JDAnalysis = z.infer<typeof JDAnalysisSchema>;
export type CompanyIntel = z.infer<typeof CompanyIntelSchema>;
export type Bullet = z.infer<typeof BulletSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type Header = z.infer<typeof HeaderSchema>;
export type QualityCheck = z.infer<typeof QualityCheckSchema>;
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;
export type CoverLetter = z.infer<typeof CoverLetterSchema>;
export type StarOutline = z.infer<typeof StarOutlineSchema>;
export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type ApplicationStrategy = z.infer<typeof ApplicationStrategySchema>;
export type PipelineOutput = z.infer<typeof PipelineOutputSchema>;

// ─── NEW SCHEMAS FOR MULTI-AGENT SYSTEM ───

export const GapItemSchema = z.object({
  field: z.string(),
  severity: z.enum(["hard", "soft"]),
  message: z.string(),
  suggestion: z.string(),
  exampleFormat: z.string().optional(),
});

export const GapReportSchema = z.object({
  canProceed: z.boolean(),
  completenessScore: z.number().min(0).max(100),
  hardGaps: z.array(GapItemSchema),
  softGaps: z.array(GapItemSchema),
  skippedSections: z.array(z.string()),
});

export const EvidenceLinkSchema = z.object({
  jdRequirement: z.string(),
  requirementTier: z.enum(["t1", "t2", "t3"]),
  experienceIndex: z.number(),
  company: z.string(),
  title: z.string(),
  supportingDescription: z.string(),
  supportingMetrics: z.array(
    z.object({
      metric: z.string(),
      value: z.string(),
      direction: z.string(),
    }),
  ),
  confidenceLevel: z.enum(["strong", "moderate", "weak"]),
  hasEvidence: z.boolean(),
});

export const EvidenceGapSchema = z.object({
  jdRequirement: z.string(),
  requirementTier: z.enum(["t1", "t2", "t3"]),
  gapNote: z.string(),
});

export const EvidenceMapSchema = z.object({
  evidenceLinks: z.array(EvidenceLinkSchema),
  evidenceGaps: z.array(EvidenceGapSchema),
  topAchievements: z.array(
    z.object({
      description: z.string(),
      metric: z.string(),
      relevantJdRequirements: z.array(z.string()),
    }),
  ),
  // z.record is not supported by OpenAI structured output (generates propertyNames).
  // Use an array of {role, requirements} pairs instead.
  roleToRequirementsMap: z.array(z.object({ role: z.string(), requirements: z.array(z.string()) })),
});

export const SummarySectionSchema = z.object({
  text: z.string(),
  wordCount: z.number(),
  keywordsIncluded: z.array(z.string()),
});

export const SkillsSectionSchema = z.object({
  categories: z.array(SkillCategorySchema),
  rawMarkdown: z.string(),
  t1KeywordsCovered: z.array(z.string()),
});

export const ExperienceBulletsOutputSchema = z.object({
  entries: z.array(ExperienceEntrySchema),
  bulletStructuresUsed: z.array(z.enum(["A", "B", "C", "D", "E"])),
});

export const QualityCheckResultSchema = z.object({
  check: z.string(),
  passed: z.boolean(),
  severity: z.enum(["critical", "high", "medium"]),
  detail: z.string().optional(),
  fixSuggestion: z.string().optional(),
});

export const QualityGateResultSchema = z.object({
  passed: z.boolean(),
  atsScore: z.number(),
  summaryWordCount: z.number(),
  bulletCount: z.number(),
  typeScriptChecks: z.array(QualityCheckResultSchema),
  aiChecks: z.array(QualityCheckResultSchema).optional(),
  failedChecks: z.array(QualityCheckResultSchema),
  warnings: z.array(QualityCheckResultSchema),
  weightedScore: z.number().optional(),
  grade: z.string().optional(),
  gradeBandLabel: z.string().optional(),
  gradeBandDescription: z.string().optional(),
});

export const DocxResultSchema = z.object({
  resumeDocxPath: z.string(),
  resumePdfPath: z.string().optional(),
  coverLetterDocxPath: z.string().optional(),
  success: z.boolean(),
  validateDocxOutput: z.string().optional(),
  errors: z.array(z.string()),
});

export type GapItem = z.infer<typeof GapItemSchema>;
export type GapReport = z.infer<typeof GapReportSchema>;
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;
export type EvidenceGap = z.infer<typeof EvidenceGapSchema>;
export type EvidenceMap = z.infer<typeof EvidenceMapSchema>;
export type SummarySection = z.infer<typeof SummarySectionSchema>;
export type SkillsSection = z.infer<typeof SkillsSectionSchema>;
export type ExperienceBulletsOutput = z.infer<typeof ExperienceBulletsOutputSchema>;
export type QualityCheckResult = z.infer<typeof QualityCheckResultSchema>;
export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;
export type DocxResult = z.infer<typeof DocxResultSchema>;
