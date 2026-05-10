import { analytics } from "@/lib/analytics";
import { errorTracker } from "@/lib/error-tracker";
import { perf } from "@/lib/performance";
import { NextResponse } from "next/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function GET(request: Request): Promise<NextResponse> {
  // Require a secret token — set ADMIN_SECRET env var to enable this endpoint
  if (!ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin endpoint disabled" }, { status: 403 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const metrics = {
    performance: {
      averageResponseTime: perf.getAverageTime("api_request"),
      slowQueries: perf.getMetrics().filter((m) => m.duration > 1000).length,
      totalRequests: perf.getMetrics().length,
    },
    analytics: {
      totalEvents: analytics.getEvents().length,
      eventCounts: analytics.getEventCounts(),
      uniqueUsers: new Set(
        analytics
          .getEvents()
          .map((e) => e.userId)
          .filter(Boolean),
      ).size,
    },
    errors: {
      totalErrors: errorTracker.getErrors().length,
      recentErrors: errorTracker.getErrors(10),
    },
    system: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(metrics);
}
