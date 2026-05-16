import { withAuth } from "@/lib/api-handler";
import {
  type CareerUnderstandingV1,
  type EvidenceRef,
  isCareerUnderstandingV1,
  understandingScopeSchema,
  understandingSectionSchema,
} from "@/lib/career-understanding";
import { issuePreviewToken } from "@/lib/career-understanding/preview-token";
import {
  CareerUnderstandingAiError,
  buildPlaceholderUnderstanding,
  generateInitialCareerUnderstanding,
  previewCareerUnderstandingChange,
} from "@/lib/career-understanding/service";
import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import { userRateLimit } from "@/lib/career-understanding/rate-limit";
import { ValidationError } from "@/lib/errors";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import { db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const PREVIEW_LIMIT = 20;
const PREVIEW_WINDOW_MS = 60 * 60 * 1000;

const intentPresetSchema = z.enum([
  "accurate",
  "different_angle",
  "more_technical",
  "more_product_focused",
  "more_senior",
  "less_exaggerated",
  "re_read_profile",
]);

const previewBodySchema = z.object({
  section: understandingSectionSchema,
  scope: understandingScopeSchema,
  instruction: z.string().min(1).max(2000),
  contextId: z.string().min(1).max(64).optional(),
  intentPreset: intentPresetSchema.optional(),
  includeEditedFields: z.array(z.string().min(1).max(120)).max(50).optional(),
  excludeFields: z.array(z.string().min(1).max(120)).max(50).optional(),
  expectedProfileFingerprint: z.string().min(1).max(128).optional(),
  expectedUnderstandingRevision: z.number().int().min(0).optional(),
  /** When true, generate the first understanding rather than tuning the existing one. */
  initial: z.boolean().optional(),
});

export const POST = withAuth(async (request, session) => {
  const limit = userRateLimit({
    userId: session.userId,
    route: "career_understanding_preview",
    limit: PREVIEW_LIMIT,
    windowMs: PREVIEW_WINDOW_MS,
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
  const parsed = previewBodySchema.safeParse(body);
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
  if (!careerProfile) {
    return NextResponse.json({ error: "missing_career_profile" }, { status: 422 });
  }

  const fingerprint = careerProfileFingerprint(careerProfile);
  if (
    parsed.data.expectedProfileFingerprint &&
    parsed.data.expectedProfileFingerprint !== fingerprint
  ) {
    return NextResponse.json(
      { error: "stale_profile_fingerprint", currentFingerprint: fingerprint },
      { status: 409 },
    );
  }

  const understandingRaw = row.careerUnderstanding;
  const currentRevision =
    typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0;
  if (
    typeof parsed.data.expectedUnderstandingRevision === "number" &&
    parsed.data.expectedUnderstandingRevision !== currentRevision
  ) {
    return NextResponse.json(
      { error: "stale_understanding_revision", currentRevision },
      { status: 409 },
    );
  }

  const readiness = (row.profileReadiness as ProfileReadiness | null | undefined) ?? null;

  let current: CareerUnderstandingV1;
  if (isCareerUnderstandingV1(understandingRaw)) {
    current = understandingRaw as CareerUnderstandingV1;
  } else {
    current = buildPlaceholderUnderstanding({ userId: session.userId, profile: careerProfile });
  }

  // Initial-generation path. Returns a "multiple" patch covering every section.
  if (parsed.data.initial || current.revision === 0) {
    try {
      const result = await generateInitialCareerUnderstanding({
        userId: session.userId,
        profile: careerProfile,
        readiness,
      });
      const patch = {
        section: "multiple" as const,
        summary: result.understanding.summary,
        positioning: result.understanding.positioning,
        evidenceMap: result.understanding.evidenceMap,
        resumeFuel: result.understanding.resumeFuel,
      };
      const issued = await issuePreviewToken({
        previewId: `pv-${result.understanding.id}`,
        userId: session.userId,
        profileFingerprint: fingerprint,
        understandingRevision: currentRevision,
        patch,
        changeSummary: ["Generated the first interpretation."],
      });
      const evidenceRefs = collectEvidenceRefs(result.understanding);
      return NextResponse.json({
        previewId: issued.previewId,
        previewToken: issued.token,
        before: emptySlice(current),
        after: {
          summary: result.understanding.summary,
          positioning: result.understanding.positioning,
          evidenceMap: result.understanding.evidenceMap,
          resumeFuel: result.understanding.resumeFuel,
        },
        patch,
        changeSummary: ["Generated the first interpretation."],
        evidenceRefs,
        profileFingerprint: fingerprint,
        understandingRevision: currentRevision,
        expiresAt: issued.expiresAt,
        kind: "initial",
      });
    } catch (err) {
      return aiErrorToResponse(err);
    }
  }

  // Tuning path — return a scoped patch.
  try {
    const result = await previewCareerUnderstandingChange({
      userId: session.userId,
      profile: careerProfile,
      current,
      request: {
        section: parsed.data.section,
        scope: parsed.data.scope,
        instruction: parsed.data.instruction,
        intentPreset: parsed.data.intentPreset,
        includeEditedFields: parsed.data.includeEditedFields,
        excludeFields: parsed.data.excludeFields,
      },
    });
    const issued = await issuePreviewToken({
      previewId: result.previewId,
      userId: session.userId,
      profileFingerprint: fingerprint,
      understandingRevision: currentRevision,
      patch: result.patch,
      changeSummary: result.changeSummary,
    });
    return NextResponse.json({
      previewId: issued.previewId,
      previewToken: issued.token,
      before: result.before,
      after: result.after,
      patch: result.patch,
      changeSummary: result.changeSummary,
      evidenceRefs: collectEvidenceRefsFromSlice(result.after),
      profileFingerprint: fingerprint,
      understandingRevision: currentRevision,
      expiresAt: issued.expiresAt,
      kind: "tune",
    });
  } catch (err) {
    return aiErrorToResponse(err);
  }
});

function emptySlice(understanding: CareerUnderstandingV1) {
  return {
    summary: understanding.summary,
    positioning: understanding.positioning,
    evidenceMap: understanding.evidenceMap,
    resumeFuel: understanding.resumeFuel,
  };
}

function collectEvidenceRefs(understanding: CareerUnderstandingV1): EvidenceRef[] {
  return collectEvidenceRefsFromSlice({
    summary: understanding.summary,
    positioning: understanding.positioning,
    evidenceMap: understanding.evidenceMap,
    resumeFuel: understanding.resumeFuel,
  });
}

function collectEvidenceRefsFromSlice(slice: {
  summary?: CareerUnderstandingV1["summary"];
  positioning?: CareerUnderstandingV1["positioning"];
  evidenceMap?: CareerUnderstandingV1["evidenceMap"];
  resumeFuel?: CareerUnderstandingV1["resumeFuel"];
}): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  if (slice.summary) refs.push(...slice.summary.sourceRefs);
  if (slice.positioning) {
    for (const opt of slice.positioning.options) refs.push(...opt.evidenceRefs);
  }
  if (slice.evidenceMap) {
    for (const sig of slice.evidenceMap.strongestSignals) refs.push(...sig.sourceRefs);
    for (const sig of slice.evidenceMap.supportingSignals) refs.push(...sig.sourceRefs);
    for (const sig of slice.evidenceMap.weakSignals) refs.push(...sig.sourceRefs);
    for (const sig of slice.evidenceMap.inferredUnconfirmed) refs.push(...sig.sourceRefs);
  }
  if (slice.resumeFuel) {
    for (const item of slice.resumeFuel.ready) refs.push(...item.sourceRefs);
    for (const item of slice.resumeFuel.needsSharpening) refs.push(...item.sourceRefs);
    for (const item of slice.resumeFuel.risks) refs.push(...item.sourceRefs);
    for (const item of slice.resumeFuel.suggestedNextEdits) refs.push(...item.sourceRefs);
  }
  return refs;
}

function aiErrorToResponse(err: unknown): NextResponse {
  if (err instanceof CareerUnderstandingAiError) {
    if (err.reason === "profile_too_thin") {
      return NextResponse.json({ error: err.reason, detail: err.detail ?? null }, { status: 422 });
    }
    return NextResponse.json({ error: err.reason, detail: err.detail ?? null }, { status: 502 });
  }
  // eslint-disable-next-line no-console
  console.error("[career-understanding] preview unexpected error", err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
