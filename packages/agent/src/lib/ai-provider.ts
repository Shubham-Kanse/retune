/**
 * Provider-agnostic AI interface.
 * All pipeline agents talk to this — never to a vendor SDK directly.
 */

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
  };
  model: string;
}

export interface AIProvider {
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
   * Provider-specific web search for company research.
   * Returns null when the provider does not support native web search
   * (callers should fall back to emptyIntel).
   */
  searchWeb(query: string, maxUses?: number): Promise<string | null>;

  /** Model identifiers for this provider. */
  models: Models;
}

/**
 * Canonical model tiers (technical-2.0 §4.2).
 *
 * - `smart`: best quality, highest cost. Default for content-shaping calls
 *   (NarrativeArcProposer, SequentialBulletComposer).
 * - `fast`: cheap+quick. Default for parallel critic calls and onboarding chat.
 * - `frontier`: best-of-best, escalation only. Used by CriticEnsemble when
 *   panel divergence exceeds the threshold (≤ 2.5% of generations after month 4).
 */
export interface Models {
  smart: string;
  fast: string;
  frontier: string;
}
