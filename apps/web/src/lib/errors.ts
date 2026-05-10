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

export function toErrorResponse(err: unknown): { error: string; code: string; status: number } {
  if (err instanceof AppError) {
    logger.warn("Application error", { code: err.code, message: err.message });
    return { error: err.message, code: err.code, status: err.statusCode };
  }

  logger.error("Unhandled error", err instanceof Error ? err : new Error(String(err)));
  return { error: "An unexpected error occurred", code: "INTERNAL_ERROR", status: 500 };
}
