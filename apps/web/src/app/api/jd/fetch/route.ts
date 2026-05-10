// Fetches a job description from a URL using Jina Reader API
// GET /api/jd/fetch?url=<encoded_url>
import { withAuth } from "@/lib/api-handler";
import { NextResponse } from "next/server";

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
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "X-No-Cache": "true",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return NextResponse.json({ error: "fetch_failed" }, { status: 502 });

  const markdown = await res.text();
  if (!markdown || markdown.length < 100) {
    return NextResponse.json({ error: "no_content" }, { status: 422 });
  }

  return NextResponse.json({ markdown: markdown.slice(0, 50000) });
});
