/**
 * Worker factory.
 *
 * A Temporal worker hosts both workflow code (in a v8 sandbox) and
 * activity code (in the regular Node.js context). The worker polls its
 * task queue for tasks, executes them, and reports results back to the
 * Temporal server.
 *
 * `build_worker` does NOT start the worker — the caller calls `.run()`
 * to begin processing. This gives `apps/worker/src/main.ts` clean
 * control over the lifecycle (graceful shutdown, metrics, etc.).
 */

import { NativeConnection, Worker, type WorkerOptions } from "@temporalio/worker";
import { type SubstrateDeps, make_activities } from "./activities";
import { COGNITIVE_TASK_QUEUE } from "./task-queue";

export interface BuildWorkerInput {
  deps: SubstrateDeps;
  /** Defaults to env `RETUNE_TEMPORAL_ADDRESS` or `localhost:7233`. */
  address?: string;
  /** Defaults to `default`. */
  namespace?: string;
  /** Defaults to `COGNITIVE_TASK_QUEUE`. */
  task_queue?: string;
  /** Additional options merged into the Temporal WorkerOptions. */
  extra?: Partial<WorkerOptions>;
}

export async function build_worker(input: BuildWorkerInput): Promise<Worker> {
  const address = input.address ?? process.env.RETUNE_TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = input.namespace ?? "default";
  const task_queue = input.task_queue ?? COGNITIVE_TASK_QUEUE;

  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: task_queue,
    workflowsPath: new URL("./workflows/index.ts", import.meta.url).pathname,
    activities: make_activities(input.deps),
    ...input.extra,
  });

  return worker;
}
