import { createHash } from "node:crypto";
import { apiUrl } from "@/lib/api-config";
import { withAuth } from "@/lib/api-handler";
import { isCareerUnderstandingV1 } from "@/lib/career-understanding";
import { verifyPreflightToken } from "@/lib/drift-preflight-token";
import { captureFunnelEvent } from "@/lib/funnel-events";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import { ensureGenerationPreflightsTable } from "@/lib/preflight-table";
import { atomicCheckGeneration, recordUsage } from "@retune/billing";
import { db } from "@retune/db";
import { applications, generationPreflights, profiles } from "@retune/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

// Proxy POST /api/generate → backend cognitive API, then record in Postgres
export const POST = withAuth(async (request, session) => {
  await ensureGenerationPreflightsTable();
  const body = (await request.json()) as {
    jd_url?: string;
    jd_text?: string;
    market?: string;
    preflight_token?: string;
    jd_hash?: string;
    idempotency_key?: string;
  };

  const suppliedHash =
    body.jd_hash ??
    (body.jd_text ? createHash("sha256").update(body.jd_text).digest("hex") : undefined);
  if (!body.preflight_token || !suppliedHash) {
    return NextResponse.json(
      {
        error: "preflight_required: run drift preflight and resolve questions before generation.",
      },
      { status: 428 },
    );
  }

  const verified = verifyPreflightToken(body.preflight_token);
  if (!verified || verified.user_id !== session.userId || verified.jd_hash !== suppliedHash) {
    return NextResponse.json(
      {
        error:
          "invalid_preflight_token: complete drift preflight again for this exact JD before generation.",
      },
      { status: 428 },
    );
  }

  const billingEnabled =
    process.env.ENABLE_BILLING === "1" || process.env.ENABLE_BILLING === "true";
  // Charter 03 Epic 01 — billing gate.
  // Atomically reserve credits before kicking off the upstream cognitive
  // run when billing is enabled. If the user is over their plan limit,
  // return 402 (Payment Required) with a structured reason.
  if (billingEnabled) {
    const idemKey = body.idempotency_key ?? `${session.userId}:${suppliedHash}`;
    const billingCheck = await atomicCheckGeneration(session.userId, idemKey);
    if (!billingCheck.allowed) {
      void captureFunnelEvent(session.userId, "billing_blocked", {
        reason: billingCheck.reason ?? "insufficient_credits",
        credits_remaining: billingCheck.creditsRemaining ?? 0,
      });
      return NextResponse.json(
        {
          error: "billing_blocked",
          reason: billingCheck.reason ?? "insufficient_credits",
          creditsRemaining: billingCheck.creditsRemaining ?? 0,
          creditsCost: billingCheck.creditsCost ?? 10,
        },
        { status: 402 },
      );
    }
  }

  const now = new Date();
  const matched = await db
    .select({
      id: generationPreflights.id,
      expiresAt: generationPreflights.expiresAt,
      revokedAt: generationPreflights.revokedAt,
      usedAt: generationPreflights.usedAt,
    })
    .from(generationPreflights)
    .where(
      and(
        eq(generationPreflights.id, verified.preflight_id),
        eq(generationPreflights.userId, session.userId),
        eq(generationPreflights.jdHash, suppliedHash),
        isNull(generationPreflights.usedAt),
        isNull(generationPreflights.revokedAt),
      ),
    )
    .limit(1);

  const row = matched[0];
  if (!row || row.expiresAt.getTime() < now.getTime()) {
    return NextResponse.json(
      {
        error:
          "preflight_expired_or_used: complete drift preflight again for this JD before generation.",
      },
      { status: 428 },
    );
  }

  // 004 §11.2 — load career_profile + career_understanding server-side so the
  // cognitive API gets the authoritative profile, not whatever the client says.
  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.userId))
    .limit(1);
  const profileRow = profileRows[0] as
    | {
        profileMarkdown?: string | null;
        careerProfile?: unknown;
        careerUnderstanding?: unknown;
      }
    | undefined;
  const careerProfile = isCareerProfileV1(profileRow?.careerProfile)
    ? profileRow?.careerProfile
    : null;
  const careerUnderstanding = isCareerUnderstandingV1(profileRow?.careerUnderstanding)
    ? profileRow?.careerUnderstanding
    : null;
  const profileMarkdown = profileRow?.profileMarkdown ?? "";

  const res = await fetch(apiUrl("/generate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 003 §10 + §12 — propagate the authenticated user id and the
      // shared internal API key (when configured) so the cognitive API
      // does not have to re-implement Supabase session validation.
      "x-retune-user-id": session.userId,
      ...(process.env.RETUNE_INTERNAL_API_KEY
        ? { "x-retune-internal-key": process.env.RETUNE_INTERNAL_API_KEY }
        : {}),
    },
    body: JSON.stringify({
      ...body,
      // Carry the durable preflight envelope id forward so the cognitive
      // API can record a generation_requests row with the link.
      preflight_id: row.id,
      jd_hash: suppliedHash,
      // Stable idempotency key — a duplicate POST with the same key
      // returns the existing generation_id rather than starting a new one.
      idempotency_key: body.idempotency_key ?? `${session.userId}:${suppliedHash}`,
      // Server-loaded profile (overrides anything the client sent).
      // Fall back to a minimal placeholder so the cognitive API's min(1)
      // validation passes for users who skipped onboarding.
      profile_text: profileMarkdown || "No profile data yet.",
      career_profile: careerProfile ?? undefined,
      career_understanding: careerUnderstanding ?? undefined,
    }),
  });

  const data = (await res.json().catch(() => null)) as { generation_id?: string } | null;
  if (!res.ok || !data?.generation_id) {
    return NextResponse.json(data, { status: res.status });
  }

  // Atomically consume the preflight after upstream generation has started.
  // This prevents burning tokens on transient upstream failures while still
  // guarding against concurrent double-use.
  const consumeAt = new Date();
  await db
    .update(generationPreflights)
    .set({ usedAt: consumeAt, updatedAt: consumeAt })
    .where(
      and(
        eq(generationPreflights.id, row.id),
        eq(generationPreflights.userId, session.userId),
        eq(generationPreflights.jdHash, suppliedHash),
        isNull(generationPreflights.usedAt),
        isNull(generationPreflights.revokedAt),
      ),
    );

  const consumed = await db
    .select({ id: generationPreflights.id })
    .from(generationPreflights)
    .where(
      and(
        eq(generationPreflights.id, row.id),
        eq(generationPreflights.userId, session.userId),
        eq(generationPreflights.jdHash, suppliedHash),
        eq(generationPreflights.usedAt, consumeAt),
        eq(generationPreflights.updatedAt, consumeAt),
      ),
    )
    .limit(1);

  if (!consumed[0]) {
    // Another request consumed this preflight first. Abort this generation to
    // preserve one-preflight -> one-generation semantics.
    await fetch(apiUrl(`/generate/${data.generation_id}`), { method: "DELETE" }).catch(() => {});
    return NextResponse.json(
      {
        error:
          "preflight_expired_or_used: complete drift preflight again for this JD before generation.",
      },
      { status: 428 },
    );
  }

  // Record in Postgres so it shows in /applications immediately. The
  // generation row in `generations` is created by the cognitive workbench
  // when persistence is enabled; here we keep the legacy `applications`
  // shell row in sync so the web UI's lists/details continue to work.
  try {
    await db
      .insert(applications)
      .values({
        id: data.generation_id,
        userId: session.userId,
        generationId: data.generation_id,
        companyName: "Unknown",
        roleTitle: "Generating…",
        jobDescription: body.jd_text ?? body.jd_url ?? "",
        jdUrl: body.jd_url ?? null,
        market: (body.market ?? "US").toLowerCase(),
        status: "generating",
      })
      .onConflictDoNothing();
  } catch {
    // Non-fatal — generation proceeds even if the row insert fails
  }

  // Charter 03 Epic 01 — billing audit trail. Only written when billing
  // is enabled; local/dev runs can keep billing disabled for unrestricted
  // generation testing.
  if (billingEnabled) {
    recordUsage(session.userId, "generation", data.generation_id).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[generate] recordUsage failed (non-fatal)", err);
    });
  }

  // Charter 25 Epic 02 — activation funnel: first_generation_started.
  void captureFunnelEvent(session.userId, "first_generation_started", {
    jd_source: body.jd_url ? "url" : "paste",
    market: (body.market ?? "US").toLowerCase(),
  });

  return NextResponse.json(data, { status: res.status });
});
