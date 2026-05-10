import { apiUrl } from "@/lib/api-config";
import { getSession } from "@/lib/session";
import { db } from "@retune/db";
import { applications } from "@retune/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const upstreamUrl = apiUrl(`/generate/${id}/stream${qs ? `?${qs}` : ""}`);

  const upstream = await fetch(upstreamUrl, {
    headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "stream_unavailable" }, { status: upstream.status });
  }

  // Pipe the stream through a TransformStream to mark as completed when done
  const userId = session.userId;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      // Look for `event: done` and mark application as completed
      const text = new TextDecoder().decode(chunk);
      if (text.includes("event: done")) {
        (async () => {
          try {
            await db
              .update(applications)
              .set({ status: "completed", updatedAt: new Date() })
              .where(and(eq(applications.id, id), eq(applications.userId, userId)));
          } catch (err) {
            console.error("[generate-stream] Failed to mark as completed:", err);
          }
        })();
      }
    },
  });

  upstream.body.pipeTo(writable).catch(() => {});

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
