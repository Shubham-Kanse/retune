import { createHash } from "node:crypto";
import { db, resumeIngestions } from "@retune/db";
import { and, eq } from "drizzle-orm";
import type { ImportSource, ResumeProcessingStatus } from "../enums";

export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function createIngestion(params: {
  userId: string;
  source: ImportSource;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  contentHash: string;
}) {
  const inserted = await db
    .insert(resumeIngestions)
    .values({
      userId: params.userId,
      source: params.source,
      status: "processing",
      stage: "upload",
      filename: params.filename,
      mediaType: params.mediaType,
      sizeBytes: params.sizeBytes,
      contentHash: params.contentHash,
    })
    .returning();
  return inserted[0] ?? null;
}

export async function findIngestionByHash(userId: string, contentHash: string) {
  const rows = await db
    .select()
    .from(resumeIngestions)
    .where(and(eq(resumeIngestions.userId, userId), eq(resumeIngestions.contentHash, contentHash)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateIngestionResult(params: {
  id: string;
  status: ResumeProcessingStatus;
  stage?: string;
  extractedProfileJson?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}) {
  await db
    .update(resumeIngestions)
    .set({
      status: params.status,
      stage: params.stage ?? "conversation",
      extractedProfileJson: params.extractedProfileJson ?? null,
      errorCode: params.errorCode ?? null,
      errorDetail: params.errorDetail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(resumeIngestions.id, params.id));
}
