import { healthMonitor } from "@/lib/health-monitor";
import { getDb } from "@retune/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Get comprehensive health status
    const overallHealth = healthMonitor.getOverallHealth();
    const healthChecks = healthMonitor.getHealthChecks();
    const metrics = healthMonitor.getMetrics();
    const alerts = healthMonitor.getAlerts(10);

    // Check database connectivity
    let result: unknown = null;
    try {
      const db = await getDb();
      result = await db.execute(sql`SELECT 1 as test`);
    } catch {
      result = null;
    }

    // Check environment variables
    const hasAnthropicKey =
      !!process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY !== "sk-ant-api03-placeholder-key-for-development-testing-only";
    const hasJwtSecret = !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;

    const status = {
      status: overallHealth,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: result ? "connected" : "disconnected",
      environment: {
        anthropic: hasAnthropicKey ? "configured" : "missing",
        jwt: hasJwtSecret ? "configured" : "missing",
        nodeEnv: process.env.NODE_ENV,
      },
      healthChecks: healthChecks.map((check) => ({
        name: check.name,
        status: check.status,
        responseTime: check.responseTime,
        lastCheck: new Date(check.lastCheck).toISOString(),
        error: check.error,
      })),
      metrics: {
        ...metrics,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          percentage: Math.round(
            (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
          ),
        },
      },
      alerts: alerts.map((alert) => ({
        message: alert.message,
        severity: alert.severity,
        timestamp: new Date(alert.timestamp).toISOString(),
      })),
      version: process.env.npm_package_version || "unknown",
    };

    const httpStatus = overallHealth === "healthy" ? 200 : overallHealth === "degraded" ? 200 : 503;

    return NextResponse.json(status, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        uptime: process.uptime(),
      },
      { status: 503 },
    );
  }
}
