"use client";

import { ColorOrb } from "@/components/ui/color-orb";
import { useGenerationStream } from "@/stores/generation-stream";
import { CheckCircle2, Circle, X } from "lucide-react";
import { motion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SPECIALIST_TO_PHASE: Record<string, string> = {
  jd_span_extractor: "Reading the job description",
  stub_jd_span_extractor: "Reading the job description",
  discourse_classifier: "Analysing job requirements",
  stub_discourse_classifier: "Analysing job requirements",
  boilerplate_stripper: "Analysing job requirements",
  cultural_calibrator: "Analysing job requirements",
  title_schema_retriever: "Identifying the role",
  company_schema_retriever: "Researching the company",
  voice_fingerprint_extractor: "Learning your voice",
  honesty_calibrator: "Calibrating honesty",
  emotional_state_modeler: "Reading your motivation",
  credibility_scanner: "Checking credibility",
  gap_mapper: "Mapping requirement gaps",
  evidence_solver: "Matching your evidence",
  narrative_arc_proposer: "Choosing your narrative",
  critic_ensemble: "Reviewing the narrative",
  sequential_bullet_composer: "Writing resume bullets",
  ats_patch_loop: "Optimising for ATS",
  cover_letter_composer: "Writing cover letter",
  application_strategy_composer: "Building your strategy",
  theory_of_mind: "Modelling the recruiter",
  outcome_predictor: "Predicting your chances",
  refuse_or_ship_gate: "Final quality check",
  document_renderer: "Generating documents",
};

const PHASES = [
  {
    key: "reading",
    label: "Job description read",
    specialists: [
      "jd_span_extractor",
      "stub_jd_span_extractor",
      "discourse_classifier",
      "stub_discourse_classifier",
      "boilerplate_stripper",
      "cultural_calibrator",
    ],
  },
  {
    key: "profiling",
    label: "Profile understood",
    specialists: [
      "voice_fingerprint_extractor",
      "honesty_calibrator",
      "credibility_scanner",
      "emotional_state_modeler",
    ],
  },
  { key: "matching", label: "Evidence matched", specialists: ["gap_mapper", "evidence_solver"] },
  {
    key: "writing",
    label: "Resume written",
    specialists: [
      "narrative_arc_proposer",
      "critic_ensemble",
      "sequential_bullet_composer",
      "ats_patch_loop",
    ],
  },
  {
    key: "outputs",
    label: "Cover letter & strategy",
    specialists: ["cover_letter_composer", "application_strategy_composer"],
  },
  {
    key: "gate",
    label: "Quality approved",
    specialists: ["theory_of_mind", "outcome_predictor", "refuse_or_ship_gate"],
  },
  { key: "docs", label: "Documents generated", specialists: ["document_renderer"] },
];

function humanize(specialist: string): string {
  return SPECIALIST_TO_PHASE[specialist] ?? specialist.replace(/_/g, " ");
}

export default function GenerationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const generationId = params?.id ?? "";

  const {
    status,
    errorMessage,
    start,
    stop,
    traceEntries,
    startedAt,
    submissionConfidence,
    currentSpecialist,
  } = useGenerationStream();
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (generationId) start(generationId);
  }, [generationId, start]);

  useEffect(() => {
    if (status !== "complete") return;
    const t = setTimeout(() => router.push(`/generate/${generationId}/result`), 1200);
    return () => clearTimeout(t);
  }, [status, generationId, router]);

  useEffect(() => {
    if (!startedAt || status !== "streaming") {
      setElapsedSec(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, status]);

  const isError = status === "error";
  const isComplete = status === "complete";
  const isActive =
    (status === "streaming" || status === "connecting" || traceEntries.length > 0) && !isComplete;
  const confidencePct =
    submissionConfidence != null ? Math.round(submissionConfidence * 100) : null;
  const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  const firedSpecialists = new Set(traceEntries.map((t) => t.specialist));

  // Find which phase the current specialist belongs to
  const activePhaseKey = currentSpecialist
    ? (PHASES.find((p) => p.specialists.includes(currentSpecialist))?.key ?? null)
    : null;

  // A phase is done if any specialist fired AND it's not the currently active phase
  const phasesDone = PHASES.filter(
    (p) => p.specialists.some((s) => firedSpecialists.has(s)) && p.key !== activePhaseKey,
  );

  const currentLabel = currentSpecialist ? humanize(currentSpecialist) : null;
  const orbTones = {
    base: "oklch(96% 0.01 120)",
    accent1: "oklch(60% 0.16 155)",
    accent2: "oklch(82% 0.12 155)",
    accent3: "oklch(55% 0.12 170)",
  };

  // Active phase label (the high-level label, not specialist label)
  const activePhase = activePhaseKey ? PHASES.find((p) => p.key === activePhaseKey) : null;

  return (
    <div className="w-full max-w-xl px-8 py-16">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="rt-label mb-3">
              {isComplete ? "Done" : isError ? "Interrupted" : "Working"}
            </p>
            <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
              {isComplete ? "Shipping your package" : isError ? "Something went wrong" : "Building your package"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              stop();
              router.push("/dashboard");
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error */}
        {isError && errorMessage && (
          <div className="mb-6 px-4 py-3 text-sm rounded-3xl border border-[#fecaca] bg-[#fef2f2] text-[#dc2626]">
            {errorMessage}
          </div>
        )}

        {/* Hero loading orb */}
        {isActive && (
          <div className="mb-6 rounded-3xl border border-[#e0ddd9] bg-white/90 px-6 py-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <ColorOrb dimension="76px" tones={orbTones} spinDuration={8} />
              </motion.div>
              <div>
                <p className="font-serif text-xl text-foreground">Retune is building your package</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {activePhase?.label ?? currentLabel ?? "Starting cognitive pipeline..."}
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[#7c746b]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
                  style={{ animationDelay: "120ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
                  style={{ animationDelay: "240ms" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Phase timeline */}
        {(isActive || phasesDone.length > 0) && (
          <div className="mb-6 rounded-3xl border border-[#e0ddd9] bg-white/90 px-6 py-6 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-0">
              {PHASES.map((phase, i) => {
                const isDone = phasesDone.some((p) => p.key === phase.key);
                const isCurrent = phase.key === activePhaseKey;
                const isLast = i === PHASES.length - 1;
                return (
                  <div key={phase.key} className="group relative flex gap-3">
                    {/* Vertical line + icon */}
                    <div className="relative flex flex-col items-center">
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full border flex items-center justify-center shrink-0",
                          isDone && "border-brand bg-brand-light",
                          isCurrent && "border-brand",
                          !isDone && !isCurrent && "border-border",
                        )}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                        ) : isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                        ) : (
                          <Circle className="w-3 h-3 text-muted-foreground/40" />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            "w-[2px] flex-1 min-h-[20px]",
                            isDone ? "bg-brand/30" : "bg-border",
                          )}
                        />
                      )}
                    </div>
                    {/* Label */}
                    <div className="pb-4 pt-0.5">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isDone && "text-foreground",
                          isCurrent && "text-foreground",
                          !isDone && !isCurrent && "text-muted-foreground/60",
                        )}
                      >
                        {phase.label}
                      </p>
                      {isCurrent && currentLabel && (
                        <p className="text-xs text-muted-foreground mt-0.5">{currentLabel}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1 mt-4">
          <span>{traceEntries.length} ticks</span>
          <span>{elapsedLabel} elapsed</span>
        </div>
    </div>
  );
}
