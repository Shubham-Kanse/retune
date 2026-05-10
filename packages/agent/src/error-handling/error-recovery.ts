/**
 * ERROR RECOVERY & MONITORING
 * Exponential backoff, circuit breaker, request monitoring
 * Day 7 SOTA Implementation - 99.9% reliability
 */

// Error recovery and monitoring module - no Anthropic SDK dependency needed here

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number; // failures before opening circuit
  successThreshold?: number; // successes to close circuit
  timeoutMs?: number; // how long to stay open
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retries: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorsByType: Record<string, number>;
}

export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Execute with exponential backoff retry
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000, backoffMultiplier = 2 } = config;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-retryable errors
      if (!isRetryable(lastError)) {
        throw lastError;
      }

      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} retries: ${lastError.message}`);
      }

      // Calculate exponential backoff
      const delayMs = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);

      // Add jitter (±10%)
      const jitter = delayMs * 0.1 * (Math.random() - 0.5);
      const finalDelay = Math.max(delayMs + jitter, 0);

      console.log(
        `Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(finalDelay)}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, finalDelay));
    }
  }

  throw lastError || new Error("Unknown error");
}

/**
 * Determine if error is retryable.
 * Check .status property first — Anthropic/OpenAI SDK errors carry it as a
 * number, so "429" won't appear in the message text.
 */
function isRetryable(error: Error): boolean {
  const status = (error as Error & { status?: number }).status;
  if (typeof status === "number") {
    return [429, 500, 502, 503, 504].includes(status);
  }

  const message = error.message.toLowerCase();
  return [
    "rate limit",
    "too many requests",
    "overloaded",
    "529",
    "429",
    "500",
    "502",
    "503",
    "504",
    "timeout",
    "econnreset",
    "enotfound",
    "temporarily unavailable",
    "service unavailable",
  ].some((pattern) => message.includes(pattern));
}

/**
 * Circuit breaker pattern
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastOpenTime = 0;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 3,
      timeoutMs: config.timeoutMs ?? 60000,
    };
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If circuit is open, check if we should try half-open
    if (this.state === CircuitBreakerState.OPEN) {
      const timeSinceOpen = Date.now() - this.lastOpenTime;
      if (timeSinceOpen > this.config.timeoutMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker OPEN. Retry after ${Math.round((this.config.timeoutMs - timeSinceOpen) / 1000)}s`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        console.log("Circuit breaker CLOSED");
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.lastOpenTime = Date.now();
      console.log("Circuit breaker OPEN");
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.lastOpenTime = Date.now();
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }
}

/**
 * Monitor and collect metrics
 */
export class RequestMonitor {
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    errorsByType: {},
  };

  private latencies: number[] = [];

  /**
   * Record successful request
   */
  recordSuccess(latencyMs: number): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.latencies.push(latencyMs);
    this.updateLatencyStats();
  }

  /**
   * Record failed request
   */
  recordFailure(error: Error): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    const errorType = error.constructor.name;
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
  }

  /**
   * Record retry attempt
   */
  recordRetry(): void {
    this.metrics.retries++;
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<RequestMetrics> {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      errorsByType: {},
    };
    this.latencies = [];
  }

  /**
   * Get success rate
   */
  getSuccessRate(): number {
    if (this.metrics.totalRequests === 0) return 100;
    return (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
  }

  private updateLatencyStats(): void {
    if (this.latencies.length === 0) return;

    const sorted = [...this.latencies].sort((a, b) => a - b);
    this.metrics.avgLatencyMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    this.metrics.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.p99LatencyMs = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }
}

/**
 * Timeout wrapper
 */
export async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

/**
 * Bulkhead pattern - isolate resource consumption
 */
export class Bulkhead {
  private activeRequests = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent = 10) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(() => resolve()));
    }

    this.activeRequests++;

    try {
      return await fn();
    } finally {
      this.activeRequests--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getStats(): { activeRequests: number; queuedRequests: number } {
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.queue.length,
    };
  }
}

// Global instances
export const globalCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 60000,
});

export const globalMonitor = new RequestMonitor();

export const globalBulkhead = new Bulkhead(10);
