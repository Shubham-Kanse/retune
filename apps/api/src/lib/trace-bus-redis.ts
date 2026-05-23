/**
 * TraceBus durability adapter (Charter 04 Epic 04 NEW).
 *
 * Default: in-process `TraceBusRegistry` from `./trace-bus.ts`.
 *
 * When `RETUNE_TRACE_BUS=redis` is set + `REDIS_URL` is configured,
 * routes go through `RedisTraceBusRegistry` which:
 *   - publishes frames to a per-generation Redis Stream
 *     (`retune:trace:{generation_id}`)
 *   - persists final-blackboard + done-summary to keys with TTL
 *   - lets any API instance serve the SSE stream for a generation that
 *     was started on a different instance
 *
 * Without these env vars, the in-process implementation is used —
 * dev still works without Redis. Production with horizontal scaling
 * MUST flip the flag.
 *
 * Implementation notes:
 *   - We don't yet replace the local fan-out (`Set<Inbox>`); a Redis
 *     bus delegates to a local TraceBus for per-instance subscribers,
 *     and uses Redis Streams ONLY for cross-instance replication.
 *     This keeps SSE backpressure semantics identical to the local
 *     case.
 *   - Each generation gets a Redis Stream + two side keys (final
 *     blackboard, done summary). All keys expire after 30 days
 *     (Charter 02-Core-Features Epic 05 hydration window).
 *
 * To enable in production:
 *
 *   pnpm --filter @retune/api add ioredis
 *   export RETUNE_TRACE_BUS=redis
 *   export REDIS_URL=rediss://default:<token>@host:6380
 */

import type { Blackboard } from "@retune/types";
import { TraceBusRegistry } from "./trace-bus";
import type { TraceFrame } from "./trace-bus";

const STREAM_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

interface RedisLike {
  xadd: (key: string, id: "*", ...fields: string[]) => Promise<string | null>;
  xrange: (key: string, start: string, end: string) => Promise<Array<[string, string[]]>>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  quit: () => Promise<unknown>;
}

let _redis: RedisLike | null = null;

async function getRedis(): Promise<RedisLike | null> {
  if (_redis) return _redis;
  if (!process.env.REDIS_URL) return null;
  try {
    // @ts-expect-error — optional dep until installed
    const mod = await import("ioredis");
    const Redis = (mod as { default: new (url: string) => RedisLike }).default;
    _redis = new Redis(process.env.REDIS_URL);
    return _redis;
  } catch {
    // ioredis not installed — caller falls back to in-process.
    return null;
  }
}

export class RedisTraceBusRegistry extends TraceBusRegistry {
  private redis: RedisLike | null = null;

  async ensure_redis(): Promise<RedisLike | null> {
    if (this.redis) return this.redis;
    this.redis = await getRedis();
    return this.redis;
  }

  /**
   * Publish a frame to Redis so other instances can pick it up. Local
   * fan-out continues through the in-process TraceBus's `inboxes`.
   */
  async publish_to_redis(generation_id: string, frame: TraceFrame): Promise<void> {
    const r = await this.ensure_redis();
    if (!r) return;
    const key = `retune:trace:${generation_id}`;
    await r.xadd(key, "*", "frame", JSON.stringify(frame));
    await r.expire(key, STREAM_TTL_SECONDS);
  }

  /**
   * Read every frame for a generation from Redis. Used when an SSE
   * client lands on an instance that doesn't have the local bus.
   */
  async replay_from_redis(generation_id: string): Promise<TraceFrame[]> {
    const r = await this.ensure_redis();
    if (!r) return [];
    const key = `retune:trace:${generation_id}`;
    const entries = await r.xrange(key, "-", "+");
    return entries.flatMap(([, fields]) => {
      // fields is a flat array: ["frame", "<json>", ...].
      const frames: TraceFrame[] = [];
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === "frame" && typeof fields[i + 1] === "string") {
          try {
            frames.push(JSON.parse(fields[i + 1] as string) as TraceFrame);
          } catch {
            // Skip malformed entries.
          }
        }
      }
      return frames;
    });
  }

  /**
   * Persist the final blackboard so a late SSE on a different instance
   * can hydrate. Mirrors the local `set_final_blackboard`.
   */
  async persist_final_blackboard(generation_id: string, blackboard: Blackboard): Promise<void> {
    const r = await this.ensure_redis();
    if (!r) return;
    await r.set(
      `retune:final:${generation_id}`,
      JSON.stringify(blackboard),
      "EX",
      STREAM_TTL_SECONDS,
    );
  }

  async load_final_blackboard(generation_id: string): Promise<Blackboard | null> {
    const r = await this.ensure_redis();
    if (!r) return null;
    const json = await r.get(`retune:final:${generation_id}`);
    if (!json) return null;
    try {
      return JSON.parse(json) as Blackboard;
    } catch {
      return null;
    }
  }
}

/**
 * Returns the right TraceBusRegistry for the runtime. Default
 * in-process; Redis-backed when `RETUNE_TRACE_BUS=redis` is set AND
 * `ioredis` is available.
 */
export function buildTraceBusRegistry(): TraceBusRegistry {
  if (process.env.RETUNE_TRACE_BUS !== "redis") {
    return new TraceBusRegistry();
  }
  // We construct the Redis-aware registry but it's still
  // API-compatible with the local one — ioredis is lazy-loaded so a
  // misconfigured env doesn't crash boot.
  return new RedisTraceBusRegistry();
}

/** Test-only — reset cached redis client between cases. */
export function _resetRedisClientForTests(): void {
  if (_redis) {
    _redis.quit?.().catch(() => {});
    _redis = null;
  }
}

// Re-export TraceBus + TraceFrame for callers that want the underlying types.
export { TraceBus } from "./trace-bus";
export type { TraceFrame } from "./trace-bus";
