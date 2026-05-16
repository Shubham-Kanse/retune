import { withAuth } from "@/lib/api-handler";
import { importResumeAndPersist } from "@/lib/profile-domain/services/resume-import-orchestrator";
import { triggerInitialUnderstandingGeneration } from "@/lib/career-understanding/auto-generate";
import {
  assertValidResumeFile,
  readAndValidateResumeFile,
  ResumeFileValidationError,
} from "@/lib/profile-domain/utils/resume-file";
import { extractDocumentText } from "@/lib/profile-domain/extractors/document-text-extractor";
import { detectAbuse } from "@/lib/profile-domain/extractors/abuse-heuristics";
import { classifyResumeContent } from "@/lib/profile-domain/extractors/content-classifier";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import { scrubPii } from "@/lib/onboarding/pii";
import { computeContentHash } from "@/lib/profile-domain/repositories/resume-ingestion-repository";
import { extractProfileFromResumeFile } from "@/lib/profile-domain/extractors/openai-resume-extractor";
import { getProfileByUserId } from "@/lib/profile-domain/repositories/profile-repository";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

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

  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dryRun = formData.get("dryRun") === "true";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    assertValidResumeFile(file);

    const { buffer, mediaType } = await readAndValidateResumeFile(file);
    const contentHash = computeContentHash(buffer);

    // ── P0.4: Abuse detection (DoS protection) ──────────────────────────
    let rawText = "";
    try {
      rawText = await extractDocumentText({ filename: file.name, mediaType, buffer });
    } catch {
      // Non-fatal; extractor will use file mode
    }

    if (rawText.length > 0) {
      const abuse = detectAbuse({ buffer, rawText });
      if (abuse.rejected) {
        await logOnboardingEvent({
          userId: session.userId,
          eventType: "security.abuse_detected",
          traceId,
          payload: scrubPii({ filename: file.name, reason: abuse.reason, flags: abuse.flags }),
        });
        return NextResponse.json({ error: abuse.reason }, { status: 422 });
      }

      // ── P0.1: Content classification gate ───────────────────────────────
      const classification = classifyResumeContent({ rawText, filename: file.name });
      if (!classification.isResume && classification.rejectReason) {
        await logOnboardingEvent({
          userId: session.userId,
          eventType: "security.classification_rejected",
          traceId,
          payload: scrubPii({
            filename: file.name,
            detectedType: classification.detectedType,
            confidence: classification.confidence,
            safetyFlags: classification.safetyFlags,
          }),
        });
        return NextResponse.json({ error: classification.rejectReason }, { status: 422 });
      }
    }

    await logOnboardingEvent({
      userId: session.userId,
      eventType: "resume_upload_started",
      traceId,
      payload: { filename: file.name, mediaType, sizeBytes: file.size, contentHash, source: "profile_upload" },
    });

    if (dryRun) {
      // Extract without persisting — return preview for diff
      const existing = await getProfileByUserId(session.userId);
      const { extracted } = await extractProfileFromResumeFile({
        filename: file.name,
        mediaType,
        buffer,
        existingProfile: existing,
      });

      if (!extracted) {
        await logOnboardingEvent({
          userId: session.userId,
          eventType: "resume_upload_failed",
          traceId,
          durationMs: Date.now() - startedAt,
          errorCode: "extraction_failed",
          payload: { filename: file.name, contentHash, source: "profile_upload" },
        });
        return NextResponse.json({ error: "Could not extract profile from resume" }, { status: 422 });
      }

      const parseQuality = computeParseQuality(extracted, mediaType);

      await logOnboardingEvent({
        userId: session.userId,
        eventType: "resume_upload_succeeded",
        traceId,
        durationMs: Date.now() - startedAt,
        payload: { dryRun: true, parseQuality: parseQuality.score, contentHash, source: "profile_upload" },
      });

      return NextResponse.json({
        dryRun: true,
        extracted,
        parseQuality,
        currentProfile: existing,
      });
    }

    // Full import with persistence
    const result = await importResumeAndPersist({
      file,
      source: "profile_upload",
      session,
      markOnboardingCompleted: true,
      saveConversation: false,
    });

    const parseQuality = result.extracted ? computeParseQuality(result.extracted as unknown as Record<string, unknown>, mediaType) : null;

    await logOnboardingEvent({
      userId: session.userId,
      eventType: result.extracted ? "resume_upload_succeeded" : "resume_upload_failed",
      traceId,
      durationMs: Date.now() - startedAt,
      errorCode: result.extracted ? undefined : "extraction_failed",
      payload: {
        ingestionId: result.ingestionId,
        parseQuality: parseQuality?.score ?? null,
        contentHash,
        source: "profile_upload",
      },
    });

    if (!result.extracted) {
      return NextResponse.json({ error: "Could not extract profile from resume" }, { status: 422 });
    }

    // Auto-generate the initial career understanding in the background.
    // No-op if user already has a non-zero understanding revision.
    triggerInitialUnderstandingGeneration({ userId: session.userId });

    return NextResponse.json({
      profile: result.extracted,
      completenessScore: result.completenessScore,
      missingQuestions: result.missingQuestions,
      ingestionId: result.ingestionId,
      parseQuality,
    });
  } catch (error) {
    if (error instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    await logOnboardingEvent({
      userId: session.userId,
      eventType: "resume_upload_failed",
      traceId,
      durationMs: Date.now() - startedAt,
      errorCode: "internal_error",
      payload: { message: error instanceof Error ? error.message : "Unknown error", source: "profile_upload" },
    });
    console.error("[profile/import-resume] failed", error);
    return NextResponse.json({ error: "Failed to process resume. Please try again." }, { status: 500 });
  }
});

function computeParseQuality(data: Record<string, unknown>, mediaType: string) {
  const hasIdentity = Boolean(data.fullName || data.email);
  const hasExperience = Array.isArray(data.experience) && data.experience.length > 0;
  const hasEducation = Array.isArray(data.education) && data.education.length > 0;
  const skillSources: unknown[] = [
    data.skillsTier1, data.skillsTier2, data.skillsTier3,
    data.technicalSkills, data.tools, data.professionalSkills,
    data.methodologies, data.softSkills, data.domainSkills,
  ];
  const skillCount = skillSources.reduce<number>((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
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
  ].reduce((sum, v) => sum + v, 0)));
  return { score, weakAreas, hasIdentity, hasExperience, hasEducation, hasSkills, hasProjects };
}
