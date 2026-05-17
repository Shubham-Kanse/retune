import { getCareerUnderstandingByUserId } from "@/lib/career-understanding/repository";
import { getApiSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await getCareerUnderstandingByUserId(session.userId);
  if (!record) {
    return NextResponse.json({ revision: 0, updatedAt: null, staleSince: null });
  }
  return NextResponse.json({
    revision: record.revision,
    updatedAt: record.updatedAt?.toISOString() ?? null,
    staleSince: record.staleSince?.toISOString() ?? null,
  });
}
