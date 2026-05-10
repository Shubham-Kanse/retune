/**
 * Typed LLM error for provider abstraction (technical-2.0 §4.5).
 *
 * Every error from an LLM provider call is wrapped in this class so that
 * specialists can classify and respond uniformly:
 *   - `rate_limit`        → low (provider-internal retry handles it)
 *   - `auth_failed`       → critical (refuse-or-ship gate refuses)
 *   - `5xx`               → medium (retry × 3 then refuse with provider_5xx)
 *   - `malformed_response`→ medium (fall back to deterministic stub if available)
 *   - `tool_call_missing` → high  (re-prompt with stricter instructions)
 *
 * Both providers (Anthropic, OpenAI) construct this; specialists never
 * unwrap vendor-specific error types directly.
 */

export type LlmErrorKind =
  | "rate_limit"
  | "auth_failed"
  | "5xx"
  | "malformed_response"
  | "tool_call_missing";

export type LlmProvider = "anthropic" | "openai";

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly kind: LlmErrorKind,
    public readonly provider: LlmProvider,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
