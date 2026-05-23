/**
 * Refusal taxonomy (Charter 26 Epic 01).
 *
 * Closed enum of refusal reasons the refuse-or-ship gate can produce.
 * Replaces free-form refusal strings so:
 *   - The UI renders canonical brand-voice messaging per reason.
 *   - The eval suite can score refusal precision/recall (Charter 21).
 *   - Audit log queries can aggregate by refusal type.
 *   - Operations can alert on per-reason rate spikes.
 *
 * When adding a new reason: bump the version, document the migration
 * for historical rows, and add cases to the adversarial corpus
 * (Charter 26 Epic 02) that exercise the new reason.
 */

export type RefusalReason =
  | "insufficient_evidence"
  | "role_mismatch"
  | "fabricated_claim"
  | "policy_violation"
  | "prompt_injection_detected"
  | "low_quality_input"
  | "rate_limit"
  | "service_degraded";

export type NextAction =
  | "add_more_experience"
  | "pick_different_role"
  | "contact_support"
  | "retry_later"
  | "appeal";

export interface RefusalMetadata {
  /** Machine identifier (the enum value). */
  enum_id: RefusalReason;
  /** Short user-facing title (≤ 6 words). Brand voice: warm but precise. */
  display_title: string;
  /** Longer explanation in brand voice. ≤ 2 sentences. */
  display_message: string;
  /** What the user should do next. */
  next_action: NextAction;
  /** Whether the user can appeal this refusal. */
  appealable: boolean;
}

const TABLE: Record<RefusalReason, RefusalMetadata> = {
  insufficient_evidence: {
    enum_id: "insufficient_evidence",
    display_title: "Not enough evidence yet",
    display_message:
      "Your profile doesn't have enough specifics to back the claims this role asks for. Add the missing experience or pick a role that fits the evidence you have.",
    next_action: "add_more_experience",
    appealable: true,
  },
  role_mismatch: {
    enum_id: "role_mismatch",
    display_title: "This role isn't a fit",
    display_message:
      "Your background and this job description don't overlap enough to write something honest. Try a closer role — we don't fake experience.",
    next_action: "pick_different_role",
    appealable: true,
  },
  fabricated_claim: {
    enum_id: "fabricated_claim",
    display_title: "We can't verify a claim",
    display_message:
      "Something on your profile doesn't have evidence behind it. Edit the unverifiable parts and try again.",
    next_action: "appeal",
    appealable: true,
  },
  policy_violation: {
    enum_id: "policy_violation",
    display_title: "We can't help with this one",
    display_message:
      "This request falls outside what Retune helps with. See our policy for the full list.",
    next_action: "contact_support",
    appealable: false,
  },
  prompt_injection_detected: {
    enum_id: "prompt_injection_detected",
    display_title: "We detected an injection attempt",
    display_message:
      "The job description contains instructions that try to override our system. We've ignored them. If this looks like a real JD, please paste the plain text only.",
    next_action: "retry_later",
    appealable: false,
  },
  low_quality_input: {
    enum_id: "low_quality_input",
    display_title: "We need more to work with",
    display_message:
      "The input was too short or didn't look like a resume / job description. Paste the full text and try again.",
    next_action: "retry_later",
    appealable: false,
  },
  rate_limit: {
    enum_id: "rate_limit",
    display_title: "You're going faster than we can keep up",
    display_message:
      "Give it a minute and try again. We rate-limit per user to protect everyone's quality.",
    next_action: "retry_later",
    appealable: false,
  },
  service_degraded: {
    enum_id: "service_degraded",
    display_title: "Something's not right on our side",
    display_message:
      "An upstream service we depend on is having a moment. Try again shortly — we'll usually recover within minutes.",
    next_action: "retry_later",
    appealable: false,
  },
};

/**
 * Get metadata for a refusal reason. Throws if `reason` isn't in the
 * enum — pass values typed as `RefusalReason`, never untrusted strings.
 */
export function getRefusalMetadata(reason: RefusalReason): RefusalMetadata {
  const entry = TABLE[reason];
  if (!entry) throw new Error(`Unknown refusal reason: ${reason}`);
  return entry;
}

/** All known refusal reasons. */
export const ALL_REFUSAL_REASONS: readonly RefusalReason[] = Object.keys(TABLE) as RefusalReason[];

/**
 * Coerce a free-form historical refusal string to the closest enum
 * value. Used by the one-time backfill migration in Charter 26 Epic 01
 * Story 1.3. Best-effort; unmatched inputs become `policy_violation`
 * with a backfill marker.
 */
export function coerceHistoricalRefusal(rawReason: string): RefusalReason {
  const r = rawReason.toLowerCase();
  if (/insufficient|missing.*evidence|no.*proof/.test(r)) return "insufficient_evidence";
  if (/mismatch|wrong.*role|not.*fit/.test(r)) return "role_mismatch";
  if (/fabricat|invent|hallucin|unverif/.test(r)) return "fabricated_claim";
  if (/inject|jailbreak|adversarial/.test(r)) return "prompt_injection_detected";
  if (/empty|short|garbage|junk|low.*quality/.test(r)) return "low_quality_input";
  if (/rate.*limit|too.*many/.test(r)) return "rate_limit";
  if (/degrad|outage|unavail|provider/.test(r)) return "service_degraded";
  return "policy_violation";
}
