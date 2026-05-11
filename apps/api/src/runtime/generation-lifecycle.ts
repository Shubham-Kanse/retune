import { randomUUID } from "node:crypto";
import { COGNITIVE_TASK_QUEUE, runGenerationWorkflow } from "@retune/agent";
import { jds, users } from "@retune/db/pg";
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
    }
  | {
      generation_id: string;
      stream: string;
      runtime: "in_memory";
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
  registry: TraceBusRegistry;
  log: LifecycleLogger;
  deps?: Partial<GenerationLifecycleDeps>;
}): Promise<GenerationStartResult> {
  const { payload, registry, log } = params;
  const deps: GenerationLifecycleDeps = { ...defaultDeps, ...(params.deps ?? {}) };
  const generation_id = deps.nowUuid();
  const temporal = await deps.acquireTemporal();

  log("info", "POST /generate", `minted generation_id=${generation_id}`);

  if (temporal) {
    log("info", "POST /generate", "temporal runtime detected, starting workflow");
    const durability = await deps.acquireDurability();
    if (!durability) {
      log("error", "POST /generate", "temporal requires persistence but none configured");
      throw new Error("persistence_required");
    }

    const dev_user_id = durability.default_user_id;

    await durability.db
      .insert(users)
      .values({
        id: dev_user_id,
        email: "dev@retune.local",
        personaType: "experienced",
        market: "US",
        locale: "en-US",
      })
      .onConflictDoNothing();

    const jd_id = deps.nowUuid();
    await durability.db.insert(jds).values({
      id: jd_id,
      source: "api",
      content_hash: generation_id.slice(0, 16),
      raw_text: `${payload.jd_title ?? ""}\n${payload.company ?? ""}`.trim(),
    });

    try {
      await deps.dualWrite({
        db: durability.db,
        jdId: jd_id,
        userId: dev_user_id,
        jdText: `${payload.jd_text ?? ""}\n${payload.jd_title ?? ""}\n${payload.company ?? ""}`.trim(),
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

    await temporal.client.workflow.start(runGenerationWorkflow, {
      taskQueue: COGNITIVE_TASK_QUEUE,
      workflowId: workflow_id_for(generation_id),
      args: [
        {
          generation_id,
          user_id: dev_user_id,
          jd_id,
          jd_title: payload.jd_title,
          company: payload.company,
        },
      ],
    });

    return {
      generation_id,
      workflow_id: workflow_id_for(generation_id),
      runtime: "temporal",
    };
  }

  log("info", "POST /generate", "in-memory runtime, spawning workbench");
  const bus = registry.create(generation_id);
  deps.runGeneration({
    generation_id,
    payload,
    bus,
    external_signal: bus.signal,
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

  registry.delete_after(generation_id, 10 * 60 * 1000);

  return {
    generation_id,
    stream: `/generate/${generation_id}/stream`,
    runtime: "in_memory",
  };
}
