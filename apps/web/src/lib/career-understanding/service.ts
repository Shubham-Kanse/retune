/**
 * Career-understanding service.
 *
 * Public functions:
 *   - generateInitialCareerUnderstanding: build the first CareerUnderstandingV1
 *     from a CareerProfileV1.
 *   - previewCareerUnderstandingChange: produce a scoped patch + signed token.
 *   - applyCareerUnderstandingPatch: apply a verified patch to the current doc
 *     (re-exported from patch.ts so the API route only imports from here).
 *
 * The service intentionally does not persist. Persistence is the route's
 * responsibility so that one route call = one transactional unit.
 */

import { randomUUID } from "node:crypto";
import { CAREER_PROFILE_VERSION } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import { getModels, getProvider } from "@retune/agent/web";
import { buildCareerUnderstandingContext } from "./context";
import { careerProfileFingerprint } from "./fingerprint";
import { type GuardrailReport, runUnderstandingGuardrails } from "./guardrails";
import {
  CAREER_UNDERSTANDING_VERSION,
  type CareerUnderstandingPatch,
  type CareerUnderstandingSlice,
  type CareerUnderstandingV1,
  type UnderstandingIntentPreset,
  type UnderstandingScope,
  type UnderstandingSection,
  careerUnderstandingAiOutputSchema,
  careerUnderstandingPatchSchema,
  careerUnderstandingSchema,
  emptyCareerUnderstanding,
} from "./index";
import { applyCareerUnderstandingPatch, buildSliceForPatch } from "./patch";
import { buildInitialUnderstandingPrompt, buildPreviewUnderstandingPrompt } from "./prompt";

export class CareerUnderstandingAiError extends Error {
  constructor(
    public reason:
      | "model_returned_invalid_json"
      | "model_returned_invalid_schema"
      | "model_returned_disallowed_facts"
      | "profile_too_thin"
      | "model_returned_empty",
    public detail?: string,
  ) {
    super(reason);
    this.name = "CareerUnderstandingAiError";
  }
}

export interface InitialUnderstandingResult {
  understanding: CareerUnderstandingV1;
  guardrails: GuardrailReport;
  profileFingerprint: string;
}

export async function generateInitialCareerUnderstanding(params: {
  userId: string;
  profile: CareerProfileV1;
  readiness: ProfileReadiness | null;
  profileId?: string | null;
}): Promise<InitialUnderstandingResult> {
  const ctx = buildCareerUnderstandingContext({
    profile: params.profile,
    readiness: params.readiness,
  });
  if (ctx.isEmpty) {
    throw new CareerUnderstandingAiError(
      "profile_too_thin",
      "Profile lacks enough facts to build a career understanding.",
    );
  }

  const { system, user } = buildInitialUnderstandingPrompt({ context: ctx });

  const aiText = await callAi({ system, user });
  const parsed = parseJsonStrict(aiText);
  const validated = careerUnderstandingAiOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new CareerUnderstandingAiError(
      "model_returned_invalid_schema",
      validated.error.issues[0]?.message ?? "schema mismatch",
    );
  }

  // Stamp ids on positioning options if the model omitted them.
  validated.data.positioning.options = validated.data.positioning.options.map((opt) => ({
    ...opt,
    id: opt.id || `pos-${randomUUID().slice(0, 8)}`,
  }));

  const guardrails = runUnderstandingGuardrails({
    output: validated.data,
    profile: params.profile,
    allowedProfilePaths: ctx.allowedProfilePaths,
  });
  if (!guardrails.ok) {
    throw new CareerUnderstandingAiError(
      "model_returned_disallowed_facts",
      guardrails.violations.map((v) => `${v.kind}: ${v.detail}`).join("; "),
    );
  }

  const fingerprint = careerProfileFingerprint(params.profile);
  const now = new Date().toISOString();
  const profileId =
    params.profileId ??
    (typeof params.profile.id === "string" && params.profile.id.length > 0
      ? params.profile.id
      : null);
  const understanding: CareerUnderstandingV1 = {
    schemaVersion: CAREER_UNDERSTANDING_VERSION,
    id: `cu-${randomUUID().slice(0, 12)}`,
    userId: params.userId,
    profileId,
    sourceProfileVersion: CAREER_PROFILE_VERSION,
    sourceProfileFingerprint: fingerprint,
    revision: 1,
    status: "active",
    summary: validated.data.summary,
    positioning: validated.data.positioning,
    evidenceMap: validated.data.evidenceMap,
    resumeFuel: validated.data.resumeFuel,
    userFeedback: {
      summary: null,
      rejectedPositioningIds: [],
      preferredPositioningIds: [],
      notes: [],
    },
    generatedAt: now,
    updatedAt: now,
    staleSince: null,
  };

  // Final schema validation belt-and-braces.
  const finalCheck = careerUnderstandingSchema.safeParse(understanding);
  if (!finalCheck.success) {
    throw new CareerUnderstandingAiError(
      "model_returned_invalid_schema",
      finalCheck.error.issues[0]?.message ?? "final schema mismatch",
    );
  }

  return { understanding, guardrails, profileFingerprint: fingerprint };
}

export interface PreviewRequest {
  section: UnderstandingSection;
  scope: UnderstandingScope;
  instruction: string;
  intentPreset?: UnderstandingIntentPreset;
  includeEditedFields?: string[];
  excludeFields?: string[];
}

export interface PreviewResult {
  previewId: string;
  patch: CareerUnderstandingPatch;
  patched: CareerUnderstandingV1;
  before: CareerUnderstandingSlice;
  after: CareerUnderstandingSlice;
  changeSummary: string[];
  guardrails: GuardrailReport;
  profileFingerprint: string;
  understandingRevision: number;
}

export async function previewCareerUnderstandingChange(params: {
  userId: string;
  profile: CareerProfileV1;
  current: CareerUnderstandingV1;
  request: PreviewRequest;
}): Promise<PreviewResult> {
  const ctx = buildCareerUnderstandingContext({
    profile: params.profile,
    readiness: params.profile.onboarding.readiness ?? null,
  });

  const { system, user, expectedShape } = buildPreviewUnderstandingPrompt({
    context: ctx,
    current: params.current,
    section: params.request.section,
    scope: params.request.scope,
    instruction: params.request.instruction,
    intentPreset: params.request.intentPreset,
    includeEditedFields: params.request.includeEditedFields,
    excludeFields: params.request.excludeFields,
  });

  const aiText = await callAi({ system, user });
  const parsed = parseJsonStrict(aiText);

  const patch = patchFromAiOutput({ parsed, expectedShape });

  const validated = careerUnderstandingPatchSchema.safeParse(patch);
  if (!validated.success) {
    throw new CareerUnderstandingAiError(
      "model_returned_invalid_schema",
      validated.error.issues[0]?.message ?? "patch schema mismatch",
    );
  }

  // Stamp ids on positioning options if the model omitted them.
  if (validated.data.section === "positioning" || validated.data.section === "multiple") {
    const positioning =
      validated.data.section === "positioning"
        ? validated.data.positioning
        : validated.data.positioning;
    if (positioning) {
      positioning.options = positioning.options.map((opt) => ({
        ...opt,
        id: opt.id || `pos-${randomUUID().slice(0, 8)}`,
      }));
    }
  }

  const sliceForGuardrails = patchToSlice(validated.data);
  const guardrails = runUnderstandingGuardrails({
    output: sliceForGuardrails,
    profile: params.profile,
    allowedProfilePaths: ctx.allowedProfilePaths,
  });
  if (!guardrails.ok) {
    throw new CareerUnderstandingAiError(
      "model_returned_disallowed_facts",
      guardrails.violations.map((v) => `${v.kind}: ${v.detail}`).join("; "),
    );
  }

  const patched = applyCareerUnderstandingPatch({ current: params.current, patch: validated.data });
  const fingerprint = careerProfileFingerprint(params.profile);
  patched.sourceProfileFingerprint = fingerprint;
  patched.staleSince = null;
  patched.status = "active";

  const { before, after } = buildSliceForPatch({
    current: params.current,
    patched,
    patch: validated.data,
  });

  return {
    previewId: `pv-${randomUUID().slice(0, 12)}`,
    patch: validated.data,
    patched,
    before,
    after,
    changeSummary: deriveChangeSummary({ before, after, request: params.request }),
    guardrails,
    profileFingerprint: fingerprint,
    understandingRevision: params.current.revision,
  };
}

/** Re-export the patch helper so route code only imports from `./service`. */
export { applyCareerUnderstandingPatch } from "./patch";

/**
 * Build a default CareerUnderstandingV1 for an authenticated user when no
 * understanding exists yet but the page still needs a structurally-valid
 * shape to render.
 */
export function buildPlaceholderUnderstanding(params: {
  userId: string;
  profile: CareerProfileV1 | null;
}): CareerUnderstandingV1 {
  const fingerprint = params.profile ? careerProfileFingerprint(params.profile) : "empty";
  const profileId =
    params.profile && typeof params.profile.id === "string" && params.profile.id.length > 0
      ? params.profile.id
      : null;
  return emptyCareerUnderstanding({
    userId: params.userId,
    profileId,
    sourceProfileVersion: CAREER_PROFILE_VERSION,
    sourceProfileFingerprint: fingerprint,
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function callAi(params: { system: string; user: string }): Promise<string> {
  const provider = getProvider();
  const models = getModels();
  const response = await provider.createMessage("career-understanding", {
    model: models.smart,
    maxTokens: 4096,
    system: params.system,
    messages: [{ role: "user", content: params.user }],
  });
  return response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function parseJsonStrict(text: string): unknown {
  const candidate = text.trim();
  // Strip markdown fences if the model still adds them.
  const stripped = candidate
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  // Common fallback — extract first object.
  let toParse = stripped;
  if (!stripped.startsWith("{")) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) toParse = match[0];
  }
  try {
    return JSON.parse(toParse);
  } catch {
    throw new CareerUnderstandingAiError("model_returned_invalid_json");
  }
}

function patchFromAiOutput(args: {
  parsed: unknown;
  expectedShape:
    | "summary_only"
    | "positioning_only"
    | "evidence_only"
    | "resume_fuel_only"
    | "multiple";
}): unknown {
  const obj = args.parsed as Record<string, unknown>;
  switch (args.expectedShape) {
    case "summary_only":
      if (!obj.summary) {
        throw new CareerUnderstandingAiError("model_returned_empty", "missing summary");
      }
      return { section: "summary", summary: obj.summary };
    case "positioning_only":
      if (!obj.positioning) {
        throw new CareerUnderstandingAiError("model_returned_empty", "missing positioning");
      }
      return { section: "positioning", positioning: obj.positioning };
    case "evidence_only":
      if (!obj.evidenceMap) {
        throw new CareerUnderstandingAiError("model_returned_empty", "missing evidenceMap");
      }
      return { section: "evidence", evidenceMap: obj.evidenceMap };
    case "resume_fuel_only":
      if (!obj.resumeFuel) {
        throw new CareerUnderstandingAiError("model_returned_empty", "missing resumeFuel");
      }
      return { section: "resume_fuel", resumeFuel: obj.resumeFuel };
    case "multiple":
      // Coerce to a multi-section patch using whatever the model emitted.
      return {
        section: "multiple",
        ...(obj.summary ? { summary: obj.summary } : {}),
        ...(obj.positioning ? { positioning: obj.positioning } : {}),
        ...(obj.evidenceMap ? { evidenceMap: obj.evidenceMap } : {}),
        ...(obj.resumeFuel ? { resumeFuel: obj.resumeFuel } : {}),
      };
  }
}

function patchToSlice(patch: CareerUnderstandingPatch): CareerUnderstandingSlice {
  switch (patch.section) {
    case "summary":
      return { summary: patch.summary };
    case "positioning":
      return { positioning: patch.positioning };
    case "evidence":
      return { evidenceMap: patch.evidenceMap };
    case "resume_fuel":
      return { resumeFuel: patch.resumeFuel };
    case "multiple":
      return {
        summary: patch.summary,
        positioning: patch.positioning,
        evidenceMap: patch.evidenceMap,
        resumeFuel: patch.resumeFuel,
      };
  }
}

function deriveChangeSummary(args: {
  before: CareerUnderstandingSlice;
  after: CareerUnderstandingSlice;
  request: PreviewRequest;
}): string[] {
  const summary: string[] = [];
  if (args.before.summary && args.after.summary) {
    if (args.before.summary.headline !== args.after.summary.headline) {
      summary.push("Updated the headline.");
    }
    if (args.before.summary.narrative !== args.after.summary.narrative) {
      summary.push("Refreshed the narrative.");
    }
  }
  if (args.before.positioning && args.after.positioning) {
    const beforeIds = new Set(args.before.positioning.options.map((o) => o.id));
    const afterIds = new Set(args.after.positioning.options.map((o) => o.id));
    const added = [...afterIds].filter((id) => !beforeIds.has(id));
    const removed = [...beforeIds].filter((id) => !afterIds.has(id));
    if (added.length) summary.push(`Added ${added.length} positioning option(s).`);
    if (removed.length) summary.push(`Removed ${removed.length} positioning option(s).`);
    if (!added.length && !removed.length) {
      summary.push("Updated existing positioning copy.");
    }
  }
  if (args.before.evidenceMap && args.after.evidenceMap) {
    summary.push("Refreshed the evidence map.");
  }
  if (args.before.resumeFuel && args.after.resumeFuel) {
    summary.push("Refreshed resume fuel.");
  }
  if (summary.length === 0) {
    summary.push(`Tuning applied: ${args.request.scope}.`);
  }
  return summary;
}
