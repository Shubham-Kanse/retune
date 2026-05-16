/**
 * Apply a bounded CareerUnderstandingPatch to an existing
 * CareerUnderstandingV1.
 *
 * The patch shapes are restricted in `schema.ts` so the client can never
 * reach into arbitrary keys. Apply intentionally rebuilds a new object so
 * the caller can compare before/after slices for the preview UI.
 */

import type {
  CareerUnderstandingPatch,
  CareerUnderstandingSlice,
  CareerUnderstandingV1,
} from "./types";

/**
 * Returns a new CareerUnderstandingV1 with the patch applied. Other
 * sections are preserved verbatim. Volatile metadata (revision, updatedAt)
 * is NOT changed here — the caller is responsible for stamping it after a
 * successful persist.
 */
export function applyCareerUnderstandingPatch(params: {
  current: CareerUnderstandingV1;
  patch: CareerUnderstandingPatch;
}): CareerUnderstandingV1 {
  const next: CareerUnderstandingV1 = { ...params.current };
  switch (params.patch.section) {
    case "summary":
      next.summary = params.patch.summary;
      break;
    case "positioning":
      next.positioning = params.patch.positioning;
      break;
    case "evidence":
      next.evidenceMap = params.patch.evidenceMap;
      break;
    case "resume_fuel":
      next.resumeFuel = params.patch.resumeFuel;
      break;
    case "multiple":
      if (params.patch.summary) next.summary = params.patch.summary;
      if (params.patch.positioning) next.positioning = params.patch.positioning;
      if (params.patch.evidenceMap) next.evidenceMap = params.patch.evidenceMap;
      if (params.patch.resumeFuel) next.resumeFuel = params.patch.resumeFuel;
      break;
  }
  return next;
}

/** Build a before/after slice pair for the preview UI. */
export function buildSliceForPatch(params: {
  current: CareerUnderstandingV1;
  patched: CareerUnderstandingV1;
  patch: CareerUnderstandingPatch;
}): { before: CareerUnderstandingSlice; after: CareerUnderstandingSlice } {
  const includeSummary = patchTouches(params.patch, "summary");
  const includePositioning = patchTouches(params.patch, "positioning");
  const includeEvidence = patchTouches(params.patch, "evidence");
  const includeResumeFuel = patchTouches(params.patch, "resume_fuel");

  return {
    before: pickSlice(params.current, {
      summary: includeSummary,
      positioning: includePositioning,
      evidence: includeEvidence,
      resumeFuel: includeResumeFuel,
    }),
    after: pickSlice(params.patched, {
      summary: includeSummary,
      positioning: includePositioning,
      evidence: includeEvidence,
      resumeFuel: includeResumeFuel,
    }),
  };
}

function pickSlice(
  doc: CareerUnderstandingV1,
  flags: { summary: boolean; positioning: boolean; evidence: boolean; resumeFuel: boolean },
): CareerUnderstandingSlice {
  const slice: CareerUnderstandingSlice = {};
  if (flags.summary) slice.summary = doc.summary;
  if (flags.positioning) slice.positioning = doc.positioning;
  if (flags.evidence) slice.evidenceMap = doc.evidenceMap;
  if (flags.resumeFuel) slice.resumeFuel = doc.resumeFuel;
  return slice;
}

function patchTouches(
  patch: CareerUnderstandingPatch,
  area: "summary" | "positioning" | "evidence" | "resume_fuel",
): boolean {
  if (patch.section === area) return true;
  if (patch.section !== "multiple") return false;
  if (area === "summary" && patch.summary) return true;
  if (area === "positioning" && patch.positioning) return true;
  if (area === "evidence" && patch.evidenceMap) return true;
  if (area === "resume_fuel" && patch.resumeFuel) return true;
  return false;
}
