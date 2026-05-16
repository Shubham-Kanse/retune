"use client";

import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import type {
  CareerUnderstandingPatch,
  CareerUnderstandingSlice,
  CareerUnderstandingV1,
  EvidenceRef,
} from "@/lib/career-understanding";
import * as React from "react";

interface PreviewApiResponse {
  previewId: string;
  previewToken: string;
  before: CareerUnderstandingSlice;
  after: CareerUnderstandingSlice;
  changeSummary: string[];
  evidenceRefs?: EvidenceRef[];
  patch: CareerUnderstandingPatch;
  profileFingerprint: string;
  understandingRevision: number;
  expiresAt: string;
  kind?: "initial" | "tune";
  error?: string;
  detail?: string | null;
  currentFingerprint?: string;
  currentRevision?: number;
}

interface ApplyApiResponse {
  ok: boolean;
  understanding: CareerUnderstandingV1;
  revision: number;
  error?: string;
}

interface UseRetuneLensParams {
  expectedProfileFingerprint?: string | null;
  expectedUnderstandingRevision?: number;
  initial?: boolean;
  onApplied?: (understanding: CareerUnderstandingV1) => void;
}

/**
 * Wires the Retune Lens panel into the /preview and /apply API routes.
 *
 * The hook manages no UI state — the panel keeps its own. Use the
 * returned callbacks as `onPreview` and `onApply` props.
 */
export function useRetuneLens(params: UseRetuneLensParams = {}) {
  const { expectedProfileFingerprint, expectedUnderstandingRevision, onApplied } = params;

  const onPreview = React.useCallback(
    async (request: RetuneLensPreviewRequest): Promise<RetuneLensPreviewResponse> => {
      const res = await fetch("/api/profile/understanding/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          expectedProfileFingerprint: expectedProfileFingerprint ?? undefined,
          expectedUnderstandingRevision: expectedUnderstandingRevision ?? undefined,
          initial: params.initial ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as PreviewApiResponse | null;
      if (!res.ok || !data || data.error) {
        const message = data?.detail ?? previewErrorMessage(data?.error, res.status);
        throw new Error(message);
      }
      return {
        previewId: data.previewId,
        previewToken: data.previewToken,
        before: data.before,
        after: data.after,
        changeSummary: data.changeSummary,
        evidenceRefs: data.evidenceRefs,
        patch: data.patch,
      };
    },
    [expectedProfileFingerprint, expectedUnderstandingRevision, params.initial],
  );

  const onApply = React.useCallback(
    async (previewId: string, previewToken: string): Promise<void> => {
      const res = await fetch("/api/profile/understanding/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewId, previewToken }),
      });
      const data = (await res.json().catch(() => null)) as ApplyApiResponse | null;
      if (!res.ok || !data || data.error) {
        throw new Error(applyErrorMessage(data?.error, res.status));
      }
      if (onApplied && data.understanding) {
        onApplied(data.understanding);
      }
    },
    [onApplied],
  );

  return { onPreview, onApply };
}

function previewErrorMessage(code: string | undefined, status: number): string {
  switch (code) {
    case "rate_limited":
      return "You're tuning too fast. Try again in a few minutes.";
    case "stale_profile_fingerprint":
      return "You edited your profile after this was loaded. Save the page and try again.";
    case "stale_understanding_revision":
      return "Someone else updated your read. Refresh and try again.";
    case "missing_career_profile":
      return "Add some profile facts before tuning.";
    case "profile_too_thin":
      return "Add more profile facts before generating an interpretation.";
    case "model_returned_invalid_json":
    case "model_returned_invalid_schema":
    case "model_returned_disallowed_facts":
    case "model_returned_empty":
      return "Retune couldn't parse the model's response. Try a simpler instruction.";
    default:
      return code ? `${code} (${status})` : `Request failed (${status})`;
  }
}

function applyErrorMessage(code: string | undefined, status: number): string {
  switch (code) {
    case "invalid_or_expired_token":
      return "This preview expired. Re-run the preview before applying.";
    case "preview_user_mismatch":
      return "This preview belongs to another user.";
    case "stale_profile_fingerprint":
      return "Your profile changed since the preview. Re-run the preview.";
    case "stale_understanding_revision":
      return "Your read changed since the preview. Re-run the preview.";
    default:
      return code ? `${code} (${status})` : `Apply failed (${status})`;
  }
}
