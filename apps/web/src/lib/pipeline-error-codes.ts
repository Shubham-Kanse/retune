/**
 * E1: Typed pipeline error taxonomy.
 * Every error the pipeline can emit maps to a code with user-facing copy,
 * a technical detail (shown in an accordion), and a retry flag.
 */

export type PipelineErrorCode =
  | "rate_limited"
  | "context_too_long"
  | "api_connection"
  | "jd_unreachable"
  | "jd_requires_login"
  | "jd_empty"
  | "profile_incomplete"
  | "role_fit_rejected"
  | "ats_score_too_low"
  | "billing_limit_reached"
  | "generation_timeout"
  | "docx_generation_failed"
  | "validation_failed"
  | "unknown";

export interface ErrorMetadata {
  headline: string;
  detail: string;
  action: string;
  retryable: boolean;
}

export const ERROR_METADATA: Record<PipelineErrorCode, ErrorMetadata> = {
  rate_limited: {
    headline: "Anthropic API is rate-limited",
    detail: "Too many requests hit the API at once. This resolves automatically.",
    action: "Click Retry - the request will back off and retry.",
    retryable: true,
  },
  context_too_long: {
    headline: "Job description is too long",
    detail: "The combined profile and JD exceeded the model's context window.",
    action: "Paste a shorter section of the JD - the first 3–4 sections are enough.",
    retryable: false,
  },
  api_connection: {
    headline: "Lost connection to AI",
    detail: "A network error interrupted the request mid-generation.",
    action: "Click Retry. If it keeps failing, check your internet connection.",
    retryable: true,
  },
  jd_unreachable: {
    headline: "Couldn't open that job posting",
    detail:
      "The URL returned an error or timed out. ATS systems like Workday and Greenhouse often block automated access.",
    action: "Open the posting → select all text → paste it directly into the JD field.",
    retryable: false,
  },
  jd_requires_login: {
    headline: "That job board requires a login",
    detail: "The page redirected to a login wall before the description could be read.",
    action: "Log in to the job board → copy the job description text → paste it here.",
    retryable: false,
  },
  jd_empty: {
    headline: "Couldn't extract the job description",
    detail: "The URL loaded but contained no job-related content.",
    action: "Paste the job description text directly instead of the URL.",
    retryable: false,
  },
  profile_incomplete: {
    headline: "Profile needs more detail",
    detail: "The pipeline needs a complete profile to generate a tailored resume.",
    action: "Go to Profile → add at least 2 experience entries with metrics → come back.",
    retryable: false,
  },
  role_fit_rejected: {
    headline: "Strong fit mismatch detected",
    detail: "The role requires experience or skills your profile doesn't demonstrate.",
    action: "Click Generate Anyway to proceed, or pick a better-matched role.",
    retryable: false,
  },
  ats_score_too_low: {
    headline: "ATS coverage too low after optimisation",
    detail: "Even after two patch attempts, required keywords couldn't be incorporated naturally.",
    action: "Add the missing skills to your profile if you genuinely have them, then retry.",
    retryable: true,
  },
  billing_limit_reached: {
    headline: "Generation credits exhausted",
    detail: "You've used all credits on your current plan.",
    action: "Upgrade to Pro for unlimited generations.",
    retryable: false,
  },
  generation_timeout: {
    headline: "Generation took too long",
    detail: "A pipeline step exceeded the maximum allowed time.",
    action: "Click Retry. Company research sometimes takes longer on busy networks.",
    retryable: true,
  },
  docx_generation_failed: {
    headline: "DOCX file generation failed",
    detail: "The resume was generated but couldn't be converted to a Word file.",
    action: "The markdown resume is still available. Try downloading again in a moment.",
    retryable: true,
  },
  validation_failed: {
    headline: "Resume didn't pass quality check",
    detail: "The generated resume scored below the 85/100 quality threshold.",
    action: "Click Retry - a second pass often produces a higher-quality result.",
    retryable: true,
  },
  unknown: {
    headline: "Generation failed",
    detail: "An unexpected error stopped the pipeline.",
    action: "Click Retry. If it keeps failing, try pasting the JD text instead of a URL.",
    retryable: true,
  },
};

export function classifyError(message: string): PipelineErrorCode {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("overloaded"))
    return "rate_limited";
  if (m.includes("context") && (m.includes("too long") || m.includes("window")))
    return "context_too_long";
  if (
    m.includes("insufficient credits") ||
    m.includes("upgrade") ||
    m.includes("credits exhausted")
  )
    return "billing_limit_reached";
  if (
    m.includes("workday") ||
    m.includes("could not fetch job") ||
    m.includes("could not extract job") ||
    m.includes("jina reader") ||
    m.includes("url source:")
  )
    return "jd_unreachable";
  if (m.includes("login") || m.includes("sign in") || m.includes("auth wall"))
    return "jd_requires_login";
  if (m.includes("job posting page returned") || m.includes("no job-related content"))
    return "jd_empty";
  if (
    m.includes("profile") &&
    (m.includes("missing") || m.includes("incomplete") || m.includes("required fields"))
  )
    return "profile_incomplete";
  if (m.includes("ats score") && m.includes("75")) return "ats_score_too_low";
  if (m.includes("timed out") || m.includes("timeout after")) return "generation_timeout";
  if (m.includes("docx") || m.includes(".docx generation failed")) return "docx_generation_failed";
  if (m.includes("validation") && m.includes("85")) return "validation_failed";
  if (
    m.includes("econnreset") ||
    m.includes("enotfound") ||
    m.includes("network") ||
    m.includes("connection refused")
  )
    return "api_connection";
  return "unknown";
}
