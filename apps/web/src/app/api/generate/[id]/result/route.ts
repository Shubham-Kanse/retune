import { apiUrl } from "@/lib/api-config";
import { withAuthParams } from "@/lib/api-handler";
import {
  dualWriteOptimizedResult,
  parityCheckResult,
  readOptimizedResult,
} from "@/lib/optimized-results";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuthParams(async (_req, _session, { id }) => {
  if (id) {
    const pre = await readOptimizedResult(id);
    if (pre) {
      return NextResponse.json(pre, {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
          "X-Retune-Source": "optimized",
        },
      });
    }
  }

  const res = await fetch(apiUrl(`/generate/${id}`), { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as {
    verdict?: string;
    company?: string | null;
    role?: string | null;
    resume?: string | null;
    cover_letter?: string | null;
    strategy?: string | null;
    ats_score?: number | null;
    interview_ready_score?: number | null;
  } | null;

  if (res.ok && data && id) {
    try {
      await dualWriteOptimizedResult(id, data);
      await parityCheckResult(id, data);
    } catch (err) {
      console.error("[generate-result] optimized write/parity failed", {
        generationId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const post = id ? await readOptimizedResult(id) : null;
  return NextResponse.json(post ?? data, {
    status: res.status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Retune-Source": post ? "optimized" : "upstream-fallback",
    },
  });
});
