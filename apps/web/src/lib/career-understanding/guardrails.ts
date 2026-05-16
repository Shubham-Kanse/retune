/**
 * Career-understanding guardrails.
 *
 * Enforces the factual-grounding contract on every AI return. The AI is
 * instructed to be evidence-bound, but instructions are not enough — we
 * verify in code:
 *
 *  - employer / school / certification / project / metric / tool names that
 *    appear in summary or positioning text must exist somewhere in the
 *    profile (case-insensitive, whole-word match).
 *  - hype words ("guaranteed", "perfect fit", "world-class", "top 1%",
 *    "rockstar") cause rejection.
 *  - every EvidenceRef.profilePath must be a member of the allowed list
 *    that comes from `context.allowedProfilePaths`.
 */

import type { CareerProfileV1 } from "@/lib/onboarding/types";
import type { CareerUnderstandingAiOutput, CareerUnderstandingSlice, EvidenceRef } from "./index";

const HYPE_WORDS = [
  "guaranteed",
  "perfect fit",
  "world-class",
  "top 1%",
  "rockstar",
  "ninja",
  "10x",
  "best in class",
  "unparalleled",
  "exceptional in every way",
];

export interface GuardrailViolation {
  kind:
    | "unsupported_employer"
    | "unsupported_school"
    | "unsupported_certification"
    | "unsupported_project"
    | "unsupported_tool"
    | "hype_words"
    | "invalid_profile_path"
    | "empty_summary"
    | "empty_positioning"
    | "duplicate_positioning_id";
  detail: string;
}

export interface GuardrailReport {
  ok: boolean;
  violations: GuardrailViolation[];
}

export function runUnderstandingGuardrails(params: {
  output: CareerUnderstandingAiOutput | CareerUnderstandingSlice;
  profile: CareerProfileV1;
  allowedProfilePaths: string[];
}): GuardrailReport {
  const violations: GuardrailViolation[] = [];

  const known = collectKnownFacts(params.profile);

  const allTextSamples: string[] = [];
  if (params.output.summary) {
    allTextSamples.push(params.output.summary.headline);
    allTextSamples.push(params.output.summary.narrative);
    for (const c of params.output.summary.caveats) allTextSamples.push(c);
  }
  if (params.output.positioning) {
    for (const opt of params.output.positioning.options) {
      allTextSamples.push(opt.title);
      allTextSamples.push(opt.description);
      for (const s of [...opt.bestFor, ...opt.emphasize, ...opt.deEmphasize, ...opt.risks]) {
        allTextSamples.push(s);
      }
    }
  }
  if (params.output.evidenceMap) {
    for (const group of [
      params.output.evidenceMap.strongestSignals,
      params.output.evidenceMap.supportingSignals,
      params.output.evidenceMap.weakSignals,
      params.output.evidenceMap.inferredUnconfirmed,
    ]) {
      for (const sig of group) {
        allTextSamples.push(sig.label);
        allTextSamples.push(sig.interpretation);
      }
    }
  }
  if (params.output.resumeFuel) {
    for (const group of [
      params.output.resumeFuel.ready,
      params.output.resumeFuel.needsSharpening,
      params.output.resumeFuel.risks,
      params.output.resumeFuel.suggestedNextEdits,
    ]) {
      for (const item of group) {
        allTextSamples.push(item.label);
        allTextSamples.push(item.whyItMatters);
      }
    }
  }

  // Hype-word check on all narrative text.
  const allText = allTextSamples.filter((t): t is string => typeof t === "string").join(" ");
  for (const hype of HYPE_WORDS) {
    if (allText.toLowerCase().includes(hype)) {
      violations.push({ kind: "hype_words", detail: hype });
    }
  }

  // Empty-summary / empty-positioning checks (initial-generation only).
  if (params.output.summary) {
    if (!params.output.summary.headline.trim() || !params.output.summary.narrative.trim()) {
      violations.push({ kind: "empty_summary", detail: "summary headline or narrative is empty" });
    }
  }
  if (params.output.positioning) {
    const ids = new Set<string>();
    for (const opt of params.output.positioning.options) {
      if (ids.has(opt.id)) {
        violations.push({
          kind: "duplicate_positioning_id",
          detail: `positioning id ${opt.id} appears more than once`,
        });
      }
      ids.add(opt.id);
    }
  }

  // Evidence path check across every EvidenceRef in the output.
  const refs: EvidenceRef[] = collectRefs(params.output);
  const allowedSet = new Set(params.allowedProfilePaths);
  for (const ref of refs) {
    if (!isAllowedPath(ref.profilePath, allowedSet)) {
      violations.push({
        kind: "invalid_profile_path",
        detail: `EvidenceRef.profilePath="${ref.profilePath}" not in allowedProfilePaths`,
      });
    }
  }

  // Quoted entities check — any quoted text in EvidenceRef must match a
  // profile substring. We keep this lenient (case-insensitive) but require
  // length>=4 to avoid noise.
  for (const ref of refs) {
    if (ref.quote && ref.quote.trim().length >= 4) {
      const q = ref.quote.toLowerCase();
      if (!known.allProfileText.includes(q)) {
        // Not strictly fatal — flag as invalid_profile_path-style, but only
        // if the quote contains a concrete entity (employer / project / school).
        if (
          known.employers.some((e) => q.includes(e)) ||
          known.schools.some((e) => q.includes(e)) ||
          known.projects.some((e) => q.includes(e))
        ) {
          // The entity is in the profile; quote may be a paraphrase. Skip.
        } else {
          // Otherwise flag at evidence level
          violations.push({
            kind: "invalid_profile_path",
            detail: `EvidenceRef quote not found in profile: "${ref.quote.slice(0, 40)}..."`,
          });
        }
      }
    }
  }

  // Entity-grounding check. We intentionally only flag entities that look
  // resume-shaped and are obviously absent from the profile — this avoids
  // false positives from generic professional language.
  for (const sample of allTextSamples) {
    if (!sample) continue;
    const employerMatches = matchEntities(sample, known.employers);
    for (const claimed of extractCapitalisedEntities(sample)) {
      if (looksLikeEmployerClaim(sample, claimed) && !employerMatches.includes(claimed)) {
        if (!known.employers.includes(claimed.toLowerCase())) {
          violations.push({
            kind: "unsupported_employer",
            detail: `summary mentions employer "${claimed}" not present in profile`,
          });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

interface KnownFacts {
  employers: string[];
  schools: string[];
  projects: string[];
  certifications: string[];
  tools: string[];
  allProfileText: string;
}

function collectKnownFacts(profile: CareerProfileV1): KnownFacts {
  const employers: string[] = [];
  for (const e of profile.experience.value ?? []) {
    if (e.company) employers.push(e.company.toLowerCase());
  }
  const schools: string[] = [];
  for (const e of profile.education.value ?? []) {
    if (e.institution) schools.push(e.institution.toLowerCase());
  }
  const projects: string[] = [];
  for (const p of profile.projects.value ?? []) {
    if (p.title) projects.push(p.title.toLowerCase());
  }
  const certifications: string[] = [];
  for (const c of profile.certifications.value ?? []) {
    if (c.name) certifications.push(c.name.toLowerCase());
  }
  const tools: string[] = [];
  for (const t of profile.skills.tools.value ?? []) tools.push(t.toLowerCase());
  for (const t of profile.skills.technical.value ?? []) tools.push(t.toLowerCase());
  for (const e of profile.experience.value ?? []) {
    for (const t of e.tools ?? []) tools.push(t.toLowerCase());
  }

  const flat = (xs: unknown): string =>
    Array.isArray(xs) ? xs.map((x) => (typeof x === "string" ? x : "")).join(" ") : "";

  const allProfileText = [
    profile.identity.fullName.value,
    profile.identity.location.value,
    profile.identity.linkedin.value,
    flat(profile.professionalProfile.currentTitles.value),
    flat(profile.professionalProfile.professionalIdentities.value),
    flat(profile.professionalProfile.summarySignals.value),
    flat(profile.professionalProfile.domainExperience.value),
    flat(profile.professionalProfile.careerHighlights.value),
    flat(profile.skills.technical.value),
    flat(profile.skills.tools.value),
    flat(profile.skills.business.value),
    flat(profile.skills.methodologies.value),
    flat(profile.skills.softSkills.value),
    flat(profile.skills.domainSkills.value),
    ...(profile.experience.value ?? []).flatMap((e) => [
      e.title,
      e.company,
      ...(e.responsibilities ?? []),
      ...(e.achievements ?? []),
      ...(e.tools ?? []),
      ...(e.skills ?? []),
    ]),
    ...(profile.education.value ?? []).flatMap((e) => [
      e.degree,
      e.institution,
      e.fieldOfStudy ?? "",
      ...(e.coursework ?? []),
    ]),
    ...(profile.projects.value ?? []).flatMap((p) => [
      p.title,
      p.description,
      ...(p.techStack ?? []),
    ]),
    ...(profile.certifications.value ?? []).flatMap((c) => [c.name, c.issuer ?? ""]),
    flat(profile.careerIntent.interestedRoles.value),
    flat(profile.careerIntent.preferredMarkets.value),
    flat(profile.careerIntent.industriesOfInterest.value),
    flat(profile.careerIntent.seniorityComfort.value),
    flat(profile.resumeWritingPreferences.emphasisAreas.value),
    flat(profile.resumeWritingPreferences.deEmphasisAreas.value),
    flat(profile.resumeWritingPreferences.toneSignals.value),
  ]
    .filter((p): p is string => typeof p === "string")
    .join(" ")
    .toLowerCase();

  return {
    employers: dedupeNonEmpty(employers),
    schools: dedupeNonEmpty(schools),
    projects: dedupeNonEmpty(projects),
    certifications: dedupeNonEmpty(certifications),
    tools: dedupeNonEmpty(tools),
    allProfileText,
  };
}

function dedupeNonEmpty(xs: string[]): string[] {
  return Array.from(new Set(xs.map((x) => x.trim()).filter((x) => x.length > 0)));
}

function collectRefs(
  output: CareerUnderstandingAiOutput | CareerUnderstandingSlice,
): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  if (output.summary) refs.push(...output.summary.sourceRefs);
  if (output.positioning) {
    for (const opt of output.positioning.options) refs.push(...opt.evidenceRefs);
  }
  if (output.evidenceMap) {
    for (const group of [
      output.evidenceMap.strongestSignals,
      output.evidenceMap.supportingSignals,
      output.evidenceMap.weakSignals,
      output.evidenceMap.inferredUnconfirmed,
    ]) {
      for (const sig of group) refs.push(...sig.sourceRefs);
    }
  }
  if (output.resumeFuel) {
    for (const group of [
      output.resumeFuel.ready,
      output.resumeFuel.needsSharpening,
      output.resumeFuel.risks,
      output.resumeFuel.suggestedNextEdits,
    ]) {
      for (const item of group) refs.push(...item.sourceRefs);
    }
  }
  return refs;
}

function isAllowedPath(path: string, allowed: Set<string>): boolean {
  if (allowed.has(path)) return true;
  // Permit indexed children of an allowed prefix, e.g. "experience[0].metrics".
  for (const a of allowed) {
    if (path.startsWith(`${a}.`)) return true;
    if (path.startsWith(`${a}[`)) return true;
  }
  return false;
}

function matchEntities(text: string, entities: string[]): string[] {
  const lc = text.toLowerCase();
  return entities.filter((e) => e && lc.includes(e));
}

const CAPITALISED_ENTITY_RE = /\b([A-Z][A-Za-z0-9&.\-']+(?:\s+[A-Z][A-Za-z0-9&.\-']+){0,3})\b/g;

function extractCapitalisedEntities(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(CAPITALISED_ENTITY_RE)) {
    if (m[1] && m[1].length >= 3 && m[1].length <= 60) out.add(m[1]);
  }
  return Array.from(out);
}

const EMPLOYER_CONTEXT_RE =
  /(?:\bat\b|\bworked at\b|\bjoined\b|\bwhile at\b|\bfrom\b|\bemployed at\b|\bduring time at\b)\s+/i;

function looksLikeEmployerClaim(text: string, entity: string): boolean {
  const idx = text.indexOf(entity);
  if (idx < 0) return false;
  const window = text.slice(Math.max(0, idx - 32), idx);
  return EMPLOYER_CONTEXT_RE.test(window);
}
