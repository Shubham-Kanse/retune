import { z } from "zod";
import { DiscourseFunctionSchema } from "./blackboard";
import { ConfidenceSchema } from "./confidence";
import { SpanKindSchema } from "./evidence";

/**
 * ML service contracts — the boundary between the TS workbench and the
 * Python ML compute layer (apps/ml).
 *
 * Source of truth is `packages/proto/proto/ml.proto`. These zod schemas
 * mirror those messages and are used at runtime to validate every payload
 * crossing the boundary in either direction.
 *
 * Until gRPC codegen lands, we transport over HTTP/JSON. The wire format
 * is JSON; embeddings are float32 arrays serialized as numeric arrays.
 */

// ───────────── Health ─────────────

export const MLHealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("retune-ml"),
  version: z.string(),
  uptime_seconds: z.number().nonnegative(),
  models_loaded: z.array(z.string()),
});
export type MLHealthResponse = z.infer<typeof MLHealthResponseSchema>;

// ───────────── Embed ─────────────

export const EmbedRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(256),
  model: z.string().default("bge-large-en-v1.5"),
  /** Truncate input to this many tokens; null = use model default. */
  max_tokens: z.number().int().positive().nullable().default(null),
});
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;

export const EMBEDDING_DIM = 768;

export const EmbedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number()).length(EMBEDDING_DIM)),
  model_version: z.string(),
  /** Server-side latency, milliseconds. */
  latency_ms: z.number().nonnegative(),
});
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;

// ───────────── Extract spans ─────────────

export const ExtractSpansRequestSchema = z.object({
  text: z.string().min(1),
  source_doc_kind: z.string(),
  span_kinds: z.array(SpanKindSchema).default([]),
});
export type ExtractSpansRequest = z.infer<typeof ExtractSpansRequestSchema>;

export const RawExtractedSpanSchema = z.object({
  kind: SpanKindSchema,
  text: z.string(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  confidence: ConfidenceSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type RawExtractedSpan = z.infer<typeof RawExtractedSpanSchema>;

export const ExtractSpansResponseSchema = z.object({
  spans: z.array(RawExtractedSpanSchema),
  model_version: z.string(),
  latency_ms: z.number().nonnegative(),
});
export type ExtractSpansResponse = z.infer<typeof ExtractSpansResponseSchema>;

// ───────────── Classify discourse ─────────────

export const ClassifyDiscourseRequestSchema = z.object({
  jd_text: z.string().min(50),
});
export type ClassifyDiscourseRequest = z.infer<typeof ClassifyDiscourseRequestSchema>;

export const ClassifyDiscourseResponseSchema = z.object({
  sentences: z.array(
    z.object({
      sentence_index: z.number().int().nonnegative(),
      text: z.string(),
      function: DiscourseFunctionSchema,
      function_logits: z.record(DiscourseFunctionSchema, z.number()),
      importance: z.number().min(0).max(1),
    }),
  ),
  model_version: z.string(),
  latency_ms: z.number().nonnegative(),
});
export type ClassifyDiscourseResponse = z.infer<typeof ClassifyDiscourseResponseSchema>;

// ───────────── Errors ─────────────

export const MLErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  request_id: z.string().optional(),
});
export type MLError = z.infer<typeof MLErrorSchema>;
