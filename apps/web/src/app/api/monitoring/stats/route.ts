import { getSession } from "@/lib/session";
import { getAgentExecutionStats } from "@retune/agent/web";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // SOTA: Get real-time monitoring stats
    const stats = getAgentExecutionStats();

    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          // Request metrics
          totalRequests: stats.requestMetrics.totalRequests,
          successfulRequests: stats.requestMetrics.successfulRequests,
          failedRequests: stats.requestMetrics.failedRequests,
          successRate: stats.successRate.toFixed(2) + "%",
          retries: stats.requestMetrics.retries,

          // Latency percentiles
          avgLatency: stats.requestMetrics.avgLatencyMs.toFixed(0) + "ms",
          p95Latency: stats.requestMetrics.p95LatencyMs.toFixed(0) + "ms",
          p99Latency: stats.requestMetrics.p99LatencyMs.toFixed(0) + "ms",

          // Circuit breaker status
          circuitBreakerStatus: stats.circuitBreakerState,

          // Error breakdown
          errorsByType: stats.requestMetrics.errorsByType,
        },
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
