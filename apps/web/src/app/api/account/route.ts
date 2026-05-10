import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { db, profiles, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const accountUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
  })
  .strict();

export const PATCH = withAuth(async (request, session) => {
  const rawBody = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = accountUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const now = new Date();
  const fullName = parsed.data.fullName.trim();

  await db
    .update(users)
    .set({ fullName, updatedAt: now })
    .where(eq(users.id, session.userId));

  await db
    .update(profiles)
    .set({ fullName, updatedAt: now })
    .where(eq(profiles.userId, session.userId));

  return NextResponse.json({ ok: true, fullName });
});

export const DELETE = withAuth(async (_request, session) => {
  // Delete user row (cascades to profiles, applications, subscriptions, usage)
  await db.delete(users).where(eq(users.id, session.userId));

  // Remove all generated files and uploads from disk (GDPR compliance)
  for (const subdir of ["files", "uploads"]) {
    try {
      rmSync(resolve(process.cwd(), "data", subdir, session.userId), {
        recursive: true,
        force: true,
      });
    } catch {
      /* non-fatal — files may not exist */
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", "", { maxAge: 0, path: "/" });
  return response;
});
