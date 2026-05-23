/**
 * Prometheus metrics (Charter 05 Epic 04 NEW).
 *
 * Exposes runtime metrics in Prometheus text format at `/metrics` on
 * the API. Scraped by the production Prometheus / Grafana Cloud stack.
 *
 * Metrics exposed:
 *   - retune_http_requests_total{method,route,status}     counter
 *   - retune_http_request_duration_seconds{method,route}  histogram
 *   - retune_generation_outcomes_total{termination}       counter
 *   - retune_generation_ticks                             histogram
 *   - retune_generation_cost_usd                          histogram
 *   - retune_active_traces                                gauge (current bus count)
 *   - retune_temporal_enabled                             gauge (1/0)
 *   - retune_persist_mode                                 gauge label-encoded
 *   - retune_circuit_breaker_state{name}                  gauge (0=closed,1=half_open,2=open)
 *
 * No external Prometheus client library is needed — the format is a
 * simple newline-delimited text encoding documented at
 * https://prometheus.io/docs/instrumenting/exposition_formats/.
 */

import type { Context, MiddlewareHandler } from "hono";

// ─── In-memory aggregator ────────────────────────────────────────────
interface CounterEntry {
  name: string;
  help: string;
  type: "counter";
  values: Map<string, number>;
}

interface GaugeEntry {
  name: string;
  help: string;
  type: "gauge";
  values: Map<string, number>;
}

interface HistogramEntry {
  name: string;
  help: string;
  type: "histogram";
  buckets: readonly number[];
  values: Map<
    string,
    {
      bucketCounts: number[];
      sum: number;
      count: number;
    }
  >;
}

type MetricEntry = CounterEntry | GaugeEntry | HistogramEntry;

const metrics: Map<string, MetricEntry> = new Map();

function labelKey(labels: Record<string, string | number | undefined>): string {
  const entries = Object.entries(labels)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}="${escapeLabel(String(v))}"`).join(",");
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ─── Public API ──────────────────────────────────────────────────────
export function registerCounter(name: string, help: string): void {
  if (metrics.has(name)) return;
  metrics.set(name, { name, help, type: "counter", values: new Map() });
}

export function registerGauge(name: string, help: string): void {
  if (metrics.has(name)) return;
  metrics.set(name, { name, help, type: "gauge", values: new Map() });
}

export function registerHistogram(name: string, help: string, buckets: readonly number[]): void {
  if (metrics.has(name)) return;
  metrics.set(name, {
    name,
    help,
    type: "histogram",
    buckets: [...buckets].sort((a, b) => a - b),
    values: new Map(),
  });
}

export function incrementCounter(
  name: string,
  labels: Record<string, string | number | undefined> = {},
  by = 1,
): void {
  const entry = metrics.get(name);
  if (!entry || entry.type !== "counter") return;
  const k = labelKey(labels);
  entry.values.set(k, (entry.values.get(k) ?? 0) + by);
}

export function setGauge(
  name: string,
  value: number,
  labels: Record<string, string | number | undefined> = {},
): void {
  const entry = metrics.get(name);
  if (!entry || entry.type !== "gauge") return;
  entry.values.set(labelKey(labels), value);
}

export function observeHistogram(
  name: string,
  value: number,
  labels: Record<string, string | number | undefined> = {},
): void {
  const entry = metrics.get(name);
  if (!entry || entry.type !== "histogram") return;
  const k = labelKey(labels);
  let v = entry.values.get(k);
  if (!v) {
    v = { bucketCounts: new Array(entry.buckets.length).fill(0), sum: 0, count: 0 };
    entry.values.set(k, v);
  }
  v.sum += value;
  v.count += 1;
  for (let i = 0; i < entry.buckets.length; i++) {
    if (value <= (entry.buckets[i] ?? 0)) v.bucketCounts[i] = (v.bucketCounts[i] ?? 0) + 1;
  }
}

// ─── Format renderer ─────────────────────────────────────────────────
export function renderMetrics(): string {
  const lines: string[] = [];
  for (const entry of metrics.values()) {
    lines.push(`# HELP ${entry.name} ${entry.help}`);
    lines.push(`# TYPE ${entry.name} ${entry.type}`);

    if (entry.type === "counter" || entry.type === "gauge") {
      if (entry.values.size === 0) {
        lines.push(`${entry.name} 0`);
      } else {
        for (const [labelStr, value] of entry.values) {
          const suffix = labelStr ? `{${labelStr}}` : "";
          lines.push(`${entry.name}${suffix} ${value}`);
        }
      }
    } else {
      // histogram
      if (entry.values.size === 0) {
        for (const b of entry.buckets) {
          lines.push(`${entry.name}_bucket{le="${b}"} 0`);
        }
        lines.push(`${entry.name}_bucket{le="+Inf"} 0`);
        lines.push(`${entry.name}_sum 0`);
        lines.push(`${entry.name}_count 0`);
      } else {
        for (const [labelStr, h] of entry.values) {
          const labelComma = labelStr ? `${labelStr},` : "";
          for (let i = 0; i < entry.buckets.length; i++) {
            lines.push(
              `${entry.name}_bucket{${labelComma}le="${entry.buckets[i]}"} ${h.bucketCounts[i] ?? 0}`,
            );
          }
          lines.push(`${entry.name}_bucket{${labelComma}le="+Inf"} ${h.count}`);
          const labelSuffix = labelStr ? `{${labelStr}}` : "";
          lines.push(`${entry.name}_sum${labelSuffix} ${h.sum}`);
          lines.push(`${entry.name}_count${labelSuffix} ${h.count}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

// ─── Bootstrap default metric set ────────────────────────────────────
function bootstrapDefaults(): void {
  registerCounter(
    "retune_http_requests_total",
    "Total HTTP requests served by the Retune API, labelled by method, route, and status.",
  );
  registerHistogram(
    "retune_http_request_duration_seconds",
    "Wall-clock duration of HTTP requests in seconds.",
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  );
  registerCounter(
    "retune_generation_outcomes_total",
    "Generations completed, labelled by termination reason.",
  );
  registerHistogram(
    "retune_generation_ticks",
    "Number of orchestrator ticks per generation.",
    [1, 5, 10, 20, 30, 50, 75, 100, 150, 256],
  );
  registerHistogram(
    "retune_generation_cost_usd",
    "Cost in USD per generation (sum of LLM + ML calls).",
    [0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  );
  registerGauge("retune_active_traces", "Number of in-flight trace buses.");
  registerGauge("retune_temporal_enabled", "1 if RETUNE_TEMPORAL=1 at boot, else 0.");
  registerGauge(
    "retune_circuit_breaker_state",
    "Circuit breaker state per name (0=closed, 1=half_open, 2=open).",
  );
}
bootstrapDefaults();

// ─── HTTP middleware ─────────────────────────────────────────────────
/**
 * Hono middleware that records request count + latency. Place AFTER
 * `requestLoggerMiddleware` so the route is normalised.
 */
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const dur = (Date.now() - start) / 1000;
  // Normalise the route by trimming trailing UUIDs/ids so cardinality stays bounded.
  const route = normaliseRoute(c.req.path);
  const status = String(c.res.status);
  incrementCounter("retune_http_requests_total", {
    method: c.req.method,
    route,
    status,
  });
  observeHistogram("retune_http_request_duration_seconds", dur, {
    method: c.req.method,
    route,
  });
};

function normaliseRoute(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\.(docx|pdf)$/i, ".:format");
}

// ─── Hono handler ────────────────────────────────────────────────────
export function metricsHandler(c: Context): Response {
  // Update gauges that derive from process state every scrape.
  setGauge(
    "retune_temporal_enabled",
    process.env.RETUNE_TEMPORAL === "1" || Boolean(process.env.RETUNE_TEMPORAL_ADDRESS) ? 1 : 0,
  );
  return c.text(renderMetrics(), 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "Cache-Control": "no-store",
  });
}
