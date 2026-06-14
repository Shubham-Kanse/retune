/**
 * gRPC transport via Connect-RPC.
 *
 * Uses the generated `ML` service descriptor from `@retune/proto` to
 * create a strongly-typed client. The wire format is gRPC over HTTP/2.
 *
 * Conversion layer (zod ↔ proto):
 *   - field names: snake_case ↔ camelCase
 *   - embeddings: proto bytes ↔ zod number[][]
 *
 * Why a translation layer rather than swapping the agent codebase to
 * proto types directly: zod gives us runtime validation + nullable
 * defaults that are awkward in proto3, and the agent already uses zod
 * types extensively. Translation is mechanical and isolated to this
 * module, so a future migration to native proto types throughout is
 * straightforward — we'd only need to delete the converters.
 *
 */

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { type Client, Code, ConnectError, type Transport, createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  ML,
  ClassifyDiscourseRequestSchema as ProtoClassifyDiscourseRequestSchema,
  EmbedRequestSchema as ProtoEmbedRequestSchema,
  ExtractSpansRequestSchema as ProtoExtractSpansRequestSchema,
  HealthRequestSchema as ProtoHealthRequestSchema,
} from "@retune/proto";
import {
  type ClassifyDiscourseRequest,
  type ClassifyDiscourseResponse,
  EMBEDDING_DIM,
  type EmbedRequest,
  type EmbedResponse,
  type ExtractSpansRequest,
  type ExtractSpansResponse,
  type MLHealthResponse,
} from "@retune/types";
import { MLClientError } from "./errors";
import type { MLTransport } from "./transport";

export interface GrpcTransportConfig {
  /** e.g. `http://localhost:9090` (h2c) or `https://ml.internal` (TLS). */
  base_url: string;
  /** Per-request hard timeout, milliseconds. Default 30s. */
  request_timeout_ms?: number;
  /** Default `false` — set true for TLS-less h2c (typical local dev). */
  use_h2c?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class GrpcTransport implements MLTransport {
  readonly kind = "grpc" as const;
  private readonly client: Client<typeof ML>;
  private readonly request_timeout_ms: number;

  constructor(config: GrpcTransportConfig);
  constructor(config: { client: Client<typeof ML>; request_timeout_ms?: number });
  constructor(
    config: GrpcTransportConfig | { client: Client<typeof ML>; request_timeout_ms?: number },
  ) {
    if ("client" in config) {
      this.client = config.client;
      this.request_timeout_ms = config.request_timeout_ms ?? DEFAULT_TIMEOUT_MS;
      return;
    }
    const transport: Transport = createGrpcTransport({
      baseUrl: config.base_url.replace(/\/+$/, ""),
      // Connect's gRPC transport for Node uses HTTP/2; h2c (cleartext) is
      // inferred from `http://` URL scheme; TLS from `https://`.
    });
    this.client = createClient(ML, transport);
    this.request_timeout_ms = config.request_timeout_ms ?? DEFAULT_TIMEOUT_MS;
  }

  async health(signal?: AbortSignal): Promise<MLHealthResponse> {
    try {
      const composite = with_timeout(signal, this.request_timeout_ms);
      const res = await this.client.health(create(ProtoHealthRequestSchema, {}), {
        signal: composite.signal,
      });
      composite.cancel();
      return {
        status: res.status as "ok",
        service: res.service as "retune-ml",
        version: res.version,
        uptime_seconds: res.uptimeSeconds,
        models_loaded: [...res.modelsLoaded],
      };
    } catch (err) {
      throw translate_error(err, "Health");
    }
  }

  async embed(req: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    try {
      const composite = with_timeout(signal, this.request_timeout_ms);
      const proto_req = create(ProtoEmbedRequestSchema, {
        texts: [...req.texts],
        model: req.model,
        maxTokens: req.max_tokens ?? 0,
      });
      const res = await this.client.embed(proto_req, { signal: composite.signal });
      composite.cancel();
      return {
        embeddings: res.embeddings.map((b) => bytes_to_floats(b)),
        model_version: res.modelVersion,
        latency_ms: res.latencyMs,
      };
    } catch (err) {
      throw translate_error(err, "Embed");
    }
  }

  async extract_spans(
    req: ExtractSpansRequest,
    signal?: AbortSignal,
  ): Promise<ExtractSpansResponse> {
    try {
      const composite = with_timeout(signal, this.request_timeout_ms);
      const proto_req = create(ProtoExtractSpansRequestSchema, {
        text: req.text,
        sourceDocKind: req.source_doc_kind,
        spanKinds: [...req.span_kinds],
      });
      const res = await this.client.extractSpans(proto_req, { signal: composite.signal });
      composite.cancel();
      return {
        spans: res.spans.map((s) => ({
          kind: s.kind as ExtractSpansResponse["spans"][number]["kind"],
          text: s.text,
          char_start: s.charStart,
          char_end: s.charEnd,
          confidence: s.confidence
            ? {
                point: s.confidence.point,
                lower: s.confidence.lower,
                upper: s.confidence.upper,
                coverage: s.confidence.coverage,
              }
            : { point: 0, lower: 0, upper: 0, coverage: 0.95 },
          payload: s.payloadJson ? (JSON.parse(s.payloadJson) as Record<string, unknown>) : {},
        })),
        model_version: res.modelVersion,
        latency_ms: res.latencyMs,
      };
    } catch (err) {
      throw translate_error(err, "ExtractSpans");
    }
  }

  async classify_discourse(
    req: ClassifyDiscourseRequest,
    signal?: AbortSignal,
  ): Promise<ClassifyDiscourseResponse> {
    try {
      const composite = with_timeout(signal, this.request_timeout_ms);
      const proto_req = create(ProtoClassifyDiscourseRequestSchema, {
        jdText: req.jd_text,
      });
      const res = await this.client.classifyDiscourse(proto_req, {
        signal: composite.signal,
      });
      composite.cancel();
      return {
        sentences: res.sentences.map((s) => {
          // Proto sends `function_logits` as a `repeated double` in the
          // stable category order from `DISCOURSE_FUNCTIONS`. Reconstruct
          // the dict the zod schema expects.
          const logits_arr = s.functionLogits;
          const order = [
            "filter",
            "actual_test",
            "aspiration",
            "culture",
            "legal",
            "boilerplate",
          ] as const;
          const function_logits: Record<string, number> = {};
          for (let i = 0; i < order.length; i++) {
            const key = order[i];
            if (key) function_logits[key] = logits_arr[i] ?? 0;
          }
          return {
            sentence_index: s.sentenceIndex,
            text: s.text,
            function: s.function as ClassifyDiscourseResponse["sentences"][number]["function"],
            function_logits,
            importance: s.importance,
          };
        }),
        model_version: res.modelVersion,
        latency_ms: res.latencyMs,
      };
    } catch (err) {
      throw translate_error(err, "ClassifyDiscourse");
    }
  }
}

// ─────────── helpers ───────────

/**
 * Decode a binary float32 little-endian buffer into a number[] of length
 * `EMBEDDING_DIM`. Used for the proto `bytes embeddings` wire format.
 *
 * Throws via MLClientError if the byte length doesn't match the expected
 * embedding dimension — bad servers shouldn't silently degrade callers.
 */
function bytes_to_floats(bytes: Uint8Array): number[] {
  const expected_bytes = EMBEDDING_DIM * 4;
  if (bytes.byteLength !== expected_bytes) {
    throw new MLClientError(
      "validation",
      `embedding byte length ${bytes.byteLength} ≠ expected ${expected_bytes} (${EMBEDDING_DIM} × float32)`,
    );
  }
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return Array.from(new Float32Array(buffer));
}

interface CompositeSignal {
  signal: AbortSignal;
  cancel: () => void;
}

function with_timeout(user_signal: AbortSignal | undefined, timeout_ms: number): CompositeSignal {
  const timeout_ctrl = new AbortController();
  const timer = setTimeout(() => timeout_ctrl.abort(new Error("request timeout")), timeout_ms);
  const sources = [timeout_ctrl.signal];
  if (user_signal) sources.push(user_signal);
  const merged = AbortSignal.any(sources);
  return {
    signal: merged,
    cancel: () => clearTimeout(timer),
  };
}

function translate_error(err: unknown, rpc: string): MLClientError {
  if (err instanceof MLClientError) return err;
  if (err instanceof ConnectError) {
    if (err.code === Code.DeadlineExceeded) {
      return new MLClientError("timeout", `${rpc} timed out`, undefined, err);
    }
    if (err.code === Code.Canceled) {
      return new MLClientError("aborted", `${rpc} aborted`, undefined, err);
    }
    if (err.code === Code.Unavailable || err.code === Code.Internal) {
      return new MLClientError("server_5xx", `${rpc}: ${err.message}`, undefined, err);
    }
    if (
      err.code === Code.InvalidArgument ||
      err.code === Code.NotFound ||
      err.code === Code.PermissionDenied ||
      err.code === Code.Unauthenticated
    ) {
      return new MLClientError("client_4xx", `${rpc}: ${err.message}`, undefined, err);
    }
    return new MLClientError("transport", `${rpc}: ${err.message}`, undefined, err);
  }
  return new MLClientError(
    "transport",
    `${rpc}: ${err instanceof Error ? err.message : String(err)}`,
    undefined,
    err,
  );
}

// Avoid silently dropping the `fromBinary` / `toBinary` re-export — it's
// available for callers that want to round-trip wire bytes directly
// (e.g. snapshot tests, debugging tools).
export { fromBinary, toBinary };
