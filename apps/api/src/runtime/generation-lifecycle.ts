import { createHash, randomUUID } from "node:crypto";
import { COGNITIVE_TASK_QUEUE, runGenerationWorkflow } from "@retune/agent";
import { generation_requests, generations, jds, users } from "@retune/db/pg";
import { and, eq } from "drizzle-orm";
import { dualWriteJobDescription } from "../lib/optimized-dual-write";
import type { TraceBusRegistry } from "../lib/trace-bus";
import { acquire_durability } from "./persistence-factory";
import { acquire_temporal } from "./temporal-factory";
import { run_generation } from "./workbench-runtime";
import { workflow_id_for } from "./workflow-ids";

export interface GenerationPayload {
  jd_title?: string;
  company?: string;
  market?: "US" | "UK";
  jd_url?: string;
  jd_text?: string;
  profile_text?: string;
  /**
   * Optional client-supplied idempotency key. When provided, duplicate
   * submissions return the existing generation row instead of starting
   * a new one. Web clients always pass this (003 §12).
   */
  idempotency_key?: string;
  /** Optional jd hash for cross-checking durable rows. */
  jd_hash?: string;
  /** Optional preflight id (003 §10). */
  preflight_id?: string;
  /** SOTA quality mode. */
  quality_mode?: "fast" | "balanced" | "frontier";
  /** 004 §11 — full CareerProfileV1 JSON loaded server-side. */
  career_profile?: unknown;
  /** 004 §11 — derived CareerUnderstandingV1 JSON loaded server-side. */
  career_understanding?: unknown;
}

export type LifecycleLogger = (
  level: "info" | "warn" | "error",
  tag: string,
  msg: string,
  meta?: unknown,
) => void;

export type GenerationStartResult =
  | {
      generation_id: string;
      workflow_id: string;
      runtime: "temporal";
      idempotent_replay: boolean;
    }
  | {
      generation_id: string;
      stream: string;
      runtime: "in_memory";
      idempotent_replay: boolean;
    };

export interface GenerationLifecycleDeps {
  nowUuid: () => string;
  acquireTemporal: typeof acquire_temporal;
  acquireDurability: typeof acquire_durability;
  dualWrite: typeof dualWriteJobDescription;
  runGeneration: typeof run_generation;
}

const defaultDeps: GenerationLifecycleDeps = {
  nowUuid: () => randomUUID(),
  acquireTemporal: acquire_temporal,
  acquireDurability: acquire_durability,
  dualWrite: dualWriteJobDescription,
  runGeneration: run_generation,
};

export async function createAndStartGeneration(params: {
  payload: GenerationPayload;
  user_id: string;
  registry: TraceBusRegistry;
  log: LifecycleLogger;
  deps?: Partial<GenerationLifecycleDeps>;
}): Promise<GenerationStartResult> {
  const { payload, registry, log } = params;
  const deps: GenerationLifecycleDeps = { ...defaultDeps, ...(params.deps ?? {}) };
  const temporal = await deps.acquireTemporal();
  const durability = await deps.acquireDurability();

  const user_id = params.user_id;
  const idempotency_key =
    payload.idempotency_key ??
    deriveIdempotencyKey({
      user_id,
      jd_hash: payload.jd_hash ?? null,
      jd_text: payload.jd_text ?? null,
      jd_url: payload.jd_url ?? null,
    });

  // ── 003 §10: idempotency check ──
  // If this user has already submitted a request with the same key,
  // return the existing generation_id rather than starting a duplicate.
  if (durability) {
    const existing = await durability.db
      .select({
        generation_id: generation_requests.generation_id,
      })
      .from(generation_requests)
      .where(
        and(
          eq(generation_requests.user_id, user_id),
          eq(generation_requests.idempotency_key, idempotency_key),
        ),
      )
      .limit(1);
    const hit = existing[0];
    if (hit) {
      log("info", "POST /generate", "idempotent replay", {
        generation_id: hit.generation_id,
        idempotency_key,
      });
      // Pick the runtime based on whether Temporal is configured.
      if (temporal) {
        return {
          generation_id: hit.generation_id,
          workflow_id: workflow_id_for(hit.generation_id),
          runtime: "temporal",
          idempotent_replay: true,
        };
      }
      return {
        generation_id: hit.generation_id,
        stream: `/generate/${hit.generation_id}/stream`,
        runtime: "in_memory",
        idempotent_replay: true,
      };
    }
  }

  const generation_id = deps.nowUuid();
  log("info", "POST /generate", `minted generation_id=${generation_id}`);

  if (temporal) {
    log("info", "POST /generate", "temporal runtime detected, starting workflow");
    if (!durability) {
      log("error", "POST /generate", "temporal requires persistence but none configured");
      throw new Error("persistence_required");
    }

    // Ensure the user row exists (FK target). The web layer is the
    // canonical source — but the API may receive the first request for
    // a brand-new user who hasn't been mirrored into the cognitive DB
    // yet. We upsert so the FK is satisfied without overwriting any
    // existing fields.
    await durability.db
      .insert(users)
      .values({
        id: user_id,
        email: `user-${user_id.slice(0, 8)}@retune.local`,
        personaType: "experienced",
        market: payload.market ?? "US",
        locale: "en-US",
      })
      .onConflictDoNothing();

    const jd_id = deps.nowUuid();
    const jd_hash =
      payload.jd_hash ?? sha256(payload.jd_text ?? payload.jd_url ?? generation_id).slice(0, 64);
    await durability.db.insert(jds).values({
      id: jd_id,
      source: "api",
      content_hash: jd_hash.slice(0, 64),
      raw_text: `${payload.jd_title ?? ""}\n${payload.company ?? ""}`.trim(),
    });

    try {
      await deps.dualWrite({
        db: durability.db,
        jdId: jd_id,
        userId: user_id,
        jdText:
          `${payload.jd_text ?? ""}\n${payload.jd_title ?? ""}\n${payload.company ?? ""}`.trim(),
        jdUrl: payload.jd_url ?? null,
        title: payload.jd_title ?? null,
        company: payload.company ?? null,
        market: payload.market ?? "US",
      });
    } catch (err) {
      log("warn", "POST /generate", "optimized job_descriptions dual-write failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 003 §6.1: pass the FULL payload to Temporal so the worker has
    // semantic parity with the in-memory path.
    await temporal.client.workflow.start(runGenerationWorkflow, {
      taskQueue: COGNITIVE_TASK_QUEUE,
      workflowId: workflow_id_for(generation_id),
      args: [
        {
          generation_id,
          user_id,
          jd_id,
          jd_title: payload.jd_title,
          company: payload.company,
          jd_text: payload.jd_text,
          jd_url: payload.jd_url,
          profile_text: payload.profile_text,
          market: payload.market,
          idempotency_key,
          jd_hash,
          preflight_id: payload.preflight_id,
          quality_mode: payload.quality_mode,
          career_profile: payload.career_profile,
          career_understanding: payload.career_understanding,
        },
      ],
    });

    // Insert the generation row first so the FK in generation_requests
    // is satisfied. The orchestrator will upsert it again with the
    // initial blackboard inside the worker.
    await durability.db
      .insert(generations)
      .values({
        id: generation_id,
        user_id,
        jd_id,
        ontology_version: "0.0.1",
      })
      .onConflictDoNothing();

    // Persist the durable request envelope.
    await durability.db
      .insert(generation_requests)
      .values({
        user_id,
        generation_id,
        jd_id,
        jd_hash,
        idempotency_key,
        command: payload as unknown as Record<string, unknown>,
        market: payload.market ?? "US",
        quality_mode: payload.quality_mode ?? "balanced",
        output_suite: ["resume"] as unknown as Record<string, unknown>,
        preflight_id: payload.preflight_id ?? null,
      })
      .onConflictDoNothing();

    return {
      generation_id,
      workflow_id: workflow_id_for(generation_id),
      runtime: "temporal",
      idempotent_replay: false,
    };
  }

  log("info", "POST /generate", "in-memory runtime, spawning workbench");

  // Persist the durable request envelope before kicking off in-memory
  // work so a crash leaves an auditable record.
  if (durability) {
    await durability.db
      .insert(users)
      .values({
        id: user_id,
        email: `user-${user_id.slice(0, 8)}@retune.local`,
        personaType: "experienced",
        market: payload.market ?? "US",
        locale: "en-US",
      })
      .onConflictDoNothing();

    const _jd_id = deps.nowUuid();
    const jd_hash =
      payload.jd_hash ?? sha256(payload.jd_text ?? payload.jd_url ?? generation_id).slice(0, 64);

    // Insert a jds row so the generations FK is satisfied (same as Temporal path).
    try {
      await durability.db.insert(jds).values({
        id: _jd_id,
        source: "api",
        content_hash: jd_hash.slice(0, 64),
        raw_text: `${payload.jd_title ?? ""}\n${payload.company ?? ""}`.trim() || "jd",
      });
    } catch (jdsErr) {
      log("error", "POST /generate", "jds insert failed", {
        error: jdsErr instanceof Error ? jdsErr.message : String(jdsErr),
      });
      throw jdsErr;
    }

    // Insert the generation row first to satisfy the generation_requests FK.
    await durability.db
      .insert(generations)
      .values({
        id: generation_id,
        user_id,
        jd_id: _jd_id,
        ontology_version: "0.0.1",
      })
      .onConflictDoNothing();

    await durability.db
      .insert(generation_requests)
      .values({
        user_id,
        generation_id,
        jd_id: _jd_id,
        jd_hash,
        idempotency_key,
        command: payload as unknown as Record<string, unknown>,
        market: payload.market ?? "US",
        quality_mode: payload.quality_mode ?? "balanced",
        output_suite: ["resume"] as unknown as Record<string, unknown>,
        preflight_id: payload.preflight_id ?? null,
      })
      .onConflictDoNothing();
  }

  const bus = registry.create(generation_id);
  deps
    .runGeneration({
      generation_id,
      payload,
      bus,
      external_signal: bus.signal,
      user_id,
    })
    .then(() => {
      log("info", "run_generation", `completed generation_id=${generation_id}`);
    })
    .catch((err) => {
      log("error", "run_generation", `failed generation_id=${generation_id}`, {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
      });
      bus.publish({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });

  registry.delete_after(generation_id, busRetentionMs(durability !== null));

  return {
    generation_id,
    stream: `/generate/${generation_id}/stream`,
    runtime: "in_memory",
    idempotent_replay: false,
  };
}

/**
 * Charter 02-Core-Features Epic 05 — result hydration contract.
 *
 * The TraceBus is process-local and lost on restart. The
 * `delete_after` TTL controls how long the in-memory bus + replay log
 * stick around for late SSE reconnects.
 *
 * Two modes:
 *   1. **Persistence on (postgres / pglite)**: the final blackboard is
 *      written to `generations.current_blackboard` JSONB at
 *      orchestrator-return, so result hydration falls back to the DB
 *      indefinitely. Bus is just a hot cache. 10 min TTL is plenty.
 *   2. **Persistence off**: the bus is the *only* place the result
 *      lives. We extend the TTL to 24 hours so a user finishing a
 *      generation can come back later in the day to download
 *      documents. Beyond that, no recovery — so "persist=off" is
 *      explicitly a dev-only mode (see `assertProductionRuntime` in
 *      `apps/api/src/main.ts`).
 *
 * Production contract: with `RETUNE_PERSIST=postgres`, results survive
 * at least 30 days (governed by GDPR retention policy in Charter 08
 * Epic 02, not by this in-memory cache).
 */
function busRetentionMs(persistenceEnabled: boolean): number {
  // Override via env for ops emergencies (dump/keep all buses for debugging).
  const override = Number(process.env.RETUNE_BUS_RETENTION_MS);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return persistenceEnabled
    ? 10 * 60 * 1000 // 10 min — DB is authoritative
    : 24 * 60 * 60 * 1000; // 24 h — bus is the only copy
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function deriveIdempotencyKey(input: {
  user_id: string;
  jd_hash: string | null;
  jd_text: string | null;
  jd_url: string | null;
}): string {
  // Stable key derivation when the client doesn't supply one. Includes
  // user_id so two users with identical JD don't collide.
  const seed = JSON.stringify({
    user_id: input.user_id,
    jd_hash: input.jd_hash ?? "",
    jd_text: input.jd_text ? sha256(input.jd_text).slice(0, 32) : "",
    jd_url: input.jd_url ?? "",
  });
  return `auto-${sha256(seed).slice(0, 32)}`;
}
