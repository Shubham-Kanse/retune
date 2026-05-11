"use client";

import { useGenerationStream } from "@/stores/generation-stream";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface GenerationVisualizerProps {
  applicationId: string;
}

/** Smoothly interpolates a displayed number toward a target value over ~300ms. */
function useSmoothNumber(target: number, durationMs = 300): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = display;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

/** Estimated time remaining based on elapsed time / completed steps. */
function useTimeEstimate(
  status: string,
  steps: Array<{ status: string }>,
  startedAt: number | null,
): string | null {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (status !== "streaming" && status !== "connecting") return;
    const id = setInterval(() => forceRender((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [status]);

  if ((status !== "streaming" && status !== "connecting") || startedAt === null) return null;
  const completed = steps.filter((s) => s.status === "complete").length;
  const total = steps.length;
  if (completed < 2 || total === 0) return null;

  const elapsed = (Date.now() - startedAt) / 1000;
  const ratePerStep = elapsed / completed;
  const remaining = Math.round((ratePerStep * (total - completed)) / 60);
  if (remaining < 1) return null;
  return `~${remaining}m remaining`;
}

export function GenerationVisualizer({ applicationId }: GenerationVisualizerProps) {
  const {
    status,
    steps,
    narrativeParagraphs,
    atsScore,
    interviewReadyScore,
    submissionConfidence,
    totalCostUsd,
    errorMessage,
    start,
    stop,
    reset,
  } = useGenerationStream();

  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    start(applicationId);
    startedAtRef.current = Date.now();
    return () => reset();
  }, [applicationId, start, reset]);

  const displayCost = useSmoothNumber(totalCostUsd, 300);
  const timeEstimate = useTimeEstimate(status, steps, startedAtRef.current);

  const isStreaming = status === "streaming" || status === "connecting";

  const completedSteps = steps.filter((s) => s.status === "complete").length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const latestNarrative =
    narrativeParagraphs.length > 0 ? narrativeParagraphs[narrativeParagraphs.length - 1] : null;

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      {/* Header strip */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="sticky top-[56px] z-30 border-b border-border bg-background/95 backdrop-blur h-12 flex items-center justify-between px-6"
      >
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="text-border hidden sm:inline">·</span>
          <StatusIndicator status={status} />
          {isStreaming && (
            <button
              type="button"
              className="rt-btn-ghost text-xs px-3 py-1.5"
              onClick={() => stop()}
            >
              Cancel
            </button>
          )}
          {timeEstimate && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{timeEstimate}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {displayCost > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
              ${displayCost.toFixed(4)}
            </span>
          )}
        </div>
      </motion.div>

      {/* Main content — vertically centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          {status === "error" ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-4 w-full sm:max-w-lg text-center"
            >
              <div className="h-12 w-12 rounded-full border border-destructive/30 bg-destructive/8 flex items-center justify-center">
                <X className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-sm text-destructive">{errorMessage ?? "Something went wrong."}</p>
              <button
                type="button"
                className="rt-btn px-6 py-2.5 text-sm"
                onClick={() => start(applicationId)}
              >
                Retry
              </button>
            </motion.div>
          ) : status === "complete" ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-6 w-full sm:max-w-lg"
            >
              {/* Large check */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                className="h-14 w-14 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center"
              >
                <Check className="h-7 w-7 text-brand" />
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="text-xl font-normal text-center"
              >
                Application package ready
              </motion.p>

              {/* Metric cards */}
              {(interviewReadyScore != null ||
                submissionConfidence != null ||
                atsScore != null) && (
                <div className="grid grid-cols-3 gap-3 w-full">
                  {interviewReadyScore != null && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.3 }}
                      className="rt-card text-center px-4 py-3"
                    >
                      <p className="text-2xl font-semibold tabular-nums">
                        {Math.round(interviewReadyScore)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Interview Ready</p>
                    </motion.div>
                  )}
                  {submissionConfidence != null && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.4 }}
                      className="rt-card text-center px-4 py-3"
                    >
                      <p className="text-2xl font-semibold tabular-nums">
                        {Math.round(submissionConfidence * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Confidence</p>
                    </motion.div>
                  )}
                  {atsScore != null && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.5 }}
                      className="rt-card text-center px-4 py-3"
                    >
                      <p className="text-2xl font-semibold tabular-nums">{Math.round(atsScore)}%</p>
                      <p className="text-xs text-muted-foreground mt-1">ATS Score</p>
                    </motion.div>
                  )}
                </div>
              )}

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <Link
                  href={`/applications/${applicationId}`}
                  className="rt-btn px-8 py-3 text-base"
                >
                  View your application →
                </Link>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="streaming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-6 w-full sm:max-w-lg"
            >
              {/* Steps card */}
              <div className="border border-border divide-y divide-border w-full">
                {steps.length === 0 ? (
                  <div className="flex items-center gap-4 px-5 py-3.5">
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      <span className="absolute h-3 w-3 rounded-full bg-brand/30 animate-ping" />
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    </span>
                    <span className="text-sm font-medium">Connecting...</span>
                  </div>
                ) : (
                  steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`flex items-center gap-4 px-5 py-3.5 transition-colors duration-300 animate-in fade-in slide-in-from-bottom-1 duration-250 ${
                        step.status === "active" ? "bg-brand/5" : ""
                      }`}
                      style={{
                        animationDelay: `${index * 40}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      <StepIcon status={step.status} />
                      <span
                        className={`flex-1 text-sm ${
                          step.status === "active"
                            ? "text-foreground font-medium"
                            : step.status === "complete"
                              ? "text-muted-foreground"
                              : "text-muted-foreground/50"
                        }`}
                      >
                        {step.label}
                      </span>
                      {step.status === "active" && (
                        <span className="text-xs text-brand/70 tabular-nums">running...</span>
                      )}
                      {step.status === "complete" && step.durationMs != null && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {(step.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Narrative sentence */}
              <div className="h-5 flex items-center justify-center w-full">
                <AnimatePresence mode="wait">
                  {latestNarrative && (
                    <motion.p
                      key={narrativeParagraphs.length}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="text-sm text-muted-foreground italic max-w-md text-center line-clamp-1"
                    >
                      {latestNarrative}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Thin progress bar */}
              <div className="w-full max-w-lg bg-muted overflow-hidden h-0.5">
                <div
                  className="h-full bg-brand transition-all duration-700 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case "streaming":
      return (
        <span className="flex items-center gap-1.5 text-sm text-brand">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating
        </span>
      );
    case "connecting":
      return (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Connecting
        </span>
      );
    case "complete":
      return (
        <span className="flex items-center gap-1.5 text-sm text-brand">
          <Check className="h-3.5 w-3.5" />
          Complete
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1.5 text-sm text-destructive">
          <X className="h-3.5 w-3.5" />
          Error
        </span>
      );
    default:
      return <span className="text-sm text-muted-foreground">Connecting...</span>;
  }
}

function StepIcon({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <div className="h-5 w-5 bg-brand/10 flex items-center justify-center shrink-0 animate-in zoom-in-50 duration-150">
        <Check className="h-3 w-3 text-brand" />
      </div>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute h-3.5 w-3.5 rounded-full bg-brand/30 animate-ping" />
        <span className="h-2 w-2 rounded-full bg-brand" />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border border-border" />;
}
