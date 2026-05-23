// Fetches a job description from a URL using Jina Reader API
// GET /api/jd/fetch?url=<encoded_url>
//
// Charter 04 Epic 03 — circuit breaker around Jina. Same thresholds as
// the API side (3 failures / 30s timeout / 2 successes to close).
// Module-level singleton so all requests share breaker state per
// Next.js process.

import { withAuth } from "@/lib/api-handler";
import { CircuitBreaker } from "@retune/agent/web";
import { NextResponse } from "next/server";

const jinaBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeoutMs: 30_000,
});

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    new URL(url); // validate
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  let res: Response;
  try {
    res = await jinaBreaker.execute(() =>
      fetch(jinaUrl, {
        headers: {
          Accept: "text/markdown",
          "X-No-Cache": "true",
        },
        signal: AbortSignal.timeout(15000),
      }),
    );
  } catch (err) {
    // Breaker open — fail-fast 503 rather than queueing on a known-bad upstream.
    const message = err instanceof Error ? err.message : "jina_unavailable";
    if (message.startsWith("Circuit breaker OPEN")) {
      return NextResponse.json({ error: "jina_circuit_open", message }, { status: 503 });
    }
    return NextResponse.json({ error: "fetch_failed", message }, { status: 502 });
  }

  if (!res.ok) return NextResponse.json({ error: "fetch_failed" }, { status: 502 });

  const markdown = await res.text();
  if (!markdown || markdown.length < 100) {
    return NextResponse.json({ error: "no_content" }, { status: 422 });
  }

  return NextResponse.json({ markdown: markdown.slice(0, 50000) });
});
