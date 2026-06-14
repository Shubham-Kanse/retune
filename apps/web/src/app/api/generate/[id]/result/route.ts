import { apiUrl } from "@/lib/api-config";
import { withAuthParams } from "@/lib/api-handler";
import {
  hasGenerationAccessSecret,
  signGenerationAccessToken,
  userOwnsGeneration,
} from "@/lib/generation-access";
import {
  dualWriteOptimizedResult,
  parityCheckResult,
  readOptimizedResult,
} from "@/lib/optimized-results";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuthParams(async (_req, _session, { id }) => {
  if (!id) {
    return NextResponse.json({ error: "invalid_generation_id" }, { status: 400 });
  }
  const owns = await userOwnsGeneration({ userId: _session.userId, generationId: id });
  if (!owns) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!hasGenerationAccessSecret()) {
    return NextResponse.json(
      {
        error: "generation_access_not_configured",
        message: "RETUNE_INTERNAL_GENERATION_ACCESS_SECRET must be set (>=16 chars)",
      },
      { status: 503 },
    );
  }

  const token = signGenerationAccessToken({ generationId: id, userId: _session.userId });
  const pre = id ? await readOptimizedResult(id) : null;

  const res = await fetch(apiUrl(`/generate/${id}`), {
    cache: "no-store",
    headers: { "X-Retune-Generation-Access": token },
  });
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
  const merged = data ? { ...data, ...(post ?? pre ?? {}) } : post ?? pre ?? null;
  return NextResponse.json(merged, {
    status: res.status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Retune-Source": post || pre ? "optimized+upstream" : "upstream-fallback",
    },
  });
});
