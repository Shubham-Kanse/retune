import * as dbModule from "@retune/db";
import { and, eq } from "drizzle-orm";
import { isCareerUnderstandingV1 } from "./schema";
import {
  CAREER_UNDERSTANDING_VERSION,
  type CareerUnderstandingRecord,
  type CareerUnderstandingV1,
} from "./types";

export class StaleRevisionError extends Error {
  constructor() {
    super("career_understanding_stale_revision");
    this.name = "StaleRevisionError";
  }
}

export async function getCareerUnderstandingByUserId(
  userId: string,
): Promise<CareerUnderstandingRecord | null> {
  const rows = await dbModule.db
    .select()
    .from(dbModule.profiles)
    .where(eq(dbModule.profiles.userId, userId))
    .limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const understanding = row.careerUnderstanding ?? null;
  if (!isCareerUnderstandingV1(understanding)) return null;

  return {
    understanding,
    revision:
      typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0,
    fingerprint:
      typeof row.careerUnderstandingFingerprint === "string"
        ? row.careerUnderstandingFingerprint
        : null,
    staleSince:
      row.careerUnderstandingStaleSince instanceof Date
        ? row.careerUnderstandingStaleSince
        : row.careerUnderstandingStaleSince
          ? new Date(row.careerUnderstandingStaleSince as string)
          : null,
    updatedAt:
      row.careerUnderstandingUpdatedAt instanceof Date
        ? row.careerUnderstandingUpdatedAt
        : row.careerUnderstandingUpdatedAt
          ? new Date(row.careerUnderstandingUpdatedAt as string)
          : null,
  };
}

export async function persistCareerUnderstanding(params: {
  userId: string;
  understanding: CareerUnderstandingV1;
  expectedRevision?: number;
}): Promise<{ revision: number }> {
  const now = new Date();
  const understanding: CareerUnderstandingV1 = {
    ...params.understanding,
    schemaVersion: CAREER_UNDERSTANDING_VERSION,
    userId: params.userId,
    updatedAt: now.toISOString(),
  };

  const whereClause =
    typeof params.expectedRevision === "number"
      ? and(
          eq(dbModule.profiles.userId, params.userId),
          eq(dbModule.profiles.careerUnderstandingRevision, params.expectedRevision),
        )
      : eq(dbModule.profiles.userId, params.userId);

  const updated = await dbModule.db
    .update(dbModule.profiles)
    .set({
      careerUnderstanding: understanding as unknown as typeof dbModule.profiles.$inferInsert["careerUnderstanding"],
      careerUnderstandingVersion: CAREER_UNDERSTANDING_VERSION,
      careerUnderstandingFingerprint: understanding.sourceProfileFingerprint,
      careerUnderstandingRevision: understanding.revision,
      careerUnderstandingStaleSince: understanding.staleSince ? new Date(understanding.staleSince) : null,
      careerUnderstandingUpdatedAt: now,
      updatedAt: now,
    })
    .where(whereClause)
    .returning();

  if (!updated || updated.length === 0) {
    throw new StaleRevisionError();
  }
  return { revision: understanding.revision };
}

export async function markCareerUnderstandingStale(params: {
  userId: string;
  staleSince?: Date;
}): Promise<void> {
  const ts = params.staleSince ?? new Date();
  await dbModule.db
    .update(dbModule.profiles)
    .set({ careerUnderstandingStaleSince: ts, updatedAt: ts })
    .where(eq(dbModule.profiles.userId, params.userId));
}
