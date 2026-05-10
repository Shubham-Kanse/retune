import { apiUrl } from "@/lib/api-config";
import { withAuthParams } from "@/lib/api-handler";
import { NextResponse } from "next/server";

const ALLOWED = new Set(["resume.docx", "resume.pdf", "cover_letter.docx", "cover_letter.pdf"]);

export const GET = withAuthParams(async (_req, _session, { id, filename }) => {
  if (!filename || !ALLOWED.has(filename)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  const upstream = await fetch(apiUrl(`/generate/${id}/${filename}`), { cache: "no-store" });
  if (!upstream.ok) {
    const fallback = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "upstream_error", status: upstream.status, detail: fallback.slice(0, 400) },
      { status: upstream.status },
    );
  }

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const disposition =
    upstream.headers.get("content-disposition") ?? `attachment; filename="${filename}"`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  });
});
