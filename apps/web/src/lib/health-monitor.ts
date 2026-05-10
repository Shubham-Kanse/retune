interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  responseTime: number;
  lastCheck: number;
  error?: string;
  metadata?: Record<string, any>;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  activeConnections: number;
  requestsPerSecond: number;
  errorRate: number;
}

class SystemHealthMonitor {
  private checks = new Map<string, HealthCheck>();
  private metrics: SystemMetrics = {
    cpu: 0,
    memory: 0,
    disk: 0,
    activeConnections: 0,
    requestsPerSecond: 0,
    errorRate: 0,
  };
  private intervals = new Map<string, NodeJS.Timeout>();
  private alerts: Array<{
    message: string;
    severity: "low" | "medium" | "high";
    timestamp: number;
  }> = [];

  registerHealthCheck(
    name: string,
    checkFn: () => Promise<{ status: "healthy" | "degraded" | "unhealthy"; metadata?: any }>,
    intervalMs = 30000,
  ): void {
    // Initial check
    this.runHealthCheck(name, checkFn);

    // Schedule periodic checks
    const interval = setInterval(() => {
      this.runHealthCheck(name, checkFn);
    }, intervalMs);

    this.intervals.set(name, interval);
  }

  private async runHealthCheck(
    name: string,
    checkFn: () => Promise<{ status: "healthy" | "degraded" | "unhealthy"; metadata?: any }>,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await checkFn();
      const responseTime = Date.now() - startTime;

      const check: HealthCheck = {
        name,
        status: result.status,
        responseTime,
        lastCheck: Date.now(),
        metadata: result.metadata,
      };

      // Check for status changes
      const previousCheck = this.checks.get(name);
      if (previousCheck && previousCheck.status !== result.status) {
        this.triggerAlert(
          `Health check '${name}' status changed from ${previousCheck.status} to ${result.status}`,
          result.status === "unhealthy" ? "high" : "medium",
        );
      }

      this.checks.set(name, check);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.checks.set(name, {
        name,
        status: "unhealthy",
        responseTime,
        lastCheck: Date.now(),
        error: errorMessage,
      });

      this.triggerAlert(`Health check '${name}' failed: ${errorMessage}`, "high");
    }
  }

  updateMetrics(metrics: Partial<SystemMetrics>): void {
    this.metrics = { ...this.metrics, ...metrics };

    // Check for threshold alerts
    if (metrics.cpu && metrics.cpu > 80) {
      this.triggerAlert(`High CPU usage: ${metrics.cpu}%`, "medium");
    }
    if (metrics.memory && metrics.memory > 85) {
      this.triggerAlert(`High memory usage: ${metrics.memory}%`, "medium");
    }
    if (metrics.errorRate && metrics.errorRate > 5) {
      this.triggerAlert(`High error rate: ${metrics.errorRate}%`, "high");
    }
  }

  getOverallHealth(): "healthy" | "degraded" | "unhealthy" {
    const checks = Array.from(this.checks.values());
    if (checks.length === 0) return "healthy";

    const unhealthyCount = checks.filter((c) => c.status === "unhealthy").length;
    const degradedCount = checks.filter((c) => c.status === "degraded").length;

    if (unhealthyCount > 0) return "unhealthy";
    if (degradedCount > 0) return "degraded";
    return "healthy";
  }

  getHealthChecks(): HealthCheck[] {
    return Array.from(this.checks.values());
  }

  getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  getAlerts(limit = 50): Array<{ message: string; severity: string; timestamp: number }> {
    return this.alerts.slice(-limit);
  }

  private triggerAlert(message: string, severity: "low" | "medium" | "high"): void {
    this.alerts.push({
      message,
      severity,
      timestamp: Date.now(),
    });

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    // Log critical alerts
    if (severity === "high") {
      console.error(`[ALERT] ${message}`);
    }
  }

  unregisterHealthCheck(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
    this.checks.delete(name);
  }

  shutdown(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    this.checks.clear();
  }
}

export const healthMonitor = new SystemHealthMonitor();

// Register default health checks
healthMonitor.registerHealthCheck(
  "database",
  async () => {
    try {
      const { getDb } = await import("@retune/db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      const result = await db.execute(sql`SELECT 1 as test`);
      const rows = (result as { rows?: unknown[] }).rows ?? (result as unknown[]);
      const ok = Array.isArray(rows) ? rows.length > 0 : !!result;
      return {
        status: ok ? "healthy" : "unhealthy",
        metadata: { connected: ok },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
  15000, // Check every 15 seconds
);

healthMonitor.registerHealthCheck(
  "anthropic_api",
  async () => {
    const hasKey =
      !!process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY !== "sk-ant-api03-placeholder-key-for-development-testing-only";

    return {
      status: hasKey ? "healthy" : "degraded",
      metadata: { configured: hasKey },
    };
  },
  60000, // Check every minute
);

healthMonitor.registerHealthCheck(
  "memory_usage",
  async () => {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const percentage = Math.round((usage.heapUsed / usage.heapTotal) * 100);

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (percentage > 90) status = "unhealthy";
    else if (percentage > 75) status = "degraded";

    return {
      status,
      metadata: { usedMB, totalMB, percentage },
    };
  },
  10000, // Check every 10 seconds
);

// Update system metrics periodically
setInterval(() => {
  const usage = process.memoryUsage();
  const memoryPercentage = Math.round((usage.heapUsed / usage.heapTotal) * 100);

  healthMonitor.updateMetrics({
    memory: memoryPercentage,
    // In a real implementation, you'd collect actual CPU, disk, and network metrics
    cpu: Math.random() * 20 + 10, // Simulated
    disk: Math.random() * 10 + 30, // Simulated
    activeConnections: Math.floor(Math.random() * 100 + 50), // Simulated
  });
}, 5000);
