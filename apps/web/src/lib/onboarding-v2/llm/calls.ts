// Onboarding V2 — LLM Call Wrapper with Retry & Cost Tracking

import OpenAI from "openai";
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

export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  checkRateLimits(0.01);

  const modelId = options.model === "smart"
    ? (process.env.AGENT_MODEL ?? "gpt-4.1")
    : (process.env.AGENT_MODEL_FAST ?? "gpt-4.1-mini");

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: LLM_CALL_TIMEOUT_MS, maxRetries: 1 });
    const response = await openai.chat.completions.create({
      model: modelId,
      max_tokens: options.maxTokens ?? 4096,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = estimateCost(modelId, inputTokens, outputTokens);
    recordCall(costUsd);
    return { content, inputTokens, outputTokens, costUsd };
  } catch (err) {
    throw new LLMCallError(options.stage, options.callName, err instanceof Error ? err : undefined);
  }
}

/**
 * Structured output variant — enforces exact JSON schema via OpenAI's
 * response_format. Eliminates all field-name guessing and regex parsing.
 * Use for any call where the output shape must be exact.
 */
export async function callLLMStructured<T>(options: LLMCallOptions & { schema: Record<string, unknown>; schemaName: string }): Promise<T> {
  checkRateLimits(0.01);

  const modelId = options.model === "smart"
    ? (process.env.AGENT_MODEL ?? "gpt-4.1")
    : (process.env.AGENT_MODEL_FAST ?? "gpt-4.1-mini");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: LLM_CALL_TIMEOUT_MS, maxRetries: 1 });
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
