/**
 * Provider factory.
 *
 * Set AI_PROVIDER=openai in .env to use OpenAI.
 * Defaults to Anthropic.
 *
 * All pipeline agents import from here — never from a vendor SDK directly.
 */

import type { AIProvider, Models } from "./ai-provider";
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

export function getProvider(): AIProvider {
  if (_provider) return _provider;

  const name = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  _provider = name === "openai" ? openaiProvider : anthropicProvider;
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
}
