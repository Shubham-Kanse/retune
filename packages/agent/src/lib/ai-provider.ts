/**
 * Provider-agnostic AI interface.
 *
 * All pipeline agents talk to this — never to a vendor SDK directly.
 *
 * v003 SOTA additions (Section 7 of the technical work doc):
 *   - createStructuredOutput: Zod-schema → typed JSON, with provider-native
 *     enforcement (OpenAI Responses API `response_format`,
 *     Anthropic forced-tool-use).
 *   - createReasonedOutput: structured output + reasoning effort knob.
 *   - searchWeb: hosted web search returning typed results.
 *   - searchFiles: hosted file search over a vector store id.
 *   - runBackground: long-running frontier review path.
 *   - getModelCallTelemetry: provider response id + token counts surfaced
 *     to the audit trail and the `generation_model_calls` table.
 *
 * Backwards compatibility:
 *   - `createMessage` and `createMessageWithTool` are unchanged so every
 *     existing specialist keeps working.
 *   - The new methods have default implementations on the abstract base
 *     so a provider that does not yet implement (e.g. legacy Anthropic
 *     path for hosted file search) returns a typed `unsupported` result
 *     rather than throwing.
 */

import type { z } from "zod";

export type MessageRole = "user" | "assistant";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export type ContentBlock = TextContent | ToolUseContent;

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * A system prompt block. `cacheHint` is an optional hint to the provider that
 * this block is a good candidate for prompt caching (Anthropic honours it;
 * other providers ignore it).
 */
export interface SystemBlock {
  type: "text";
  text: string;
  /** Provider hint: cache this block if the provider supports prompt caching. */
  cacheHint?: boolean;
}

export interface MessageParams {
  model: string;
  maxTokens: number;
  /** Plain string or structured blocks (for multi-part / cacheable system prompts). */
  system: string | SystemBlock[];
  messages: Message[];
  tools?: ToolDefinition[];
  /** Force the model to call a specific tool by name. */
  forceTool?: string;
}

export interface AIResponse {
  content: ContentBlock[];
  stopReason: "tool_use" | "end_turn" | "max_tokens" | string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Anthropic prompt-cache read tokens (0 for other providers) */
    cacheReadTokens: number;
    /** Anthropic prompt-cache creation tokens (0 for other providers) */
    cacheCreationTokens: number;
    /** Reasoning tokens (OpenAI o-series) — 0 when unavailable. */
    reasoningTokens?: number;
  };
  model: string;
  /** Provider-side response id for audit + correlation (003 §8). */
  providerResponseId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 003 SOTA — structured output, reasoning effort, web/file search, telemetry
// ─────────────────────────────────────────────────────────────────────────────

export type ReasoningEffort = "low" | "medium" | "high";

/**
 * StructuredOutputParams — drives a single LLM call that MUST emit JSON
 * conforming to the supplied Zod schema. Providers that natively
 * enforce schemas use them; others fall back to forced-tool-use.
 */
export interface StructuredOutputParams<T> {
  model: string;
  maxTokens: number;
  system: string | SystemBlock[];
  messages: Message[];
  /** Zod schema describing the expected JSON. */
  schema: z.ZodType<T>;
  /** Stable name for the schema (used for tool name + telemetry tags). */
  schemaName: string;
  /** Optional plain-language description of what the schema is for. */
  schemaDescription?: string;
}

export interface ReasonedOutputParams<T> extends StructuredOutputParams<T> {
  /** Reasoning effort — providers that ignore this set effort to default. */
  reasoningEffort: ReasoningEffort;
}

export interface WebSearchOptions {
  /** Cap how many distinct page fetches the provider may make. */
  maxUses?: number;
  /** Optional list of allowed domains. */
  allowedDomains?: readonly string[];
  /** Optional list of blocked domains (used for SSRF defence in depth). */
  blockedDomains?: readonly string[];
}

export interface WebSearchCitation {
  url: string;
  title: string | null;
  snippet: string | null;
  fetchedAt: string;
}

export interface WebSearchResult {
  /** Plain-text answer summarising the search. */
  summary: string;
  /** Underlying citations the provider relied on. */
  citations: WebSearchCitation[];
  /** Whether the provider had to refuse part of the query (e.g. blocked domains). */
  partial: boolean;
}

export interface FileSearchOptions {
  /** Provider-side vector store identifier. */
  vectorStoreId: string;
  /** Maximum number of chunks to retrieve. */
  topK?: number;
}

export interface FileSearchHit {
  fileId: string;
  fileName: string | null;
  snippet: string;
  score: number;
}

export interface FileSearchResult {
  hits: FileSearchHit[];
  partial: boolean;
}

export interface BackgroundParams<T> extends StructuredOutputParams<T> {
  /** Reasoning effort for the background run. */
  reasoningEffort: ReasoningEffort;
  /** Stable trace id (e.g. generation id). */
  traceId: string;
}

export interface BackgroundRun<T> {
  /** Provider-side run id. */
  runId: string;
  /** Resolves with the final structured output once the run finishes. */
  result: Promise<T>;
}

/** Telemetry record for a single provider call (gen_model_calls row). */
export interface ModelCallTelemetry {
  agent: string;
  cognitiveFunctionId: string | null;
  provider: "openai" | "anthropic";
  model: string;
  responseId: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number;
  requestHash: string;
  responseHash: string | null;
  createdAt: string;
}

/**
 * Capability advertisement from a provider — specialists branch on this
 * before requesting features that may not exist (e.g. hosted file search
 * is OpenAI-only at the time of writing).
 */
export interface ProviderCapabilities {
  structuredOutput: boolean;
  reasoningEffort: boolean;
  webSearch: boolean;
  fileSearch: boolean;
  backgroundRuns: boolean;
  promptCaching: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AIProvider interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AIProvider {
  readonly capabilities: ProviderCapabilities;

  /**
   * Send a message and return the full response.
   * Usage is recorded internally by each provider.
   */
  createMessage(agent: string, params: MessageParams): Promise<AIResponse>;

  /**
   * Send a message that must respond with a specific tool call.
   * Automatically retries with a larger token budget on truncation.
   */
  createMessageWithTool<T = unknown>(
    agent: string,
    params: MessageParams,
    toolName: string,
  ): Promise<T>;

  /**
   * Structured output — drives the model to emit JSON that conforms to
   * the supplied Zod schema. Default fallback: forced-tool-use.
   */
  createStructuredOutput<T>(agent: string, params: StructuredOutputParams<T>): Promise<T>;

  /**
   * Structured output + reasoning effort. Providers that ignore the
   * `reasoningEffort` field MUST treat this as `createStructuredOutput`.
   */
  createReasonedOutput<T>(agent: string, params: ReasonedOutputParams<T>): Promise<T>;

  /**
   * Hosted web search. Returns null when the provider has no native
   * web-search tool — callers should treat null as "no fresh data".
   */
  searchWeb(query: string, opts?: WebSearchOptions): Promise<WebSearchResult | null>;

  /**
   * Hosted file search over a provider-side vector store.
   * Returns null when the provider has no native file search.
   */
  searchFiles(query: string, opts: FileSearchOptions): Promise<FileSearchResult | null>;

  /**
   * Long-running structured output with reasoning effort. Returns
   * immediately; consumers `await runBackground.result` when they need
   * the answer. Returns null when unsupported.
   */
  runBackground<T>(agent: string, params: BackgroundParams<T>): Promise<BackgroundRun<T> | null>;

  /** Pop the recorded telemetry buffer for this process. */
  drainModelCallTelemetry(): ModelCallTelemetry[];

  /** Model identifiers for this provider. */
  models: Models;
}

/**
 * Canonical model tiers (technical-2.0 §4.2).
 */
export interface Models {
  smart: string;
  fast: string;
  frontier: string;
}
