import { getSession } from "@/lib/session";
import { applications, db } from "@retune/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/profile/voice-fingerprint
 *
 * Returns the most recent voice fingerprint inferred from the user's
 * pipeline logs. The fingerprint is extracted from pipelineLog.cognitive
 * if available; otherwise synthesised from completed application stats.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });

  const rows = await db
    .select({ pipelineLog: applications.pipelineLog, createdAt: applications.createdAt })
    .from(applications)
    .where(eq(applications.userId, session.userId))
    .orderBy(desc(applications.createdAt))
    .limit(10);

  for (const row of rows) {
    if (!row.pipelineLog) continue;
    try {
      const log = JSON.parse(row.pipelineLog) as Record<string, unknown>;
      const cognitive = log.cognitive as Record<string, unknown> | undefined;
      if (cognitive?.voiceProfile && typeof cognitive.voiceProfile === "object") {
        const vp = cognitive.voiceProfile as Record<string, unknown>;
        return NextResponse.json({
          sampleSize:
            typeof vp.sampleBullets === "object" && Array.isArray(vp.sampleBullets)
              ? (vp.sampleBullets as unknown[]).length
              : 1,
          updatedAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
          dimensions: {
            avgSentenceWords: vp.avgSentenceWords ?? 0,
            metricDensity: vp.metricDensity ?? 0,
            vocabularyLevel:
              vp.vocabularyLevel === "executive"
                ? 1
                : vp.vocabularyLevel === "technical"
                  ? 0.6
                  : 0.3,
            passiveVoice: vp.usesPassiveVoice ? 0.8 : 0.1,
            verbQuality:
              vp.dominantVerbQuality === "ELITE"
                ? 1
                : vp.dominantVerbQuality === "STRONG"
                  ? 0.8
                  : vp.dominantVerbQuality === "GOOD"
                    ? 0.6
                    : 0.3,
          },
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json(null, { status: 404 });
}
