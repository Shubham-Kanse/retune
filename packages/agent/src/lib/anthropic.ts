/**
 * Provider-agnostic shim (formerly Anthropic-specific; see technical-2.0 §17.3).
 *
 * Pipeline agents were originally written against the Anthropic SDK shape:
 *   - system was Anthropic.TextBlockParam[] with cache_control
 *   - max_tokens was the param name
 *   - input_schema was the tool schema key
 *
 * This shim normalises those calls to the generic `MessageParams` shape and
 * delegates to the active provider via `getProvider()`. v2.0 specialists
 * import `getModels()` from here at runtime so `AI_PROVIDER=openai` routes to
 * gpt-4o instead of claude-sonnet-4-6 (technical-2.0 §4.3).
 *
 * The `MODELS` re-export is the legacy v1.0 shape — it always resolves to the
 * Anthropic model strings regardless of the active provider. Avoid it in new
 * code; use `getModels()` for runtime-correct behaviour.
 *
 * @deprecated v2.1 will rename this module to `lib/legacy-shim.ts`. Until
 *   then this barrel stays import-stable for downstream consumers.
 */

import type { MessageParams, SystemBlock } from "./ai-provider";
import { getProvider } from "./provider";

export { getProvider, getModels } from "./provider";
export { LlmError, type LlmErrorKind, type LlmProvider } from "./llm-error";
export {
  toToolInputSchema,
  getUsageStats,
  ANTHROPIC_MODELS as MODELS,
} from "./providers/anthropic";

// ---------------------------------------------------------------------------
// Shim types — match what agents currently pass
// ---------------------------------------------------------------------------

type LegacySystemBlock = { type: "text"; text: string; cache_control?: unknown } | string;

type LegacyToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

interface LegacyParams {
  model: string;
  max_tokens: number;
  system: string | LegacySystemBlock[];
  messages: MessageParams["messages"];
  tools?: LegacyToolDef[];
  tool_choice?: { type: string; name?: string };
}

// ---------------------------------------------------------------------------
// Normalise legacy params → generic MessageParams
// ---------------------------------------------------------------------------

function normaliseSystem(system: string | LegacySystemBlock[]): string | SystemBlock[] {
  if (typeof system === "string") return system;
  return system.map((b): SystemBlock => {
    if (typeof b === "string") return { type: "text", text: b };
    return {
      type: "text",
      text: b.text,
      cacheHint: b.cache_control != null,
    };
  });
}

function normalise(params: LegacyParams): MessageParams {
  return {
    model: params.model,
    maxTokens: params.max_tokens,
    system: normaliseSystem(params.system),
    messages: params.messages,
    tools: params.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    })),
    forceTool: params.tool_choice?.type === "tool" ? params.tool_choice.name : undefined,
  };
}

// ---------------------------------------------------------------------------
// Exported wrappers
// ---------------------------------------------------------------------------

export async function createMessage(agent: string, params: LegacyParams) {
  return getProvider().createMessage(agent, normalise(params));
}

export async function createMessageWithTool<T = unknown>(
  agent: string,
  params: LegacyParams,
  toolName: string,
): Promise<T> {
  return getProvider().createMessageWithTool<T>(agent, normalise(params), toolName);
}

/** @deprecated — kept for any code that still calls ephemeralCache() directly. */
export function ephemeralCache(): { type: "ephemeral" } {
  return { type: "ephemeral" };
}
