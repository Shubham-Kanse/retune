"use client";

interface Step {
  id: string;
  label: string;
  status: "pending" | "active" | "complete";
  durationMs?: number;
}

interface PipelineStepsProps {
  steps: Step[];
  className?: string;
}

export function PipelineSteps({ steps, className }: PipelineStepsProps) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-3 py-1.5">
          <StepIndicator status={step.status} />
          <span
            className={`flex-1 text-sm ${step.status === "active" ? "text-foreground font-medium" : "text-muted-foreground"}`}
          >
            {step.label}
          </span>
          {step.durationMs != null && step.status === "complete" && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {(step.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function StepIndicator({ status }: { status: Step["status"] }) {
  if (status === "complete") {
    return (
      <svg className="h-4 w-4 text-brand" viewBox="0 0 16 16" fill="none">
        <title>Complete</title>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex h-4 w-4 items-center justify-center">
        <span className="absolute h-3 w-3 rounded-full bg-brand/30 animate-ping" />
        <span className="h-2 w-2 rounded-full bg-brand" />
      </span>
    );
  }
  return <span className="h-4 w-4 rounded-full border border-border" />;
}
