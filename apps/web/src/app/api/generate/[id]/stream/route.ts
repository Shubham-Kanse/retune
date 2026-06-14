import { apiUrl } from "@/lib/api-config";
import {
  hasGenerationAccessSecret,
  signGenerationAccessToken,
  userOwnsGeneration,
} from "@/lib/generation-access";
import { getApiSession } from "@/lib/session";
import { NextResponse } from "next/server";

function sseTerminalError(message: string) {
  const completion = {
    status: "failed",
    termination: "stream_unavailable",
    ticks_executed: 0,
    total_cost_usd: 0,
    total_latency_ms: 0,
    error_message: message,
  };
  const payload = [
    `event: completion\ndata: ${JSON.stringify(completion)}\n\n`,
    `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
  ].join("");
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owns = await userOwnsGeneration({ userId: session.userId, generationId: id });
  if (!owns) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!hasGenerationAccessSecret()) {
    return sseTerminalError(
      "Generation access is not configured. RETUNE_INTERNAL_GENERATION_ACCESS_SECRET must be set (>=16 chars).",
    );
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
    return sseTerminalError(`Stream unavailable (upstream ${upstream.status}).`);
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
