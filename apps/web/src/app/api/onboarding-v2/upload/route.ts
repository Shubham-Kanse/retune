// POST: Handle file upload or pasted text, extract, fire schema mapping

import { trackOnboardingEvent } from "@/lib/onboarding-v2/analytics";
import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import {
  MAX_UPLOAD_ATTEMPTS_BEFORE_PASTE,
  MIN_EXTRACTION_CHARS,
} from "@/lib/onboarding-v2/constants";
import { NonResumeError } from "@/lib/onboarding-v2/errors";
import { loadSession, updateSession } from "@/lib/onboarding-v2/session";
import { extractTextFromFile, fireSchemaMapping } from "@/lib/onboarding-v2/stages/stage-1-upload";
import {
  applyDualExtraction,
  runDualExtraction,
} from "@/lib/onboarding-v2/stages/stage-2-extraction";
import { applyInference, runInference } from "@/lib/onboarding-v2/stages/stage-3-inference";
import { beginUpload, endUpload, isUploadAborted } from "@/lib/onboarding-v2/upload-debouncer";
import { sanitizeFileName, validateUploadedFile } from "@/lib/onboarding-v2/validation";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let session = await loadSession(userId);
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 400 });

  // Reject after commit — profile already saved.
  if (session.onboarding_status === "committed") {
    return NextResponse.json({ error: "already_committed" }, { status: 409 });
  }

  // Begin new upload — aborts any prior in-flight work for this user.
  const signal = beginUpload(userId);

  const contentType = req.headers.get("content-type") || "";
  let rawText: string;
  let fileName = "pasted_text.txt";
  let fileType = "text/plain";
  let fileSize = 0;
  let method: "file" | "paste" = "paste";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

      const attempts = (session.upload.upload_attempts || 0) + 1;
      trackOnboardingEvent({
        event: "onboarding_v2_upload_attempted",
        properties: { fileType: file.type, fileSizeBytes: file.size, attempt: attempts },
      });

      const headerBuffer = await file.slice(0, 8).arrayBuffer();
      const headerBytes = new Uint8Array(headerBuffer);
      const validation = validateUploadedFile(file, headerBytes);

      if (!validation.valid) {
        trackOnboardingEvent({
          event: "onboarding_v2_upload_failed",
          properties: { errorCode: validation.error?.code || "unknown", attempt: attempts },
        });
        await updateSession(userId, {
          upload: { ...session.upload, upload_attempts: attempts },
        });
        return NextResponse.json({
          success: false,
          error: validation.error,
          uploadAttempts: attempts,
          showPasteFallback: attempts >= MAX_UPLOAD_ATTEMPTS_BEFORE_PASTE,
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const extraction = await extractTextFromFile(
        buffer,
        file.type || validation.detectedType || "application/pdf",
      );

      if (isUploadAborted(signal)) {
        return NextResponse.json({
          success: false,
          error: { code: "superseded", message: "Replaced by a newer upload" },
        });
      }

      if (!extraction.success) {
        trackOnboardingEvent({
          event: "onboarding_v2_upload_failed",
          properties: {
            errorCode: extraction.error?.code || "extraction_failed",
            attempt: attempts,
          },
        });
        await updateSession(userId, {
          upload: { ...session.upload, upload_attempts: attempts },
        });
        return NextResponse.json({
          success: false,
          error: extraction.error,
          uploadAttempts: attempts,
          showPasteFallback: attempts >= MAX_UPLOAD_ATTEMPTS_BEFORE_PASTE,
        });
      }

      if (!extraction.text) {
        return NextResponse.json({
          success: false,
          error: {
            code: "extraction_failed",
            message: "I could not read enough text from that file.",
          },
          uploadAttempts: attempts,
          showPasteFallback: attempts >= MAX_UPLOAD_ATTEMPTS_BEFORE_PASTE,
        });
      }

      rawText = extraction.text;
      fileName = sanitizeFileName(file.name);
      fileType = file.type || "application/pdf";
      fileSize = file.size;
      method = "file";
    } else {
      const body = await req.json().catch(() => ({}));
      if (!body.pastedText || body.pastedText.trim().length < MIN_EXTRACTION_CHARS) {
        return NextResponse.json({
          success: false,
          error: {
            code: "empty_content",
            message: "Please paste at least a few paragraphs of your resume text.",
          },
        });
      }
      rawText = body.pastedText.trim();
      fileSize = rawText.length;
      trackOnboardingEvent({
        event: "onboarding_v2_upload_attempted",
        properties: {
          fileType: "text/plain",
          fileSizeBytes: fileSize,
          attempt: (session.upload.upload_attempts || 0) + 1,
        },
      });
    }

    if (isUploadAborted(signal)) {
      return NextResponse.json({
        success: false,
        error: { code: "superseded", message: "Replaced by a newer upload" },
      });
    }

    // Persist extraction
    await updateSession(userId, {
      upload: {
        file_name: fileName,
        file_type: fileType,
        file_size_bytes: fileSize,
        upload_timestamp: new Date().toISOString(),
        upload_attempts: (session.upload.upload_attempts || 0) + 1,
      },
      extraction: {
        raw_text: rawText,
        raw_text_character_count: rawText.length,
        extraction_method: method,
        schema_mapping_status: null,
        schema_mapping_object: null,
        extraction_quality: null,
      },
      onboarding_status: "extraction_complete",
    });

    trackOnboardingEvent({
      event: "onboarding_v2_upload_success",
      properties: { method, charCount: rawText.length },
    });

    // Fire schema mapping in background (non-blocking)
    fireSchemaMapping(rawText, userId).catch(() => {});

    // Auto-advance: run Stage 2 + Stage 3
    const extractedSession = await loadSession(userId);
    if (!extractedSession) return NextResponse.json({ error: "no_session" }, { status: 400 });
    session = extractedSession;
    const dualResult = await runDualExtraction(session);
    if (isUploadAborted(signal)) {
      return NextResponse.json({
        success: false,
        error: { code: "superseded", message: "Replaced by a newer upload" },
      });
    }
    await applyDualExtraction(userId, dualResult);
    trackOnboardingEvent({
      event: "onboarding_v2_extraction_complete",
      properties: {
        confidence: dualResult.pureExtractionConfidence || "low",
        schemaMapSuccess: session.extraction.schema_mapping_status === "success",
      },
    });

    const extractedAndMergedSession = await loadSession(userId);
    if (!extractedAndMergedSession)
      return NextResponse.json({ error: "no_session" }, { status: 400 });
    session = extractedAndMergedSession;
    const inferenceResult = await runInference(session);
    await applyInference(userId, inferenceResult);

    if (inferenceResult) {
      const ambiguities: string[] = [];
      if (inferenceResult.industry_ambiguous) ambiguities.push("industry");
      if (inferenceResult.role_family_ambiguous) ambiguities.push("role_family");
      if (inferenceResult.seniority_ambiguous) ambiguities.push("seniority");
      trackOnboardingEvent({
        event: "onboarding_v2_inference_complete",
        properties: {
          roleFamily: inferenceResult.role_family || "",
          seniority: inferenceResult.seniority || "",
          industry: inferenceResult.industry || "",
          ambiguities,
        },
      });
    }

    return NextResponse.json({ success: true, status: "inference_complete" });
  } catch (err) {
    if (err instanceof NonResumeError) {
      trackOnboardingEvent({
        event: "onboarding_v2_upload_failed",
        properties: { errorCode: "non_resume", attempt: session?.upload.upload_attempts || 0 },
      });
      return NextResponse.json({
        success: false,
        error: { code: "non_resume", message: err.userMessage },
      });
    }
    const current = await loadSession(userId);
    return NextResponse.json({
      success: true,
      status: current?.onboarding_status || "extraction_complete",
      partial: true,
    });
  } finally {
    endUpload(userId, signal);
  }
}
