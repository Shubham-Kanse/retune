/**
 * ML client error taxonomy.
 *
 * Distinguishing transient (retryable) from permanent (do-not-retry)
 * errors is essential for the orchestrator's retry policy and for
 * cost accounting (we don't want exponential backoff on a 4xx).
 */

export type MLErrorKind =
  | "transport" // network, DNS, connection refused
  | "timeout"
  | "server_5xx"
  | "client_4xx" // bad request, validation
  | "validation" // response failed zod validation
  | "aborted";

export class MLClientError extends Error {
  constructor(
    public readonly kind: MLErrorKind,
    message: string,
    public readonly status?: number,
    public readonly cause_err?: unknown,
  ) {
    super(message);
    this.name = "MLClientError";
  }

  is_retryable(): boolean {
    return this.kind === "transport" || this.kind === "timeout" || this.kind === "server_5xx";
  }
}
