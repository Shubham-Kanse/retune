"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { DriftCheckInline } from "@/components/generate/drift-check-inline";
import { JdPrompt } from "@/components/generate/jd-prompt";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought";
import { TextShimmer } from "@/components/prompt-kit/text-shimmer";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/prompt-kit/reasoning";
import type {
  DriftAnswer,
  PreflightDetectResponse,
  PreflightResolveResponse,
} from "@/lib/drift-preflight";
import { useGenerationStream } from "@/stores/generation-stream";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function hasPreflightToken(v: unknown): v is PreflightResolveResponse {
  return typeof v === "object" && v !== null && "preflight_token" in v;
}

type Phase = "form" | "captured" | "preflight" | "starting" | "streaming";

const PHASES = [
  { key: "reading", label: "Reading the job description", specialists: ["jd_span_extractor", "stub_jd_span_extractor", "discourse_classifier", "stub_discourse_classifier", "boilerplate_stripper", "cultural_calibrator"] },
  { key: "profile", label: "Loading your career profile", specialists: ["voice_fingerprint_extractor", "honesty_calibrator", "credibility_scanner", "emotional_state_modeler"] },
  { key: "matching", label: "Matching evidence to the role", specialists: ["gap_mapper", "evidence_solver"] },
  { key: "writing", label: "Rewriting bullets and resume", specialists: ["narrative_arc_proposer", "critic_ensemble", "sequential_bullet_composer", "ats_patch_loop"] },
  { key: "outputs", label: "Drafting cover letter & strategy", specialists: ["cover_letter_composer", "application_strategy_composer"] },
  { key: "audit", label: "Computing ATS & readiness", specialists: ["theory_of_mind", "outcome_predictor", "refuse_or_ship_gate"] },
  { key: "docs", label: "Generating documents", specialists: ["document_renderer"] },
];

function humanize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function greet() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late";
}

function NewGenerationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledJd = params?.get("jd") ?? "";
  const prefilledUrl = params?.get("url") ?? "";
  const prefilledMarket = (params?.get("market") as "us" | "uk" | null) ?? "us";

  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [preflight, setPreflight] = useState<PreflightDetectResponse | null>(null);
  const [preflightJdHash, setPreflightJdHash] = useState<string | null>(null);
  const [driftSaving, setDriftSaving] = useState(false);

  const { start: startStream, status, traceEntries, currentSpecialist, completionData, stop } = useGenerationStream();

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.fullName) setFirstName(d.fullName.split(" ")[0]); })
      .catch(() => {});
  }, []);

  // Navigate to result when complete
  useEffect(() => {
    if (status === "complete" && completionData) {
      const appId = useGenerationStream.getState().applicationId;
      if (appId) router.push(`/generate/${appId}/result`);
    }
  }, [status, completionData, router]);

  const firedSpecialists = new Set(traceEntries.map((t) => t.specialist));
  const activePhaseKey = currentSpecialist
    ? PHASES.find((p) => p.specialists.includes(currentSpecialist))?.key ?? null
    : null;

  function phaseState(key: string): "done" | "active" | "pending" {
    const p = PHASES.find((ph) => ph.key === key)!;
    if (key === activePhaseKey) return "active";
    if (p.specialists.some((s) => firedSpecialists.has(s))) return "done";
    return "pending";
  }

  async function resolveJd(mode: "text" | "url", jdText?: string, jdUrl?: string): Promise<string> {
    if (mode === "text") return (jdText ?? "").trim();
    const res = await fetch(`/api/jd/fetch?url=${encodeURIComponent((jdUrl ?? "").trim())}`);
    const data = (await res.json().catch(() => null)) as { markdown?: string; error?: string } | null;
    if (!res.ok || !data?.markdown) throw new Error(data?.error ?? "Could not fetch job description from URL.");
    return data.markdown;
  }

  async function launchGeneration(payload: {
    jdUrl?: string; jdText?: string; profileMarkdown: string;
    market: string; preflightToken: string; jdHash: string | null;
  }) {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jd_url: payload.jdUrl,
        jd_text: payload.jdText,
        profile_text: payload.profileMarkdown,
        market: payload.market,
        preflight_token: payload.preflightToken,
        jd_hash: payload.jdHash,
      }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(d?.error ?? "System failure.");
    }
    const { generation_id } = (await res.json()) as { generation_id: string };
    setPhase("streaming");
    startStream(generation_id);
  }

  async function start(payload: { mode: "text" | "url"; jdText?: string; jdUrl?: string; market: "us" | "uk" }) {
    setError("");
    setPhase("captured");
    try {
      const profileRes = await fetch("/api/profile");
      const profile = await profileRes.json().catch(() => null);
      const jdBody = await resolveJd(payload.mode, payload.jdText, payload.jdUrl);

      setPhase("preflight");
      const preflightRes = await fetch("/api/generate/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jdBody }),
      });
      const preflightData = (await preflightRes.json().catch(() => null)) as PreflightDetectResponse | null;
      if (!preflightRes.ok || !preflightData) throw new Error("Failed to run preflight drift detection.");

      if (preflightData.questions.length > 0) {
        setPreflight(preflightData);
        setPreflightJdHash(preflightData.jd_hash ?? null);
        setPhase("form");
        return;
      }

      const auto = await fetch("/api/generate/preflight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_hash: preflightData.jd_hash, answers: [] }),
      });
      const autoData = (await auto.json().catch(() => null)) as PreflightResolveResponse | null;
      if (!auto.ok || !autoData?.preflight_token) throw new Error("Could not finalize drift preflight.");

      setPhase("starting");
      await launchGeneration({
        jdUrl: payload.mode === "url" ? payload.jdUrl : undefined,
        jdText: payload.mode === "text" ? payload.jdText : undefined,
        profileMarkdown: profile?.profileMarkdown ?? "",
        market: payload.market.toUpperCase(),
        preflightToken: autoData.preflight_token,
        jdHash: preflightData.jd_hash ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error");
      setPhase("form");
    }
  }

  async function continueAfterDrift(answers: DriftAnswer[]) {
    setDriftSaving(true);
    setPreflight(null);
    setPhase("starting");
    setError("");
    try {
      const save = await fetch("/api/generate/preflight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_hash: preflightJdHash, answers }),
      });
      const saveData = (await save.json().catch(() => null)) as PreflightResolveResponse | { error?: string } | null;
      if (!save.ok || !hasPreflightToken(saveData)) {
        throw new Error((typeof saveData === "object" && saveData && "error" in saveData ? saveData.error : undefined) || "Could not save drift answers.");
      }
      const profile = await fetch("/api/profile").then((r) => r.json().catch(() => null));
      await launchGeneration({
        jdUrl: prefilledUrl || undefined,
        jdText: prefilledJd || undefined,
        profileMarkdown: profile?.profileMarkdown ?? "",
        market: prefilledMarket.toUpperCase(),
        preflightToken: saveData.preflight_token,
        jdHash: preflightJdHash,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error");
      setPhase("form");
    } finally {
      setDriftSaving(false);
    }
  }

  const busy = phase !== "form";
  const isStreaming = phase === "streaming";

  return (
    <PageShell width="wide" className="flex min-h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        eyebrow="New tuning"
        title={
          <span>
            <span className="block text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60 mb-4">
              {greet()}{firstName ? `, ${firstName}` : ""}
            </span>
            What are you applying to?
          </span>
        }
        subtitle="Paste a job URL or the full description. We'll check profile drift, then run a tuning."
      />

      <div className="mb-8" />

      {busy ? (
        <ChainOfThought className="mt-2">
          <ChainOfThoughtStep defaultOpen={phase === "captured"}>
            <ChainOfThoughtTrigger>
              {phase === "captured" ? <TextShimmer>Capturing the job description</TextShimmer> : "Capturing the job description"}
            </ChainOfThoughtTrigger>
          </ChainOfThoughtStep>

          <ChainOfThoughtStep defaultOpen={phase === "preflight"}>
            <ChainOfThoughtTrigger>
              {phase === "preflight" ? <TextShimmer>Checking profile drift</TextShimmer> : "Checking profile drift"}
            </ChainOfThoughtTrigger>
          </ChainOfThoughtStep>

          <ChainOfThoughtStep defaultOpen={phase === "starting" || isStreaming}>
            <ChainOfThoughtTrigger>
              {(phase === "starting" || isStreaming) ? <TextShimmer>Starting the tuning workflow</TextShimmer> : "Starting the tuning workflow"}
            </ChainOfThoughtTrigger>
            {(phase === "starting" || isStreaming) && (
              <ChainOfThoughtContent>
                <ChainOfThought>
                  {PHASES.map((p) => {
                    const s = phaseState(p.key);
                    return (
                      <ChainOfThoughtStep key={p.key} defaultOpen={s === "active"}>
                        <ChainOfThoughtTrigger>
                          <span className={cn(
                            s === "pending" && "text-muted-foreground/40",
                            (s === "active" || s === "done") && "text-foreground",
                          )}>
                            {s === "active" ? <TextShimmer>{p.label}</TextShimmer> : p.label}
                          </span>
                        </ChainOfThoughtTrigger>
                        <ChainOfThoughtContent>
                          {traceEntries.filter((t) => p.specialists.includes(t.specialist)).map((t) => (
                            <ChainOfThoughtItem key={t.seq}>
                              <span className="font-mono text-[11px] text-muted-foreground/60">{humanize(t.specialist)}</span>
                              <span className="ml-2 font-mono text-[10px] text-muted-foreground/40">{t.latencyMs}ms</span>
                            </ChainOfThoughtItem>
                          ))}
                          {s === "active" && currentSpecialist && (
                            <ChainOfThoughtItem>
                              <span className="text-muted-foreground/60">{humanize(currentSpecialist)}…</span>
                            </ChainOfThoughtItem>
                          )}
                        </ChainOfThoughtContent>
                      </ChainOfThoughtStep>
                    );
                  })}
                </ChainOfThought>
              </ChainOfThoughtContent>
            )}
          </ChainOfThoughtStep>
        </ChainOfThought>
      ) : preflight ? null : (
        <JdPrompt
          onStart={start}
          busy={busy}
          placeholderText={prefilledJd || "Paste a job description, a job URL, or describe the role…"}
        />
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {preflight && preflight.questions.length > 0 ? (
        <DriftCheckInline
          questions={preflight.questions}
          saving={driftSaving}
          errorText={error}
          onSubmit={continueAfterDrift}
          onSkip={() => { setPreflight(null); setPhase("form"); }}
        />
      ) : null}

      <div className="mt-auto pt-16 flex flex-wrap gap-6 text-[11px] text-muted-foreground/50 [&_span]:text-muted-foreground/50 [&_button:hover_span]:text-muted-foreground [&_svg]:size-3">
        <Reasoning>
          <ReasoningTrigger>What Retuned will produce</ReasoningTrigger>
          <ReasoningContent contentClassName="text-[11px] text-muted-foreground/50 prose-none not-prose">
            A tailored resume (or UK CV), cover letter, ATS / readiness audit, and application strategy - each editable and exportable.
          </ReasoningContent>
        </Reasoning>
        <Reasoning>
          <ReasoningTrigger>Before tuning</ReasoningTrigger>
          <ReasoningContent contentClassName="text-[11px] text-muted-foreground/50 prose-none not-prose">
            Retuned may ask a few drift questions if the role needs evidence not yet in your career profile.
          </ReasoningContent>
        </Reasoning>
      </div>
    </PageShell>
  );
}

export default function NewGenerationPage() {
  return (
    <Suspense fallback={<PageShell>{null}</PageShell>}>
      <NewGenerationInner />
    </Suspense>
  );
}
