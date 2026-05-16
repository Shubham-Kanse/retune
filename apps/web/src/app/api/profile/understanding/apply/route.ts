import { withAuth } from "@/lib/api-handler";
import {
  applyCareerUnderstandingPatch,
  careerUnderstandingSchema,
  isCareerUnderstandingV1,
} from "@/lib/career-understanding";
import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import { verifyPreviewToken } from "@/lib/career-understanding/preview-token";
import {
  StaleRevisionError,
  persistCareerUnderstanding,
} from "@/lib/career-understanding/repository";
import { buildPlaceholderUnderstanding } from "@/lib/career-understanding/service";
import { userRateLimit } from "@/lib/career-understanding/rate-limit";
import { ValidationError } from "@/lib/errors";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1 } from "@/lib/onboarding/types";
import { db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

const APPLY_LIMIT = 30;
const APPLY_WINDOW_MS = 60 * 60 * 1000;

const applyBodySchema = z.object({
  previewId: z.string().min(1).max(64),
  previewToken: z.string().min(20).max(8000),
});

export const POST = withAuth(async (request, session) => {
  const limit = userRateLimit({
    userId: session.userId,
    route: "career_understanding_apply",
    limit: APPLY_LIMIT,
    windowMs: APPLY_WINDOW_MS,
  });
  if (!limit.success) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: limit.resetMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = applyBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const verified = await verifyPreviewToken(parsed.data.previewToken);
  if (!verified) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }
  if (verified.userId !== session.userId) {
    return NextResponse.json({ error: "preview_user_mismatch" }, { status: 401 });
  }
  if (verified.previewId !== parsed.data.previewId) {
    return NextResponse.json({ error: "preview_id_mismatch" }, { status: 400 });
  }

  const rows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const careerProfile = isCareerProfileV1(row.careerProfile)
    ? (row.careerProfile as CareerProfileV1)
    : null;
  if (!careerProfile) {
    return NextResponse.json({ error: "missing_career_profile" }, { status: 422 });
  }

  const currentFingerprint = careerProfileFingerprint(careerProfile);
  if (currentFingerprint !== verified.profileFingerprint) {
    return NextResponse.json(
      { error: "stale_profile_fingerprint", currentFingerprint },
      { status: 409 },
    );
  }

  const currentRevision =
    typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0;
  if (currentRevision !== verified.understandingRevision) {
    return NextResponse.json(
      { error: "stale_understanding_revision", currentRevision },
      { status: 409 },
    );
  }

  const understandingRaw = row.careerUnderstanding;
  const current = isCareerUnderstandingV1(understandingRaw)
    ? (understandingRaw as ReturnType<typeof buildPlaceholderUnderstanding>)
    : buildPlaceholderUnderstanding({ userId: session.userId, profile: careerProfile });

  // Apply patch.
  const patched = applyCareerUnderstandingPatch({ current, patch: verified.patch });
  const now = new Date().toISOString();
  patched.updatedAt = now;
  patched.staleSince = null;
  patched.status = "active";
  patched.revision = currentRevision + 1;
  patched.sourceProfileFingerprint = currentFingerprint;

  // Final schema validation belt-and-braces.
  const validated = careerUnderstandingSchema.safeParse(patched);
  if (!validated.success) {
    return NextResponse.json(
      {
        error: "invalid_understanding",
        detail: validated.error.issues[0]?.message ?? "schema mismatch",
      },
      { status: 502 },
    );
  }

  try {
    await persistCareerUnderstanding({
      userId: session.userId,
      understanding: validated.data,
      expectedRevision: currentRevision,
    });
  } catch (err) {
    if (err instanceof StaleRevisionError) {
      return NextResponse.json({ error: "stale_understanding_revision" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[career-understanding] apply persist failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  revalidatePath("/profile");

  return NextResponse.json({
    ok: true,
    understanding: validated.data,
    revision: validated.data.revision,
  });
});
