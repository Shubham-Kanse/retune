import { withAuth } from "@/lib/api-handler";
import {
  type CareerUnderstandingV1,
  careerUnderstandingSchema,
  isCareerUnderstandingV1,
} from "@/lib/career-understanding";
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

const FEEDBACK_LIMIT = 120;
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;

const feedbackSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("summary_feedback"), value: z.enum(["accurate", "not_quite"]) }),
  z.object({ kind: z.literal("select_positioning"), positioningId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("reject_positioning"), positioningId: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal("use_positioning_sometimes"),
    positioningId: z.string().min(1).max(64),
  }),
  z.object({ kind: z.literal("clear_summary_feedback") }),
]);

type FeedbackBody = z.infer<typeof feedbackSchema>;

export const POST = withAuth(async (request, session) => {
  const limit = userRateLimit({
    userId: session.userId,
    route: "career_understanding_feedback",
    limit: FEEDBACK_LIMIT,
    windowMs: FEEDBACK_WINDOW_MS,
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
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const rows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const careerProfile = isCareerProfileV1(row.careerProfile)
    ? (row.careerProfile as CareerProfileV1)
    : null;
  const understandingRaw = row.careerUnderstanding;
  const current = isCareerUnderstandingV1(understandingRaw)
    ? (understandingRaw as CareerUnderstandingV1)
    : careerProfile
      ? buildPlaceholderUnderstanding({ userId: session.userId, profile: careerProfile })
      : null;
  if (!current) {
    return NextResponse.json({ error: "no_understanding" }, { status: 404 });
  }

  const currentRevision =
    typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0;
  const next: CareerUnderstandingV1 = JSON.parse(JSON.stringify(current));
  applyFeedback(next, parsed.data);

  const feedback = parsed.data;
  if (
    feedback.kind === "select_positioning" ||
    feedback.kind === "reject_positioning" ||
    feedback.kind === "use_positioning_sometimes"
  ) {
    const optionExists = next.positioning.options.some((o) => o.id === feedback.positioningId);
    if (!optionExists) {
      return NextResponse.json({ error: "unknown_positioning_id" }, { status: 400 });
    }
  }

  next.revision = currentRevision + 1;
  next.updatedAt = new Date().toISOString();

  const validated = careerUnderstandingSchema.safeParse(next);
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
    console.error("[career-understanding] feedback persist failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  revalidatePath("/profile");

  return NextResponse.json({
    ok: true,
    revision: validated.data.revision,
    understanding: validated.data,
  });
});

function applyFeedback(doc: CareerUnderstandingV1, feedback: FeedbackBody): void {
  switch (feedback.kind) {
    case "summary_feedback": {
      doc.userFeedback.summary = feedback.value;
      doc.summary.confirmed = feedback.value === "accurate";
      return;
    }
    case "clear_summary_feedback": {
      doc.userFeedback.summary = null;
      doc.summary.confirmed = false;
      return;
    }
    case "select_positioning": {
      doc.positioning.selectedId = feedback.positioningId;
      const opt = doc.positioning.options.find((o) => o.id === feedback.positioningId);
      if (opt) opt.userDecision = "accepted";
      doc.userFeedback.preferredPositioningIds = uniqueWith(
        doc.userFeedback.preferredPositioningIds,
        feedback.positioningId,
      );
      doc.userFeedback.rejectedPositioningIds = doc.userFeedback.rejectedPositioningIds.filter(
        (id) => id !== feedback.positioningId,
      );
      return;
    }
    case "reject_positioning": {
      const opt = doc.positioning.options.find((o) => o.id === feedback.positioningId);
      if (opt) opt.userDecision = "rejected";
      doc.userFeedback.rejectedPositioningIds = uniqueWith(
        doc.userFeedback.rejectedPositioningIds,
        feedback.positioningId,
      );
      doc.userFeedback.preferredPositioningIds = doc.userFeedback.preferredPositioningIds.filter(
        (id) => id !== feedback.positioningId,
      );
      if (doc.positioning.selectedId === feedback.positioningId) {
        doc.positioning.selectedId = null;
      }
      return;
    }
    case "use_positioning_sometimes": {
      const opt = doc.positioning.options.find((o) => o.id === feedback.positioningId);
      if (opt) opt.userDecision = "use_sometimes";
      return;
    }
  }
}

function uniqueWith(list: string[], item: string): string[] {
  return Array.from(new Set([...list, item]));
}
