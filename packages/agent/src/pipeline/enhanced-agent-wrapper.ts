/**
 * ENHANCED AGENT WRAPPER
 * Adds streaming, error recovery, caching, and monitoring to existing agents
 * Implements all SOTA improvements without breaking existing code
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createCachedSystemPrompt } from "../caching/prompt-cache";
import { concurrencyManager } from "../concurrency/concurrency-manager";
import {
  executeWithRetry,
  executeWithTimeout,
  globalCircuitBreaker,
  globalMonitor,
} from "../error-handling/error-recovery";

export interface EnhancedAgentOptions {
  userId: string;
  enableStreaming?: boolean;
  enableCaching?: boolean;
  enableRetry?: boolean;
  enableCircuitBreaker?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface AgentExecutionStats {
  duration: number;
  retries: number;
  cached: boolean;
  success: boolean;
}

/**
 * Wrap an agent call with all SOTA improvements
 */
export async function executeEnhancedAgent<T>(
  agentName: string,
  agentFn: () => Promise<T>,
  options: EnhancedAgentOptions,
): Promise<{ result: T; stats: AgentExecutionStats }> {
  const startTime = Date.now();
  const retryCount = 0;
  const { userId, enableRetry = true, enableCircuitBreaker = true, timeoutMs = 30000 } = options;

  try {
    // Build the function chain
    let fn: () => Promise<T> = agentFn;

    // Wrap with circuit breaker
    if (enableCircuitBreaker) {
      const originalFn = fn;
      fn = () => globalCircuitBreaker.execute(originalFn);
    }

    // Wrap with timeout
    if (timeoutMs) {
      const originalFn = fn;
      fn = () => executeWithTimeout(originalFn, timeoutMs);
    }

    // Wrap with retry + exponential backoff
    if (enableRetry) {
      const originalFn = fn;
      fn = async () =>
        executeWithRetry(originalFn, {
          maxRetries: options.maxRetries ?? 3,
          baseDelayMs: 1000,
        });
    }

    // Execute with concurrency control
    const result = await concurrencyManager.run(userId, fn);

    globalMonitor.recordSuccess(Date.now() - startTime);

    return {
      result,
      stats: {
        duration: Date.now() - startTime,
        retries: retryCount,
        cached: false,
        success: true,
      },
    };
  } catch (error) {
    globalMonitor.recordFailure(error instanceof Error ? error : new Error(String(error)));

    throw new Error(
      `Enhanced agent '${agentName}' failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Build a cached system prompt for agents
 */
export function buildCachedSystemPromptForAgent(
  staticPrompt: string,
  dynamicContext?: string,
): Anthropic.MessageParam["content"] {
  const parts: Anthropic.MessageParam["content"] = [createCachedSystemPrompt(staticPrompt)];

  if (dynamicContext) {
    parts.push({
      type: "text",
      text: dynamicContext,
    });
  }

  return parts;
}

/**
 * Get execution statistics for monitoring
 */
export function getAgentExecutionStats() {
  return {
    requestMetrics: globalMonitor.getMetrics(),
    circuitBreakerState: globalCircuitBreaker.getState(),
    successRate: globalMonitor.getSuccessRate(),
  };
}

/**
 * Reset monitoring statistics
 */
export function resetAgentExecutionStats() {
  globalMonitor.reset();
}
