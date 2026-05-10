"use client";

import { ColorOrb } from "@/components/ui/color-orb";
import { useGenerationStream } from "@/stores/generation-stream";
import { CheckCircle2, X } from "lucide-react";
import { motion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

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
    totalCostUsd,
    submissionConfidence,
    currentSpecialist,
  } = useGenerationStream();

  useEffect(() => {
    if (generationId) start(generationId);
  }, [generationId, start]);

  useEffect(() => {
    if (status !== "complete") return;
    const t = setTimeout(() => router.push(`/generate/${generationId}/result`), 1200);
    return () => clearTimeout(t);
  }, [status, generationId, router]);

  const isError = status === "error";
  const isComplete = status === "complete";
  const isActive =
    (status === "streaming" || status === "connecting" || traceEntries.length > 0) && !isComplete;
  const confidencePct =
    submissionConfidence != null ? Math.round(submissionConfidence * 100) : null;

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
    <div className="min-h-screen flex items-start justify-center pt-16 px-6 pb-16">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
            <motion.div
              className="w-9 h-9 rounded-xl bg-[#f0ede8] flex items-center justify-center overflow-hidden"
              animate={isActive ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}
            >
              <ColorOrb dimension="26px" tones={orbTones} spinDuration={10} />
            </motion.div>
            <div>
              <p className="rt-label">
                {isComplete ? "Done" : isError ? "Interrupted" : "Working"}
              </p>
              <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] leading-tight">
                {isComplete
                  ? "Shipping your package"
                  : isError
                    ? "Something went wrong"
                    : "Building your package"}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stop();
              router.push("/dashboard");
            }}
            className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error */}
        {isError && errorMessage && (
          <div className="mb-6 px-4 py-3 text-sm rounded-2xl border border-[#fecaca] bg-[#fef2f2] text-[#dc2626]">
            {errorMessage}
          </div>
        )}

        {/* Hero loading orb */}
        {isActive && (
          <div className="mb-6 rounded-2xl border border-[#e5e2dd] bg-white px-6 py-8">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <ColorOrb dimension="76px" tones={orbTones} spinDuration={8} />
              </motion.div>
              <div>
                <p className="font-serif text-xl text-[#1a1a1a]">Retune is building your package</p>
                <p className="text-sm text-[#6b6b6b] mt-1">
                  {activePhase?.label ?? currentLabel ?? "Starting cognitive pipeline..."}
                </p>
              </div>
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
          </div>
        )}

        {/* Phase stack (hidden while active orb loading is shown) */}
        {!isActive && <div className="space-y-2 mb-4">
          {/* Active phase pill — with pulse on the icon and current specialist as muted subtitle */}
          {isActive && (activePhase || currentLabel) && (
            <div className="flex items-center gap-3 px-5 py-3.5 border border-[#e5d6f5] bg-white rounded-2xl shadow-sm">
              {/* Icon with iconShine pulse — same as nav bar hover effect */}
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                <span
                  className="inline-flex w-3 h-3 rounded-full bg-[#b84ed1]"
                  style={{ animation: "iconShine 1.2s ease-in-out infinite" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a1a]">
                  {activePhase?.label ?? currentLabel ?? "Starting up…"}
                </p>
                {/* Current specialist as muted subtitle */}
                {currentLabel && activePhase && currentLabel !== activePhase.label && (
                  <p className="text-[11px] text-[#9a9690] mt-0.5 truncate">{currentLabel}</p>
                )}
              </div>
              {confidencePct != null && (
                <span className="text-[11px] font-mono text-[#2d8a5e] font-semibold shrink-0">
                  {confidencePct}%
                </span>
              )}
            </div>
          )}

          {/* Completed phases */}
          {phasesDone.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center gap-3 px-5 py-3 border border-[#e5e2dd] bg-white rounded-2xl"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16a34a]" />
              <span className="text-sm text-[#1a1a1a]">{label}</span>
            </div>
          ))}
        </div>}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-[#9a9690] font-mono px-1 mt-4">
          <span>{traceEntries.length} ticks</span>
          <span>${totalCostUsd.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
