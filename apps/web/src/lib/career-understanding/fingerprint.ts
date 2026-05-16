/**
 * Career profile fingerprinting.
 *
 * Detects whether a CareerUnderstandingV1 is stale relative to its source
 * CareerProfileV1, and prevents applying previews that were generated
 * against older facts.
 *
 * The fingerprint is deterministic and stable across key ordering, so
 * minor reorderings of the profile JSON do not break stale-state.
 *
 * Volatile fields are intentionally excluded:
 *   - `updatedAt`, `lastUpdatedAt` (timestamps re-stamp on every save)
 *   - `editHistory` (we care about the current value, not the history)
 *   - `evidence` (parse provenance is not a meaningful interpretation input)
 *   - `onboarding.currentPhase`, `onboarding.readiness` (UI state)
 *
 * The fingerprint runs server-side. Clients cannot import this helper and
 * compute their own — they must use the server-issued fingerprint.
 */

import { createHash } from "node:crypto";
import type { CareerProfileV1 } from "@/lib/onboarding/types";
import type { CareerUnderstandingV1 } from "./types";

/**
 * Returns a stable digest of the meaningful career facts.
 *
 * The digest only includes value-bearing fields. Provenance, evidence,
 * confirmations, edit history, and timestamps are stripped before
 * hashing because they change on every save without changing the facts.
 */
export function careerProfileFingerprint(profile: CareerProfileV1): string {
  const canonical = canonicaliseProfile(profile);
  const json = stableStringify(canonical);
  return createHash("sha256").update(json).digest("hex").slice(0, 32);
}

/**
 * True when the understanding's recorded fingerprint disagrees with the
 * fingerprint of the supplied profile.
 */
export function isUnderstandingStale(
  understanding: CareerUnderstandingV1 | null,
  profile: CareerProfileV1,
): boolean {
  if (!understanding) return false;
  if (understanding.status === "stale") return true;
  if (!understanding.sourceProfileFingerprint) return true;
  return understanding.sourceProfileFingerprint !== careerProfileFingerprint(profile);
}

/**
 * Project the canonical CareerProfileV1 down to value-only structure used
 * for fingerprinting. The output is a plain JSON value.
 */
function canonicaliseProfile(profile: CareerProfileV1): unknown {
  return {
    schemaVersion: profile.schemaVersion,
    identity: {
      fullName: liftValue(profile.identity.fullName),
      email: liftValue(profile.identity.email),
      phone: liftValue(profile.identity.phone),
      location: liftValue(profile.identity.location),
      linkedin: liftValue(profile.identity.linkedin),
      github: liftValue(profile.identity.github),
      portfolio: liftValue(profile.identity.portfolio),
      website: liftValue(profile.identity.website),
    },
    professionalProfile: {
      currentTitles: liftValue(profile.professionalProfile.currentTitles),
      professionalIdentities: liftValue(profile.professionalProfile.professionalIdentities),
      yearsOfExperience: liftValue(profile.professionalProfile.yearsOfExperience),
      summarySignals: liftValue(profile.professionalProfile.summarySignals),
      domainExperience: liftValue(profile.professionalProfile.domainExperience),
      careerHighlights: liftValue(profile.professionalProfile.careerHighlights),
    },
    experience: liftValue(profile.experience),
    education: liftValue(profile.education),
    skills: {
      technical: liftValue(profile.skills.technical),
      tools: liftValue(profile.skills.tools),
      business: liftValue(profile.skills.business),
      methodologies: liftValue(profile.skills.methodologies),
      softSkills: liftValue(profile.skills.softSkills),
      domainSkills: liftValue(profile.skills.domainSkills),
    },
    projects: liftValue(profile.projects),
    certifications: liftValue(profile.certifications),
    languages: liftValue(profile.languages),
    awards: liftValue(profile.awards),
    publications: liftValue(profile.publications),
    volunteering: liftValue(profile.volunteering),
    careerIntent: {
      interestedRoles: liftValue(profile.careerIntent.interestedRoles),
      careerDirection: liftValue(profile.careerIntent.careerDirection),
      preferredMarkets: liftValue(profile.careerIntent.preferredMarkets),
      workPreference: liftValue(profile.careerIntent.workPreference),
      seniorityComfort: liftValue(profile.careerIntent.seniorityComfort),
      industriesOfInterest: liftValue(profile.careerIntent.industriesOfInterest),
      roleDealbreakers: liftValue(profile.careerIntent.roleDealbreakers),
    },
    resumeWritingPreferences: {
      emphasisAreas: liftValue(profile.resumeWritingPreferences.emphasisAreas),
      deEmphasisAreas: liftValue(profile.resumeWritingPreferences.deEmphasisAreas),
      toneSignals: liftValue(profile.resumeWritingPreferences.toneSignals),
      styleConstraints: liftValue(profile.resumeWritingPreferences.styleConstraints),
    },
    onboarding: {
      educationNotApplicable: profile.onboarding.educationNotApplicable,
      resumeUploaded: profile.onboarding.resumeUploaded,
      resumeParsed: profile.onboarding.resumeParsed,
      resumeSummarized: profile.onboarding.resumeSummarized,
    },
  };
}

/**
 * Lift a ProfileField<T>.value into its bare JSON representation.
 *
 * Strips arrays of objects of their volatile inner fields (id, evidence,
 * editHistory) when present, so the same fact set always hashes the same
 * even if those metadata fields change.
 */
function liftValue(field: unknown): unknown {
  if (field == null) return null;
  if (typeof field !== "object") return field;
  // ProfileField<T> shape
  if ("value" in field) {
    const v = (field as { value: unknown }).value;
    return stripVolatileMeta(v);
  }
  return stripVolatileMeta(field);
}

function stripVolatileMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileMeta);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (
        key === "lastUpdatedAt" ||
        key === "updatedAt" ||
        key === "createdAt" ||
        key === "editHistory" ||
        key === "evidence" ||
        key === "confidence" ||
        key === "confirmed"
      ) {
        continue;
      }
      out[key] = stripVolatileMeta(v);
    }
    return out;
  }
  return value;
}

/**
 * JSON.stringify with a stable, sorted key order at every level. Required
 * because object key order in JavaScript is insertion-order-sensitive but
 * fact equality should not depend on it.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const sorted = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const key of sorted) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
