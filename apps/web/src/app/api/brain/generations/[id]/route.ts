import { apiUrl } from "@/lib/api-config";
import { getApiSession } from "@/lib/session";
import { applications, db, generations } from "@retune/db";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Try legacy applications table first
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)))
    .returning();

  if (deleted.length) return NextResponse.json({ ok: true });

  // Try soft-delete from cognitive generations table
  try {
    const softDeleted = await db
      .update(generations)
      .set({ deleted_at: new Date() })
      .where(
        and(
          eq(generations.id, id),
          eq(generations.user_id, session.userId),
          isNull(generations.deleted_at),
        ),
      )
      .returning();

    if (softDeleted.length) return NextResponse.json({ ok: true });
  } catch {
    // generations table may not exist in all environments
  }

  // Fall back to cognitive API (abort in-flight)
  const res = await fetch(apiUrl(`/generate/${id}`), { method: "DELETE" }).catch(() => null);
  if (res?.ok) return NextResponse.json({ ok: true });

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
