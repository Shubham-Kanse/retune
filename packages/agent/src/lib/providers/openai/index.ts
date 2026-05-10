import OpenAI from "openai";
import type {
  AIProvider,
  AIResponse,
  ContentBlock,
  MessageParams,
  Models,
} from "../../ai-provider";
import { LlmError } from "../../llm-error";

// ---------------------------------------------------------------------------
// Model resolution (technical-2.0 §4.2)
// ---------------------------------------------------------------------------

export const OPENAI_MODELS: Models = {
  smart: process.env.AGENT_MODEL || "gpt-4o",
  fast: process.env.AGENT_MODEL_FAST || "gpt-4o-mini",
  frontier: process.env.AGENT_MODEL_FRONTIER || "gpt-5",
};

// ---------------------------------------------------------------------------
// SDK client — lazy so module evaluation never throws on missing key
// ---------------------------------------------------------------------------

let _sdkClient: OpenAI | null = null;
function getSdkClient(): OpenAI {
  if (_sdkClient) return _sdkClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmError(
      "OPENAI_API_KEY not set; set AI_PROVIDER=anthropic or provide an OpenAI key",
      "auth_failed",
      "openai",
    );
  }
  _sdkClient = new OpenAI({ apiKey });
  return _sdkClient;
}

/** Test-only — reset the cached client so a new env var takes effect. */
export function _resetOpenAIClient(): void {
  _sdkClient = null;
}

// ---------------------------------------------------------------------------
// Usage ring-buffer (last 1 000 calls)
// ---------------------------------------------------------------------------

interface UsageRecord {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const usageLog: UsageRecord[] = [];

function recordUsage(
  agent: string,
  model: string,
  usage: OpenAI.CompletionUsage | undefined,
  durationMs: number,
): void {
  usageLog.push({
    agent,
    model,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    durationMs,
  });
  if (usageLog.length > 1000) usageLog.splice(0, usageLog.length - 1000);
}

export function getUsageStats() {
  const totals = usageLog.reduce(
    (acc, r) => {
      acc.inputTokens += r.inputTokens;
      acc.outputTokens += r.outputTokens;
      acc.calls += 1;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, calls: 0 },
  );
  return { ...totals, recentCalls: usageLog.slice(-50) };
}

// ---------------------------------------------------------------------------
// Internal: translate generic params → OpenAI SDK params
// ---------------------------------------------------------------------------

function toOpenAITools(tools: MessageParams["tools"]): OpenAI.ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

function resolveSystem(system: MessageParams["system"]): string {
  if (typeof system === "string") return system;
  return system.map((b) => b.text).join("\n\n");
}

function toOpenAIMessages(
  system: MessageParams["system"],
  messages: MessageParams["messages"],
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: resolveSystem(system) },
  ];
  for (const m of messages) {
    if (typeof m.content === "string") {
      result.push({ role: m.role, content: m.content });
    } else {
      // Flatten content blocks to text for simplicity (tool results handled separately)
      const text = m.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");
      result.push({ role: m.role, content: text });
    }
  }
  return result;
}

function fromOpenAIResponse(response: OpenAI.ChatCompletion, model: string): AIResponse {
  const choice = response.choices[0];
  if (!choice)
    return {
      content: [],
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model,
    };

  const content: ContentBlock[] = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  for (const call of choice.message.tool_calls ?? []) {
    if (call.type !== "function") continue;
    let input: unknown = {};
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      /* leave empty */
    }
    content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }

  const finishReason = choice.finish_reason;
  const stopReason =
    finishReason === "tool_calls"
      ? "tool_use"
      : finishReason === "length"
        ? "max_tokens"
        : "end_turn";

  return {
    content,
    stopReason,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    model,
  };
}

function extractToolUseBlock<T>(response: AIResponse, toolName: string): T {
  const block = response.content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.type !== "tool_use") {
    if (response.stopReason === "max_tokens") {
      throw new Error(
        `Missing required tool "${toolName}" because response hit max_tokens. Retry with higher maxTokens.`,
      );
    }
    throw new Error(`Expected tool "${toolName}" but got stopReason="${response.stopReason}"`);
  }
  return block.input as T;
}

// ---------------------------------------------------------------------------
// OpenAIProvider
// ---------------------------------------------------------------------------

class OpenAIProvider implements AIProvider {
  readonly models = OPENAI_MODELS;

  async createMessage(agent: string, params: MessageParams): Promise<AIResponse> {
    const model = params.model;
    const tools = toOpenAITools(params.tools);

    const sdkParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      max_tokens: params.maxTokens,
      messages: toOpenAIMessages(params.system, params.messages),
      ...(tools && { tools }),
      ...(params.forceTool && {
        tool_choice: { type: "function", function: { name: params.forceTool } },
      }),
    };

    const t0 = Date.now();
    const response = await invokeOpenAI(() => getSdkClient().chat.completions.create(sdkParams));
    recordUsage(agent, model, response.usage, Date.now() - t0);
    return fromOpenAIResponse(response, model);
  }

  async createMessageWithTool<T = unknown>(
    agent: string,
    params: MessageParams,
    toolName: string,
  ): Promise<T> {
    const initialMaxTokens = params.maxTokens;
    let attempt = 0;

    while (attempt < 2) {
      const currentParams =
        attempt === 0 ? params : { ...params, maxTokens: Math.min(initialMaxTokens * 2, 16_384) };
      const response = await this.createMessage(agent, currentParams);
      try {
        return extractToolUseBlock<T>(response, toolName);
      } catch (err) {
        if (attempt === 0 && err instanceof Error && err.message.includes("max_tokens")) {
          attempt++;
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Failed to get required tool "${toolName}" after retry`);
  }

  /**
   * OpenAI has no native server-side web search tool equivalent to Anthropic's
   * web_search_20250305. Returns null — callers fall back to emptyIntel.
   */
  async searchWeb(_query: string, _maxUses?: number): Promise<string | null> {
    return null;
  }
}

export const openaiProvider = new OpenAIProvider();

// ---------------------------------------------------------------------------
// Error translation — wrap vendor errors in a typed LlmError.
// ---------------------------------------------------------------------------

async function invokeOpenAI<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw translateOpenAIError(err);
  }
}

function translateOpenAIError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const e = err as { status?: number; message?: string };
  const status = e?.status;
  const message = e?.message ?? String(err);
  if (status === 401 || status === 403) {
    return new LlmError(message, "auth_failed", "openai", err);
  }
  if (status === 429) {
    return new LlmError(message, "rate_limit", "openai", err);
  }
  if (status !== undefined && status >= 500) {
    return new LlmError(message, "5xx", "openai", err);
  }
  return new LlmError(message, "malformed_response", "openai", err);
}
