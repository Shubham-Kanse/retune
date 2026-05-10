import { withAuth } from "@/lib/api-handler";
import { db, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const POST = withAuth(async (_request, session) => {
  await db
    .update(users)
    .set({ onboardingCompleted: true, updatedAt: new Date() })
    .where(eq(users.id, session.userId));

  return NextResponse.json({ ok: true });
});
