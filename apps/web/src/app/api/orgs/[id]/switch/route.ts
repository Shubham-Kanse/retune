/**
 * POST /api/orgs/:id/switch — switch the user's active organisation.
 *
 * Charter 19 Epic 01 — multi-tenant scaffolding.
 *
 * Sets a `retune_active_org` cookie containing the org id. Subsequent
 * scoped queries (eventually: generations + applications) will respect
 * this cookie when filtering. The cookie is HttpOnly + SameSite=Lax,
 * 30-day TTL.
 */

import { withSupabaseAuthParams } from "@/lib/api-handler";
import { db } from "@retune/db";
import { organisation_memberships } from "@retune/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "retune_active_org";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const POST = withSupabaseAuthParams(async (_req, userId, params) => {
  const orgId = params.id;
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    return NextResponse.json({ error: "invalid_org_id" }, { status: 400 });
  }

  // Caller must be a member.
  const rows = await db
    .select({ role: organisation_memberships.role })
    .from(organisation_memberships)
    .where(
      and(
        eq(organisation_memberships.organisation_id, orgId),
        eq(organisation_memberships.user_id, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const response = NextResponse.json({ status: "active", org_id: orgId, role: rows[0].role });
  response.cookies.set(COOKIE_NAME, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
});
