// Onboarding V2 — Typed Error Classes

export class OnboardingError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public retryable = false,
    public stage = 0,
  ) {
    super(`[onboarding:${code}] ${userMessage}`);
    this.name = "OnboardingError";
  }
}

export class FileValidationError extends OnboardingError {
  constructor(code: string, message: string) {
    super(code, message, false, 1);
    this.name = "FileValidationError";
  }
}

export class ExtractionError extends OnboardingError {
  constructor(code: string, message: string) {
    super(code, message, true, 1);
    this.name = "ExtractionError";
  }
}

export class LLMCallError extends OnboardingError {
  constructor(stage: number, callName: string, cause?: Error) {
    super(`llm_${callName}_failed`, "AI processing failed — please try again.", true, stage);
    this.name = "LLMCallError";
    if (cause) this.cause = cause;
  }
}

export class SessionWriteError extends OnboardingError {
  constructor(cause?: Error) {
    super(
      "session_write_failed",
      "Something went wrong saving your progress — please try again.",
      true,
      0,
    );
    this.name = "SessionWriteError";
    if (cause) this.cause = cause;
  }
}

export class CommitError extends OnboardingError {
  constructor(cause?: Error) {
    super(
      "commit_failed",
      "We hit a technical issue saving your profile — please try again in a moment.",
      true,
      9,
    );
    this.name = "CommitError";
    if (cause) this.cause = cause;
  }
}

export class RateLimitError extends OnboardingError {
  constructor() {
    super("rate_limit", "I need a moment — please wait a few seconds.", false, 0);
    this.name = "RateLimitError";
  }
}

export class NonResumeError extends OnboardingError {
  constructor() {
    super(
      "non_resume",
      "I wasn't able to find enough resume information in that file. It may be a cover letter or a different kind of document. Could you upload your actual resume?",
      false,
      2,
    );
    this.name = "NonResumeError";
  }
}
