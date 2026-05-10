/**
 * PROMPT CACHING UTILITIES
 * Ephemeral 5-minute TTL for static system prompts
 * Day 3 SOTA Implementation - 90% cost savings at scale
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface CachedSystemPrompt {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
}

/**
 * Create a cacheable system prompt
 * Caches for 5 minutes across all requests with identical content
 */
export function createCachedSystemPrompt(text: string): CachedSystemPrompt {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

/**
 * Build a system prompt with caching applied to static knowledge
 */
export function buildCachedSystemPrompt(
  staticKnowledge: string,
  dynamicContext?: string,
): Anthropic.TextBlockParam[] {
  const prompts: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: staticKnowledge,
      cache_control: { type: "ephemeral" },
    },
  ];

  if (dynamicContext) {
    prompts.push({
      type: "text",
      text: dynamicContext,
    });
  }

  return prompts;
}

/**
 * Example: Build cached resume-writing prompt
 * This prompt is identical for all users in a market, so it caches perfectly
 */
export function buildCachedResumeWriterPrompt(market: "us" | "uk"): CachedSystemPrompt {
  const staticPrompt = `
You are an expert resume architect specializing in ${market === "us" ? "US Resumes" : "UK CVs"}.

UNIVERSAL RULES (same for all users):
1. Bullets must be 1-2 lines max, no longer
2. Every bullet MUST have specific metrics (numbers, %, team size, $, time saved)
3. Use only 5 bullet structures: CAR, PAR, XYZ, STAR, or Hybrid
4. Mirror JD terminology exactly for ATS alignment
5. No generic superlatives (best, excellent, amazing, etc)

${
  market === "us"
    ? `US MARKET SPECIFIC:
- Document type: Resume (not CV)
- Language: American English (optimize, center, color)
- Paper: Letter size (8.5×11)
- No "References available on request"
- Font: Calibri 11pt body, 14pt name header
- Date format: MM/YYYY (01/2024)`
    : `UK/IRELAND MARKET SPECIFIC:
- Document type: CV (not Resume)
- Language: British English (optimise, centre, behaviour)
- Paper: A4 size
- Include "References available on request" at end
- Phone format: +44 or +353 prefix
- Font: Calibri 11pt body, 14pt name header
- Date format: Month YYYY (January 2024)`
}

ATS COMPLIANCE (NON-NEGOTIABLE):
- No tables, columns, text boxes, or images
- Single-column layout only
- No header/footer with critical info
- Parseable section headers (use ### format)
- Standard fonts only
`;

  return createCachedSystemPrompt(staticPrompt);
}

/**
 * Example: Build cached quality gate prompt
 */
export function buildCachedQualityGatePrompt(): CachedSystemPrompt {
  return createCachedSystemPrompt(`
You are a resume quality auditor. Evaluate resumes against JD requirements.

CHECKLIST (apply in order):
1. Metric Authenticity
   - Is every metric grounded in the candidate's actual profile?
   - Do numbers feel realistic (not inflated)?
   - Are percentages and team sizes proportional?

2. JD Alignment
   - Does the resume address the top 3 required keywords?
   - Would a recruiter understand the relevance in 10 seconds?
   - Is terminology matched to JD (not generic)?

3. AI Detection Signals
   - Are bullet structures varied (not all CAR, not all XYZ)?
   - Does the voice match the candidate's tone?
   - Any overuse of business jargon?

4. ATS Compliance
   - No tables or complex formatting?
   - Standard fonts only?
   - Section headers parseable?

5. Readability
   - Can each bullet be understood in 2 seconds?
   - Is there white space (not wall-of-text)?
   - Consistent verb tense?

Score 0-100 based on severity of issues found.
`);
}

/**
 * Monitor cache effectiveness
 */
export interface CacheStats {
  cacheCreationTokens: number;
  cacheReadTokens: number;
  regularTokens: number;
  totalCost: number;
  cacheHitRate: number; // 0-100%
}

/**
 * Extract cache usage from response headers (if available)
 */
export function extractCacheStats(response: Anthropic.Message): Partial<CacheStats> {
  // Note: SDK doesn't expose cache stats in public API yet
  // This is a placeholder for when that becomes available
  return {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    regularTokens: response.usage?.input_tokens || 0,
  };
}

/**
 * Cost calculation with caching
 * Assumes cache creation costs 25% of read cost (API pricing model)
 */
export function calculateCachedCost(stats: CacheStats, inputCostPer1M = 3.0): number {
  const inputCost = (stats.regularTokens / 1_000_000) * inputCostPer1M;
  const cacheReadCost = (stats.cacheReadTokens / 1_000_000) * inputCostPer1M * 0.1; // 90% cheaper
  const cacheCreateCost = (stats.cacheCreationTokens / 1_000_000) * inputCostPer1M * 0.25; // 25% of normal cost

  return inputCost + cacheReadCost + cacheCreateCost;
}
