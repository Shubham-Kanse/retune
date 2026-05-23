/**
 * OpenTelemetry initialisation (Charter 05 Epic 02).
 *
 * Conditional: only activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 * Honeycomb / Grafana Tempo / Jaeger / Datadog APM all accept OTLP.
 *
 * Wire-up:
 *   1. `pnpm --filter @retune/api add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http`
 *   2. Set `OTEL_EXPORTER_OTLP_ENDPOINT=https://<your-collector>/v1/traces`.
 *   3. (Optional) Set `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`.
 *   4. Call `await initOTel()` at the very top of `apps/api/src/main.ts`
 *      BEFORE any other imports that might trigger instrumentation
 *      (auto-instrumentations need to patch require/import early).
 *
 * Architect note: instrumentation must be the FIRST thing the process
 * does — patching imports late means uninstrumented modules slip through.
 */

let _shutdownHook: (() => Promise<void>) | null = null;

export async function initOTel(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  try {
    // @ts-expect-error — optional dep
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    // @ts-expect-error — optional dep
    // biome-ignore format: keep on one line so @ts-expect-error covers the import
    const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
    // @ts-expect-error — optional dep
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    // @ts-expect-error — optional dep
    const { Resource } = await import("@opentelemetry/resources");
    // @ts-expect-error — optional dep
    const { SemanticResourceAttributes } = await import("@opentelemetry/semantic-conventions");

    const sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "retune-api",
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? "development",
      }),
      traceExporter: new OTLPTraceExporter({
        url: endpoint,
        headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
          ? Object.fromEntries(
              process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",").map((kv) => {
                const [k, v] = kv.split("=");
                return [k?.trim() ?? "", v?.trim() ?? ""];
              }),
            )
          : undefined,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable the noisy fs instrumentation — it floods spans.
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();
    _shutdownHook = async () => {
      try {
        await sdk.shutdown();
      } catch {
        // best-effort shutdown
      }
    };

    // eslint-disable-next-line no-console
    console.log(`[otel] tracing enabled → ${endpoint}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[otel] SDK packages not installed — skipping. To enable, run:",
      "pnpm --filter @retune/api add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function shutdownOTel(): Promise<void> {
  if (_shutdownHook) await _shutdownHook();
}

export const otelEnabled = (): boolean => Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
