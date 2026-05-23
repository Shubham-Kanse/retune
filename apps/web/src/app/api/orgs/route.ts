/**
 * GET /api/orgs — list organisations the current user belongs to.
 * POST /api/orgs — create a new organisation; the creator becomes owner.
 *
 * Charter 19 Epic 01 — multi-tenant scaffolding.
 *
 * Response shape:
 *   {
 *     orgs: Array<{ id, name, slug, kind, role, member_count }>,
 *     active_id: string | null
 *   }
 *
 * The active org id lives in a `retune_active_org` cookie. Falls back
 * to the user's first org (oldest membership) when unset.
 */

import { withSupabaseAuth } from "@/lib/api-handler";
import { db } from "@retune/db";
import { organisation_memberships, organisations } from "@retune/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET — list orgs the user belongs to ──────────────────────────
export const GET = withSupabaseAuth(async (req, userId) => {
  const rows = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      slug: organisations.slug,
      kind: organisations.kind,
      role: organisation_memberships.role,
      created_at: organisation_memberships.created_at,
    })
    .from(organisation_memberships)
    .innerJoin(organisations, eq(organisations.id, organisation_memberships.organisation_id))
    .where(and(eq(organisation_memberships.user_id, userId), isNull(organisations.deleted_at)));

  // Member counts per org (one extra round trip; small N).
  const counts = await db
    .select({
      organisation_id: organisation_memberships.organisation_id,
      member_count: sql<number>`count(*)::int`,
    })
    .from(organisation_memberships)
    .groupBy(organisation_memberships.organisation_id);
  const countByOrg = new Map(counts.map((c) => [c.organisation_id, Number(c.member_count)]));

  const cookie = (
    req as Request & { cookies?: { get?: (k: string) => { value: string } | undefined } }
  ).cookies?.get?.("retune_active_org");
  const cookieOrgId = cookie?.value ?? null;

  // Active org: cookie if set + valid; else oldest membership.
  const sortedByMembership = [...rows].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  const fallback = sortedByMembership[0]?.id ?? null;
  const active_id = cookieOrgId && rows.some((r) => r.id === cookieOrgId) ? cookieOrgId : fallback;

  return NextResponse.json({
    orgs: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      kind: r.kind,
      role: r.role,
      member_count: countByOrg.get(r.id) ?? 0,
    })),
    active_id,
  });
});

// ─── POST — create a new org; creator becomes owner ───────────────
export const POST = withSupabaseAuth(async (req, userId) => {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; slug?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slugRaw = typeof body.slug === "string" ? body.slug.trim() : "";

  if (!name || name.length > 80) {
    return NextResponse.json(
      { error: "invalid_name", message: "Name is required (≤ 80 chars)." },
      { status: 400 },
    );
  }
  const slug = slugRaw
    ? slugRaw.toLowerCase().replace(/[^a-z0-9-]/g, "-")
    : name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
  if (!/^[a-z0-9-]{2,32}$/.test(slug)) {
    return NextResponse.json(
      { error: "invalid_slug", message: "Slug must be 2-32 chars: a-z, 0-9, hyphen." },
      { status: 400 },
    );
  }

  // Insert org + creator-as-owner membership in a transaction.
  try {
    const orgId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(organisations)
        .values({ name, slug, kind: "team" })
        .returning();
      const org = inserted[0] as { id: string } | undefined;
      if (!org) throw new Error("org_insert_failed");
      await tx.insert(organisation_memberships).values({
        organisation_id: org.id,
        user_id: userId,
        role: "owner",
        invited_by: userId,
        accepted_at: new Date(),
      });
      return org.id;
    });
    return NextResponse.json({ id: orgId, slug, name }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (/unique|duplicate|already.*exists/i.test(msg)) {
      return NextResponse.json(
        { error: "slug_taken", message: "That slug is already in use. Pick another." },
        { status: 409 },
      );
    }
    // eslint-disable-next-line no-console
    console.error("[orgs.create] failed", msg);
    return NextResponse.json({ error: "create_failed", message: msg }, { status: 500 });
  }
});
