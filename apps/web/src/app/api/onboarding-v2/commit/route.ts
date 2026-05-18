// POST /api/onboarding-v2/commit
//
// Two actions:
//   { action: "audit" }   — run the Stage 9 confidence audit and return gaps
//   {} (default)          — commit profile to DB and trigger background
//                           understanding generation
//
// Guarded by validateCommitIdempotency to prevent duplicate writes when the
// client retries (network blip, double-click).

import { trackOnboardingError, trackOnboardingEvent } from "@/lib/onboarding-v2/analytics";
import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import { getSessionStats } from "@/lib/onboarding-v2/llm/calls";
import { loadSession, updateSession, validateCommitIdempotency } from "@/lib/onboarding-v2/session";
import {
  commitProfile,
  generateUnderstandingDocument,
  regenerateInferredSummary,
  runConfidenceAudit,
} from "@/lib/onboarding-v2/stages/stage-9-audit";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let session = await loadSession(userId);
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // --- Action: mark ready (optimistic commit gate) ---
  if (body.action === "mark_ready") {
    await updateSession(userId, {
      audit: { ...session.audit, ready_to_commit: true },
    });
    return NextResponse.json({ success: true });
  }

  // --- Action: run audit ---
  if (body.action === "audit") {
    const audit = await runConfidenceAudit(session);
    await updateSession(userId, {
      audit: {
        critical_gaps_resolved: audit.critical_gaps.length === 0,
        important_gaps_resolved: audit.important_gaps.length === 0,
        contradictions_resolved: audit.contradictions.length === 0,
        profile_quality_score: audit.profile_quality_score,
        ready_to_commit: audit.ready_to_commit,
        regenerated_inferred_summary: false,
      },
    });
    return NextResponse.json({ audit });
  }

  // --- Action: commit ---
  // Idempotency guard
  const canCommit = await validateCommitIdempotency(userId);
  if (!canCommit) {
    return NextResponse.json({ success: true, alreadyCommitted: true, redirect: "/dashboard" });
  }

  if (
    session.onboarding_status !== "voice_extraction_complete" &&
    session.onboarding_status !== "committed"
  ) {
    return NextResponse.json(
      { error: "not_ready_to_commit", currentStatus: session.onboarding_status },
      { status: 400 },
    );
  }

  try {
    if (session.audit.ready_to_commit !== true) {
      const audit = await runConfidenceAudit(session);
      const auditPatch = {
        audit: {
          critical_gaps_resolved: audit.critical_gaps.length === 0,
          important_gaps_resolved: audit.important_gaps.length === 0,
          contradictions_resolved: audit.contradictions.length === 0,
          profile_quality_score: audit.profile_quality_score,
          ready_to_commit: audit.ready_to_commit,
          regenerated_inferred_summary: session.audit.regenerated_inferred_summary,
        },
      };
      await updateSession(userId, auditPatch);
      if (!audit.ready_to_commit) {
        return NextResponse.json(
          {
            success: false,
            error: "audit_not_ready",
            audit,
          },
          { status: 409 },
        );
      }
      session = { ...session, ...auditPatch };
    }

    const startedAt = new Date(session.onboarding_started_at).getTime();
    await commitProfile(session);

    const stats = getSessionStats();
    trackOnboardingEvent({
      event: "onboarding_v2_committed",
      properties: {
        qualityScore: session.audit.profile_quality_score ?? 0,
        completenessPath: session.completeness.completeness_path ?? "standard",
        totalLLMCalls: stats.calls,
        totalCostUsd: stats.costUsd,
        durationMs: Date.now() - startedAt,
      },
    });

    // Fire understanding generation in background (non-blocking)
    generateUnderstandingDocument(session).catch(() => {});
    // Fire inferred-summary regeneration in background if Stage 2 was low quality
    regenerateInferredSummary(session).catch(() => {});

    return NextResponse.json({ success: true, redirect: "/dashboard" });
  } catch (err) {
    trackOnboardingError(9, "commit_failed", true);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message, retryable: true }, { status: 500 });
  }
}
