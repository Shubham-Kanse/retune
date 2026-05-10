/**
 * Ad-hoc migrator.
 *
 * Runs the bundled SQL migrations in order. Idempotent — every `CREATE`
 * uses `IF NOT EXISTS`, so re-running is safe.
 *
 * Both pglite and postgres-js expose an `unsafe(sql)` method we can use
 * to execute a multi-statement SQL string. This is deliberately simple;
 * commit #4 introduces a proper schema_migrations table + drizzle-kit
 * generation so schema drift can be detected.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { MIGRATIONS } from "./migrations";

type MigratableClient = { kind: "pglite"; client: PGlite } | { kind: "postgres"; sql: Sql };

export async function run_migrations(target: MigratableClient): Promise<void> {
  for (const migration of MIGRATIONS) {
    if (target.kind === "pglite") {
      await target.client.exec(migration.sql);
    } else {
      await target.sql.unsafe(migration.sql);
    }
  }
}
