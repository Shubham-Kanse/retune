import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  AIProvider,
  AIResponse,
  BackgroundParams,
  BackgroundRun,
  ContentBlock,
  FileSearchOptions,
  FileSearchResult,
  MessageParams,
  ModelCallTelemetry,
  Models,
  ProviderCapabilities,
  ReasonedOutputParams,
  StructuredOutputParams,
  SystemBlock,
  ToolDefinition,
  WebSearchOptions,
  WebSearchResult,
} from "../../ai-provider";
import { LlmError } from "../../llm-error";
import {
  ANTHROPIC_CAPS,
  drainTelemetry,
  hashRequest,
  hashResponse,
  recordTelemetry,
  reasonedOutputViaStructured,
  structuredOutputViaTool,
} from "../../provider-shared";

// ---------------------------------------------------------------------------
// Model resolution (technical-2.0 §4.2)
// ---------------------------------------------------------------------------

export const ANTHROPIC_MODELS: Models = {
  smart: process.env.AGENT_MODEL || "claude-sonnet-4-6",
  fast: process.env.AGENT_MODEL_FAST || "claude-haiku-4-5",
  frontier: process.env.AGENT_MODEL_FRONTIER || "claude-opus-4-1",
};

// ---------------------------------------------------------------------------
// SDK client — lazy so module evaluation never throws on missing key.
// (technical-2.0 §13: jsdom + missing key broke 130 web vitest tests in v1.0.)
// ---------------------------------------------------------------------------

let _sdkClient: Anthropic | null = null;

function getSdkClient(): Anthropic {
  if (_sdkClient) return _sdkClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LlmError(
      "ANTHROPIC_API_KEY not set; set AI_PROVIDER=openai or provide an Anthropic key",
      "auth_failed",
      "anthropic",
    );
  }
  _sdkClient = new Anthropic({ apiKey });
  return _sdkClient;
}

/** Test-only — reset the cached client so a new env var takes effect. */
export function _resetAnthropicClient(): void {
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
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
}

const usageLog: UsageRecord[] = [];

function recordUsage(agent: string, response: Anthropic.Message, durationMs: number): void {
  const u = response.usage;
  usageLog.push({
    agent,
    model: response.model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    durationMs,
  });
  if (usageLog.length > 1000) usageLog.splice(0, usageLog.length - 1000);
}

export function getUsageStats() {
  const totals = usageLog.reduce(
    (acc, r) => {
      acc.inputTokens += r.inputTokens;
      acc.outputTokens += r.outputTokens;
      acc.cacheReadTokens += r.cacheReadTokens;
      acc.cacheCreationTokens += r.cacheCreationTokens;
      acc.calls += 1;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, calls: 0 },
  );
  const total = totals.inputTokens + totals.cacheReadTokens + totals.cacheCreationTokens;
  return {
    ...totals,
    cacheHitRate: total === 0 ? 0 : (totals.cacheReadTokens / total) * 100,
    recentCalls: usageLog.slice(-50),
  };
}

// ---------------------------------------------------------------------------
// Helpers (Anthropic-specific, used by research.ts for toToolInputSchema)
// ---------------------------------------------------------------------------

/** Convert a Zod schema to an Anthropic tool input_schema (strips $schema). */
export function toToolInputSchema(schema: z.ZodTypeAny): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  return json as unknown as Anthropic.Tool.InputSchema;
}

// ---------------------------------------------------------------------------
// Internal: translate generic params → Anthropic SDK params
// ---------------------------------------------------------------------------

function toAnthropicSystem(system: string | SystemBlock[]): Anthropic.TextBlockParam[] {
  if (typeof system === "string") {
    return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  }
  return system.map((b) => ({
    type: "text" as const,
    text: b.text,
    ...(b.cacheHint ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

function toAnthropicMessages(messages: MessageParams["messages"]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((b) => {
            if (b.type === "text") return { type: "text" as const, text: b.text };
            return { type: "tool_use" as const, id: b.id, name: b.name, input: b.input };
          }),
  }));
}

function fromAnthropicResponse(response: Anthropic.Message): AIResponse {
  const content: ContentBlock[] = [];
  for (const b of response.content) {
    if (b.type === "text") {
      content.push({ type: "text", text: b.text });
    } else if (b.type === "tool_use") {
      content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
    // Skip thinking/redacted/server-tool blocks — not relevant to pipeline
  }
  return {
    content,
    stopReason: response.stop_reason ?? "end_turn",
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
    model: response.model,
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
// AnthropicProvider
// ---------------------------------------------------------------------------

class AnthropicProvider implements AIProvider {
  readonly models = ANTHROPIC_MODELS;
  readonly capabilities: ProviderCapabilities = ANTHROPIC_CAPS;

  async createMessage(agent: string, params: MessageParams): Promise<AIResponse> {
    const sdkParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: toAnthropicSystem(params.system),
      messages: toAnthropicMessages(params.messages),
      ...(params.tools && { tools: toAnthropicTools(params.tools) }),
      ...(params.forceTool && {
        tool_choice: { type: "tool", name: params.forceTool },
      }),
    };

    const t0 = Date.now();
    const response = await invokeAnthropic(() => getSdkClient().messages.create(sdkParams));
    const elapsed = Date.now() - t0;
    recordUsage(agent, response, elapsed);

    const aiResp = fromAnthropicResponse(response);
    aiResp.providerResponseId = response.id;

    recordTelemetry("anthropic", {
      agent,
      cognitiveFunctionId: null,
      provider: "anthropic",
      model: response.model,
      responseId: response.id,
      inputTokens: aiResp.usage.inputTokens,
      outputTokens: aiResp.usage.outputTokens,
      reasoningTokens: null,
      cacheReadTokens: aiResp.usage.cacheReadTokens,
      cacheCreationTokens: aiResp.usage.cacheCreationTokens,
      costUsd: anthropicCostFor(response.model, aiResp.usage),
      latencyMs: elapsed,
      requestHash: hashRequest({
        model: params.model,
        messages: params.messages,
        system: typeof params.system === "string" ? params.system : params.system.map((s) => s.text).join("\n"),
      }),
      responseHash: hashResponse(aiResp.content),
      createdAt: new Date().toISOString(),
    });

    return aiResp;
  }

  async createMessageWithTool<T = unknown>(
    agent: string,
    params: MessageParams,
    toolName: string,
  ): Promise<T> {
    const initialMaxTokens = params.maxTokens;
    let attempt = 0;

    while (attempt < 2) {
      const p =
        attempt === 0 ? params : { ...params, maxTokens: Math.min(initialMaxTokens * 2, 16_384) };
      const response = await this.createMessage(agent, p);
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
   * Anthropic structured output is enforced via forced-tool-use against
   * the Zod schema's tool form. The result is Zod-validated by
   * `structuredOutputViaTool`.
   */
  async createStructuredOutput<T>(
    agent: string,
    params: StructuredOutputParams<T>,
  ): Promise<T> {
    return structuredOutputViaTool(this, agent, params);
  }

  /**
   * Anthropic models do not expose a separate `reasoning_effort` knob,
   * so this falls back to structured output. The shape of the API
   * stays consistent for callers that pick at runtime.
   */
  async createReasonedOutput<T>(agent: string, params: ReasonedOutputParams<T>): Promise<T> {
    return reasonedOutputViaStructured(this, agent, params);
  }

  /**
   * Uses Anthropic's native web_search_20250305 server tool.
   * Returns a typed `WebSearchResult` with summary text. Citations are
   * left empty pending stable extraction across SDK versions.
   *
   * SECURITY: when `opts.allowedDomains` is supplied, we record the
   * intent and surface `partial=true` if any portion of the response
   * was filtered.
   */
  async searchWeb(query: string, opts?: WebSearchOptions): Promise<WebSearchResult | null> {
    const t0 = Date.now();
    const maxUses = opts?.maxUses ?? 4;
    let response: Anthropic.Message;
    try {
      response = await invokeAnthropic(() =>
        getSdkClient().messages.create({
          model: this.models.smart,
          max_tokens: 4096,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }],
          messages: [{ role: "user", content: query }],
        }),
      );
    } catch {
      return null;
    }
    const elapsed = Date.now() - t0;
    recordUsage("web-search", response, elapsed);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n")
      .trim();

    if (!text) return null;

    recordTelemetry("anthropic", {
      agent: "web-search",
      cognitiveFunctionId: "researchCompanyWithWebSearch",
      provider: "anthropic",
      model: this.models.smart,
      responseId: response.id,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      reasoningTokens: null,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      costUsd: anthropicCostFor(response.model, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      }),
      latencyMs: elapsed,
      requestHash: hashRequest({ tool: "web_search_20250305", query, maxUses }),
      responseHash: hashResponse(text),
      createdAt: new Date().toISOString(),
    });

    return {
      summary: text,
      citations: [],
      partial: opts?.allowedDomains !== undefined || opts?.blockedDomains !== undefined,
    };
  }

  /**
   * Anthropic does not currently expose a hosted file search comparable
   * to OpenAI's vector store path. Returns null so callers fall back.
   */
  async searchFiles(_query: string, _opts: FileSearchOptions): Promise<FileSearchResult | null> {
    return null;
  }

  async runBackground<T>(_agent: string, _params: BackgroundParams<T>): Promise<BackgroundRun<T> | null> {
    return null;
  }

  drainModelCallTelemetry(): ModelCallTelemetry[] {
    return drainTelemetry("anthropic");
  }
}

function anthropicCostFor(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  },
): number {
  // Conservative per-tier rates per technical-2.0 §4.2.
  const COST: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
    "claude-haiku-4-5": { input: 0.00025, output: 0.00125, cacheRead: 0.00003, cacheCreate: 0.0003 },
    "claude-sonnet-4-6": { input: 0.003, output: 0.015, cacheRead: 0.0003, cacheCreate: 0.00375 },
    "claude-opus-4-1": { input: 0.015, output: 0.075, cacheRead: 0.0015, cacheCreate: 0.01875 },
  };
  const k = COST[model] ?? COST["claude-sonnet-4-6"]!;
  return (
    (usage.inputTokens / 1000) * k.input +
    (usage.outputTokens / 1000) * k.output +
    (usage.cacheReadTokens / 1000) * k.cacheRead +
    (usage.cacheCreationTokens / 1000) * k.cacheCreate
  );
}

export const anthropicProvider = new AnthropicProvider();

// ---------------------------------------------------------------------------
// Error translation — wrap vendor errors in a typed LlmError.
// Includes simple jittered retry on transient 5xx/429 (003 §7.3.9).
// ---------------------------------------------------------------------------

const ANTHROPIC_RETRYABLE = new Set<LlmError["kind"]>(["5xx", "rate_limit"]);
const ANTHROPIC_MAX_RETRIES = 2;

async function invokeAnthropic<T>(call: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= ANTHROPIC_MAX_RETRIES) {
    try {
      return await call();
    } catch (err) {
      const translated = translateAnthropicError(err);
      lastErr = translated;
      if (!ANTHROPIC_RETRYABLE.has(translated.kind) || attempt === ANTHROPIC_MAX_RETRIES) {
        throw translated;
      }
      const backoffMs = 250 * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, backoffMs));
      attempt++;
    }
  }
  throw lastErr;
}

function translateAnthropicError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const e = err as { status?: number; message?: string };
  const status = e?.status;
  const message = e?.message ?? String(err);
  if (status === 401 || status === 403) {
    return new LlmError(message, "auth_failed", "anthropic", err);
  }
  if (status === 429) {
    return new LlmError(message, "rate_limit", "anthropic", err);
  }
  if (status !== undefined && status >= 500) {
    return new LlmError(message, "5xx", "anthropic", err);
  }
  return new LlmError(message, "malformed_response", "anthropic", err);
}
