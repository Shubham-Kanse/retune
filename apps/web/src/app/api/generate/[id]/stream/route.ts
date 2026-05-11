import { apiUrl } from "@/lib/api-config";
import { signGenerationAccessToken, userOwnsGeneration } from "@/lib/generation-access";
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owns = await userOwnsGeneration({ userId: session.userId, generationId: id });
  if (!owns) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const upstreamUrl = apiUrl(`/generate/${id}/stream${qs ? `?${qs}` : ""}`);
  const token = signGenerationAccessToken({ generationId: id, userId: session.userId });

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Retune-Generation-Access": token,
    },
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "stream_unavailable" }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
