import OpenAI from "openai";
import type { z } from "zod";
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
  WebSearchOptions,
  WebSearchResult,
} from "../../ai-provider";
import { LlmError } from "../../llm-error";
import {
  OPENAI_CAPS,
  drainTelemetry,
  hashRequest,
  hashResponse,
  newProviderResponseId,
  recordTelemetry,
  reasonedOutputViaStructured,
  structuredOutputViaTool,
  zodToJsonSchema,
} from "../../provider-shared";

// ---------------------------------------------------------------------------
// Model resolution (technical-2.0 §4.2)
// ---------------------------------------------------------------------------

export const OPENAI_MODELS: Models = {
  smart: process.env.AGENT_MODEL || "gpt-4o",
  fast: process.env.AGENT_MODEL_FAST || "gpt-4o-mini",
  frontier: process.env.AGENT_MODEL_FRONTIER || "gpt-5",
};

// ---------------------------------------------------------------------------
// Token-based cost estimator (003 §7.3.7) — deliberately conservative.
// Prices are USD per 1k tokens; only used for telemetry, not enforcement.
// ---------------------------------------------------------------------------

const COST_PER_1K: Record<string, { input: number; output: number; reasoning?: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-5": { input: 0.015, output: 0.075 },
  "o1": { input: 0.015, output: 0.06, reasoning: 0.06 },
};

function costFor(model: string, inputTokens: number, outputTokens: number, reasoningTokens = 0): number {
  const k = COST_PER_1K[model] ?? COST_PER_1K[model.split(":")[0] ?? ""] ?? { input: 0.001, output: 0.005 };
  const inputCost = (inputTokens / 1_000) * k.input;
  const outputCost = (outputTokens / 1_000) * k.output;
  const reasoningCost = ((k.reasoning ?? 0) * reasoningTokens) / 1_000;
  return inputCost + outputCost + reasoningCost;
}

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
// Usage ring-buffer (legacy stat surface — kept for compatibility)
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
      providerResponseId: response.id,
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
    providerResponseId: response.id,
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
  readonly capabilities: ProviderCapabilities = OPENAI_CAPS;

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
    const elapsed = Date.now() - t0;
    recordUsage(agent, model, response.usage, elapsed);

    const aiResp = fromOpenAIResponse(response, model);

    // Always record SOTA telemetry for the orchestrator's audit trail.
    recordTelemetry("openai", {
      agent,
      cognitiveFunctionId: null,
      provider: "openai",
      model,
      responseId: aiResp.providerResponseId ?? null,
      inputTokens: aiResp.usage.inputTokens,
      outputTokens: aiResp.usage.outputTokens,
      reasoningTokens: aiResp.usage.reasoningTokens ?? null,
      cacheReadTokens: aiResp.usage.cacheReadTokens,
      cacheCreationTokens: aiResp.usage.cacheCreationTokens,
      costUsd: costFor(model, aiResp.usage.inputTokens, aiResp.usage.outputTokens),
      latencyMs: elapsed,
      requestHash: hashRequest({ model, system: params.system, messages: params.messages }),
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
   * Structured output via Chat Completions `response_format: json_schema`.
   *
   * Falls back to forced-tool-use when the model doesn't support
   * `json_schema` (rare; gpt-4o family fully supports it). Schema is
   * still validated client-side via Zod — defence in depth against
   * provider drift.
   */
  async createStructuredOutput<T>(
    agent: string,
    params: StructuredOutputParams<T>,
  ): Promise<T> {
    const model = params.model;
    const schemaJson = zodToJsonSchema(params.schema);

    const sdkParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      max_tokens: params.maxTokens,
      messages: toOpenAIMessages(params.system, params.messages),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.schemaName,
          description: params.schemaDescription,
          schema: schemaJson as Record<string, unknown>,
          strict: true,
        },
      } as unknown as OpenAI.ChatCompletionCreateParams["response_format"],
    };

    const t0 = Date.now();
    let resp: OpenAI.ChatCompletion | null = null;
    try {
      resp = await invokeOpenAI(() => getSdkClient().chat.completions.create(sdkParams));
    } catch (err) {
      // If the model rejects strict json_schema, fall back to forced-tool-use.
      if (err instanceof LlmError && err.kind === "malformed_response") {
        return structuredOutputViaTool(this, agent, params);
      }
      throw err;
    }
    const elapsed = Date.now() - t0;
    recordUsage(agent, model, resp.usage, elapsed);

    const text = resp.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError(
        `OpenAI structured output returned invalid JSON for schema=${params.schemaName}`,
        "malformed_response",
        "openai",
      );
    }
    const result = params.schema.parse(parsed);

    recordTelemetry("openai", {
      agent,
      cognitiveFunctionId: params.schemaName,
      provider: "openai",
      model,
      responseId: resp.id,
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      reasoningTokens: null,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: costFor(model, resp.usage?.prompt_tokens ?? 0, resp.usage?.completion_tokens ?? 0),
      latencyMs: elapsed,
      requestHash: hashRequest({ model, schema: params.schemaName, messages: params.messages }),
      responseHash: hashResponse(text),
      createdAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Reasoned output — uses `reasoning_effort` for o-series + structured
   * output via json_schema. Falls back to plain structured output for
   * gpt-4o family which does not accept `reasoning_effort`.
   */
  async createReasonedOutput<T>(agent: string, params: ReasonedOutputParams<T>): Promise<T> {
    const model = params.model;
    const isReasoning = /^o\d/.test(model) || model.startsWith("gpt-5");
    if (!isReasoning) return this.createStructuredOutput(agent, params);

    const schemaJson = zodToJsonSchema(params.schema);
    const sdkParams = {
      model,
      max_completion_tokens: params.maxTokens,
      messages: toOpenAIMessages(params.system, params.messages),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.schemaName,
          description: params.schemaDescription,
          schema: schemaJson as Record<string, unknown>,
          strict: true,
        },
      },
      reasoning_effort: params.reasoningEffort,
    } as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming;

    const t0 = Date.now();
    let resp: OpenAI.ChatCompletion;
    try {
      resp = await invokeOpenAI(() => getSdkClient().chat.completions.create(sdkParams));
    } catch (err) {
      if (err instanceof LlmError && err.kind === "malformed_response") {
        return reasonedOutputViaStructured(this, agent, params);
      }
      throw err;
    }
    const elapsed = Date.now() - t0;

    const text = resp.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError(
        `OpenAI reasoned output returned invalid JSON for schema=${params.schemaName}`,
        "malformed_response",
        "openai",
      );
    }
    const result = params.schema.parse(parsed);

    recordTelemetry("openai", {
      agent,
      cognitiveFunctionId: params.schemaName,
      provider: "openai",
      model,
      responseId: resp.id,
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
      reasoningTokens: null,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: costFor(model, resp.usage?.prompt_tokens ?? 0, resp.usage?.completion_tokens ?? 0),
      latencyMs: elapsed,
      requestHash: hashRequest({ model, schema: params.schemaName, effort: params.reasoningEffort }),
      responseHash: hashResponse(text),
      createdAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Hosted web search via the Responses API when available; otherwise
   * returns null so callers fall back to deterministic stubs.
   *
   * SECURITY: when `opts.allowedDomains` is set, only those hosts are
   * accepted; this is the SSRF defence-in-depth layer for company research.
   */
  async searchWeb(query: string, opts?: WebSearchOptions): Promise<WebSearchResult | null> {
    // The OpenAI SDK shape for hosted web search has shifted across
    // releases. We try the Responses API path first; if not available,
    // we return null so callers know to fall back.
    const sdk = getSdkClient();
    const responses = (sdk as unknown as { responses?: { create: (input: unknown) => Promise<unknown> } }).responses;
    if (!responses) return null;

    try {
      const tools: unknown[] = [{ type: "web_search_preview" }];
      const t0 = Date.now();
      const resp = (await responses.create({
        model: this.models.smart,
        input: query,
        tools,
        max_output_tokens: 1024,
      })) as { output_text?: string; id?: string; output?: unknown };
      const elapsed = Date.now() - t0;

      const summary = (resp.output_text ?? "").trim();
      if (!summary) return null;

      // Provider-side citations are not yet stable across SDK versions;
      // we return an empty list when we cannot extract them safely.
      const citations: WebSearchResult["citations"] = [];

      const allowed = opts?.allowedDomains;
      const blocked = opts?.blockedDomains;
      let partial = false;
      const filteredCitations = citations.filter((c) => {
        try {
          const host = new URL(c.url).host;
          if (allowed && !allowed.some((d) => host.endsWith(d))) {
            partial = true;
            return false;
          }
          if (blocked && blocked.some((d) => host.endsWith(d))) {
            partial = true;
            return false;
          }
          return true;
        } catch {
          partial = true;
          return false;
        }
      });

      recordTelemetry("openai", {
        agent: "web-search",
        cognitiveFunctionId: "researchCompanyWithWebSearch",
        provider: "openai",
        model: this.models.smart,
        responseId: resp.id ?? null,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        latencyMs: elapsed,
        requestHash: hashRequest({ tool: "web_search_preview", query }),
        responseHash: hashResponse(summary),
        createdAt: new Date().toISOString(),
      });

      return { summary, citations: filteredCitations, partial };
    } catch {
      return null;
    }
  }

  /**
   * Hosted file search via the Responses API. Returns null when the
   * SDK does not expose `responses.create` or the call fails.
   */
  async searchFiles(query: string, opts: FileSearchOptions): Promise<FileSearchResult | null> {
    const sdk = getSdkClient();
    const responses = (sdk as unknown as { responses?: { create: (input: unknown) => Promise<unknown> } }).responses;
    if (!responses) return null;
    try {
      const t0 = Date.now();
      const resp = (await responses.create({
        model: this.models.fast,
        input: query,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [opts.vectorStoreId],
            max_num_results: opts.topK ?? 5,
          },
        ],
        max_output_tokens: 512,
      })) as { id?: string };
      const elapsed = Date.now() - t0;

      // The SDK's typed accessor for file_search hits varies across
      // versions; we record telemetry but return an empty hits list
      // when extraction is unsafe.
      recordTelemetry("openai", {
        agent: "file-search",
        cognitiveFunctionId: "fileSearch",
        provider: "openai",
        model: this.models.fast,
        responseId: resp.id ?? null,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: null,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        latencyMs: elapsed,
        requestHash: hashRequest({ tool: "file_search", query, vector_store_id: opts.vectorStoreId }),
        responseHash: null,
        createdAt: new Date().toISOString(),
      });

      return { hits: [], partial: true };
    } catch {
      return null;
    }
  }

  /**
   * Background runs are not exposed as a stable Responses API surface
   * in the bundled SDK version, so we return null for now; the caller
   * (final red-team gate) falls back to a synchronous structured
   * output call.
   */
  async runBackground<T>(
    _agent: string,
    _params: BackgroundParams<T>,
  ): Promise<BackgroundRun<T> | null> {
    return null;
  }

  drainModelCallTelemetry(): ModelCallTelemetry[] {
    return drainTelemetry("openai");
  }
}

export const openaiProvider = new OpenAIProvider();

// ---------------------------------------------------------------------------
// Error translation — wrap vendor errors in a typed LlmError.
// Includes simple jittered retry on transient 5xx/429 (003 §7.3.9).
// ---------------------------------------------------------------------------

const RETRYABLE_KINDS = new Set<LlmError["kind"]>(["5xx", "rate_limit"]);
const MAX_RETRIES = 2;

async function invokeOpenAI<T>(call: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= MAX_RETRIES) {
    try {
      return await call();
    } catch (err) {
      const translated = translateOpenAIError(err);
      lastErr = translated;
      if (!RETRYABLE_KINDS.has(translated.kind) || attempt === MAX_RETRIES) {
        throw translated;
      }
      const backoffMs = 250 * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, backoffMs));
      attempt++;
    }
  }
  throw lastErr;
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

// Keep the helper so legacy callers can mint a deterministic id when the
// SDK does not return one (used by tests).
export function _newOpenAIResponseId(): string {
  return newProviderResponseId("openai");
}
