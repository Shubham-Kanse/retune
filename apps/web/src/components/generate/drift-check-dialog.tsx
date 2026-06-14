"use client";

import { BrainIcon, type BrainIconHandle } from "@/components/ui/brain-icon";
import {
  DRIFT_LEVEL_OPTIONS,
  type DriftAnswer,
  type DriftLevel,
  type DriftQuestion,
  type DriftSummary,
} from "@/lib/drift-preflight";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, ArrowRight, CheckCircle2, Info, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export function DriftCheckLoading({
  label = "Retune is checking profile drift...",
}: { label?: string }) {
  const brainRef = useRef<BrainIconHandle>(null);
  useEffect(() => {
    brainRef.current?.startAnimation();
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <BrainIcon ref={brainRef} size={36} className="text-[#2d8a5e]" />
      <p className="text-sm text-[#6f6a64]">{label}</p>
      <div className="inline-flex items-center gap-1.5 text-[#7c746b]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2d8a5e]" />
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2d8a5e]"
          style={{ animationDelay: "120ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2d8a5e]"
          style={{ animationDelay: "240ms" }}
        />
      </div>
    </div>
  );
}

export function DriftCheckDialog({
  open,
  summary,
  questions,
  onClose,
  onSubmit,
  saving,
  errorText,
}: {
  open: boolean;
  summary: DriftSummary;
  questions: DriftQuestion[];
  onClose: () => void;
  onSubmit: (answers: DriftAnswer[]) => Promise<void>;
  saving: boolean;
  errorText?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DriftLevel>>({});

  const current = questions[index];
  const canNext = current ? Boolean(answers[current.skill]) : false;

  const progress = useMemo(() => {
    if (!questions.length) return 100;
    return Math.round(((index + 1) / questions.length) * 100);
  }, [index, questions.length]);

  function cleanText(input: string | undefined | null): string {
    if (!input) return "";
    return input
      .replace(/\s+/g, " ")
      .replace(/JD context:\s*/gi, "Detected in JD: ")
      .replace(/\s*"\s*/g, '"')
      .trim()
      .slice(0, 320);
  }

  const mustHavePills = summary.missing_must_have.slice(0, 8);
  const goodToHavePills = summary.missing_good_to_have.slice(0, 8);

  async function handlePrimary() {
    if (!current) return;
    if (index < questions.length - 1) {
      setIndex((v) => v + 1);
      return;
    }
    const payload = questions.map((q) => ({ skill: q.skill, level: answers[q.skill] ?? "no" }));
    await onSubmit(payload);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="rt-card fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-medium text-[#1a1a1a]">
                A slight drift was identified
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-[#6f6a64]">
                We found skills in this job description that are not clearly present in your
                profile. Confirming these helps Retune generate a truthful resume.
              </Dialog.Description>
            </div>
            <button type="button" className="rt-icon-btn" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 rounded-2xl border border-[#e8e3dc] bg-[#faf8f5] p-4 text-sm text-[#3f3b36]">
            <div className="mb-2 inline-flex items-center gap-2 font-medium">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#eef7f2] text-[#4f8f73]">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              Detected drift summary
            </div>
            <div className="mb-3">
              Severity:
              <span className="ml-2 rounded-full bg-[#efeae4] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#5f5850]">
                {summary.severity}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#8a847d]">
                  Missing Must-Haves
                </p>
                {mustHavePills.length ? (
                  <div className="flex flex-wrap gap-2">
                    {mustHavePills.map((skill) => (
                      <span
                        key={`must-${skill}`}
                        className="inline-flex items-center rounded-full border border-[#e2d9ee] bg-[#f7f1ff] px-2.5 py-1 text-xs font-medium text-[#6f4d8f]"
                      >
                        {cleanText(skill)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#7b746d]">None</p>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#8a847d]">
                  Missing Good-To-Haves
                </p>
                {goodToHavePills.length ? (
                  <div className="flex flex-wrap gap-2">
                    {goodToHavePills.map((skill) => (
                      <span
                        key={`good-${skill}`}
                        className="inline-flex items-center rounded-full border border-[#dbe6ef] bg-[#f2f8ff] px-2.5 py-1 text-xs font-medium text-[#4d6a89]"
                      >
                        {cleanText(skill)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#7b746d]">None</p>
                )}
              </div>
            </div>
          </div>

          {current ? (
            <div className="rounded-2xl border border-[#e8e3dc] bg-white p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-[#807b74]">
                <span>
                  Question {index + 1} of {questions.length}
                </span>
                <span>{progress}%</span>
              </div>
              <p className="mb-3 inline-flex items-center gap-2 text-base font-medium text-[#1a1a1a]">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f4effb] text-[#8f6caf]">
                  <AlertCircle className="h-3.5 w-3.5" />
                </span>
                {cleanText(current.prompt)}
              </p>
              {current.why_flagged ? (
                <div className="mb-4 inline-flex items-start gap-2 rounded-lg border border-[#e8e3dc] bg-[#fbfaf8] px-3 py-2 text-xs leading-relaxed text-[#6f6a64]">
                  <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#eef3fb] text-[#6d82a6]">
                    <Info className="h-2.5 w-2.5" />
                  </span>
                  <span>{cleanText(current.why_flagged)}</span>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DRIFT_LEVEL_OPTIONS.map((opt) => {
                  const active = answers[current.skill] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [current.skill]: opt.value }))
                      }
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        active
                          ? "border-[#b84ed1] bg-[#f7ecfb] text-[#7e2d90]"
                          : "border-[#e5e2dd] bg-white text-[#45413c] hover:border-[#d7c9e5]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {errorText ? (
                <p className="mt-3 rounded-lg border border-[#ffd9d9] bg-[#fff5f5] px-3 py-2 text-xs text-[#b94a4a]">
                  {errorText}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIndex((v) => Math.max(v - 1, 0))}
              disabled={index === 0 || saving}
              className="rt-btn-ghost px-4 py-2 text-sm disabled:opacity-40"
            >
              Back
            </button>

            <button
              type="button"
              onClick={handlePrimary}
              disabled={!canNext || saving}
              className="rt-btn px-5 py-2 text-sm disabled:opacity-40"
            >
              {saving ? (
                "Saving..."
              ) : index === questions.length - 1 ? (
                <span className="inline-flex items-center gap-2">
                  Confirm and continue <CheckCircle2 className="h-4 w-4" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  Next <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
