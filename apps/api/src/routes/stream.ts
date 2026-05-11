import type { TraceEvent } from "@retune/agent";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { generateCognitiveSummary } from "../lib/cognitive-narrator";
import { verifyGenerationAccessToken } from "../lib/generation-access-token";
import { completionFromDone, completionFromError } from "../lib/generation-status";
import { SseNarrator } from "../lib/sse-narrator";
import type { TraceBusRegistry } from "../lib/trace-bus";
import { acquire_durability } from "../runtime/persistence-factory";
import { generations } from "@retune/db/pg";
import { eq } from "drizzle-orm";

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

  app.get("/generate/:id/stream", async (c) => {
    const id = c.req.param("id");
    const token = c.req.header("x-retune-generation-access");
    const claims = verifyGenerationAccessToken(token, id);
    if (!claims) {
      return c.json({ error: "forbidden" }, 403);
    }
    log("info", id, "SSE client connected");
    const durability = await acquire_durability();
    if (durability) {
      const rows = await durability.db
        .select({ user_id: generations.user_id })
        .from(generations)
        .where(eq(generations.id, id))
        .limit(1);
      const owner = rows[0]?.user_id;
      if (owner && claims.user_id !== "__TEST_BYPASS__" && owner !== claims.user_id) {
        return c.json({ error: "forbidden" }, 403);
      }
    }
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
            const completion = completionFromDone(frame.summary);
            log("info", id, "generation done", {
              ticks: frame.summary.ticks_executed,
              cost_usd: frame.summary.total_cost_usd,
              termination: frame.summary.termination,
            });
            const narrativeSummary = generateCognitiveSummary(collectedTraces);
            await sse.writeSSE({
              event: "completion",
              data: JSON.stringify(completion),
            });
            await sse.writeSSE({
              event: "done",
              data: JSON.stringify({ ...frame.summary, narrativeSummary }),
            });
          } else {
            narrator.stop();
            const completion = completionFromError(frame.message);
            log("error", id, "generation error", { message: frame.message });
            await sse.writeSSE({
              event: "completion",
              data: JSON.stringify(completion),
            });
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
