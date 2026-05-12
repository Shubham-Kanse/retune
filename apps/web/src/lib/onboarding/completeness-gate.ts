/**
 * completeness-gate.ts
 * Pure function — no I/O. Checks whether the hard minimum profile data
 * has been collected to allow onboarding completion.
 *
 * Hard minimum: fullName + currentTitle + experienceLevel + ≥1 work entry
 */

import type { ProfileNormalized } from "@/lib/profile-domain/contracts";

export type HardMinimumField = "fullName" | "currentTitle" | "experienceLevel" | "experience";

export interface CompletenessGateResult {
  met: boolean;
  missing: HardMinimumField[];
}

export function checkHardMinimum(
  delta: Partial<ProfileNormalized>,
): CompletenessGateResult {
  const missing: HardMinimumField[] = [];

  if (!delta.fullName?.trim()) missing.push("fullName");
  if (!delta.currentTitle?.trim()) missing.push("currentTitle");
  if (!delta.experienceLevel?.trim()) missing.push("experienceLevel");
  if (!delta.experience?.length || !delta.experience.some((e) => e.company?.trim() || e.title?.trim())) {
    missing.push("experience");
  }

  return { met: missing.length === 0, missing };
}
