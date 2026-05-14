/**
 * POST /api/onboarding/upload
 *
 * Extracts structured profile fields from a resume file and persists the
 * extracted draft into the onboarding session.
 */
import { withAuth } from "@/lib/api-handler";
import { extractProfileFromResumeFile } from "@/lib/profile-domain/extractors/openai-resume-extractor";
import {
  readAndValidateResumeFile,
  ResumeFileValidationError,
} from "@/lib/profile-domain/utils/resume-file";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import { getOrCreateSession, saveSession } from "@/lib/onboarding/session-store";
import { calculateProfileReadiness } from "@/lib/onboarding/readiness";
import { planNextQuestion } from "@/lib/onboarding/planner";
import { attachFieldEdit, emptyParseQuality } from "@/lib/onboarding/career-profile.schema";
import {
  computeContentHash,
  createIngestion,
  findIngestionByHash,
  updateIngestionResult,
} from "@/lib/profile-domain/repositories/resume-ingestion-repository";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ParseQuality, ProfileEvidence, ProfileField } from "@/lib/onboarding/types";

// Per-user upload rate limit: 5 uploads per user per 10 minutes
const userUploadStore: Record<string, { count: number; resetTime: number }> = {};

function checkUserUploadRateLimit(userId: string): boolean {
  const windowMs = 10 * 60 * 1000;
  const limit = 5;
  const now = Date.now();
  const entry = userUploadStore[userId];
  if (!entry || now > entry.resetTime) {
    userUploadStore[userId] = { count: 1, resetTime: now + windowMs };
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export const POST = withAuth(async (request, session) => {
  // Per-IP rate limit: 20 uploads per IP per hour
  const { success: ipOk } = rateLimit(request as unknown as NextRequest, 20, 60 * 60 * 1000);
  if (!ipOk) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  // Per-user rate limit: 5 uploads per user per 10 minutes
  if (!checkUserUploadRateLimit(session.userId)) {
    return NextResponse.json({ error: "Too many uploads. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const { buffer, mediaType } = await readAndValidateResumeFile(file);
    const contentHash = computeContentHash(buffer);
    const traceId = crypto.randomUUID();
    const startedAt = Date.now();

    await logOnboardingEvent({
      userId: session.userId,
      eventType: "resume_upload_started",
      traceId,
      payload: { filename: file.name, mediaType, sizeBytes: file.size, contentHash },
    });

    const stored = await getOrCreateSession(session.userId);
    let ingestionId: string | null = null;
    let extracted: Record<string, unknown> | null = null;
    let reusedExtraction = false;
    const existingIngestion = await findIngestionByHash(session.userId, contentHash);
    if (existingIngestion?.status === "ready" && existingIngestion.extractedProfileJson) {
      extracted = JSON.parse(existingIngestion.extractedProfileJson) as Record<string, unknown>;
      ingestionId = existingIngestion.id;
      reusedExtraction = true;
    } else {
      const ingestion = existingIngestion ?? await createIngestion({
        userId: session.userId,
        source: "onboarding_upload",
        filename: file.name,
        mediaType,
        sizeBytes: file.size,
        contentHash,
      });
      ingestionId = ingestion?.id ?? null;

      const extractedResult = await extractProfileFromResumeFile({
        filename: file.name,
        mediaType,
        buffer,
        existingProfile: stored.profile as unknown as Record<string, unknown>,
      });
      extracted = extractedResult.extracted;

      if (!extracted) {
        if (ingestionId) {
          await updateIngestionResult({
            id: ingestionId,
            status: "failed",
            stage: "upload",
            errorCode: "extraction_failed",
            errorDetail: "Model returned an empty or invalid extraction payload",
          });
        }
        stored.meta.resumeUploaded = true;
        stored.meta.resumeParsed = false;
        stored.meta.extractionStatus = "failed";
        stored.extractionStatus = "failed";
        stored.profile.onboarding.resumeUploaded = true;
        stored.profile.onboarding.resumeParsed = false;
        stored.profile.onboarding.parseQuality = {
          ...emptyParseQuality(),
          warnings: ["Resume extraction failed. Ask the user to paste resume text or upload another file."],
        };
        await saveSession(session.userId, stored);
        await logOnboardingEvent({
          userId: session.userId,
          sessionId: stored.id,
          eventType: "resume_extraction_failed",
          traceId,
          durationMs: Date.now() - startedAt,
          errorCode: "extraction_failed",
          payload: { filename: file.name, contentHash },
        });
        return NextResponse.json({ error: "Could not extract profile from resume" }, { status: 422 });
      }

      if (ingestionId) {
        await updateIngestionResult({
          id: ingestionId,
          status: "ready",
          stage: "upload",
          extractedProfileJson: JSON.stringify(extracted),
        });
      }
    }

    const nextState = { ...stored };
    const parseQuality = calculateParseQuality(extracted, mediaType);
    applyExtractedProfile(nextState, extracted, parseQuality);
    nextState.meta = {
      ...nextState.meta,
      resumeUploaded: true,
      resumeParsed: true,
      extractionStatus: "done",
      resumeFileHash: contentHash,
      currentPhase: "resume_summary",
    };
    nextState.status = "draft";
    nextState.resumeFileHash = contentHash;
    nextState.extractionStatus = "done";
    nextState.profile.onboarding.resumeUploaded = true;
    nextState.profile.onboarding.resumeParsed = true;
    nextState.profile.onboarding.parseQuality = parseQuality;

    const readiness = calculateProfileReadiness(nextState.profile);
    nextState.profile.onboarding.readiness = readiness;
    const nextQuestion = planNextQuestion(nextState.profile, nextState.meta);
    await saveSession(session.userId, nextState);
    await logOnboardingEvent({
      userId: session.userId,
      sessionId: stored.id,
      eventType: reusedExtraction ? "resume_extraction_reused" : "resume_extraction_succeeded",
      traceId,
      phase: "resume_summary",
      durationMs: Date.now() - startedAt,
      payload: { filename: file.name, contentHash, keys: Object.keys(extracted ?? {}) },
    });

    return NextResponse.json({
      ok: true,
      ingestionId,
      parseQuality,
      readiness,
      nextQuestion,
      cards: nextQuestion?.cards ?? [],
      sessionSaved: true,
    });
  } catch (err) {
    if (err instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[onboarding/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
});

/**
 * Map the OpenAI resume extractor payload onto the in-session
 * `UserCareerProfile`. We persist **every** extracted field — summary,
 * certifications, projects, current title, target roles, experience level —
 * not just the ones the chat planner actively asks about. This is the single
 * point where data flows from the resume into the session; if a field is
 * dropped here it is lost for the rest of onboarding and the eventual
 * `persistProfile` call.
 */
function calculateParseQuality(data: Record<string, unknown>, mediaType: string): ParseQuality {
  const hasIdentity = Boolean(data.fullName || data.email);
  const hasExperience = Array.isArray(data.experience) && data.experience.length > 0;
  const hasEducation = Array.isArray(data.education) && data.education.length > 0;
  const skillSources: unknown[] = [
    data.skillsTier1,
    data.skillsTier2,
    data.skillsTier3,
    data.technicalSkills,
    data.tools,
    data.professionalSkills,
    data.methodologies,
    data.softSkills,
    data.domainSkills,
  ];
  const skillCount = skillSources.reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
  const hasSkills = skillCount >= 3;
  const hasProjects = Array.isArray(data.projects) && data.projects.length > 0;
  const weakAreas = [
    !hasIdentity ? "identity" : "",
    !hasExperience ? "experience" : "",
    !hasEducation ? "education" : "",
    !hasSkills ? "skills" : "",
  ].filter(Boolean);
  const score = Math.max(0, Math.min(100, [
    hasIdentity ? 20 : 0,
    hasExperience ? 30 : 0,
    hasEducation ? 10 : 0,
    hasSkills ? 25 : 0,
    hasProjects ? 10 : 0,
    5,
  ].reduce((sum, value) => sum + value, 0)));
  return {
    score,
    textExtractionMethod: mediaType.includes("pdf") ? "pdf_text" : mediaType.includes("word") ? "docx_text" : "openai_file",
    hasIdentity,
    hasExperience,
    hasEducation,
    hasSkills,
    hasProjects,
    weakAreas,
    warnings: weakAreas.length ? [`Weak extraction areas: ${weakAreas.join(", ")}`] : [],
  };
}

function applyExtractedProfile(
  stored: Awaited<ReturnType<typeof getOrCreateSession>>,
  data: Record<string, unknown>,
  parseQuality: ParseQuality,
) {
  const { profile } = stored;
  const now = new Date().toISOString();
  const evidenceFor = (quote?: unknown): ProfileEvidence[] => {
    const text = typeof quote === "string" ? quote.trim().slice(0, 500) : "";
    return [{ source: "resume_text", quote: text || undefined, confidence: 0.8 }];
  };
  const field = <T>(current: ProfileField<T>, value: T, confidence = 0.8, quote?: unknown) =>
    attachFieldEdit(current, value, {
      source: "resume",
      actor: "extractor",
      reason: "resume_extraction",
      confidence,
      confirmed: false,
      evidence: evidenceFor(quote),
    });
  const asStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const splitBullets = (text: string): string[] =>
    text
      .split(/\r?\n|•|◦|·|\u2022|\u2023|\u25E6|^\s*[-*]\s+/gm)
      .map((s) => s.trim())
      .filter(Boolean);

  // ── Identity ────────────────────────────────────────────────────────────
  if (data.fullName) profile.identity.fullName = field(profile.identity.fullName, asStr(data.fullName), 0.9, data.fullName);
  if (data.email) profile.identity.email = field(profile.identity.email, asStr(data.email), 0.9, data.email);
  if (data.phone) profile.identity.phone = field(profile.identity.phone, asStr(data.phone), 0.85, data.phone);
  if (data.location) profile.identity.location = field(profile.identity.location, asStr(data.location), 0.85, data.location);
  if (data.linkedin) profile.identity.linkedin = field(profile.identity.linkedin, asStr(data.linkedin), 0.85, data.linkedin);
  if (data.github) profile.identity.github = field(profile.identity.github, asStr(data.github), 0.85, data.github);
  if (data.portfolio) profile.identity.portfolio = field(profile.identity.portfolio, asStr(data.portfolio), 0.85, data.portfolio);
  if (data.website) profile.identity.website = field(profile.identity.website, asStr(data.website), 0.85, data.website);

  // ── Professional profile ────────────────────────────────────────────────
  if (data.currentTitle) profile.professionalProfile.currentTitles = field(profile.professionalProfile.currentTitles, [asStr(data.currentTitle)], 0.8, data.currentTitle);
  if (typeof data.yearsOfExperience === "number") {
    profile.professionalProfile.yearsOfExperience = field(profile.professionalProfile.yearsOfExperience, data.yearsOfExperience);
  } else if (typeof data.experienceLevel === "string") {
    const levelToYears: Record<string, number> = { entry: 0, early: 2, mid: 5, senior: 8, staff: 12 };
    const approx = levelToYears[data.experienceLevel];
    if (typeof approx === "number") profile.professionalProfile.yearsOfExperience = field(profile.professionalProfile.yearsOfExperience, approx, 0.45, data.experienceLevel);
  }
  if (Array.isArray(data.summarySignals)) profile.professionalProfile.summarySignals = field(profile.professionalProfile.summarySignals, data.summarySignals.map(asStr), 0.75);
  if (Array.isArray(data.domainExperience)) profile.professionalProfile.domainExperience = field(profile.professionalProfile.domainExperience, data.domainExperience.map(asStr), 0.75);
  if (Array.isArray(data.careerHighlights)) profile.professionalProfile.careerHighlights = field(profile.professionalProfile.careerHighlights, data.careerHighlights.map(asStr), 0.75);
  if (typeof data.professionalSummary === "string" && data.professionalSummary.trim()) {
    profile.professionalProfile.summarySignals = field(profile.professionalProfile.summarySignals, [data.professionalSummary.trim()], 0.7, data.professionalSummary);
  }

  // ── Experience ──────────────────────────────────────────────────────────
  if (Array.isArray(data.experience)) {
    profile.experience = field(profile.experience, data.experience.map((e: any, i: number) => {
      const responsibilities = Array.isArray(e.responsibilities) && e.responsibilities.length > 0
        ? e.responsibilities.map(asStr)
        : splitBullets(asStr(e.description));
      return {
        id: e.id ?? `exp-${i}`,
        title: asStr(e.title),
        company: asStr(e.company),
        location: e.location ? asStr(e.location) : undefined,
        startDate: e.startDate ? asStr(e.startDate) : undefined,
        endDate: e.endDate ? asStr(e.endDate) : "Present",
        isCurrent: Boolean(e.isCurrent),
        responsibilities,
        achievements: Array.isArray(e.achievements) ? e.achievements.map(asStr) : [],
        metrics: Array.isArray(e.metrics) ? e.metrics : [],
        tools: Array.isArray(e.tools) ? e.tools.map(asStr) : [],
        skills: Array.isArray(e.skills) ? e.skills.map(asStr) : [],
        domain: e.domain ? asStr(e.domain) : undefined,
        industry: e.industry ? asStr(e.industry) : undefined,
        teamSize: typeof e.teamSize === "number" ? e.teamSize : undefined,
        confidence: 0.8,
      };
    }), 0.8);
  }

  // ── Education ──────────────────────────────────────────────────────────
  if (Array.isArray(data.education)) {
    profile.education = field(profile.education, data.education.map((e: any, i: number) => ({
      id: e.id ?? `edu-${i}`,
      degree: asStr(e.degree),
      institution: asStr(e.institution),
      fieldOfStudy: e.fieldOfStudy ? asStr(e.fieldOfStudy) : undefined,
      startDate: e.startDate ? asStr(e.startDate) : undefined,
      endDate: e.endDate ? asStr(e.endDate) : undefined,
      graduationYear: asStr(e.graduationYear ?? e.endDate) || undefined,
      location: e.location ? asStr(e.location) : undefined,
      grade: e.grade ? asStr(e.grade) : undefined,
      coursework: Array.isArray(e.coursework) ? e.coursework.map(asStr) : [],
      capstone: e.capstone ? asStr(e.capstone) : undefined,
    })), 0.8);
  }

  // ── Skills ──────────────────────────────────────────────────────────────
  if (Array.isArray(data.skillsTier1)) profile.skills.technical = field(profile.skills.technical, extractSkillNames(data.skillsTier1));
  else if (Array.isArray(data.technicalSkills)) profile.skills.technical = field(profile.skills.technical, data.technicalSkills.map(asStr));
  else if (Array.isArray(data.skills)) profile.skills.technical = field(profile.skills.technical, data.skills.map(asStr));

  if (Array.isArray(data.skillsTier2)) profile.skills.tools = field(profile.skills.tools, extractSkillNames(data.skillsTier2));
  else if (Array.isArray(data.tools)) profile.skills.tools = field(profile.skills.tools, data.tools.map(asStr));

  if (Array.isArray(data.skillsTier3)) profile.skills.business = field(profile.skills.business, extractSkillNames(data.skillsTier3));
  else if (Array.isArray(data.professionalSkills)) profile.skills.business = field(profile.skills.business, data.professionalSkills.map(asStr));

  if (Array.isArray(data.softSkills)) profile.skills.softSkills = field(profile.skills.softSkills, data.softSkills.map(asStr));
  if (Array.isArray(data.methodologies)) profile.skills.methodologies = field(profile.skills.methodologies, data.methodologies.map(asStr));
  if (Array.isArray(data.domainSkills)) profile.skills.domainSkills = field(profile.skills.domainSkills, data.domainSkills.map(asStr));

  // ── Projects ────────────────────────────────────────────────────────────
  if (Array.isArray(data.projects)) {
    profile.projects = field(profile.projects, data.projects.map((p: any, i: number) => ({
      id: p.id ? asStr(p.id) : `project-${i}`,
      title: asStr(p.title ?? p.name),
      description: asStr(p.description),
      techStack: Array.isArray(p.techStack) ? p.techStack.map(asStr) : Array.isArray(p.technologies) ? p.technologies.map(asStr) : Array.isArray(p.tech) ? p.tech.map(asStr) : undefined,
      link: p.link ? asStr(p.link) : p.url ? asStr(p.url) : undefined,
      impact: p.impact ? asStr(p.impact) : p.keyMetric ? asStr(p.keyMetric) : undefined,
      role: p.role ? asStr(p.role) : undefined,
      year: p.year ? asStr(p.year) : undefined,
    })), 0.75);
  }

  // ── Certifications ─────────────────────────────────────────────────────
  if (Array.isArray(data.certifications)) {
    profile.certifications = field(profile.certifications, data.certifications.map((c: any, i: number) => {
      if (typeof c === "string") return { id: `cert-${i}`, name: c, issuer: "" };
      return {
        id: c.id ? asStr(c.id) : `cert-${i}`,
        name: asStr(c.name ?? c.title),
        issuer: asStr(c.issuer ?? c.organization ?? ""),
        year: c.year ? asStr(c.year) : c.date ? asStr(c.date) : undefined,
        expiresAt: c.expiresAt ? asStr(c.expiresAt) : undefined,
      };
    }), 0.75);
  }

  if (Array.isArray(data.languages)) profile.languages = field(profile.languages, data.languages.map(asStr), 0.75);
  if (Array.isArray(data.awards)) profile.awards = field(profile.awards, data.awards.map(asStr), 0.75);
  if (Array.isArray(data.publications)) profile.publications = field(profile.publications, data.publications.map(asStr), 0.75);
  if (Array.isArray(data.volunteering)) profile.volunteering = field(profile.volunteering, data.volunteering.map(asStr), 0.75);

  // ── Career intent ───────────────────────────────────────────────────────
  if (Array.isArray(data.targetRoles) && data.targetRoles.length > 0) {
    profile.careerIntent.interestedRoles = field(profile.careerIntent.interestedRoles, data.targetRoles.map(asStr), 0.55);
  }

  // ── Summary → emphasisAreas seed ────────────────────────────────────────
  if (typeof data.summary === "string" && data.summary.trim()) {
    profile.resumeWritingPreferences.emphasisAreas = field(profile.resumeWritingPreferences.emphasisAreas, [data.summary.trim()], 0.55, data.summary);
  } else if (typeof data.voiceNotes === "string" && data.voiceNotes.trim()) {
    profile.resumeWritingPreferences.emphasisAreas = field(profile.resumeWritingPreferences.emphasisAreas, [data.voiceNotes.trim()], 0.55, data.voiceNotes);
  }

  profile.onboarding.parseQuality = parseQuality;
  profile.updatedAt = now;
}

function extractSkillNames(values: unknown[]): string[] {
  return values
    .map((value) => {
      if (value && typeof value === "object" && "name" in value) {
        return String((value as { name?: unknown }).name ?? "");
      }
      return String(value ?? "");
    })
    .map((value) => value.trim())
    .filter(Boolean);
}
