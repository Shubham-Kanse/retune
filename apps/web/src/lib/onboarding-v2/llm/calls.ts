// Onboarding V2 — LLM Call Wrapper with Retry & Cost Tracking

import { getModels, getProvider } from "@retune/agent/web";
import {
  LLM_CALL_TIMEOUT_MS,
  MAX_CALLS_PER_MINUTE,
  MAX_CALLS_PER_SESSION,
  MAX_COST_PER_SESSION_USD,
} from "../constants";
import { LLMCallError, RateLimitError } from "../errors";

export interface LLMCallOptions {
  systemPrompt: string;
  userMessage: string;
  model: "smart" | "fast";
  temperature?: number;
  maxTokens?: number;
  stage: number;
  callName: string;
}

export interface LLMCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Per-session rate limiter (in-memory, reset per request context)
let sessionCallCount = 0;
let sessionCostUsd = 0;
const minuteWindow: number[] = [];

export function resetSessionLimits() {
  sessionCallCount = 0;
  sessionCostUsd = 0;
  minuteWindow.length = 0;
}

export function getSessionStats() {
  return { calls: sessionCallCount, costUsd: sessionCostUsd };
}

function checkRateLimits(estimatedCost: number) {
  if (sessionCallCount >= MAX_CALLS_PER_SESSION) {
    throw new RateLimitError();
  }
  if (sessionCostUsd + estimatedCost > MAX_COST_PER_SESSION_USD) {
    throw new RateLimitError();
  }
  const now = Date.now();
  while (minuteWindow.length) {
    const oldest = minuteWindow[0];
    if (oldest === undefined || now - oldest <= 60_000) break;
    minuteWindow.shift();
  }
  if (minuteWindow.length >= MAX_CALLS_PER_MINUTE) {
    throw new RateLimitError();
  }
}

function recordCall(cost: number) {
  sessionCallCount++;
  sessionCostUsd += cost;
  minuteWindow.push(Date.now());
}

/**
 * Charter 09 AI/ML — every onboarding-v2 LLM call goes through the
 * shared agent provider (`@retune/agent/web`). This means:
 *   - One source of truth for which model implements "smart" / "fast".
 *   - Concurrency gating (5 global / 2 per agent) shared with all other
 *     specialists.
 *   - Provider switching (anthropic <-> openai) is centralised.
 *   - Telemetry capture per agent rolls up under
 *     `onboarding-v2:{stage}:{callName}` instead of bypassing the
 *     instrumentation by going direct to OpenAI/Anthropic SDKs.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  checkRateLimits(0.01);

  const provider = getProvider();
  const models = getModels();
  const modelId = options.model === "smart" ? models.smart : models.fast;
  const agent = `onboarding-v2:${options.stage}:${options.callName}`;

  try {
    const response = await provider.createMessage(agent, {
      model: modelId,
      maxTokens: options.maxTokens ?? 4096,
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userMessage }],
    });

    // The provider returns a normalised `AIResponse`. Extract the first
    // text content block; the agent provider already canonicalises this
    // across openai vs anthropic shapes.
    const firstContent = response.content?.[0];
    const content = firstContent && firstContent.type === "text" ? firstContent.text : "";
    const inputTokens = response.usage?.inputTokens ?? 0;
    const outputTokens = response.usage?.outputTokens ?? 0;
    const costUsd = estimateCost(modelId, inputTokens, outputTokens);
    recordCall(costUsd);
    return { content, inputTokens, outputTokens, costUsd };
  } catch (err) {
    throw new LLMCallError(options.stage, options.callName, err instanceof Error ? err : undefined);
  }
}

/**
 * Structured output variant — uses the provider's structured-output
 * surface (which falls back to forced-tool-use when the underlying
 * model doesn't support strict JSON schemas natively).
 *
 * NOTE: kept temporarily on the OpenAI direct path until the provider's
 * `createStructuredOutput` accepts a raw JSON schema (today it requires
 * a Zod schema). Tracked as Charter 09 Epic 02 follow-up.
 */
export async function callLLMStructured<T>(
  options: LLMCallOptions & { schema: Record<string, unknown>; schemaName: string },
): Promise<T> {
  checkRateLimits(0.01);

  // Dynamic import keeps the OpenAI SDK out of the bundle when this
  // function isn't called.
  const { default: OpenAI } = await import("openai");

  const models = getModels();
  const modelId = options.model === "smart" ? models.smart : models.fast;

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: LLM_CALL_TIMEOUT_MS,
    maxRetries: 1,
  });
  const response = await openai.chat.completions.create({
    model: modelId,
    max_tokens: options.maxTokens ?? 8192,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: options.schemaName,
        strict: true,
        schema: options.schema,
      },
    },
  });

  const content = response.choices[0]?.message?.content ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  recordCall(estimateCost(modelId, inputTokens, outputTokens));

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new LLMCallError(options.stage, options.callName);
  }
}

export async function callLLMWithRetry(
  options: LLMCallOptions,
  maxRetries: number,
): Promise<LLMCallResult> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await callLLM(options);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt <= maxRetries) {
        await sleep(1000 * attempt); // linear backoff
      }
    }
  }
  throw lastError ?? new LLMCallError(options.stage, options.callName);
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Rough cost estimates (Anthropic Sonnet / Haiku pricing)
  const isSmartModel = model.includes("sonnet") || model.includes("gpt-4o");
  const inputRate = isSmartModel ? 3.0 / 1_000_000 : 0.25 / 1_000_000;
  const outputRate = isSmartModel ? 15.0 / 1_000_000 : 1.25 / 1_000_000;
  return inputTokens * inputRate + outputTokens * outputRate;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
