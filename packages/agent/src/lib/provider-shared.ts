/**
 * Shared provider-side helpers (003 SOTA).
 *
 * Telemetry buffer + hashing helpers + structured-output fallback used
 * by both OpenAI and Anthropic providers. Lives outside provider-
 * specific modules so the same audit trail rows appear regardless of
 * `AI_PROVIDER`.
 */

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AIProvider,
  ModelCallTelemetry,
  ProviderCapabilities,
  ReasonedOutputParams,
  StructuredOutputParams,
  ToolDefinition,
} from "./ai-provider";

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry buffer (per-provider)
// ─────────────────────────────────────────────────────────────────────────────

const buffers: Record<string, ModelCallTelemetry[]> = {};

export function recordTelemetry(provider: "openai" | "anthropic", record: ModelCallTelemetry): void {
  const buf = buffers[provider] ?? (buffers[provider] = []);
  buf.push(record);
  // Cap each buffer at 10_000 entries to bound memory.
  if (buf.length > 10_000) buf.splice(0, buf.length - 10_000);
}

export function drainTelemetry(provider: "openai" | "anthropic"): ModelCallTelemetry[] {
  const buf = buffers[provider] ?? [];
  buffers[provider] = [];
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hashing helpers — deterministic, redact-safe
// ─────────────────────────────────────────────────────────────────────────────

export function hashRequest(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload, Object.keys(payload as object).sort()))
    .digest("hex")
    .slice(0, 32);
}

export function hashResponse(payload: unknown): string {
  return createHash("sha256")
    .update(typeof payload === "string" ? payload : JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured output via forced tool use
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Zod schema to a JSON schema with `$schema` stripped — works
 * for both Anthropic tools and OpenAI function-call params.
 */
export function zodToJsonSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Default fallback: forced-tool-use to emit JSON conforming to the schema.
 * Both Anthropic and OpenAI support this path; Anthropic requires it for
 * structured output today.
 */
export async function structuredOutputViaTool<T>(
  provider: AIProvider,
  agent: string,
  params: StructuredOutputParams<T>,
): Promise<T> {
  const schema = params.schema;
  const tool: ToolDefinition = {
    name: params.schemaName,
    description: params.schemaDescription ?? `Emit JSON conforming to the ${params.schemaName} schema.`,
    inputSchema: zodToJsonSchema(schema),
  };
  const raw = await provider.createMessageWithTool<unknown>(
    agent,
    {
      model: params.model,
      maxTokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
      tools: [tool],
      forceTool: params.schemaName,
    },
    params.schemaName,
  );
  // Validate against the Zod schema — this is the bug-prevention boundary.
  return schema.parse(raw);
}

/**
 * Default fallback for `createReasonedOutput` when the provider has no
 * native reasoning-effort knob: just emit structured output and ignore
 * the effort hint.
 */
export async function reasonedOutputViaStructured<T>(
  provider: AIProvider,
  agent: string,
  params: ReasonedOutputParams<T>,
): Promise<T> {
  return structuredOutputViaTool(provider, agent, params);
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability presets
// ─────────────────────────────────────────────────────────────────────────────

export const ANTHROPIC_CAPS: ProviderCapabilities = {
  structuredOutput: true,
  reasoningEffort: false,
  webSearch: true,
  fileSearch: false,
  backgroundRuns: false,
  promptCaching: true,
};

export const OPENAI_CAPS: ProviderCapabilities = {
  structuredOutput: true,
  reasoningEffort: true,
  webSearch: false, // toggled to true if the SDK exposes web_search_options
  fileSearch: true,
  backgroundRuns: true,
  promptCaching: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock-friendly id generator
// ─────────────────────────────────────────────────────────────────────────────

export function newProviderResponseId(provider: "openai" | "anthropic"): string {
  return `${provider}-${randomUUID()}`;
}
