/**
 * Shared helpers for provider-parity tests (technical-2.0 §4.4 / Appendix D).
 *
 * Every LLM-driven specialist must produce identical blackboard writes
 * regardless of which provider (Anthropic vs OpenAI) is active, given the
 * same canonical LLM response. These helpers monkey-patch the active
 * provider's `createMessageWithTool` method to return a fixture, run the
 * specialist, and capture writes for comparison.
 *
 * The audit entry's `model_version` field is expected to differ between
 * providers (e.g. `claude-sonnet-4-6` vs `gpt-4o`); the `equalWrites`
 * helper compares only the blackboard writes.
 */

import { randomUUID } from "node:crypto";
import type { Blackboard, Goal, GoalKind } from "@retune/types";
import type { AIProvider } from "../../src/lib/ai-provider";
import { _resetProvider } from "../../src/lib/provider";
import { anthropicProvider } from "../../src/lib/providers/anthropic";
import { openaiProvider } from "../../src/lib/providers/openai";
import { BlackboardStore } from "../../src/workbench/blackboard";
import { TriggerBus } from "../../src/workbench/trigger-bus";
import type { Specialist, SpecialistResult } from "../../src/workbench/types";

// ──────────── Provider switching ────────────

type ToolFn = AIProvider["createMessageWithTool"];

/**
 * Run `specialist.run(ctx, goal)` once per provider with the same canonical
 * LLM fixture. Returns both results so callers can assert equality.
 *
 * Sets `AI_PROVIDER`, resets the cached provider, monkey-patches the
 * provider's `createMessageWithTool`, and restores the original after.
 */
export async function runWithBothProviders<R extends SpecialistResult>(opts: {
  specialist: Specialist;
  buildBlackboard: () => Blackboard;
  goal: Goal;
  fixture: unknown;
}): Promise<{ anthropic: R; openai: R }> {
  const previous = process.env.AI_PROVIDER;

  const fakeTool: ToolFn = async <T>() => opts.fixture as T;

  const results: Partial<Record<"anthropic" | "openai", R>> = {};

  for (const name of ["anthropic", "openai"] as const) {
    process.env.AI_PROVIDER = name;
    _resetProvider();

    const provider = name === "anthropic" ? anthropicProvider : openaiProvider;
    const original = provider.createMessageWithTool.bind(provider);
    provider.createMessageWithTool = fakeTool as typeof provider.createMessageWithTool;

    try {
      const bb = opts.buildBlackboard();
      const bus = new TriggerBus();
      const store = new BlackboardStore(bb, bus);
      const ctx = {
        blackboard: store.snapshot(),
        tick: 0,
        trace_id: randomUUID(),
        signal: new AbortController().signal,
      };
      results[name] = (await opts.specialist.run(ctx, opts.goal)) as R;
    } finally {
      provider.createMessageWithTool = original as typeof provider.createMessageWithTool;
    }
  }

  if (previous === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = previous;
  _resetProvider();

  return { anthropic: results.anthropic!, openai: results.openai! };
}

// ──────────── Canonical comparison ────────────

/**
 * Reduce a list of writes to a `(path, value)` shape so model-version drift
 * in `audit.model_version` does not pollute the comparison.
 *
 * UUIDs (e.g. `draft.bullets.<uuid>`) are normalised to `<uuid>` everywhere
 * — both in path segments and recursively inside values — so that
 * `randomUUID()`-generated keys do not break parity comparison. The order of
 * writes is preserved, matching the deterministic specialist iteration.
 */
export function canonicalWrites(result: SpecialistResult): Array<{ path: string; value: unknown }> {
  return result.writes.map((w) => ({ path: normalise(w.path), value: deepNormalise(w.value) }));
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function normalise(s: string): string {
  return s.replace(UUID_RE, "<uuid>");
}

function deepNormalise(value: unknown): unknown {
  if (typeof value === "string") return normalise(value);
  if (Array.isArray(value)) return value.map(deepNormalise);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepNormalise(v);
    }
    return out;
  }
  return value;
}

// ──────────── Goal builders ────────────

export function makeGoal(kind: GoalKind, payload: Record<string, unknown> = {}): Goal {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind,
    priority: 70,
    emitted_by: "test",
    payload,
    status: "pending",
    satisfied_by: [],
    parent_goal_id: null,
    created_at: now,
    updated_at: now,
  };
}

// ──────────── Blackboard builder ────────────

export function emptyBlackboard(): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id: randomUUID(),
    user_id: randomUUID(),
    jd_id: randomUUID(),
    ontology_version: "0.0.1",
    goals: [],
    hypotheses: {
      role_schema: null,
      company_schema: null,
      discourse_map: null,
      hidden_disqualifiers: null,
      desperation_index: null,
      cultural_vector: null,
      candidate_credibility_prior: null,
      voice_fingerprint: null,
      honesty_calibration: null,
      narrative_arcs_candidates: [],
      chosen_narrative_arc: null,
    },
    evidence_graph: { span_ids: [], requirement_matches: [] },
    draft: { sections: {}, bullets: {}, claims: {}, pending_revisions: [] },
    conflicts: [],
    outcome_estimate: null,
    blocking_factors: [],
    cost_budget: {
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    },
    audit_trail: [],
    created_at: now,
    updated_at: now,
  };
}
