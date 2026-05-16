/**
 * Career understanding persistence.
 *
 * Goes through Supabase like the existing profile repository so RLS and
 * column casing stay consistent. Optimistic-revision checks prevent two
 * concurrent applies from clobbering each other.
 */

import { createClient } from "@/lib/supabase/server";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
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

/** Read the current understanding row for a user. */
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
  if (!isCareerUnderstandingV1(understanding)) {
    return null;
  }

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

/**
 * Write the understanding row for a user. When `expectedRevision` is
 * supplied the update is rejected (StaleRevisionError) if another writer
 * has incremented the revision in between.
 */
export async function persistCareerUnderstanding(params: {
  userId: string;
  understanding: CareerUnderstandingV1;
  expectedRevision?: number;
}): Promise<{ revision: number }> {
  const supabase = await createClient();
  const now = new Date();
  const understanding: CareerUnderstandingV1 = {
    ...params.understanding,
    schemaVersion: CAREER_UNDERSTANDING_VERSION,
    userId: params.userId,
    updatedAt: now.toISOString(),
    revision: params.understanding.revision,
  };

  // Optimistic revision check — only update when the row's current
  // revision matches what we expected. Returns the updated row so we can
  // detect the no-op case (stale).
  let query = supabase
    .from("profiles")
    .update({
      career_understanding: understanding,
      career_understanding_version: CAREER_UNDERSTANDING_VERSION,
      career_understanding_fingerprint: understanding.sourceProfileFingerprint,
      career_understanding_revision: understanding.revision,
      career_understanding_stale_since: understanding.staleSince ?? null,
      career_understanding_updated_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("user_id", params.userId);
  if (typeof params.expectedRevision === "number") {
    query = query.eq("career_understanding_revision", params.expectedRevision);
  }
  const { data, error } = await query.select("career_understanding_revision");
  if (error) {
    throw new Error(`[career-understanding] failed to persist: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new StaleRevisionError();
  }
  return { revision: understanding.revision };
}

/**
 * Mark the existing understanding stale without changing its content. Used
 * when fact edits land but the user has not yet asked Retune to re-read.
 */
export async function markCareerUnderstandingStale(params: {
  userId: string;
  staleSince?: Date;
}): Promise<void> {
  const supabase = await createClient();
  const ts = (params.staleSince ?? new Date()).toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      career_understanding_stale_since: ts,
      updated_at: ts,
    })
    .eq("user_id", params.userId);
  if (error) {
    throw new Error(`[career-understanding] failed to mark stale: ${error.message}`);
  }
}
