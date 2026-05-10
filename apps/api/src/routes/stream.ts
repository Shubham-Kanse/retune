import type { TraceEvent } from "@retune/agent";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { generateCognitiveSummary } from "../lib/cognitive-narrator";
import { SseNarrator } from "../lib/sse-narrator";
import type { TraceBusRegistry } from "../lib/trace-bus";

const log = (level: "info" | "warn" | "error", tag: string, msg: string, meta?: unknown) => {
  const prefix = `[stream:${tag}]`;
  const line = meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else console.log(line);
};

export function stream_routes(registry: TraceBusRegistry) {
  const app = new Hono();

  app.get("/generate/:id/stream", (c) => {
    const id = c.req.param("id");
    log("info", id, "SSE client connected");
    const bus = registry.get(id);
    if (!bus) {
      log("warn", id, "bus not found — generation_id unknown or already expired");
      return c.json({ error: "generation_not_found", generation_id: id }, 404);
    }

    return streamSSE(c, async (sse) => {
      const heartbeat = setInterval(() => {
        sse.writeSSE({ event: "ping", data: "" }).catch(() => {});
      }, 15_000);

      const collectedTraces: TraceEvent[] = [];
      let tickCount = 0;

      const narrator = new SseNarrator(bus, (text) => {
        sse
          .writeSSE({ event: "narrative_paragraph", data: JSON.stringify({ text }) })
          .catch(() => {});
      });
      narrator.start();

      try {
        for await (const frame of bus.subscribe()) {
          if (frame.kind === "trace") {
            collectedTraces.push(frame.event);
            tickCount++;
            if (tickCount === 1 || tickCount % 10 === 0) {
              log("info", id, `tick #${tickCount} specialist=${frame.event.specialist}`);
            }
            await sse.writeSSE({
              event: "trace",
              data: JSON.stringify(frame.event),
              id: String(frame.event.seq),
            });
          } else if (frame.kind === "done") {
            narrator.stop();
            log("info", id, "generation done", {
              ticks: frame.summary.ticks_executed,
              cost_usd: frame.summary.total_cost_usd,
              termination: frame.summary.termination,
            });
            const narrativeSummary = generateCognitiveSummary(collectedTraces);
            await sse.writeSSE({
              event: "done",
              data: JSON.stringify({ ...frame.summary, narrativeSummary }),
            });
          } else {
            narrator.stop();
            log("error", id, "generation error", { message: frame.message });
            await sse.writeSSE({
              event: "error",
              data: JSON.stringify({ message: frame.message }),
            });
          }
        }
      } catch (err) {
        log("error", id, "SSE stream threw", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        log("info", id, `SSE connection closed after ${tickCount} ticks`);
        narrator.stop();
        clearInterval(heartbeat);
      }
    });
  });

  return app;
}
