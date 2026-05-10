/**
 * CONCURRENCY MANAGER
 * Global and per-user concurrency limits with p-limit
 * Day 2 SOTA Implementation
 */

import pLimit from "p-limit";

interface ConcurrencyConfig {
  globalLimit?: number;
  perUserLimit?: number;
}

export class ConcurrencyManager {
  private globalLimit: ReturnType<typeof pLimit>;
  private userLimits: Map<string, ReturnType<typeof pLimit>>;
  private globalConfig: Required<ConcurrencyConfig>;

  constructor(config: ConcurrencyConfig = {}) {
    this.globalConfig = {
      globalLimit: config.globalLimit ?? 5,
      perUserLimit: config.perUserLimit ?? 2,
    };
    this.globalLimit = pLimit(this.globalConfig.globalLimit);
    this.userLimits = new Map();
  }

  /**
   * Get or create per-user limit
   */
  private getUserLimit(userId: string): ReturnType<typeof pLimit> {
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, pLimit(this.globalConfig.perUserLimit));
    }
    return this.userLimits.get(userId)!;
  }

  /**
   * Run a function with concurrency control
   */
  async run<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const userLimit = this.getUserLimit(userId);
    return this.globalLimit(() => userLimit(() => fn()));
  }

  /**
   * Run multiple functions in parallel with concurrency control
   */
  async runAll<T>(userId: string, fns: Array<() => Promise<T>>): Promise<T[]> {
    const userLimit = this.getUserLimit(userId);

    return Promise.all(fns.map((fn) => this.globalLimit(() => userLimit(() => fn()))));
  }

  /**
   * Run with timeout protection
   */
  async runWithTimeout<T>(userId: string, fn: () => Promise<T>, timeoutMs = 30000): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    return Promise.race([this.run(userId, fn), timeoutPromise]);
  }

  /**
   * Cleanup per-user limits (call on logout or session end)
   */
  cleanupUser(userId: string): void {
    this.userLimits.delete(userId);
  }

  /**
   * Get current pending count (for monitoring)
   */
  getStats(): {
    globalPending: number;
    userCounts: Record<string, number>;
  } {
    return {
      globalPending: this.globalLimit.pendingCount,
      userCounts: Object.fromEntries(
        Array.from(this.userLimits.entries()).map(([userId, limit]) => [
          userId,
          limit.pendingCount,
        ]),
      ),
    };
  }
}

// Singleton instance for use across the app
export const concurrencyManager = new ConcurrencyManager({
  globalLimit: 5,
  perUserLimit: 2,
});
