/**
 * Prompt registry bootstrap (Charter 09 Epic 01).
 *
 * Calls `register()` for every specialist prompt the system uses.
 * Today the bodies are placeholders — the actual extraction from
 * inline template literals into these registered slots is the
 * follow-up tracked by the playbook at
 * `docs/charters/09-ai-ml/prompt-extraction-playbook.md`.
 *
 * The reason to register them NOW even with placeholder bodies:
 *   - Anything querying `listPrompts()` (audit dashboards, model-call
 *     telemetry rows, eval scaffolding) sees the full canonical name
 *     list immediately.
 *   - The migration becomes "swap the body" instead of "introduce a
 *     new registry entry," which is a simpler review.
 *   - Tests that assert "every specialist has a registered prompt"
 *     can land before the bodies are migrated.
 *
 * IMPORTANT: until each body is migrated, `getPrompt(name).body`
 * returns this placeholder — do NOT call `renderPrompt()` and feed it
 * to a real LLM until the body is extracted.
 */

import { register } from "./registry";

const PLACEHOLDER = "[[ unmigrated — see docs/charters/09-ai-ml/prompt-extraction-playbook.md ]]";

const SPECIALIST_PROMPTS: Array<{ name: string; model_hint: "smart" | "fast" | "frontier" }> = [
  { name: "bullet-composer.refine", model_hint: "smart" },
  { name: "bullet-composer.compose", model_hint: "smart" },
  { name: "gap-mapper.detect", model_hint: "smart" },
  { name: "gap-mapper.suggest", model_hint: "fast" },
  { name: "refuse-or-ship.gate", model_hint: "frontier" },
  { name: "narrative-arc-proposer.draft", model_hint: "smart" },
  { name: "narrative-arc-proposer.score", model_hint: "fast" },
  { name: "cover-letter-composer.draft", model_hint: "smart" },
  { name: "cover-letter-composer.tighten", model_hint: "fast" },
  { name: "critic-ensemble.recruiter", model_hint: "smart" },
  { name: "critic-ensemble.peer", model_hint: "smart" },
  { name: "critic-ensemble.skeptic", model_hint: "smart" },
  { name: "evidence-solver.match", model_hint: "fast" },
  { name: "outcome-predictor.score", model_hint: "fast" },
  { name: "theory-of-mind.recruiter-belief", model_hint: "smart" },
  { name: "fairness-monitor.review", model_hint: "fast" },
  { name: "voice-drift-monitor.audit", model_hint: "fast" },
  { name: "well-being-monitor.audit", model_hint: "fast" },
  { name: "active-question-handler.compose", model_hint: "fast" },
  { name: "narrator.summary", model_hint: "fast" },
];

let _bootstrapped = false;

/**
 * Idempotent — call this once at agent module load. Subsequent calls
 * are no-ops (the registry's own `register` already dedupes).
 */
export function bootstrapSpecialistPrompts(): void {
  if (_bootstrapped) return;
  for (const spec of SPECIALIST_PROMPTS) {
    register({
      name: spec.name,
      version: 1,
      model_hint: spec.model_hint,
      body: PLACEHOLDER,
    });
  }
  _bootstrapped = true;
}

/**
 * Test-only — clear the bootstrap flag so a test can re-register.
 */
export function _resetBootstrapForTests(): void {
  _bootstrapped = false;
}
