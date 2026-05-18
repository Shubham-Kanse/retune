import { describe, expect, it } from "vitest";
import {
  CommitError,
  FileValidationError,
  LLMCallError,
  NonResumeError,
  OnboardingError,
  RateLimitError,
  SessionWriteError,
} from "../errors";
import { createEmptySession } from "../types";

describe("createEmptySession", () => {
  it("returns a fully-populated session with the user_id wired through", () => {
    const session = createEmptySession("user-test-123");
    expect(session.user_id).toBe("user-test-123");
    expect(session.session_id).toMatch(/^[0-9a-f-]+$/);
    expect(session.onboarding_status).toBe("awaiting_upload");
    expect(session.confirmation.summary_confirmed).toBe(false);
    expect(session.upload.upload_attempts).toBe(0);
    expect(session.question_map.target_role.value).toBeNull();
    expect(session.voice_profile.voice_profile_source).toBeNull();
    expect(session.audit.ready_to_commit).toBe(false);
  });

  it("initialises every question map field as null", () => {
    const session = createEmptySession("u");
    const fields = Object.values(session.question_map);
    for (const f of fields) {
      expect(f.value).toBeNull();
      expect(f.confidence).toBeNull();
      expect(f.source).toBeNull();
    }
  });

  it("starts with sensible default flags", () => {
    const session = createEmptySession("u");
    expect(session.inference.career_transition_detected).toBe(false);
    expect(session.inference.new_grad).toBe(false);
    expect(session.completeness.employment_gaps_present).toBe(false);
    expect(session.completeness.has_quantified_achievements).toBe(false);
  });
});

describe("OnboardingError classes", () => {
  it("FileValidationError carries a code and stage 1", () => {
    const e = new FileValidationError("image_file", "Image not allowed");
    expect(e).toBeInstanceOf(OnboardingError);
    expect(e.stage).toBe(1);
    expect(e.code).toBe("image_file");
    expect(e.userMessage).toBe("Image not allowed");
  });

  it("LLMCallError preserves the cause", () => {
    const cause = new Error("timeout");
    const e = new LLMCallError(7, "answer_eval", cause);
    expect(e.stage).toBe(7);
    expect(e.code).toBe("llm_answer_eval_failed");
    expect((e as { cause?: Error }).cause).toBe(cause);
    expect(e.retryable).toBe(true);
  });

  it("CommitError marks itself retryable at stage 9", () => {
    const e = new CommitError();
    expect(e.stage).toBe(9);
    expect(e.retryable).toBe(true);
  });

  it("NonResumeError uses the spec'd user message", () => {
    const e = new NonResumeError();
    expect(e.userMessage).toContain("wasn't able to find enough resume information");
  });

  it("RateLimitError is non-retryable and stage-agnostic", () => {
    const e = new RateLimitError();
    expect(e.retryable).toBe(false);
    expect(e.stage).toBe(0);
  });

  it("SessionWriteError preserves cause and is retryable", () => {
    const cause = new Error("db down");
    const e = new SessionWriteError(cause);
    expect(e.retryable).toBe(true);
    expect((e as { cause?: Error }).cause).toBe(cause);
  });
});
