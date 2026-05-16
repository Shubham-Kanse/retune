/**
 * P0.1 — Content classification gate (OWASP LLM01, A03, A04)
 *
 * Two-tier approach:
 *   Tier 1: Fast heuristic gate (no AI, synchronous)
 *   Tier 2: AI classifier (gpt-4.1-nano, only if Tier 1 is ambiguous)
 */

export interface ClassificationResult {
  isResume: boolean;
  confidence: number;
  detectedType: "resume" | "cover_letter" | "academic_cv" | "contract" | "other" | "prompt_injection" | "empty";
  rejectReason: string | null;
  safetyFlags: string[];
}

// ─── Prompt injection patterns ────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /(?:ignore|disregard|forget)\s+(?:previous|all|the above|prior)\s+(?:instructions?|prompts?|rules?)/i,
  /(?:system:|assistant:|<\|im_start\|>|<\|im_end\|>)/i,
  /\bjailbreak\b/i,
  /\byou are now\b/i,
  /\bact as\b.*\b(?:different|new)\b/i,
  /\bdo not follow\b.*\brules?\b/i,
  /\boverride\b.*\b(?:system|instructions?)\b/i,
  /\bpretend\b.*\b(?:you are|to be)\b/i,
  /\bDAN\b.*\bmode\b/i,
  /\bignore\b.*\babove\b/i,
];

// ─── Resume-likeness features ─────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
const DATE_RANGE_RE = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|20\d{2}|19\d{2})\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|20\d{2}|19\d{2}|present|current)/i;
const EDUCATION_RE = /\b(?:bachelor|master|phd|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba|university|college|degree|diploma)\b/i;
const EXPERIENCE_RE = /\b(?:experience|employment|work\s*history|professional\s*background|career)\b/i;
const JOB_TITLE_RE = /\b(?:engineer|developer|manager|analyst|designer|consultant|director|lead|architect|specialist|coordinator|intern)\b/i;

function shannonEntropy(text: string): number {
  const freq = new Map<string, number>();
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const len = text.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ─── Tier 1: Heuristic gate ──────────────────────────────────────────────────

export function classifyResumeContent(input: { rawText: string; filename: string }): ClassificationResult {
  const { rawText, filename } = input;
  const safetyFlags: string[] = [];

  // Empty / too short
  if (rawText.length < 200) {
    return {
      isResume: false,
      confidence: 0.95,
      detectedType: "empty",
      rejectReason: "Document is too short to be a valid resume (less than 200 characters of text).",
      safetyFlags: ["low_text_density"],
    };
  }

  // Shannon entropy check (catches repetitive/token-grinding content)
  const entropy = shannonEntropy(rawText.slice(0, 5000));
  if (entropy < 2.5) {
    safetyFlags.push("low_entropy");
  }

  // Prompt injection detection
  let injectionScore = 0;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(rawText)) {
      injectionScore++;
      safetyFlags.push("contains_instruction_keywords");
    }
  }
  if (injectionScore >= 3) {
    return {
      isResume: false,
      confidence: 0.9,
      detectedType: "prompt_injection",
      rejectReason: "Document contains patterns consistent with prompt injection attempts rather than resume content.",
      safetyFlags,
    };
  }

  // Resume-likeness scoring
  let resumeScore = 0;
  if (EMAIL_RE.test(rawText)) resumeScore++;
  if (PHONE_RE.test(rawText)) resumeScore++;
  if (DATE_RANGE_RE.test(rawText)) resumeScore++;
  if (EDUCATION_RE.test(rawText)) resumeScore++;
  if (EXPERIENCE_RE.test(rawText)) resumeScore++;
  if (JOB_TITLE_RE.test(rawText)) resumeScore++;

  // Filename heuristic
  const lowerFilename = filename.toLowerCase();
  if (/(?:resume|cv|curriculum)/i.test(lowerFilename)) resumeScore++;

  // Decision
  if (resumeScore >= 3) {
    // Likely a resume — pass with any injection flags noted
    return {
      isResume: true,
      confidence: Math.min(0.95, 0.5 + resumeScore * 0.1),
      detectedType: "resume",
      rejectReason: null,
      safetyFlags,
    };
  }

  if (resumeScore >= 1 && resumeScore < 3) {
    // Ambiguous — could be cover letter or other doc
    // In production, Tier 2 AI classifier would run here.
    // For now, allow with low confidence and flag.
    safetyFlags.push("low_resume_likeness");
    return {
      isResume: true,
      confidence: 0.4,
      detectedType: resumeScore >= 2 ? "resume" : "other",
      rejectReason: null,
      safetyFlags,
    };
  }

  // Very low resume-likeness
  safetyFlags.push("low_resume_likeness");
  return {
    isResume: false,
    confidence: 0.7,
    detectedType: "other",
    rejectReason: "Document does not appear to be a resume. It lacks typical resume features (contact info, work history, education).",
    safetyFlags,
  };
}

// ─── Tier 2: AI classifier (gpt-4.1-nano) ────────────────────────────────────

/**
 * Tier 2 AI classifier — invoked when Tier 1 is ambiguous (resume-likeness 1-2,
 * or injection markers detected alongside resume features).
 *
 * Uses gpt-4.1-nano with structured output, max 150 tokens, 5s timeout.
 * Fail-open: if AI errors, accepts the document (logs security event).
 */
export async function classifyWithAI(input: {
  rawText: string;
  filename: string;
  tier1Result: ClassificationResult;
}): Promise<ClassificationResult> {
  const { rawText, filename, tier1Result } = input;

  // Only invoke when Tier 1 is ambiguous
  if (tier1Result.confidence >= 0.7) return tier1Result;

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await client.chat.completions.create(
      {
        model: "gpt-4.1-nano",
        max_tokens: 150,
        messages: [
          { role: "system", content: "Classify the document type. Respond with JSON only: {\"is_resume\":bool,\"document_type\":\"resume\"|\"cover_letter\"|\"other\"|\"prompt_injection\",\"confidence\":0-1,\"reason\":\"brief\"}" },
          { role: "user", content: `Filename: "${filename}"\n\n${rawText.slice(0, 2000)}` },
        ],
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const text = response.choices[0]?.message?.content;
    if (!text) {
      console.warn("[content-classifier] AI returned empty, accepting document");
      return { ...tier1Result, safetyFlags: [...tier1Result.safetyFlags, "tier2_no_result"] };
    }

    const result = JSON.parse(text) as {
      is_resume?: boolean;
      document_type?: string;
      confidence?: number;
      reason?: string;
    };

    return {
      isResume: result.is_resume ?? tier1Result.isResume,
      confidence: result.confidence ?? 0.6,
      detectedType: (result.document_type as ClassificationResult["detectedType"]) ?? tier1Result.detectedType,
      rejectReason: result.is_resume ? null : (result.reason ?? tier1Result.rejectReason),
      safetyFlags: [...tier1Result.safetyFlags, "tier2_classified"],
    };
  } catch (err) {
    // Fail-open: accept the document on AI failure, log security event
    console.error("[content-classifier] Tier 2 AI classifier failed, accepting document:", err);
    return {
      ...tier1Result,
      isResume: true,
      safetyFlags: [...tier1Result.safetyFlags, "tier2_error_failopen"],
    };
  }
}
