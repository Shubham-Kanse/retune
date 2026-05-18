// Onboarding V2 — Stage 2: Dual LLM Extraction

import { SUMMARY_MIN_WORDS } from "../constants";
import { NonResumeError } from "../errors";
import { callLLM, callLLMStructured } from "../llm/calls";
import {
  stripPIIFromExtraction,
  truncateForContext,
  verifyExtractionAgainstSource,
} from "../llm/guardrails";
import { INFERRED_SUMMARY_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { Confidence, ExtractionSchema, OnboardingV2Session } from "../types";

export interface DualExtractionResult {
  pureExtraction: ExtractionSchema | null;
  pureExtractionConfidence: Confidence | null;
  inferredSummary: string | null;
  inferredSummaryStatus: "success" | "failed" | "low_quality";
  summaryQuality: Confidence | null;
  nonResumeDetected: boolean;
}

export async function runDualExtraction(
  session: OnboardingV2Session,
): Promise<DualExtractionResult> {
  const sourceText = session.extraction.raw_text;
  if (!sourceText) throw new NonResumeError();
  const rawText = truncateForContext(sourceText);
  const schemaMapping = session.extraction.schema_mapping_object;

  // --- Fire Call A and Call B in parallel ---
  const callAPromise = callPureExtraction(rawText, schemaMapping);
  const callBPromise = callInferredSummary(rawText, schemaMapping);

  const [callAResult, callBResult] = await Promise.allSettled([callAPromise, callBPromise]);

  // --- Process Call A result ---
  let extraction: ExtractionSchema | null = null;
  let confidence: Confidence | null = null;

  if (callAResult.status === "fulfilled" && callAResult.value) {
    extraction = callAResult.value.extraction;
    confidence = callAResult.value.confidence;
    // Verify against source text
    const verification = verifyExtractionAgainstSource(extraction, sourceText);
    if (!verification.verified) {
      console.warn("[onboarding] Suspicious extraction fields:", verification.suspiciousFields);
    }
    // Non-resume detection — only when we have a real LLM extraction, not a fallback
    if (!isLikelyResume(extraction)) {
      return {
        pureExtraction: null,
        pureExtractionConfidence: null,
        inferredSummary: null,
        inferredSummaryStatus: "failed",
        summaryQuality: null,
        nonResumeDetected: true,
      };
    }
  } else if (schemaMapping) {
    // Fallback to Stage 1 schema mapping — skip non-resume check, proceed optimistically
    extraction = schemaMapping;
    confidence = "medium";
  }

  // --- Process Call B result ---
  let summary: string | null = null;
  let summaryStatus: "success" | "failed" | "low_quality" = "failed";
  let summaryQuality: Confidence | null = null;

  if (callBResult.status === "fulfilled" && callBResult.value) {
    summary = callBResult.value.summary;
    summaryQuality = callBResult.value.quality;
    summaryStatus = summaryQuality === "low" ? "low_quality" : "success";
  }

  return {
    pureExtraction: extraction,
    pureExtractionConfidence: confidence,
    inferredSummary: summary,
    inferredSummaryStatus: summaryStatus,
    summaryQuality,
    nonResumeDetected: false,
  };
}

// Exact JSON schema for structured extraction — model MUST return this shape.
// Using OpenAI strict mode: no field name guessing, no regex, no normalization needed.
const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    identity: {
      type: "object",
      additionalProperties: false,
      properties: {
        full_name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        linkedin_url: { type: ["string", "null"] },
        github_url: { type: ["string", "null"] },
        portfolio_url: { type: ["string", "null"] },
      },
      required: ["full_name", "email", "phone", "location", "linkedin_url", "github_url", "portfolio_url"],
    },
    professional_summary: { type: ["string", "null"] },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: ["string", "null"] },
          start_date: { type: "string" },
          end_date: { type: "string" },
          is_current: { type: "boolean" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["title", "company", "location", "start_date", "end_date", "is_current", "bullets"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          institution: { type: "string" },
          degree: { type: "string" },
          field: { type: ["string", "null"] },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
          gpa: { type: ["string", "null"] },
          honours: { type: ["string", "null"] },
        },
        required: ["institution", "degree", "field", "start_date", "end_date", "gpa", "honours"],
      },
    },
    skills: { type: "array", items: { type: "string" } },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          url: { type: ["string", "null"] },
        },
        required: ["name", "description", "technologies", "url"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          issuer: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
        },
        required: ["name", "issuer", "date"],
      },
    },
    languages: { type: "array", items: { type: "string" } },
    awards: { type: "array", items: { type: "string" } },
    publications: { type: "array", items: { type: "string" } },
    volunteering: { type: "array", items: { type: "string" } },
    extraction_confidence: { type: "string", enum: ["high", "medium", "low"] },
    extraction_notes: { type: "string" },
  },
  required: [
    "identity", "professional_summary", "experience", "education", "skills",
    "projects", "certifications", "languages", "awards", "publications",
    "volunteering", "extraction_confidence", "extraction_notes",
  ],
} as const;

interface StructuredExtraction {
  identity: { full_name: string | null; email: string | null; phone: string | null; location: string | null; linkedin_url: string | null; github_url: string | null; portfolio_url: string | null };
  professional_summary: string | null;
  experience: Array<{ title: string; company: string; location: string | null; start_date: string; end_date: string; is_current: boolean; bullets: string[] }>;
  education: Array<{ institution: string; degree: string; field: string | null; start_date: string | null; end_date: string | null; gpa: string | null; honours: string | null }>;
  skills: string[];
  projects: Array<{ name: string; description: string; technologies: string[]; url: string | null }>;
  certifications: Array<{ name: string; issuer: string | null; date: string | null }>;
  languages: string[];
  awards: string[];
  publications: string[];
  volunteering: string[];
  extraction_confidence: "high" | "medium" | "low";
  extraction_notes: string;
}

const STRUCTURED_EXTRACTION_PROMPT = `You are a precise resume extraction engine. Extract every field from the resume text exactly as written. 

CRITICAL RULES:
- bullets[]: split experience descriptions into individual bullet points. Each bullet is one sentence/achievement. Strip leading bullet chars (•, -, *).
- skills[]: flat array of individual skill strings. No categories, no grouping.
- Return null for absent fields, empty arrays [] for absent lists.
- Dates: use the format as written (e.g. "May 2021", "2019").
- linkedin_url/github_url/portfolio_url: only include if a real URL or profile path is present. Null if just a label like "LinkedIn".
- Do NOT include national IDs, passport numbers, or dates of birth.`;

async function callPureExtraction(
  rawText: string,
  _schemaMapping: ExtractionSchema | null,
): Promise<{ extraction: ExtractionSchema; confidence: Confidence } | null> {
  try {
    const result = await callLLMStructured<StructuredExtraction>({
      systemPrompt: STRUCTURED_EXTRACTION_PROMPT,
      userMessage: `Extract this resume:\n\n${rawText}`,
      model: "smart",
      temperature: 0,
      maxTokens: 8192,
      stage: 2,
      callName: "pure_extraction",
      schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "resume_extraction",
    });

    // Map structured output directly to ExtractionSchema — no normalization needed
    const extraction: ExtractionSchema = {
      identity: result.identity,
      professional_summary: result.professional_summary,
      experience: result.experience.map(e => ({
        title: e.title,
        company: e.company,
        location: e.location,
        start_date: e.start_date,
        end_date: e.end_date,
        is_current: e.is_current,
        bullets: e.bullets,
      })),
      education: result.education.map(e => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        start_date: e.start_date,
        end_date: e.end_date,
        gpa: e.gpa,
        honours: e.honours,
      })),
      skills: { raw_list: result.skills, grouped: {} },
      projects: result.projects.map(p => ({
        name: p.name,
        description: p.description,
        technologies: p.technologies,
        url: p.url,
      })),
      certifications: result.certifications,
      languages: result.languages,
      awards: result.awards,
      publications: result.publications,
      volunteering: result.volunteering,
      extraction_confidence: result.extraction_confidence,
      extraction_notes: result.extraction_notes,
    } as unknown as ExtractionSchema;

    const cleaned = stripPIIFromExtraction(extraction);
    return { extraction: cleaned, confidence: result.extraction_confidence };
  } catch {
    return null;
  }
}

async function callInferredSummary(
  rawText: string,
  schemaMapping: ExtractionSchema | null,
): Promise<{ summary: string; quality: Confidence } | null> {
  try {
    const result = await callLLM({
      systemPrompt: INFERRED_SUMMARY_SYSTEM_PROMPT,
      userMessage: `Raw resume text:\n---\n${rawText}\n---\n\nStructured extraction:\n${schemaMapping ? JSON.stringify(schemaMapping, null, 2) : "Not yet available"}`,
      model: "smart",
      temperature: 0.3,
      maxTokens: 1024,
      stage: 2,
      callName: "inferred_summary",
    });

    let summary = result.content.trim();
    let quality = assessSummaryQuality(summary);

    if (quality === "low") {
      // Retry with more directive prompt
      const retry = await callLLM({
        systemPrompt: `${INFERRED_SUMMARY_SYSTEM_PROMPT}\n\nIMPORTANT: Be more specific. Name actual companies, technologies, and achievements. Do not use generic filler.`,
        userMessage: `Raw resume text:\n---\n${rawText}\n---`,
        model: "smart",
        temperature: 0.4,
        maxTokens: 1024,
        stage: 2,
        callName: "inferred_summary_retry",
      });
      summary = retry.content.trim();
      quality = assessSummaryQuality(summary);
    }

    return { summary, quality };
  } catch {
    return null;
  }
}

export async function applyDualExtraction(
  userId: string,
  result: DualExtractionResult,
): Promise<void> {
  if (result.nonResumeDetected) {
    await updateSession(userId, {
      extraction: { raw_text: null, raw_text_character_count: 0 },
      onboarding_status: "awaiting_upload",
    });
    throw new NonResumeError();
  }

  await updateSession(userId, {
    dual_extraction: {
      pure_extraction: result.pureExtraction,
      pure_extraction_confidence: result.pureExtractionConfidence,
      inferred_summary: result.inferredSummary,
      inferred_summary_status: result.inferredSummaryStatus,
      summary_quality: result.summaryQuality,
    },
    extraction: { extraction_quality: result.pureExtractionConfidence },
    onboarding_status: "dual_extraction_complete",
  });
}
function isLikelyResume(extraction: ExtractionSchema): boolean {
  let signals = 0;
  if (extraction.identity?.full_name) signals++;
  if ((extraction.experience?.length ?? 0) > 0) signals++;
  if ((extraction.education?.length ?? 0) > 0) signals++;
  if ((extraction.skills?.raw_list?.length ?? 0) > 0) signals++;
  // Require only 2 signals — schema mapping may run before experience/skills are populated
  return signals >= 2;
}

function assessSummaryQuality(summary: string): Confidence {
  const wordCount = summary.split(/\s+/).length;
  if (wordCount < 50) return "low";
  if (wordCount < SUMMARY_MIN_WORDS) return "medium";
  const genericPhrases = [
    "experience in software",
    "worked in technology",
    "various projects",
    "multiple companies",
  ];
  const genericCount = genericPhrases.filter((p) => summary.toLowerCase().includes(p)).length;
  if (genericCount >= 2) return "low";
  return "high";
}

function validateExtraction(parsed: unknown): {
  valid: boolean;
  result: ExtractionSchema | null;
  errors: string[];
} {
  if (!parsed || typeof parsed !== "object")
    return { valid: false, result: null, errors: ["Not an object"] };
  const obj = parsed as Record<string, unknown>;
  if (!["high", "medium", "low"].includes(obj.extraction_confidence as string)) {
    return { valid: false, result: null, errors: ["Invalid extraction_confidence"] };
  }
  return { valid: true, result: parsed as ExtractionSchema, errors: [] };
}
