/**
 * Default `@retune/db` client — Postgres-only.
 *
 * Returns a single, lazy, process-wide drizzle client. Production uses
 * postgres-js against `RETUNE_DATABASE_URL` / `DATABASE_URL`. Dev and
 * tests can opt into pglite (in-process WASM Postgres) by setting
 * `RETUNE_DB_KIND=pglite` and optionally `RETUNE_PGLITE_DATADIR=…` (a
 * filesystem path or `idb://retune` in the browser).
 *
 * The legacy SQLite client was removed in the v2 consolidation
 * (see MIGRATION.md). All consumers now use the same Postgres schema
 * exported from `@retune/db/pg`.
 */

import { type PgDb, create_pglite, pglite_drizzle, postgres_drizzle, run_migrations } from "./pg";

export type DB = PgDb;

let _cached: { db: PgDb; close: () => Promise<void> } | null = null;
let _initPromise: Promise<{ db: PgDb; close: () => Promise<void> }> | null = null;

function envKind(): "postgres" | "pglite" {
  const explicit = (process.env.RETUNE_DB_KIND ?? "").toLowerCase();
  if (explicit === "pglite") return "pglite";
  if (explicit === "postgres") return "postgres";
  // Auto-detect: any DATABASE_URL → postgres; otherwise pglite for dev/tests.
  const url = process.env.RETUNE_DATABASE_URL ?? process.env.DATABASE_URL;
  return url ? "postgres" : "pglite";
}

async function init(): Promise<{ db: PgDb; close: () => Promise<void> }> {
  if (_cached) return _cached;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const kind = envKind();

    if (kind === "postgres") {
      const url = process.env.RETUNE_DATABASE_URL ?? process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          "RETUNE_DATABASE_URL (or DATABASE_URL) must be set when RETUNE_DB_KIND=postgres",
        );
      }
      const { db, sql } = postgres_drizzle(url);
      _cached = { db, close: async () => sql.end() };
      return _cached;
    }

    // pglite (dev / tests)
    const dataDir = process.env.RETUNE_PGLITE_DATADIR;
    const client = await create_pglite(dataDir);
    await run_migrations({ kind: "pglite", client });
    const db = pglite_drizzle(client);
    _cached = { db, close: async () => client.close() };
    return _cached;
  })();

  return _initPromise;
}

/**
 * Awaitable Postgres client. The first access spins up the underlying
 * connection (and runs migrations in pglite mode); subsequent accesses
 * return the cached client.
 */
export async function getDb(): Promise<PgDb> {
  return (await init()).db;
}

/** Close the underlying connection (test teardown). */
export async function closeDb(): Promise<void> {
  if (!_cached) return;
  const c = _cached;
  _cached = null;
  _initPromise = null;
  await c.close();
}

/**
 * `db` proxy — every method call forwards to the resolved drizzle client
 * via a Promise. Callers `await` the final query chain just like a
 * regular drizzle client; intermediate builder methods chain through.
 *
 * Drizzle's own query builders are thenable (awaiting executes the SQL).
 * That's a problem for naive Promise chains: when a `.then()` handler
 * returns a thenable, the spec says the outer promise *adopts* its
 * state — i.e. it would execute the query mid-chain. We avoid that by
 * boxing every intermediate value in a non-thenable container `{ v }`
 * and only unwrapping (and assimilating) at the terminal `await`.
 *
 * Example:
 *   const rows = await db.select().from(users).where(eq(users.id, id));
 *   await db.insert(users).values({ … });
 *   await db.transaction(async (tx) => { … });
 */

/** Non-thenable container so Promise chains don't auto-unwrap drizzle builders. */
type Box = { v: unknown };
const box = (v: unknown): Box => ({ v });

export const db: PgDb = new Proxy({} as PgDb, {
  get(_target, prop) {
    if (prop === "then" || prop === "catch" || prop === "finally") {
      // The bare `db` proxy is intentionally NOT thenable — only the
      // chained builders are. Returning undefined here means `await db`
      // is a no-op, and `db.then` returns undefined which is fine.
      return undefined;
    }
    return (...args: unknown[]) =>
      chainable(
        init().then(({ db: real }): Box => {
          const fn = (real as unknown as Record<PropertyKey, unknown>)[prop];
          if (typeof fn !== "function") {
            return box((real as unknown as Record<PropertyKey, unknown>)[prop]);
          }
          return box((fn as (...a: unknown[]) => unknown).apply(real, args));
        }),
      );
  },
}) as PgDb;

/**
 * Resolve the boxed inner promise, then if the unwrapped value is a
 * drizzle builder (thenable), await it to execute the query.
 */
async function execute(promise: Promise<Box>): Promise<unknown> {
  const { v } = await promise;
  if (v != null && typeof (v as { then?: unknown }).then === "function") {
    return await (v as PromiseLike<unknown>);
  }
  return v;
}

function chainable<T>(promise: Promise<Box>): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") return undefined;
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            execute(promise).then(onFulfilled, onRejected);
        }
        if (prop === "catch") {
          return (onRejected: (e: unknown) => unknown) => execute(promise).catch(onRejected);
        }
        if (prop === "finally") {
          return (onFinally: () => void) => execute(promise).finally(onFinally);
        }
        // Forward chained drizzle builder methods. We re-box the result
        // so the outer Promise doesn't auto-assimilate the drizzle
        // builder's thenable interface and execute the query early.
        return (...args: unknown[]) =>
          chainable(
            promise.then(({ v }): Box => {
              const fn = (v as unknown as Record<PropertyKey, unknown>)[prop];
              if (typeof fn !== "function") {
                return box((v as unknown as Record<PropertyKey, unknown>)[prop]);
              }
              return box((fn as (...a: unknown[]) => unknown).apply(v, args));
            }),
          );
      },
    },
  ) as unknown as T;
}
