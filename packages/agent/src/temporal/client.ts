/**
 * Temporal client factory.
 *
 * Used by `apps/api` to start workflows and send signals. Holds a
 * process-lifetime Connection + Client; callers should close on
 * shutdown.
 */

import { Client, type ClientOptions, Connection } from "@temporalio/client";

export interface BuildClientInput {
  address?: string;
  namespace?: string;
  extra?: Partial<ClientOptions>;
}

export async function build_temporal_client(input: BuildClientInput = {}): Promise<{
  client: Client;
  connection: Connection;
  close: () => Promise<void>;
}> {
  const address = input.address ?? process.env.RETUNE_TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = input.namespace ?? "default";

  const connection = await Connection.connect({ address });
  const client = new Client({
    connection,
    namespace,
    ...input.extra,
  });

  return {
    client,
    connection,
    close: async () => {
      await connection.close();
    },
  };
}
