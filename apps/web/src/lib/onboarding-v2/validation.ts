// Onboarding V2 — File & Input Validation

import {
  ALLOWED_MIME_TYPES,
  MAGIC_BYTES,
  MAX_FILE_SIZE_BYTES,
  MAX_USER_INPUT_CHARS,
  UPLOAD_ERROR_MESSAGES,
  type UploadErrorCode,
} from "./constants";

export interface FileValidationResult {
  valid: boolean;
  error?: { code: UploadErrorCode; message: string };
  detectedType: string | null;
}

export function validateUploadedFile(file: File, headerBytes: Uint8Array): FileValidationResult {
  // 1. Size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: { code: "too_large", message: UPLOAD_ERROR_MESSAGES.too_large },
      detectedType: null,
    };
  }

  // 2. Magic byte detection
  const detected = detectFileType(headerBytes);

  // 3. Image detection
  if (detected === "jpeg" || detected === "png") {
    return {
      valid: false,
      error: { code: "image_file", message: UPLOAD_ERROR_MESSAGES.image_file },
      detectedType: detected,
    };
  }

  // 4. Check allowed types
  const mimeType = file.type || mimeFromDetected(detected);
  const isAllowed =
    (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType) ||
    detected === "pdf" ||
    detected === "docx" ||
    detected === "rtf";

  if (!isAllowed) {
    return {
      valid: false,
      error: { code: "unsupported_type", message: UPLOAD_ERROR_MESSAGES.unsupported_type },
      detectedType: detected,
    };
  }

  return { valid: true, detectedType: detected };
}

function detectFileType(bytes: Uint8Array): string | null {
  if (matchesBytes(bytes, MAGIC_BYTES.pdf)) return "pdf";
  if (matchesBytes(bytes, MAGIC_BYTES.docx)) return "docx";
  if (matchesBytes(bytes, MAGIC_BYTES.rtf)) return "rtf";
  if (matchesBytes(bytes, MAGIC_BYTES.jpeg)) return "jpeg";
  if (matchesBytes(bytes, MAGIC_BYTES.png)) return "png";
  return null;
}

function matchesBytes(data: Uint8Array, signature: readonly number[]): boolean {
  if (data.length < signature.length) return false;
  return signature.every((byte, i) => data[i] === byte);
}

function mimeFromDetected(detected: string | null): string {
  switch (detected) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "rtf":
      return "application/rtf";
    default:
      return "application/octet-stream";
  }
}

// --- Input sanitization ---

export function sanitizeUserInput(input: string): string {
  let sanitized = input.slice(0, MAX_USER_INPUT_CHARS);
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /you\s+are\s+now\s+a/gi,
    /system\s*:\s*/gi,
    /\[INST\]/gi,
    /<<SYS>>/gi,
  ];
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "[filtered]");
  }
  return sanitized.trim();
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[<>:"|?*]/g, "_")
    .slice(0, 255);
}
