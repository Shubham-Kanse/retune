import { apiUrl } from "@/lib/api-config";
import { getApiSession } from "@/lib/session";
import { applications, db } from "@retune/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Try SQLite first (legacy pipeline generations)
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)))
    .returning();

  if (deleted.length) return NextResponse.json({ ok: true });

  // Fall back to cognitive API (in-memory / postgres generations)
  const res = await fetch(apiUrl(`/generate/${id}`), { method: "DELETE" }).catch(() => null);
  if (res?.ok) return NextResponse.json({ ok: true });

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
