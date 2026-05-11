import { apiUrl } from "@/lib/api-config";
import { withAuth } from "@/lib/api-handler";
import { verifyPreflightToken } from "@/lib/drift-preflight-token";
import { ensureGenerationPreflightsTable } from "@/lib/preflight-table";
import { db } from "@retune/db";
import { applications, generationPreflights } from "@retune/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
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
  };

  const suppliedHash =
    body.jd_hash ??
    (body.jd_text ? createHash("sha256").update(body.jd_text).digest("hex") : undefined);
  if (!body.preflight_token || !suppliedHash) {
    return NextResponse.json(
      {
        error:
          "preflight_required: run drift preflight and resolve questions before generation.",
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

  const res = await fetch(apiUrl("/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

  return NextResponse.json(data, { status: res.status });
});
