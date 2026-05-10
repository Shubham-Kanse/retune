/**
 * pglite test harness.
 *
 * One fresh in-memory Postgres per test — no shared state, no Docker.
 * Also seeds a user row for FK targets.
 */

import { randomUUID } from "node:crypto";
import { create_pglite, pglite_drizzle, run_migrations, users } from "@retune/db/pg";
import { PostgresPersistence } from "../../src/persistence";

export async function build_pglite_harness() {
  const client = await create_pglite();
  await run_migrations({ kind: "pglite", client });
  const db = pglite_drizzle(client);
  const user_id = randomUUID();
  await db.insert(users).values({
    id: user_id,
    email: `test-${user_id}@example.com`,
    personaType: "experienced",
    market: "US",
    locale: "en-US",
  });
  const persistence = new PostgresPersistence(db);
  return {
    client,
    db,
    persistence,
    user_id,
    async close() {
      await client.close();
    },
  };
}
