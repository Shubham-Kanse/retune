/**
 * P0.4 — Token grinding / DoS protection (OWASP LLM04)
 *
 * Detects abusive uploads before they reach the AI extraction pipeline.
 */

export interface AbuseDetectionResult {
  rejected: boolean;
  reason: string | null;
  flags: string[];
}

const MAX_RAW_TEXT_CHARS = 50_000;
const MAX_AVG_WORD_LENGTH = 15;
const MAX_REPETITION_RATIO = 0.7;

export function detectAbuse(input: { buffer: Buffer; rawText: string }): AbuseDetectionResult {
  const flags: string[] = [];

  if (input.rawText.length > MAX_RAW_TEXT_CHARS) {
    flags.push("text_too_long");
    return { rejected: true, reason: "Document text exceeds maximum length (50,000 characters). No legitimate resume is this long.", flags };
  }

  // Repetition ratio: fraction of duplicate lines
  const lines = input.rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > 5) {
    const unique = new Set(lines);
    const ratio = 1 - unique.size / lines.length;
    if (ratio > MAX_REPETITION_RATIO) {
      flags.push("high_repetition");
      return { rejected: true, reason: "Document contains excessive repeated content.", flags };
    }
  }

  // Average word length check (catches binary/random token data)
  const words = input.rawText.split(/\s+/).filter((w) => w.length > 0);
  if (words.length > 10) {
    const avgLen = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    if (avgLen > MAX_AVG_WORD_LENGTH) {
      flags.push("high_avg_word_length");
      return { rejected: true, reason: "Document appears to contain binary or non-text data.", flags };
    }
  }

  return { rejected: false, reason: null, flags };
}
