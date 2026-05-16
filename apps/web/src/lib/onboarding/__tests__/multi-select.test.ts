import { describe, expect, it } from "vitest";
import { isMultiSelectQuestion } from "../multi-select";
import type { Pill } from "../types";

const setField = (label: string, field: string): Pill => ({
  label,
  value: label.toLowerCase(),
  action: "set_field",
  field,
});

const confirm = (label: string, field: string): Pill => ({
  label,
  value: `confirm_${field}`,
  action: "confirm_field",
  field,
});

describe("isMultiSelectQuestion", () => {
  it("treats resume_summary single-choice confirm pills as NOT multi-select", () => {
    // resume_summary has just a confirm_field pill ("Looks mostly correct") and
    // edit/text actions. No set_field pills for the same field. This was the
    // bug: the check found the confirm pill and falsely returned true.
    const pills: Pill[] = [
      confirm("Looks mostly correct", "resume_summary"),
      { label: "Review details", value: "review_details", action: "edit_card", field: "resume_summary" },
      { label: "Something is wrong", value: "wrong", action: "ask_text", field: "resume_summary" },
    ];
    expect(isMultiSelectQuestion(pills, "resume_summary")).toBe(false);
  });

  it("treats experience_metrics single-choice 'Skip metrics' as NOT multi-select", () => {
    const pills: Pill[] = [confirm("Skip metrics", "experience")];
    expect(isMultiSelectQuestion(pills, "experience")).toBe(false);
  });

  it("treats tone_preferences (set_field options + Continue) as multi-select", () => {
    const pills: Pill[] = [
      setField("Direct", "resumeWritingPreferences.toneSignals"),
      setField("Technical", "resumeWritingPreferences.toneSignals"),
      setField("Punchy", "resumeWritingPreferences.toneSignals"),
      confirm("Continue", "resumeWritingPreferences.toneSignals"),
    ];
    expect(isMultiSelectQuestion(pills, "resumeWritingPreferences.toneSignals")).toBe(true);
  });

  it("treats style_constraints with custom confirm label ('No constraints') as multi-select", () => {
    // Earlier bug: detection required label === "Continue" exactly; any other
    // confirm label silently turned multi-select into broken single-click.
    const pills: Pill[] = [
      setField("No buzzwords", "resumeWritingPreferences.styleConstraints"),
      setField("No I/we pronouns", "resumeWritingPreferences.styleConstraints"),
      confirm("No constraints", "resumeWritingPreferences.styleConstraints"),
    ];
    expect(isMultiSelectQuestion(pills, "resumeWritingPreferences.styleConstraints")).toBe(true);
  });

  it("returns false for empty / undefined pills", () => {
    expect(isMultiSelectQuestion(undefined, "x")).toBe(false);
    expect(isMultiSelectQuestion([], "x")).toBe(false);
  });

  it("returns false when only set_field pills exist (no confirm)", () => {
    const pills: Pill[] = [setField("A", "f"), setField("B", "f")];
    expect(isMultiSelectQuestion(pills, "f")).toBe(false);
  });
});
