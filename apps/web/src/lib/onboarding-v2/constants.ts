// Onboarding V2 — Constants & Thresholds

// --- File validation ---
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MIN_EXTRACTION_CHARS = 300;
export const NEAR_EMPTY_CHARS = 200;
export const MAX_UPLOAD_ATTEMPTS_BEFORE_PASTE = 3;
export const SLOW_CONNECTION_TIMEOUT_MS = 45_000;

// --- LLM call limits ---
export const SCHEMA_MAPPING_MAX_RETRIES = 2;
export const INFERENCE_MAX_RETRIES = 2;
export const CORRECTION_MAX_ROUNDS = 4;
export const VAGUE_ROUNDS_BEFORE_ESCAPE = 2;
export const COMMIT_MAX_RETRIES = 3;
export const LLM_CALL_TIMEOUT_MS = 60_000;
export const MAX_CALLS_PER_SESSION = 30;
export const MAX_COST_PER_SESSION_USD = 0.5;
export const MAX_CALLS_PER_MINUTE = 5;

// --- Content limits ---
export const LONG_RESUME_CHAR_LIMIT = 50_000;
export const VOICE_SAMPLE_MIN_WORDS = 30;
export const SUMMARY_MIN_WORDS = 100;
export const SESSION_VALIDITY_DAYS = 7;
export const MAX_USER_INPUT_CHARS = 5000;

// --- Valid vocabularies ---

export const VALID_INDUSTRIES = [
  "Fintech",
  "HealthTech",
  "SaaS B2B",
  "Gaming",
  "Developer Tools",
  "E-commerce",
  "AdTech",
  "Cybersecurity",
  "AI/ML Infrastructure",
  "Cloud Infrastructure",
  "EdTech",
  "LegalTech",
  "PropTech",
  "InsurTech",
  "Logistics/Supply Chain",
  "Media/Entertainment",
  "Telecommunications",
  "Automotive/Mobility",
  "Energy/CleanTech",
  "Government/Defense",
  "Consulting",
  "Agency",
] as const;

export const VALID_ROLE_FAMILIES = [
  "Backend Engineering",
  "Frontend Engineering",
  "Fullstack Engineering",
  "Mobile Engineering",
  "Data Engineering",
  "ML Engineering",
  "Platform/Infrastructure Engineering",
  "DevOps/SRE",
  "Security Engineering",
  "Engineering Management",
  "Technical Product Management",
  "Developer Relations",
  "QA/Testing Engineering",
] as const;

export const VALID_SENIORITIES = [
  "Entry Level",
  "Junior",
  "Mid-level",
  "Senior IC",
  "Staff/Principal IC",
  "Engineering Lead",
  "Engineering Manager",
  "Senior Manager",
  "Director+",
] as const;

export const VALID_COMPLETENESS_PATHS = [
  "standard",
  "new_grad",
  "career_changer",
  "contractor",
  "returning",
] as const;

// --- Allowed MIME types ---
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/rtf",
  "application/rtf",
] as const;

// --- Magic bytes for file type detection ---
export const MAGIC_BYTES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK\x03\x04 (ZIP)
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  rtf: [0x7b, 0x5c, 0x72, 0x74, 0x66], // {\rtf
} as const;

// --- Upload error messages (exact spec text) ---
export const UPLOAD_ERROR_MESSAGES = {
  image_file:
    "It looks like you uploaded an image — I need the actual resume file to read it properly. If you have it as a PDF or Word document, please upload that instead. If you only have it as an image, let me know and we can work around it.",
  too_large:
    "That file is a bit large for me to process. Resume files are usually well under 1MB — could you try compressing it or exporting a smaller version?",
  corrupted:
    "Something went wrong reading that file — it may be corrupted or in an unsupported format. Could you try re-exporting or re-saving it and uploading again?",
  password_protected:
    "That file appears to be password protected, so I can't read it. Could you remove the password protection and re-upload, or export an unprotected version?",
  empty_content:
    "That file didn't have much content in it — it may be a blank template or an incomplete draft. Is this the right file?",
  unsupported_type:
    "I wasn't able to read that file format. Could you try uploading a PDF or Word document instead?",
  scanned_pdf:
    "I wasn't able to read the text in that file — it looks like it might be a scanned image rather than a text-based PDF. Do you have a version where you can select and copy the text, or a Word document version?",
} as const;

export type UploadErrorCode = keyof typeof UPLOAD_ERROR_MESSAGES;
