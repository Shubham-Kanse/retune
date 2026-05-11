import { logger } from "./logger";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "AUTH_ERROR", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, "RATE_LIMIT", 429);
  }
}

export class BillingError extends AppError {
  constructor(message: string) {
    super(message, "BILLING_ERROR", 402);
  }
}

export class AgentError extends AppError {
  constructor(message: string) {
    super(message, "AGENT_ERROR", 500, true);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, "EXTERNAL_SERVICE_ERROR", 502, true);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(message, "SERVICE_UNAVAILABLE", 503, true);
  }
}

export function isInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { code?: string };
  const code = String(e.code ?? "").toUpperCase();
  const msg = e.message.toLowerCase();

  // Network/DNS/transient infrastructure failures.
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code)) {
    return true;
  }
  if (
    msg.includes("getaddrinfo enotfound") ||
    msg.includes("connection refused") ||
    msg.includes("connect etimedout") ||
    msg.includes("network error") ||
    msg.includes("dns")
  ) {
    return true;
  }
  return false;
}

export function toErrorResponse(err: unknown): { error: string; code: string; status: number } {
  if (err instanceof AppError) {
    logger.warn("Application error", { code: err.code, message: err.message });
    return { error: err.message, code: err.code, status: err.statusCode };
  }

  if (isInfrastructureError(err)) {
    logger.error("Infrastructure connectivity error", err instanceof Error ? err : new Error(String(err)));
    return {
      error: "Service temporarily unavailable. Please retry in a moment.",
      code: "SERVICE_UNAVAILABLE",
      status: 503,
    };
  }

  logger.error("Unhandled error", err instanceof Error ? err : new Error(String(err)));
  return { error: "An unexpected error occurred", code: "INTERNAL_ERROR", status: 500 };
}

export async function withInfraFallback<T>(
  op: () => Promise<T>,
  fallback: T,
  opts?: { onInfraError?: (err: Error) => void },
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isInfrastructureError(err)) {
      opts?.onInfraError?.(err instanceof Error ? err : new Error(String(err)));
      return fallback;
    }
    throw err;
  }
}

export async function safeQuery<T>(
  query: () => Promise<T>,
  fallback: T,
  opts?: { onInfraError?: (err: Error) => void },
): Promise<T> {
  return withInfraFallback(query, fallback, opts);
}

export async function safeFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: T,
  opts?: {
    parse?: (response: Response) => Promise<T>;
    onInfraError?: (err: Error) => void;
    onNonOk?: (response: Response) => Promise<T> | T;
  },
): Promise<T> {
  return withInfraFallback(async () => {
    const response = await fetch(input, init);
    if (!response.ok) {
      if (opts?.onNonOk) return await opts.onNonOk(response);
      return fallback;
    }
    if (opts?.parse) return await opts.parse(response);
    return (await response.json()) as T;
  }, fallback, opts);
}
