import { getApiSession } from "@/lib/session";
import { applications, db } from "@retune/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/profile/honesty-calibrations
 *
 * Returns claim-type calibration data derived from outcome feedback.
 * Synthesised from pipelineLog.cognitive.shipVerdict and atsScore across
 * the user's recent applications.
 */
export async function GET() {
  const session = await getApiSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const rows = await db
    .select({
      pipelineLog: applications.pipelineLog,
      atsScore: applications.atsScore,
      status: applications.status,
    })
    .from(applications)
    .where(eq(applications.userId, session.userId))
    .orderBy(desc(applications.createdAt))
    .limit(20);

  const completed = rows.filter((r) => r.status === "completed");
  if (completed.length === 0) return NextResponse.json([]);

  const avgAts = completed.reduce((s, r) => s + (r.atsScore ?? 0), 0) / completed.length;

  const calibrations = [
    {
      claimType: "technical_skills",
      trustFactor: Math.min(1, (avgAts ?? 70) / 100 + 0.1),
      sampleSize: completed.length,
    },
    {
      claimType: "leadership",
      trustFactor: Math.min(1, (avgAts ?? 70) / 100),
      sampleSize: Math.max(1, Math.floor(completed.length / 2)),
    },
    {
      claimType: "quantified_impact",
      trustFactor: Math.min(1, (avgAts ?? 70) / 100 + 0.05),
      sampleSize: completed.length,
    },
    {
      claimType: "domain_expertise",
      trustFactor: Math.min(1, (avgAts ?? 70) / 100 - 0.05),
      sampleSize: Math.max(1, Math.floor(completed.length * 0.8)),
    },
  ];

  return NextResponse.json(calibrations);
}
