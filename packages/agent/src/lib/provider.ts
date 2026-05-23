/**
 * Provider factory.
 *
 * Set AI_PROVIDER=openai in .env to use OpenAI.
 * Defaults to Anthropic.
 *
 * All pipeline agents import from here — never from a vendor SDK directly.
 *
 * Charter 09 Epic 02 / 11 Epic 01 (architect addendum) — every
 * `createMessage*` call is funnelled through `concurrencyManager` so a
 * single process never has more than `globalLimit` LLM calls in flight,
 * and a single user never has more than `perUserLimit` concurrent calls.
 * This prevents accidental fan-out (specialists firing in parallel) from
 * tripping provider rate limits or running up unbounded cost.
 *
 * Defaults: 5 global / 2 per user (see `concurrency-manager.ts`).
 * Override via env: `RETUNE_LLM_GLOBAL_LIMIT`, `RETUNE_LLM_PER_USER_LIMIT`.
 */

import { ConcurrencyManager } from "../concurrency/concurrency-manager";
import type {
  AIProvider,
  MessageParams,
  Models,
  ReasonedOutputParams,
  StructuredOutputParams,
} from "./ai-provider";
import { anthropicProvider } from "./providers/anthropic";
import { openaiProvider } from "./providers/openai";

export type {
  AIProvider,
  AIResponse,
  MessageParams,
  Models,
  ToolDefinition,
  Message,
  ContentBlock,
  SystemBlock,
} from "./ai-provider";

let _provider: AIProvider | null = null;
let _concurrency: ConcurrencyManager | null = null;

function getConcurrencyManager(): ConcurrencyManager {
  if (_concurrency) return _concurrency;
  const globalLimit = Number(process.env.RETUNE_LLM_GLOBAL_LIMIT ?? "5");
  const perUserLimit = Number(process.env.RETUNE_LLM_PER_USER_LIMIT ?? "2");
  _concurrency = new ConcurrencyManager({
    globalLimit: Number.isFinite(globalLimit) && globalLimit > 0 ? globalLimit : 5,
    perUserLimit: Number.isFinite(perUserLimit) && perUserLimit > 0 ? perUserLimit : 2,
  });
  return _concurrency;
}

/**
 * Wrap a provider so every method goes through the concurrency gate.
 * The `agent` parameter doubles as a stable identifier we can use for
 * per-user gating; for now we treat the agent name as the key (this is
 * conservative — production should pass the request's user_id explicitly
 * via the orchestrator's substrate-deps once the wiring lands in
 * `apps/api/src/runtime/workbench-runtime.ts`).
 */
function wrapWithConcurrency(provider: AIProvider): AIProvider {
  const cm = getConcurrencyManager();
  // The agent name is used as the user-key fallback. When the API runtime
  // is plumbed to pass a real user_id through to LLM calls (Charter 09
  // Epic 03), this fallback stops being used.
  const userKey = (agent: string): string => `agent:${agent}`;

  return {
    ...provider,
    createMessage: (agent, params) =>
      cm.run(userKey(agent), () => provider.createMessage(agent, params)),
    createMessageWithTool: <T>(agent: string, params: MessageParams, toolName: string) =>
      cm.run(userKey(agent), () => provider.createMessageWithTool<T>(agent, params, toolName)),
    createStructuredOutput: <T>(agent: string, params: StructuredOutputParams<T>) =>
      cm.run(userKey(agent), () => provider.createStructuredOutput(agent, params)),
    createReasonedOutput: <T>(agent: string, params: ReasonedOutputParams<T>) =>
      cm.run(userKey(agent), () => provider.createReasonedOutput(agent, params)),
    // searchWeb, searchFiles, runBackground are passed through unwrapped —
    // they are slow operations where the concurrency gate would only
    // serialise unrelated work without protecting any provider quota.
  };
}

export function getProvider(): AIProvider {
  if (_provider) return _provider;

  const name = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  const base = name === "openai" ? openaiProvider : anthropicProvider;
  _provider = wrapWithConcurrency(base);
  return _provider;
}

/** Convenience: active provider's model identifiers (smart, fast, frontier). */
export function getModels(): Models {
  return getProvider().models;
}

/**
 * Test-only — reset the cached provider so a new `AI_PROVIDER` env var takes
 * effect on the next call. Used by provider-parity tests that flip the env
 * mid-process.
 */
export function _resetProvider(): void {
  _provider = null;
  _concurrency = null;
}
