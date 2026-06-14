/**
 * Provider fallback router (Charter 09 Epic 02).
 *
 * Wraps a primary `AIProvider` with automatic fallback to a secondary
 * provider when the primary errors with rate-limit / overload / 5xx /
 * provider-down.
 *
 * Why:
 *   - Anthropic and OpenAI both have intermittent overload windows
 *     (e.g. Anthropic's "529 overloaded"). A single provider outage
 *     should not cascade into generation failure when the alternate
 *     provider is healthy.
 *   - Capabilities differ (`reasoningEffort`, `fileSearch`,
 *     `backgroundRuns`). Fallback ONLY happens for `createMessage` /
 *     `createMessageWithTool` / `createStructuredOutput` — not for
 *     calls that would lose features the caller depends on.
 *
 * Activation:
 *   - Set `AGENT_MODEL_FALLBACK_PROVIDER=openai` (or `anthropic`) when
 *     the primary is the other one. Fallback is OFF by default.
 *
 * Failure-detection:
 *   - 429 / 529 / 503 / 502 / 504
 *   - Network errors (ECONNRESET / ETIMEDOUT / fetch threw)
 *   - Anthropic overload errors (carrying `type: "overloaded_error"`)
 *
 * Anything else (4xx user error, structured-output validation failure)
 * is NOT retried on the fallback — that's a content-level bug, not a
 * provider outage.
 */

import type {
  AIProvider,
  MessageParams,
  ReasonedOutputParams,
  StructuredOutputParams,
} from "./ai-provider";

interface ErrorWithStatus {
  status?: number;
  code?: string | number;
  type?: string;
  message?: string;
}

function isFallbackable(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorWithStatus & { kind?: string; circuitOpen?: boolean };

  // An open circuit on the primary provider is exactly when fallback
  // should fire — the secondary provider has its own independent breaker.
  if (e.kind === "circuit_open" || e.circuitOpen === true) return true;

  // Status-based: 429 (rate-limit), 502/503/504 (gateway / upstream),
  // 529 (Anthropic overloaded).
  if (typeof e.status === "number") {
    if ([429, 502, 503, 504, 529].includes(e.status)) return true;
  }

  // Anthropic-specific overload type.
  if (e.type === "overloaded_error") return true;

  // Network-level transient errors.
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("econnreset")) return true;
  if (msg.includes("etimedout")) return true;
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("socket hang up")) return true;
  if (msg.includes("overloaded")) return true;

  return false;
}

/**
 * Wrap a primary provider so that {createMessage, createMessageWithTool,
 * createStructuredOutput, createReasonedOutput} fall back to the
 * secondary on transient errors.
 *
 * Fallback events emit a `console.warn` so an observability hook can
 * track how often the fallback fires (Charter 05 Epic 04 metrics).
 */
export function withFallback(primary: AIProvider, secondary: AIProvider): AIProvider {
  const tryPrimaryThenSecondary = async <T>(
    fnName: string,
    primaryFn: () => Promise<T>,
    secondaryFn: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await primaryFn();
    } catch (err) {
      if (!isFallbackable(err)) throw err;
      // eslint-disable-next-line no-console
      console.warn(
        `[provider-fallback] primary failed on ${fnName}; falling back. error=${(err as Error)?.message?.slice(0, 200) ?? "unknown"}`,
      );
      return await secondaryFn();
    }
  };

  return {
    ...primary,
    capabilities: primary.capabilities,
    createMessage: (agent, params) =>
      tryPrimaryThenSecondary(
        "createMessage",
        () => primary.createMessage(agent, params),
        () => secondary.createMessage(agent, params),
      ),
    createMessageWithTool: <T>(agent: string, params: MessageParams, toolName: string) =>
      tryPrimaryThenSecondary(
        "createMessageWithTool",
        () => primary.createMessageWithTool<T>(agent, params, toolName),
        () => secondary.createMessageWithTool<T>(agent, params, toolName),
      ),
    createStructuredOutput: <T>(agent: string, params: StructuredOutputParams<T>) =>
      tryPrimaryThenSecondary(
        "createStructuredOutput",
        () => primary.createStructuredOutput<T>(agent, params),
        () => secondary.createStructuredOutput<T>(agent, params),
      ),
    createReasonedOutput: <T>(agent: string, params: ReasonedOutputParams<T>) =>
      tryPrimaryThenSecondary(
        "createReasonedOutput",
        () => primary.createReasonedOutput<T>(agent, params),
        () => secondary.createReasonedOutput<T>(agent, params),
      ),
    // Capability-specific calls do NOT fall back — searching files, running
    // background tasks, or web search may not be supported by the secondary.
  };
}

/** Exposed for tests. */
export const _isFallbackableForTests = isFallbackable;
