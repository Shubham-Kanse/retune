// Onboarding V2 — Stage 1: Resume Upload & Text Extraction

import {
  MIN_EXTRACTION_CHARS,
  NEAR_EMPTY_CHARS,
  SCHEMA_MAPPING_MAX_RETRIES,
  UPLOAD_ERROR_MESSAGES,
} from "../constants";
import { callLLMWithRetry } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import { SCHEMA_MAPPING_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { ExtractionSchema, OnboardingV2Session } from "../types";

export interface ExtractionResult {
  success: boolean;
  text: string | null;
  charCount: number;
  error?: {
    code: "password_protected" | "corrupted" | "scanned_pdf" | "empty_content";
    message: string;
  };
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  fileName = "resume",
): Promise<ExtractionResult> {
  try {
    let text: string;

    if (mimeType === "text/plain" || mimeType === "text/rtf" || mimeType === "application/rtf") {
      text = fileBuffer.toString("utf-8");
    } else {
      // Use existing document text extractor (Python subprocess for PDF/DOCX)
      const { extractDocumentText } = await import(
        "@/lib/profile-domain/extractors/document-text-extractor"
      );
      text = await extractDocumentText({
        filename: fileName,
        mediaType: mimeType,
        buffer: fileBuffer,
      });
    }

    const charCount = text.trim().length;

    if (charCount < NEAR_EMPTY_CHARS) {
      return {
        success: false,
        text: null,
        charCount,
        error: { code: "scanned_pdf", message: UPLOAD_ERROR_MESSAGES.scanned_pdf },
      };
    }
    if (charCount < MIN_EXTRACTION_CHARS) {
      return {
        success: false,
        text: null,
        charCount,
        error: { code: "empty_content", message: UPLOAD_ERROR_MESSAGES.empty_content },
      };
    }

    return { success: true, text: text.trim(), charCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("password") || msg.includes("encrypted")) {
      return {
        success: false,
        text: null,
        charCount: 0,
        error: { code: "password_protected", message: UPLOAD_ERROR_MESSAGES.password_protected },
      };
    }
    return {
      success: false,
      text: null,
      charCount: 0,
      error: { code: "corrupted", message: UPLOAD_ERROR_MESSAGES.corrupted },
    };
  }
}

export async function fireSchemaMapping(rawText: string, userId: string): Promise<void> {
  try {
    const result = await callLLMWithRetry(
      {
        systemPrompt: SCHEMA_MAPPING_SYSTEM_PROMPT,
        userMessage: `Raw resume text:\n\n${rawText}`,
        model: "fast",
        temperature: 0,
        maxTokens: 4096,
        stage: 1,
        callName: "schema_mapping",
      },
      SCHEMA_MAPPING_MAX_RETRIES,
    );

    const parsed = safeParseLLMJson<ExtractionSchema>(result.content, validateExtractionSchema);

    if (parsed.success) {
      await updateSession(userId, {
        extraction: { schema_mapping_status: "success", schema_mapping_object: parsed.data },
      });
    } else {
      await updateSession(userId, { extraction: { schema_mapping_status: "failed" } });
    }
  } catch {
    await updateSession(userId, { extraction: { schema_mapping_status: "failed" } });
  }
}

function validateExtractionSchema(parsed: unknown): {
  valid: boolean;
  result: ExtractionSchema | null;
  errors: string[];
} {
  if (!parsed || typeof parsed !== "object")
    return { valid: false, result: null, errors: ["Not an object"] };
  const obj = parsed as Record<string, unknown>;

  const errors: string[] = [];
  if (
    !obj.extraction_confidence ||
    !["high", "medium", "low"].includes(obj.extraction_confidence as string)
  ) {
    errors.push("Missing or invalid extraction_confidence");
  }
  if (!Array.isArray(obj.experience)) errors.push("experience must be array");
  if (!Array.isArray(obj.education)) errors.push("education must be array");

  if (errors.length > 0) return { valid: false, result: null, errors };

  return { valid: true, result: parsed as ExtractionSchema, errors: [] };
}

export function isStage1Complete(session: OnboardingV2Session): boolean {
  return (
    session.extraction.raw_text !== null &&
    session.extraction.raw_text_character_count >= MIN_EXTRACTION_CHARS &&
    session.extraction.extraction_method !== null &&
    session.onboarding_status === "extraction_complete"
  );
}
