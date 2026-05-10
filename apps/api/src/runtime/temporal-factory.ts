/**
 * Lazy Temporal client factory.
 *
 * When `RETUNE_TEMPORAL=1`, the API submits workflows to a Temporal
 * cluster instead of running generations in-process. Clients are
 * memoized per-process.
 *
 * Tests override the connection by passing `client_override` to
 * `acquire_temporal()` — this is how the Temporal integration test in
 * apps/api (lands commit #5) wires the TestWorkflowEnvironment into the
 * API's runtime without bringing up a real Temporal server.
 */

import { build_temporal_client } from "@retune/agent";
import type { Client } from "@temporalio/client";

export interface TemporalHandle {
  client: Client;
  close: () => Promise<void>;
}

let cached: TemporalHandle | null = null;
let override: TemporalHandle | null = null;

export function is_temporal_mode(env = process.env): boolean {
  const raw = (env.RETUNE_TEMPORAL ?? "0").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export function set_temporal_override(handle: TemporalHandle | null): void {
  override = handle;
}

export async function acquire_temporal(env = process.env): Promise<TemporalHandle | null> {
  if (!is_temporal_mode(env)) return null;
  if (override) return override;
  if (cached) return cached;
  const { client, close } = await build_temporal_client({
    address: env.RETUNE_TEMPORAL_ADDRESS,
    namespace: env.RETUNE_TEMPORAL_NAMESPACE,
  });
  cached = {
    client,
    close: async () => {
      await close();
      cached = null;
    },
  };
  return cached;
}
