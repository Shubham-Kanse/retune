"use client";

import { PageShell } from "@/components/app/page-shell";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought";
import { TextShimmerLoader } from "@/components/prompt-kit/loader";
import { Message, MessageAvatar, MessageContent } from "@/components/prompt-kit/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/prompt-kit/reasoning";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGenerationStream } from "@/stores/generation-stream";
import { Check, CircleDot, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    label: "Reading the job description",
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
    key: "profile",
    label: "Loading your career profile",
    specialists: [
      "voice_fingerprint_extractor",
      "honesty_calibrator",
      "credibility_scanner",
      "emotional_state_modeler",
    ],
  },
  {
    key: "matching",
    label: "Matching evidence to the role",
    specialists: ["gap_mapper", "evidence_solver"],
  },
  {
    key: "writing",
    label: "Rewriting bullets and resume",
    specialists: [
      "narrative_arc_proposer",
      "critic_ensemble",
      "sequential_bullet_composer",
      "ats_patch_loop",
    ],
  },
  {
    key: "outputs",
    label: "Drafting cover letter & strategy",
    specialists: ["cover_letter_composer", "application_strategy_composer"],
  },
  {
    key: "audit",
    label: "Computing ATS & readiness",
    specialists: ["theory_of_mind", "outcome_predictor", "refuse_or_ship_gate"],
  },
  {
    key: "docs",
    label: "Generating documents",
    specialists: ["document_renderer"],
  },
];

function humanize(specialist: string) {
  return (
    SPECIALIST_TO_PHASE[specialist] ?? specialist.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export default function GenerationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const generationId = params?.id ?? "";

  const { status, errorMessage, start, stop, traceEntries, startedAt, currentSpecialist } =
    useGenerationStream();
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
  const isActive = (status === "streaming" || status === "connecting") && !isComplete;
  const elapsed = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  const firedSpecialists = new Set(traceEntries.map((t) => t.specialist));
  const activePhaseKey = currentSpecialist
    ? PHASES.find((p) => p.specialists.includes(currentSpecialist))?.key ?? null
    : null;
  const phaseState = (key: string): "done" | "active" | "pending" => {
    const phase = PHASES.find((p) => p.key === key)!;
    if (key === activePhaseKey) return "active";
    if (phase.specialists.some((s) => firedSpecialists.has(s))) return "done";
    return "pending";
  };

  return (
    <PageShell width="wide">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isComplete ? "Done" : isError ? "Interrupted" : "Tuning"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
            {isComplete
              ? "Shipping your package"
              : isError
                ? "Something went wrong"
                : "Tuning your application"}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            stop();
            router.push("/dashboard");
          }}
          className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="size-4" />
        </button>
      </div>

      {isError && errorMessage ? (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <Message className="mb-6">
        <MessageAvatar src="" alt="Retuned" fallback="R" />
        <div className="min-w-0 flex-1">
          <MessageContent className="bg-card border border-border">
            {isActive ? (
              <TextShimmerLoader
                text={currentSpecialist ? humanize(currentSpecialist) : "Starting the cognitive pipeline"}
              />
            ) : isComplete ? (
              <span>Your application package is ready. Opening results…</span>
            ) : (
              <span>Tuning paused.</span>
            )}
          </MessageContent>

          <div className="mt-4 rounded-xl border border-border bg-card/40 p-4">
            <ChainOfThought>
              {PHASES.map((phase) => {
                const s = phaseState(phase.key);
                const Icon =
                  s === "done"
                    ? Check
                    : s === "active"
                      ? Loader2
                      : CircleDot;
                return (
                  <ChainOfThoughtStep key={phase.key} defaultOpen={s === "active"}>
                    <ChainOfThoughtTrigger
                      leftIcon={
                        <Icon
                          className={cn(
                            "size-4",
                            s === "done" && "text-emerald-500",
                            s === "active" && "animate-spin text-foreground",
                            s === "pending" && "text-muted-foreground/40",
                          )}
                        />
                      }
                    >
                      <span
                        className={cn(
                          s === "pending" && "text-muted-foreground/60",
                          s === "active" && "text-foreground",
                          s === "done" && "text-foreground",
                        )}
                      >
                        {phase.label}
                      </span>
                    </ChainOfThoughtTrigger>
                    <ChainOfThoughtContent>
                      {traceEntries
                        .filter((t) => phase.specialists.includes(t.specialist))
                        .map((t) => (
                          <ChainOfThoughtItem key={t.seq}>
                            <span className="font-mono text-[11px] text-muted-foreground/80">
                              {t.displayName || humanize(t.specialist)}
                            </span>
                            <span className="ml-2 font-mono text-[10px] text-muted-foreground/60">
                              {t.latencyMs}ms
                            </span>
                          </ChainOfThoughtItem>
                        ))}
                      {phaseState(phase.key) === "active" && currentSpecialist ? (
                        <ChainOfThoughtItem>
                          <span className="text-muted-foreground">
                            {humanize(currentSpecialist)}…
                          </span>
                        </ChainOfThoughtItem>
                      ) : null}
                    </ChainOfThoughtContent>
                  </ChainOfThoughtStep>
                );
              })}
            </ChainOfThought>
          </div>

          <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>{traceEntries.length} ticks</span>
            <span>{elapsed} elapsed</span>
          </div>
        </div>
      </Message>

      {isError ? (
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button onClick={() => start(generationId)}>Retry tuning</Button>
        </div>
      ) : null}

      <Reasoning className="mt-6">
        <ReasoningTrigger>
          <span className="text-sm text-muted-foreground">What's happening behind the scenes?</span>
        </ReasoningTrigger>
        <ReasoningContent contentClassName="text-sm">
          Each phase runs a small ensemble of specialists. Reading parses the JD into structured
          requirement spans. Profile loads your career brain. Matching maps your evidence to the
          requirements. Writing rewrites bullets in your voice. Audit scores ATS coverage and
          interview readiness. Documents render the final resume, cover letter and strategy.
        </ReasoningContent>
      </Reasoning>
    </PageShell>
  );
}
