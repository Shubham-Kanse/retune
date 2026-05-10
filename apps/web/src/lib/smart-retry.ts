interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

class SmartRetry {
  private attempts = new Map<string, number>();
  private lastErrors = new Map<string, string>();

  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    config: RetryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
    },
  ): Promise<T> {
    const attempts = this.attempts.get(key) || 0;

    try {
      const result = await fn();
      this.attempts.delete(key);
      this.lastErrors.delete(key);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.lastErrors.set(key, errorMsg);

      if (attempts >= config.maxRetries) {
        this.attempts.delete(key);
        throw error;
      }

      this.attempts.set(key, attempts + 1);

      // Smart backoff based on error type
      let delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempts),
        config.maxDelay,
      );

      // Reduce delay for rate limit errors
      if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
        delay *= 2; // Wait longer for rate limits
      }

      // Add jitter to prevent thundering herd
      delay += Math.random() * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.execute(key, fn, config);
    }
  }

  getAttempts(key: string): number {
    return this.attempts.get(key) || 0;
  }

  getLastError(key: string): string | undefined {
    return this.lastErrors.get(key);
  }
}

export const smartRetry = new SmartRetry();
