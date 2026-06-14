"use client";

import type { DriftAnswer, DriftLevel, DriftQuestion } from "@/lib/drift-preflight";
import { useState } from "react";

const OPTIONS: { value: DriftLevel; label: string }[] = [
  { value: "no", label: "No experience" },
  { value: "theory", label: "Familiar" },
  { value: "basic", label: "Some experience" },
  { value: "hands_on", label: "Used it" },
  { value: "strong", label: "Strong" },
  { value: "similar_stack", label: "Similar" },
];

export function DriftCheckInline({
  questions,
  saving,
  errorText,
  onSubmit,
  onSkip,
}: {
  questions: DriftQuestion[];
  saving: boolean;
  errorText?: string | null;
  onSubmit: (answers: DriftAnswer[]) => Promise<void>;
  onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DriftLevel>>({});

  const current = questions[index];
  if (!current) return null;

  const canNext = Boolean(answers[current.skill]);
  const isLast = index === questions.length - 1;

  async function handleNext() {
    if (!canNext) return;
    if (!isLast) {
      setIndex((v) => v + 1);
      return;
    }
    await onSubmit(questions.map((q) => ({ skill: q.skill, level: answers[q.skill] ?? "no" })));
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-border/40" />
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50">
          Quick check · {index + 1} / {questions.length}
        </p>
        <span className="h-px flex-1 bg-border/40" />
      </div>

      <p className="text-sm text-foreground/80">
        How well do you know <span className="font-medium">{current.skill}</span>?
      </p>

      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const active = answers[current.skill] === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswers((prev) => ({ ...prev, [current.skill]: opt.value }))}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {errorText && <p className="text-xs text-destructive">{errorText}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleNext}
          disabled={!canNext || saving}
          className="text-xs text-foreground/80 transition-colors hover:text-foreground disabled:opacity-30"
        >
          {saving ? "Starting…" : isLast ? "Confirm" : "Next"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
