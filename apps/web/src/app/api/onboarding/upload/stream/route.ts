/**
 * POST /api/onboarding/upload/stream
 *
 * SSE streaming variant of the upload route. Streams extraction tokens
 * to the client for real-time progress, then emits the final result.
 */
import { withAuth } from "@/lib/api-handler";
import { streamProfileExtraction } from "@/lib/profile-domain/extractors/openai-resume-extractor";
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
import { sseEvent, SSE_HEADERS } from "@/lib/onboarding/sse";
import {
  computeContentHash,
  createIngestion,
  findIngestionByHash,
  updateIngestionResult,
} from "@/lib/profile-domain/repositories/resume-ingestion-repository";
import { NextResponse } from "next/server";

export const POST = withAuth(async (request, session) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const { buffer, mediaType } = await readAndValidateResumeFile(file);
    const contentHash = computeContentHash(buffer);
    const traceId = crypto.randomUUID();
    const startedAt = Date.now();

    // ── P0.4: Abuse detection + P0.1: Content classification ────────────
    let rawText = "";
    try {
      rawText = await extractDocumentText({ filename: file.name, mediaType, buffer });
    } catch {
      // Non-fatal
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

    // Check for cached extraction
    const existingIngestion = await findIngestionByHash(session.userId, contentHash);
    if (existingIngestion?.status === "ready" && existingIngestion.extractedProfileJson) {
      // Return cached result as non-streaming JSON (instant)
      return NextResponse.json({
        ok: true,
        cached: true,
        ingestionId: existingIngestion.id,
      });
    }

    const ingestion = existingIngestion ?? await createIngestion({
      userId: session.userId,
      source: "onboarding_upload",
      filename: file.name,
      mediaType,
      sizeBytes: file.size,
      contentHash,
    });
    const ingestionId = ingestion?.id ?? null;

    // Stream SSE response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (data: string) => controller.enqueue(encoder.encode(data));

        write(sseEvent("extraction_stage", { stage: "reading" }));

        const gen = streamProfileExtraction({
          filename: file.name,
          mediaType,
          buffer,
          existingProfile: stored.profile as unknown as Record<string, unknown>,
        });

        let extracted: Record<string, unknown> | null = null;

        for await (const event of gen) {
          switch (event.type) {
            case "text_extracting":
              write(sseEvent("extraction_stage", { stage: "understanding" }));
              break;
            case "token":
              write(sseEvent("extraction_token", { delta: event.delta }));
              break;
            case "complete":
              extracted = event.extracted;
              write(sseEvent("extraction_stage", { stage: "organizing" }));
              break;
            case "error":
              write(sseEvent("extraction_error", { message: event.message }));
              controller.close();
              return;
          }
        }

        if (!extracted) {
          if (ingestionId) {
            await updateIngestionResult({
              id: ingestionId,
              status: "failed",
              stage: "upload",
              errorCode: "extraction_failed",
              errorDetail: "Model returned empty or invalid extraction",
            });
          }
          write(sseEvent("extraction_error", { message: "Could not extract profile from resume" }));
          controller.close();
          return;
        }

        if (ingestionId) {
          await updateIngestionResult({
            id: ingestionId,
            status: "ready",
            stage: "upload",
            extractedProfileJson: JSON.stringify(extracted),
          });
        }

        // Compute readiness
        const readiness = calculateProfileReadiness(stored.profile);
        const nextQuestion = planNextQuestion(stored.profile, stored.meta);

        await logOnboardingEvent({
          userId: session.userId,
          sessionId: stored.id,
          eventType: "resume_extraction_succeeded",
          traceId,
          phase: "resume_summary",
          durationMs: Date.now() - startedAt,
          payload: { filename: file.name, contentHash, keys: Object.keys(extracted) },
        });

        write(sseEvent("extraction_complete", {
          ok: true,
          ingestionId,
          readiness,
          nextQuestion,
          cards: nextQuestion?.cards ?? [],
        }));
        controller.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    if (err instanceof ResumeFileValidationError) {
      return NextResponse.json({ error: err.message }, { status: (err as any).status ?? 400 });
    }
    console.error("[onboarding/upload/stream]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
});
