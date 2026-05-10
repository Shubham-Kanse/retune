import { type JDAnalysis, JDAnalysisSchema } from "../schemas";

export class JDAnalysisValidationError extends Error {
  constructor(
    message: string,
    public issues: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
    this.name = "JDAnalysisValidationError";
  }
}

export function parseAndValidateJDAnalysis(raw: unknown): JDAnalysis {
  const result = JDAnalysisSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path as (string | number)[],
      message: i.message,
    }));
    throw new JDAnalysisValidationError(
      `JD Analysis output missing required fields: ${issues.map((i) => i.path.join(".")).join(", ")}`,
      issues,
    );
  }
  return result.data;
}

export type { JDAnalysis };
