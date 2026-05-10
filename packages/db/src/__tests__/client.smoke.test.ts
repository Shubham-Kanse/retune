/**
 * Runtime smoke test for the async `db` proxy against pglite.
 *
 * Exercises every shape we use in the codebase:
 *   - select().from().where().limit()
 *   - insert().values().returning()
 *   - insert().values().onConflictDoNothing()
 *   - update().set().where()
 *   - delete().where()
 *   - transaction(async (tx) => ...)
 *   - sql`...` raw query via getDb().execute(...)
 *
 * Drizzle builders are themselves thenable — the chainable proxy must
 * box every intermediate value so Promise chains don't auto-unwrap and
 * execute the query mid-build.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db, getDb, users } from "..";

beforeAll(() => {
  // Force pglite mode so tests don't need a real Postgres.
  process.env.RETUNE_DB_KIND = "pglite";
});

afterAll(async () => {
  await closeDb();
});

describe("@retune/db client proxy", () => {
  it("select on empty table returns []", async () => {
    const rows = await db.select().from(users).limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("insert + returning", async () => {
    const inserted = await db
      .insert(users)
      .values({
        email: `smoke-${Date.now()}@retune.local`,
        passwordHash: null,
        fullName: "Smoke Test",
        authProvider: "email",
      })
      .returning();
    expect(inserted.length).toBe(1);
    expect(inserted[0]?.id).toBeTruthy();
    expect(inserted[0]?.email).toContain("@retune.local");
  });

  it("select with where + limit", async () => {
    const email = `where-${Date.now()}@retune.local`;
    await db.insert(users).values({ email });
    const rows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(rows[0]?.email).toBe(email);
  });

  it("update + delete", async () => {
    const email = `upd-${Date.now()}@retune.local`;
    const inserted = await db.insert(users).values({ email }).returning();
    const id = inserted[0]?.id;
    expect(id).toBeTruthy();

    await db
      .update(users)
      .set({ fullName: "Updated", updatedAt: new Date() })
      .where(eq(users.id, id!));

    const rows = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, id!))
      .limit(1);
    expect(rows[0]?.fullName).toBe("Updated");

    await db.delete(users).where(eq(users.id, id!));
    const after = await db.select().from(users).where(eq(users.id, id!)).limit(1);
    expect(after.length).toBe(0);
  });

  it("transaction (async callback)", async () => {
    const email = `tx-${Date.now()}@retune.local`;
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({ email })
        .returning();
      const id = inserted[0]?.id;
      const rows = await tx.select().from(users).where(eq(users.id, id!)).limit(1);
      return { id, found: rows.length === 1 };
    });
    expect(result.found).toBe(true);
    expect(result.id).toBeTruthy();
  });

  it("raw sql via getDb().execute(sql`...`)", async () => {
    const realDb = await getDb();
    const result = (await realDb.execute(sql`SELECT 1 as one`)) as unknown;
    // pglite returns { rows: [...] }; postgres-js returns array directly.
    const rows = Array.isArray(result)
      ? (result as Array<{ one: number }>)
      : (((result as { rows?: Array<{ one: number }> }).rows ?? []) as Array<{ one: number }>);
    expect(rows[0]?.one).toBe(1);
  });

  it("onConflictDoNothing is a no-op on duplicate", async () => {
    const email = `conflict-${Date.now()}@retune.local`;
    await db.insert(users).values({ email });
    // Second insert with same email should be a no-op (partial unique
    // index targets `email WHERE deleted_at IS NULL`).
    const inserted = await db
      .insert(users)
      .values({ email })
      .onConflictDoNothing({ target: users.email })
      .returning();
    expect(inserted.length).toBe(0);
  });
});
