/**
 * Transport interface — pluggable HTTP / gRPC backends for the ML client.
 *
 * The `MLClient` facade owns retry, timeout, and zod validation. The
 * transport just does the wire work and returns parsed payloads in the
 * shape the zod schemas expect.
 *
 * Each transport is responsible for:
 *   - mapping zod-camelCase / snake_case mismatches if its wire format
 *     uses a different convention (the gRPC transport does field renames
 *     against `@retune/proto` generated stubs)
 *   - producing typed errors via `MLClientError` (transport / timeout /
 *     server_5xx / client_4xx / aborted / validation)
 *   - propagating the caller's `AbortSignal`
 *
 * @brain thalamus: routing layer between cortical regions
 */

import type {
  ClassifyDiscourseRequest,
  ClassifyDiscourseResponse,
  EmbedRequest,
  EmbedResponse,
  ExtractSpansRequest,
  ExtractSpansResponse,
  MLHealthResponse,
} from "@retune/types";

export interface MLTransport {
  /** Identifier used in logs/traces. */
  readonly kind: "http" | "grpc";
  health(signal?: AbortSignal): Promise<MLHealthResponse>;
  embed(req: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse>;
  extract_spans(req: ExtractSpansRequest, signal?: AbortSignal): Promise<ExtractSpansResponse>;
  classify_discourse(
    req: ClassifyDiscourseRequest,
    signal?: AbortSignal,
  ): Promise<ClassifyDiscourseResponse>;
}
