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
import { extractDocumentText } from "@/lib/profile-domain/extractors/document-text-extractor";
import { detectAbuse } from "@/lib/profile-domain/extractors/abuse-heuristics";
import { classifyResumeContent } from "@/lib/profile-domain/extractors/content-classifier";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import { scrubPii } from "@/lib/onboarding/pii";
import { getOrCreateSession, saveSession } from "@/lib/onboarding/session-store";
import { calculateProfileReadiness } from "@/lib/onboarding/readiness";
import { planNextQuestion } from "@/lib/onboarding/planner";
import { emptyParseQuality } from "@/lib/onboarding/career-profile.schema";
import { applyExtractedProfile, calculateParseQuality } from "@/lib/onboarding/apply-extracted-profile";
import {
  computeContentHash,
  createIngestion,
  findIngestionByHash,
  updateIngestionResult,
} from "@/lib/profile-domain/repositories/resume-ingestion-repository";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ParseQuality } from "@/lib/onboarding/types";

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

    // ── P0.4: Abuse detection (DoS protection) ──────────────────────────
    let rawText = "";
    try {
      rawText = await extractDocumentText({ filename: file.name, mediaType, buffer });
    } catch {
      // Text extraction failure is non-fatal here; the extractor will use file mode
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
      payload: { filename: file.name, mediaType, sizeBytes: file.size, contentHash },
    });

    const stored = await getOrCreateSession(session.userId);
    let ingestionId: string | null = null;
    let extracted: Record<string, unknown> | null = null;
    let reusedExtraction = false;
    const existingIngestion = await findIngestionByHash(session.userId, contentHash);
    if (existingIngestion?.status === "ready" && existingIngestion.extractedProfileJson) {
      extracted = JSON.parse(existingIngestion.extractedProfileJson) as Record<string, unknown>;
      // Apply any existing profile fields as merge hints to the cached extraction
      // (e.g., user already provided identity info via chat before re-uploading)
      const existingProfile = stored.profile as unknown as Record<string, unknown>;
      if (existingProfile) {
        applyMergeHintToCached(extracted, existingProfile);
      }
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
function applyMergeHintToCached(extracted: Record<string, unknown>, existingProfile: Record<string, unknown>) {
  const identity = existingProfile.identity as Record<string, { value?: unknown; confirmed?: boolean }> | undefined;
  if (!identity) return;
  // Only override extracted fields with user-confirmed values
  for (const key of ["fullName", "email", "phone", "location", "linkedin", "github", "portfolio", "website"] as const) {
    const field = identity[key];
    if (field?.confirmed && field.value) {
      (extracted as Record<string, unknown>)[key] = field.value;
    }
  }
}
