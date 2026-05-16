import type { Pill } from "./types";

/**
 * Detect whether a question is multi-select (staging mode) vs single-choice.
 *
 * A question is multi-select only when its pill array contains BOTH:
 *   • a `confirm_field` pill (the "submit" button), AND
 *   • at least one `set_field` pill for the SAME field (the toggleable options).
 *
 * Single-choice confirm questions (e.g. resume_summary's "Looks mostly correct",
 * experience_metrics' "Skip metrics") have a confirm_field pill but no set_field
 * pills for the same field — they should be treated as single-choice.
 *
 * The earlier version of this check used `label === "Continue"` which broke when
 * different steps used different confirm labels ("No constraints", "Skip metrics").
 * The version after that just looked for any confirm_field pill, which then broke
 * single-choice confirms by treating them as empty multi-selects. This is the
 * correct invariant.
 */
export function isMultiSelectQuestion(pills: Pill[] | undefined, fieldHint?: string): boolean {
  if (!pills || pills.length === 0) return false;
  const targetField = fieldHint ?? pills.find((p) => p.action === "confirm_field")?.field;
  if (!targetField) return false;
  const hasConfirm = pills.some(
    (p) => p.action === "confirm_field" && p.field === targetField,
  );
  const hasOptions = pills.some(
    (p) => p.action === "set_field" && p.field === targetField,
  );
  return hasConfirm && hasOptions;
}
