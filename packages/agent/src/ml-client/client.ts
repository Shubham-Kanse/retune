/**
 * ML client — transport-agnostic facade over `apps/ml`.
 *
 * Owns:
 *   - retry policy (exponential backoff + cooperative cancellation)
 *   - zod validation of every payload (defense-in-depth: even if the
 *     transport's wire format is wrong, validation catches mismatches
 *     before they corrupt the workbench state)
 *   - request id propagation
 *
 * Delegates:
 *   - wire format → `MLTransport` (HttpTransport or GrpcTransport)
 *
 * Pick a transport per environment:
 *   - dev: `HttpTransport` against `apps/ml`'s FastAPI (commit #1)
 *   - prod: `GrpcTransport` against the gRPC server (commit #5)
 *
 * @brain thalamus + cerebellar precision: routing + validation
 */

import {
  type ClassifyDiscourseRequest,
  ClassifyDiscourseRequestSchema,
  type ClassifyDiscourseResponse,
  ClassifyDiscourseResponseSchema,
  type EmbedRequest,
  EmbedRequestSchema,
  type EmbedResponse,
  EmbedResponseSchema,
  type ExtractSpansRequest,
  ExtractSpansRequestSchema,
  type ExtractSpansResponse,
  ExtractSpansResponseSchema,
  type MLHealthResponse,
  MLHealthResponseSchema,
} from "@retune/types";
import { MLClientError } from "./errors";
import { HttpTransport, type HttpTransportConfig } from "./http-transport";
import { DEFAULT_RETRY_POLICY, type RetryPolicy, with_retries } from "./retry-policy";
import type { MLTransport } from "./transport";

export interface MLClientConfig {
  /** Backing transport. Default: HTTP at `base_url`. */
  transport: MLTransport;
  retry_policy?: RetryPolicy;
}

export class MLClient {
  private readonly transport: MLTransport;
  private readonly retry_policy: RetryPolicy;

  constructor(config: MLClientConfig) {
    this.transport = config.transport;
    this.retry_policy = config.retry_policy ?? DEFAULT_RETRY_POLICY;
  }

  /** Convenience factory for the common HTTP case. */
  static http(config: HttpTransportConfig & { retry_policy?: RetryPolicy }): MLClient {
    return new MLClient({
      transport: new HttpTransport(config),
      retry_policy: config.retry_policy,
    });
  }

  /** Diagnostic: `"http"` or `"grpc"`. */
  get transport_kind(): MLTransport["kind"] {
    return this.transport.kind;
  }

  // ─────────── Public RPCs ───────────

  async health(signal?: AbortSignal): Promise<MLHealthResponse> {
    const raw = await with_retries(() => this.transport.health(signal), this.retry_policy, signal);
    return validate(MLHealthResponseSchema, raw, "Health");
  }

  async embed(req: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    const validated_in = validate(EmbedRequestSchema, req, "EmbedRequest");
    const raw = await with_retries(
      () => this.transport.embed(validated_in, signal),
      this.retry_policy,
      signal,
    );
    return validate(EmbedResponseSchema, raw, "EmbedResponse");
  }

  async extract_spans(
    req: ExtractSpansRequest,
    signal?: AbortSignal,
  ): Promise<ExtractSpansResponse> {
    const validated_in = validate(ExtractSpansRequestSchema, req, "ExtractSpansRequest");
    const raw = await with_retries(
      () => this.transport.extract_spans(validated_in, signal),
      this.retry_policy,
      signal,
    );
    return validate(ExtractSpansResponseSchema, raw, "ExtractSpansResponse");
  }

  async classify_discourse(
    req: ClassifyDiscourseRequest,
    signal?: AbortSignal,
  ): Promise<ClassifyDiscourseResponse> {
    const validated_in = validate(ClassifyDiscourseRequestSchema, req, "ClassifyDiscourseRequest");
    const raw = await with_retries(
      () => this.transport.classify_discourse(validated_in, signal),
      this.retry_policy,
      signal,
    );
    return validate(ClassifyDiscourseResponseSchema, raw, "ClassifyDiscourseResponse");
  }
}

function validate<T>(schema: { parse: (v: unknown) => T }, value: unknown, what: string): T {
  try {
    return schema.parse(value);
  } catch (err) {
    throw new MLClientError(
      "validation",
      `${what} failed schema validation: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err,
    );
  }
}
