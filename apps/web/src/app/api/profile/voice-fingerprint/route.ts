import { getApiSession } from "@/lib/session";
import { db } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { voice_centroids } = await import("@retune/db/schema");
    
    const rows = await db
      .select()
      .from(voice_centroids)
      .where(eq(voice_centroids.user_id, session.userId))
      .limit(1);

    if (!rows[0]) {
      return NextResponse.json(null);
    }

    const centroid = rows[0];
    const vector = Array.isArray(centroid.vector) 
      ? centroid.vector 
      : typeof centroid.vector === 'string'
        ? JSON.parse(centroid.vector)
        : [];

    // Convert 128-dim vector to named dimensions for radar chart
    const dimensions: Record<string, number> = {
      formality: vector[0] ?? 0.5,
      technicality: vector[1] ?? 0.5,
      conciseness: vector[2] ?? 0.5,
      confidence: vector[3] ?? 0.5,
      enthusiasm: vector[4] ?? 0.5,
      precision: vector[5] ?? 0.5,
      creativity: vector[6] ?? 0.5,
      directness: vector[7] ?? 0.5,
    };

    return NextResponse.json({
      sampleSize: centroid.sample_size,
      updatedAt: centroid.updated_at?.toISOString() ?? new Date().toISOString(),
      dimensions,
    });
  } catch (error) {
    console.error("Failed to fetch voice fingerprint:", error);
    return NextResponse.json(null);
  }
}
