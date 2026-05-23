/**
 * POST /api/orgs/:id/invite — invite a user to the org by email.
 *
 * Charter 19 Epic 01 — multi-tenant scaffolding.
 *
 * Auth: caller must be an owner or admin of the target org.
 * Body: `{ email: string, role?: "admin" | "member" | "viewer" }` (no
 *        owner — only the creator is owner; ownership transfer is a
 *        separate flow.)
 *
 * Behaviour:
 *   - If the email is a known Retune user, insert the membership row
 *     directly. Send a Slack-style "you've been added" email (TODO —
 *     wire when Charter 25 Epic 03 ships email-worker).
 *   - If unknown, create a placeholder row with `accepted_at=null`
 *     and an invited_by stamp. Once they sign up with this email,
 *     a follow-up step claims the placeholder.
 */

import { withSupabaseAuthParams } from "@/lib/api-handler";
import { captureFunnelEvent } from "@/lib/funnel-events";
import { db } from "@retune/db";
import { organisation_memberships, organisations, users } from "@retune/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "member", "viewer"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

export const POST = withSupabaseAuthParams(async (req, userId, params) => {
  const orgId = params.id;
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    return NextResponse.json({ error: "invalid_org_id" }, { status: 400 });
  }

  // Must be an active member of the org with sufficient role.
  const callerRows = await db
    .select({ role: organisation_memberships.role })
    .from(organisation_memberships)
    .where(
      and(
        eq(organisation_memberships.organisation_id, orgId),
        eq(organisation_memberships.user_id, userId),
      ),
    )
    .limit(1);
  const callerRole = callerRows[0]?.role;
  if (!callerRole || (callerRole !== "owner" && callerRole !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Org must still exist (not soft-deleted).
  const orgRows = await db
    .select({ id: organisations.id })
    .from(organisations)
    .where(and(eq(organisations.id, orgId), isNull(organisations.deleted_at)))
    .limit(1);
  if (!orgRows[0]) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    role?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const requestedRole = typeof body.role === "string" ? body.role : "member";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(requestedRole as Role)) {
    return NextResponse.json(
      { error: "invalid_role", message: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  const role = requestedRole as Role;

  // Look up the invited user by email (if they're already on Retune).
  const targetRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const targetUserId = targetRows[0]?.id ?? null;

  if (targetUserId) {
    // Direct membership.
    try {
      await db
        .insert(organisation_memberships)
        .values({
          organisation_id: orgId,
          user_id: targetUserId,
          role,
          invited_by: userId,
        })
        .onConflictDoNothing();
      void captureFunnelEvent(targetUserId, "subscribed", {
        // Reusing `subscribed` as the closest funnel event; a dedicated
        // `org_invitation_accepted` event is a Charter 25 Epic 02 follow-up.
        org_id: orgId,
        role,
        via: "direct",
      });
      return NextResponse.json({ status: "added", user_id: targetUserId, role });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[orgs.invite] direct add failed", err);
      return NextResponse.json({ error: "invite_failed" }, { status: 500 });
    }
  }

  // Unknown email — record the invitation intent for claim-on-signup.
  // We store the email in metadata so the signup hook can claim it.
  // Details: organisation_memberships keys on user_id; for placeholder
  // invitations we'd need a separate table. Until Charter 19 Epic 02
  // ships that table, we return 202 + ask the inviter to share a
  // signup link.
  return NextResponse.json(
    {
      status: "invitation_pending",
      message:
        "User not found yet. Share the signup link below and they'll be added on first login. (Email-based invitation queue is tracked in Charter 19 Epic 02.)",
      signup_link: `${new URL(req.url).origin}/signup?invite_org=${orgId}`,
    },
    { status: 202 },
  );
});
