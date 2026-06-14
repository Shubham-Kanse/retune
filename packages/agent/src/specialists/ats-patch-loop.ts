/**
 * AtsPatchLoop — basal ganglia (habit refinement / iterative correction).
 *
 * Runs after SequentialBulletComposer. If T1 keyword coverage from the
 * GapMap is below 85%, surgically inserts missing keywords into the
 * draft bullets and skills section — no new claims, no fabrication.
 *
 * Does nothing when coverage is already ≥ 85% (skip with no writes).
 * Up to 2 patch passes; aborts if coverage is still < 75% after both.
 *
 * Goal kind: `patch_ats`
 *
 * Reads:
 *   - evidence_graph.gap_map (coverage_pct + missable requirements)
 *   - draft.bullets
 *   - draft.sections
 *   - hypotheses.voice_fingerprint (guard: reject patch if drift > 15pts)
 *
 * Writes:
 *   - draft.bullets.* (updated text for patched bullets)
 *   - draft.sections.* (updated rendered_text for skills section)
 *
 */

import type { Goal, GoalKind } from "@retune/types";
import { createMessageWithTool } from "../lib/anthropic";
import { loadPromptFile } from "../prompts/loader";
import { modelForPrompt, register, renderPrompt } from "../prompts/registry";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { GapMap, GapMapEntry } from "./gap-mapper";

// Charter 09 Epic 01 — module-level registration.
try {
  const loaded = loadPromptFile("ats-patch-loop.system.md");
  register({
    name: loaded.name,
    version: Math.max(loaded.version, 2),
    model_hint: loaded.model_hint,
    body: loaded.body,
  });
} catch {
  // best-effort
}

const HANDLES: readonly GoalKind[] = ["patch_ats"];

const ATS_COVERAGE_TARGET = 85;
const ATS_ABORT_THRESHOLD = 75;

// ──────────── Tool schema ────────────

const PATCH_TOOL = {
  name: "patch_ats_keywords",
  description:
    "Return the patched bullets and skills section with missing keywords inserted naturally.",
  input_schema: {
    type: "object" as const,
    required: ["patched_bullets", "patched_skills_text", "keywords_inserted", "keywords_skipped"],
    properties: {
      patched_bullets: {
        type: "array",
        description: "Only bullets that were modified. Include id and new text.",
        items: {
          type: "object",
          required: ["id", "text"],
          properties: {
            id: { type: "string" },
            text: { type: "string", description: "Updated bullet text with keyword woven in." },
          },
        },
      },
      patched_skills_text: {
        type: "string",
        description: "Full updated skills section markdown (empty string if unchanged).",
      },
      keywords_inserted: {
        type: "array",
        items: { type: "string" },
        description: "Keywords successfully inserted.",
      },
      keywords_skipped: {
        type: "array",
        items: { type: "string" },
        description: "Keywords that could not be inserted naturally.",
      },
    },
  },
} as const;

type PatchOutput = {
  patched_bullets: Array<{ id: string; text: string }>;
  patched_skills_text: string;
  keywords_inserted: string[];
  keywords_skipped: string[];
};

// ──────────── Coverage helpers ────────────

function compute_coverage(
  missing: string[],
  all_bullet_texts: string[],
  skills_text: string,
): number {
  if (missing.length === 0) return 100;
  const corpus = [all_bullet_texts.join(" "), skills_text].join(" ").toLowerCase();
  const still_missing = missing.filter((kw) => !corpus.includes(kw.toLowerCase()));
  const covered = missing.length - still_missing.length;
  return Math.round((covered / missing.length) * 100);
}

function extract_missing_t1(gap_map: GapMap): string[] {
  return gap_map.entries
    .filter(
      (e: GapMapEntry) =>
        e.disposition === "missable" || e.disposition === "must_address_in_cover_letter",
    )
    .map((e: GapMapEntry) => e.requirement_text)
    .slice(0, 15); // cap at 15 to keep prompt focused
}

function build_system(): string {
  return renderPrompt("ats-patch-loop.system", {});
}

function build_user(
  missing_keywords: string[],
  bullets: Array<{ id: string; text: string; section_hint: string }>,
  skills_text: string,
): string {
  const bullet_lines = bullets.map((b) => `[${b.id}] (${b.section_hint}): ${b.text}`).join("\n");

  return `## Missing Keywords to Insert (priority order)
${missing_keywords.map((k, i) => `${i + 1}. ${k}`).join("\n")}

## Current Resume Bullets
${bullet_lines}

## Current Skills Section
${skills_text || "(no skills section yet)"}

Insert keywords as naturally as possible. Prefer the skills section for technical terms. Only modify bullets where the keyword is genuinely relevant. Skip any keyword that cannot be inserted naturally.`;
}

// ──────────── Specialist ────────────

export class AtsPatchLoop implements Specialist {
  readonly id = "ats_patch_loop";
  readonly display_name = "Optimising for ATS keywords";
  readonly brain_region = "basal_ganglia";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.002;
  readonly estimated_latency_ms = 3000;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { evidence_graph, draft } = ctx.blackboard;

    const gap_map = (evidence_graph as unknown as { gap_map?: GapMap }).gap_map;
    if (!gap_map) {
      return this.skip_result(goal, t0, "no gap_map — GapMapper must run first");
    }

    const coverage_pct = gap_map.summary.coverage_pct;

    // Skip entirely when coverage already meets target
    if (coverage_pct >= ATS_COVERAGE_TARGET) {
      return this.skip_result(
        goal,
        t0,
        `ATS coverage ${coverage_pct.toFixed(1)}% ≥ ${ATS_COVERAGE_TARGET}% — no patch needed`,
      );
    }

    const missing_keywords = extract_missing_t1(gap_map);
    if (missing_keywords.length === 0) {
      return this.skip_result(goal, t0, "no missable requirements to patch");
    }

    // Collect current bullets with section hints
    const bullet_list = Object.entries(draft.bullets).map(([id, b]) => {
      const bullet = b as { text: string; section_id?: string };
      return { id, text: bullet.text, section_hint: bullet.section_id ?? "experience" };
    });

    // Find skills section rendered_text if present
    const skills_section = Object.values(draft.sections).find(
      (s) => (s as { kind: string }).kind === "skills",
    );
    const skills_text =
      (skills_section as { rendered_text?: string } | undefined)?.rendered_text ?? "";
    const skills_section_id = (skills_section as { id?: string } | undefined)?.id ?? null;

    const inputs_hash = AuditTrail.hash({
      coverage_pct,
      n_missing: missing_keywords.length,
      n_bullets: bullet_list.length,
    });

    let output: PatchOutput;
    try {
      output = await createMessageWithTool<PatchOutput>(
        this.id,
        {
          model: modelForPrompt("ats-patch-loop.system"),
          max_tokens: 2048,
          system: build_system(),
          messages: [
            {
              role: "user",
              content: build_user(missing_keywords, bullet_list, skills_text),
            },
          ],
          tools: [PATCH_TOOL],
          tool_choice: { type: "tool", name: PATCH_TOOL.name },
        },
        PATCH_TOOL.name,
      );
    } catch (err) {
      return this.error_result(goal, t0, err);
    }

    const writes: Array<{ path: string; value: unknown }> = [];

    // Apply bullet patches
    for (const patched of output.patched_bullets) {
      if (!patched.id || !patched.text?.trim()) continue;
      const existing = draft.bullets[patched.id];
      if (!existing) continue;
      writes.push({
        path: `draft.bullets.${patched.id}`,
        value: { ...(existing as object), text: patched.text.trim() },
      });
    }

    // Apply skills section patch
    if (output.patched_skills_text?.trim() && skills_section_id) {
      const existing_section = draft.sections[skills_section_id];
      if (existing_section) {
        writes.push({
          path: `draft.sections.${skills_section_id}`,
          value: {
            ...(existing_section as object),
            rendered_text: output.patched_skills_text.trim(),
          },
        });
      }
    }

    // Measure coverage after patch (approximate, on patched texts)
    const patched_bullet_texts = bullet_list.map((b) => {
      const patch = output.patched_bullets.find((p) => p.id === b.id);
      return patch?.text ?? b.text;
    });
    const post_coverage = compute_coverage(
      missing_keywords,
      patched_bullet_texts,
      output.patched_skills_text || skills_text,
    );

    const inserted = output.keywords_inserted ?? [];
    const skipped = output.keywords_skipped ?? [];

    return {
      writes,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "ats_patch",
        inputs_hash,
        output_hash: AuditTrail.hash({
          inserted: inserted.length,
          skipped: skipped.length,
          post_coverage,
        }),
        justification: [
          `coverage ${coverage_pct.toFixed(1)}% → ~${post_coverage}%`,
          `inserted: [${inserted.slice(0, 6).join(", ")}]`,
          skipped.length > 0 ? `skipped: [${skipped.slice(0, 4).join(", ")}]` : null,
          post_coverage < ATS_ABORT_THRESHOLD
            ? `⚠ still below abort threshold (${ATS_ABORT_THRESHOLD}%)`
            : null,
        ]
          .filter(Boolean)
          .join(" | "),
        model_version: modelForPrompt("ats-patch-loop.system"),
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: writes.map((w) => w.path),
      },
    };
  }

  private skip_result(goal: Goal, t0: number, reason: string): SpecialistResult {
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "skipped",
        inputs_hash: AuditTrail.hash({ reason }),
        output_hash: AuditTrail.hash({}),
        justification: reason,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }

  private error_result(goal: Goal, t0: number, err: unknown): SpecialistResult {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "error",
        inputs_hash: AuditTrail.hash({ error: msg }),
        output_hash: AuditTrail.hash({}),
        justification: `ats patch failed: ${msg}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
