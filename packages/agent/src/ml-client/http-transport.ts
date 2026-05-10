/**
 * HTTP/JSON transport.
 *
 * The commit #1 implementation, refactored to live behind the
 * `MLTransport` interface so callers can swap in `GrpcTransport`
 * without touching the rest of the agent.
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
import { MLClientError } from "./errors";
import type { MLTransport } from "./transport";

export interface HttpTransportConfig {
  base_url: string;
  /** Per-request hard timeout, milliseconds. Default 30s. */
  request_timeout_ms?: number;
  default_headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpTransport implements MLTransport {
  readonly kind = "http" as const;
  private readonly base_url: string;
  private readonly request_timeout_ms: number;
  private readonly default_headers: Record<string, string>;

  constructor(config: HttpTransportConfig) {
    this.base_url = config.base_url.replace(/\/+$/, "");
    this.request_timeout_ms = config.request_timeout_ms ?? DEFAULT_TIMEOUT_MS;
    this.default_headers = config.default_headers ?? {};
  }

  health(signal?: AbortSignal): Promise<MLHealthResponse> {
    return this.do_request<MLHealthResponse>("GET", "/health", undefined, signal);
  }

  embed(req: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse> {
    return this.do_request<EmbedResponse>("POST", "/embed", req, signal);
  }

  extract_spans(req: ExtractSpansRequest, signal?: AbortSignal): Promise<ExtractSpansResponse> {
    return this.do_request<ExtractSpansResponse>("POST", "/extract-spans", req, signal);
  }

  classify_discourse(
    req: ClassifyDiscourseRequest,
    signal?: AbortSignal,
  ): Promise<ClassifyDiscourseResponse> {
    return this.do_request<ClassifyDiscourseResponse>("POST", "/classify-discourse", req, signal);
  }

  private async do_request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    user_signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.base_url}${path}`;
    const timeout_controller = new AbortController();
    const timeout = setTimeout(
      () => timeout_controller.abort(new Error("request timeout")),
      this.request_timeout_ms,
    );

    const composite_signal = compose_signals(user_signal, timeout_controller.signal);
    const headers: Record<string, string> = {
      ...this.default_headers,
      "x-request-id": crypto.randomUUID(),
    };
    if (body !== undefined) headers["content-type"] = "application/json";

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: composite_signal,
      });
      if (res.status >= 500) {
        throw new MLClientError("server_5xx", `${method} ${path} → ${res.status}`, res.status);
      }
      if (res.status >= 400) {
        const text = await safe_text(res);
        throw new MLClientError(
          "client_4xx",
          `${method} ${path} → ${res.status}: ${text}`,
          res.status,
        );
      }
      const json = (await res.json()) as T;
      return json;
    } catch (err) {
      if (err instanceof MLClientError) throw err;
      if (is_abort_error(err)) {
        if (timeout_controller.signal.aborted) {
          throw new MLClientError("timeout", `${method} ${path} timed out`, undefined, err);
        }
        throw new MLClientError("aborted", `${method} ${path} aborted by caller`, undefined, err);
      }
      throw new MLClientError("transport", `${method} ${path}: ${describe(err)}`, undefined, err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function compose_signals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const real = signals.filter((s): s is AbortSignal => s !== undefined);
  if (real.length === 0) return new AbortController().signal;
  if (real.length === 1) {
    const sig = real[0];
    if (sig) return sig;
  }
  return AbortSignal.any(real);
}

function is_abort_error(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
}

async function safe_text(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 512);
  } catch {
    return "<unreadable body>";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
