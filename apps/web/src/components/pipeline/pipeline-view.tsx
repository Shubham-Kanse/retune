"use client";

import { cn } from "@/lib/utils";
import { useGenerationStream } from "@/stores/generation-stream";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ─── Step catalogue ───────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  company_research: "Company research",
  jd_analysis: "JD analysis",
  profile_validation: "Profile validation",
  role_fit_analysis: "Role fit analysis",
  evidence_mapping: "Evidence mapping",
  resume_writing: "Resume writing",
  ats_optimization: "ATS optimisation",
  quality_gate: "Quality gate",
  validation: "Validation",
  document_generation: "Document generation",
  cover_letter: "Cover letter",
  application_strategy: "Application strategy",
  // Cognitive workbench steps
  extract_spans: "Evidence extraction",
  classify_discourse: "JD discourse analysis",
  map_gaps: "Requirement gap mapping",
  solve_evidence: "Evidence optimisation",
  propose_arcs: "Narrative arc selection",
  select_arc: "Critic review",
  compose_resume: "Bullet composition",
  predict_outcome: "Outcome prediction",
  decide_refuse_or_ship: "Quality gate",
};

// Ordered list used to pre-seed pending steps before the first SSE event
const INITIAL_STEPS = [
  "profile_validation",
  "jd_analysis",
  "company_research",
  "evidence_mapping",
  "resume_writing",
  "ats_optimization",
  "quality_gate",
  "validation",
  "cover_letter",
  "application_strategy",
].map((id) => ({ id, label: STEP_LABELS[id] ?? id }));

// ─── Fun loading messages (rotate every 4 s per step) ────────────────────────

const FUN_MESSAGES: Record<string, string[]> = {
  company_research: [
    "Exploring signal constellations around the company...",
    "Hyperferreting the internet burrow for company lore...",
    "Juxtaprizing company context with role expectations...",
    "Nebulonoodling reputation crumbs into insight soup...",
  ],
  jd_analysis: [
    "Forloopifying the JD into structured insights...",
    "Constellationizing requirements, tools, and impact...",
    "Goblin-parsing must-haves from nice-to-haves...",
    "Laser-waffling raw text into recruiter-grade structure...",
  ],
  evidence_mapping: [
    "Cross-referencing your experience against each requirement...",
    "Mapping proof to promises...",
    "Linking real work to role expectations...",
    "Building the evidence graph...",
  ],
  resume_writing: [
    "Thunder-drafting impact bullets with metric confetti...",
    "Crafting recruiter-readable, ATS-happy structure...",
    "Word-wizarding experience into interview bait...",
    "Career-tetrising your wins into premium narrative geometry...",
  ],
  ats_optimization: [
    "Threading must-have keywords into natural phrasing...",
    "Keyword-juggling like a caffeinated octopus...",
    "De-robotifying phrasing while ATS goblins nod approvingly...",
    "Semanticalooza tuning for scanability and signal density...",
  ],
  quality_gate: [
    "Running the final coherence and evidence pass...",
    "Red-pen ninjaflipping weak phrasing into sharp proof...",
    "Final boss battle: consistency vs entropy...",
    "Cross-checking claims, formatting, and consistency...",
  ],
  validation: [
    "Auditing voice authenticity and fact accuracy...",
    "Comparing every claim against your profile...",
    "AI-detection scan: humanising where needed...",
  ],
  cover_letter: [
    "Shaping narrative fit from profile + JD context...",
    "Story-splicing motivation, proof, and role-fit spark...",
    "Vibecrafting sincerity with precision-guided relevance...",
  ],
  application_strategy: [
    "Mapping outreach angles and referral pathways...",
    "Calendar-bending follow-ups into momentum rockets...",
    "Strategy-chaos alchemizing into a clean action map...",
  ],
};

function getMsg(stepId: string, tick: number): string {
  const opts = FUN_MESSAGES[stepId] ?? ["Processing..."];
  return opts[tick % opts.length]!;
}

// ─── Shimmer (80 ms rAF, decoupled from parent re-renders) ───────────────────

function StepShimmer({ text }: { text: string }) {
  const [idx, setIdx] = useState(0);
  const lastRef = useRef(0);
  const lenRef = useRef(text.length);
  lenRef.current = text.length;

  useEffect(() => {
    setIdx(0);
  }, [text]);

  useEffect(() => {
    let raf: number;
    const tick = (now: number) => {
      if (now - lastRef.current >= 80) {
        lastRef.current = now;
        setIdx((i) => (i + 1) % Math.max(lenRef.current, 1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span className="font-mono text-[10px]">
      <span className="text-muted-foreground/60">{text.slice(0, idx)}</span>
      <span className="text-brand/80 font-semibold">{text[idx] ?? ""}</span>
      <span className="text-muted-foreground/60">{text.slice(idx + 1)}</span>
    </span>
  );
}

// ─── Error taxonomy (inline — avoids import stripping) ───────────────────────

type PipelineErrorCode =
  | "rate_limited"
  | "context_too_long"
  | "api_connection"
  | "jd_unreachable"
  | "jd_requires_login"
  | "jd_empty"
  | "profile_incomplete"
  | "role_fit_rejected"
  | "ats_score_too_low"
  | "billing_limit_reached"
  | "generation_timeout"
  | "docx_generation_failed"
  | "validation_failed"
  | "unknown";

const ERROR_COPY: Record<
  PipelineErrorCode,
  { headline: string; detail: string; action: string; retryable: boolean }
> = {
  rate_limited: {
    headline: "Anthropic API is rate-limited",
    detail: "Too many requests at once. This resolves automatically.",
    action: "Click Retry — the request will back off and retry.",
    retryable: true,
  },
  context_too_long: {
    headline: "Job description is too long",
    detail: "The profile + JD exceeded the model's context window.",
    action: "Paste a shorter section of the JD — the first 3–4 sections are enough.",
    retryable: false,
  },
  api_connection: {
    headline: "Lost connection to AI",
    detail: "A network error interrupted the request.",
    action: "Click Retry. If it keeps failing, check your internet connection.",
    retryable: true,
  },
  jd_unreachable: {
    headline: "Couldn't open that job posting",
    detail: "The URL returned an error or timed out. Workday and Greenhouse often block scrapers.",
    action: "Open the posting → copy all text → paste directly into the JD field.",
    retryable: false,
  },
  jd_requires_login: {
    headline: "That job board requires a login",
    detail: "The page redirected to a login wall.",
    action: "Log in → copy the job description text → paste it here.",
    retryable: false,
  },
  jd_empty: {
    headline: "Couldn't extract the job description",
    detail: "The URL loaded but contained no job-related content.",
    action: "Paste the job description text directly instead of the URL.",
    retryable: false,
  },
  profile_incomplete: {
    headline: "Profile needs more detail",
    detail: "The pipeline needs a complete profile to generate a tailored resume.",
    action: "Go to Profile → add at least 2 experience entries with metrics → come back.",
    retryable: false,
  },
  role_fit_rejected: {
    headline: "Strong fit mismatch detected",
    detail: "The role requires experience your profile doesn't demonstrate.",
    action: "Click Generate Anyway to proceed, or pick a better-matched role.",
    retryable: false,
  },
  ats_score_too_low: {
    headline: "ATS coverage too low after optimisation",
    detail: "Required keywords couldn't be incorporated naturally after two attempts.",
    action: "Add missing skills to your profile if you have them, then retry.",
    retryable: true,
  },
  billing_limit_reached: {
    headline: "Generation credits exhausted",
    detail: "You've used all credits on your current plan.",
    action: "Upgrade to Pro for unlimited generations.",
    retryable: false,
  },
  generation_timeout: {
    headline: "Generation took too long",
    detail: "A pipeline step exceeded the maximum allowed time.",
    action: "Click Retry. Company research sometimes takes longer on busy networks.",
    retryable: true,
  },
  docx_generation_failed: {
    headline: "DOCX file generation failed",
    detail: "The resume was generated but couldn't be converted to a Word file.",
    action: "The markdown resume is still available. Try downloading again in a moment.",
    retryable: true,
  },
  validation_failed: {
    headline: "Resume didn't pass quality check",
    detail: "The generated resume scored below the 85/100 quality threshold.",
    action: "Click Retry — a second pass often produces a higher-quality result.",
    retryable: true,
  },
  unknown: {
    headline: "Generation failed",
    detail: "An unexpected error stopped the pipeline.",
    action: "Click Retry. If it keeps failing, try pasting the JD text instead of a URL.",
    retryable: true,
  },
};

function classifyError(msg: string): PipelineErrorCode {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("overloaded"))
    return "rate_limited";
  if (m.includes("context") && (m.includes("too long") || m.includes("window")))
    return "context_too_long";
  if (
    m.includes("insufficient credits") ||
    m.includes("upgrade") ||
    m.includes("credits exhausted")
  )
    return "billing_limit_reached";
  if (
    m.includes("workday") ||
    m.includes("could not fetch job") ||
    m.includes("could not extract job") ||
    m.includes("jina reader") ||
    m.includes("url source:")
  )
    return "jd_unreachable";
  if (m.includes("login") || m.includes("sign in") || m.includes("auth wall"))
    return "jd_requires_login";
  if (m.includes("no job-related content")) return "jd_empty";
  if (
    m.includes("profile") &&
    (m.includes("missing") || m.includes("incomplete") || m.includes("required"))
  )
    return "profile_incomplete";
  if (m.includes("ats score") && m.includes("75")) return "ats_score_too_low";
  if (m.includes("timed out") || m.includes("timeout after")) return "generation_timeout";
  if (m.includes("docx") || m.includes(".docx generation")) return "docx_generation_failed";
  if (m.includes("validation") && m.includes("85")) return "validation_failed";
  if (m.includes("econnreset") || m.includes("enotfound") || m.includes("connection refused"))
    return "api_connection";
  return "unknown";
}

// ─── Stall color bleed ────────────────────────────────────────────────────────

function lerpColor(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): string {
  const c = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(from[0] + (to[0] - from[0]) * c)},${Math.round(from[1] + (to[1] - from[1]) * c)},${Math.round(from[2] + (to[2] - from[2]) * c)})`;
}

// ─── Elapsed timer hook ───────────────────────────────────────────────────────

function useElapsed(startedAt: number | null, running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || !startedAt) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);
  return elapsed;
}

function formatElapsed(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── User-action UI copy ──────────────────────────────────────────────────────

function getActionUi(action: string, fallback: string): { title: string; message: string } {
  switch (action) {
    case "weak_fit_consent":
      return {
        title: "This role may be a stretch",
        message:
          "Your profile has notable gaps for this role. You can still generate a tailored resume, but interview odds may be lower.",
      };
    case "do_not_apply_consent":
      return {
        title: "Low match for this role",
        message:
          "The fit check strongly recommends not applying. You can still generate a resume package if you want to proceed anyway.",
      };
    case "profile_completion_required":
      return {
        title: "Profile details needed",
        message:
          "Your profile is missing required details for high-quality generation. Complete your profile, then run generation again.",
      };
    default:
      return { title: "Action required", message: fallback };
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PipelineView({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [msgTick, setMsgTick] = useState(0);
  // Force re-render every 2 s so stallT (Date.now() derived) stays live
  const [, setTick] = useState(0);

  const {
    status,
    steps,
    startedAt,
    userActionRequired,
    failedStep,
    activity,
    liveResume,
    atsScore,
    errorMessage,
    completionData,
    start,
    retry,
    stop,
  } = useGenerationStream();

  const isStreaming = status === "streaming";
  const isError = status === "error";
  const isDone = status === "complete";
  const started = isStreaming || isDone || isError;

  // ── Start stream on mount, clean up on unmount ────────────────────────────
  useEffect(() => {
    router.prefetch(`/applications/${applicationId}`);
    start(applicationId, { initialSteps: INITIAL_STEPS });
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  // ── Timers ────────────────────────────────────────────────────────────────
  const elapsed = useElapsed(startedAt, isStreaming);

  // Rotate fun messages every 4 s
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setMsgTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Force re-render every 2 s so stall color stays live
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const completedSteps = steps.filter((s) => s.status === "complete");
  const activeSteps = steps.filter((s) => s.status === "active");
  const pendingSteps = steps.filter((s) => s.status === "pending");

  const progress = steps.length
    ? Math.round(((completedSteps.length + activeSteps.length * 0.5) / steps.length) * 100)
    : 0;

  const lastEventAt = useRef(Date.now());
  // Update lastEventAt whenever new events land (step count changes as proxy)
  const prevStepCount = useRef(completedSteps.length);
  if (completedSteps.length !== prevStepCount.current) {
    lastEventAt.current = Date.now();
    prevStepCount.current = completedSteps.length;
  }

  const msSince = Date.now() - lastEventAt.current;
  const stallT = isStreaming ? Math.max(0, Math.min(1, (msSince - 10_000) / 20_000)) : 0;
  const progressBarColor =
    stallT > 0 ? lerpColor([156, 163, 175], [245, 158, 11], stallT) : undefined;

  // Error meta
  const errorCode = errorMessage ? classifyError(errorMessage) : null;
  const errorMeta = errorCode ? ERROR_COPY[errorCode] : null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleCancel() {
    setCancelling(true);
    stop();
    const res = await fetch(`/api/applications/${applicationId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (data?.status === "completed") {
      router.push(`/applications/${applicationId}`);
      return;
    }
    router.push("/dashboard");
  }

  function handleRetry() {
    retry(false);
  }
  function handleProceedAnyway() {
    retry(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100svh-56px)] bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-6 md:px-16 lg:px-24">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </button>
          <div className="text-center">
            <h1 className="text-3xl font-normal leading-[1.08] tracking-tight md:text-5xl">
              Generating your <em className="font-serif italic">perfect</em> application
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Watch the AI research, write, and optimise your resume in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Pipeline body */}
      <div className="px-8 py-12 md:px-16 lg:px-24">
        <div className="max-w-xl mx-auto">
          {/* Connecting state */}
          {!started && !isError && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse mb-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting to generation pipeline…
            </div>
          )}

          {/* Progress bar (running) */}
          {isStreaming && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatElapsed(elapsed)} elapsed
                </p>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  <X className="h-3 w-3" />
                  {cancelling ? "Cancelling…" : "Cancel"}
                </button>
              </div>
              <div className="h-0.5 w-full bg-muted overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: progressBarColor ?? "oklch(var(--foreground))",
                    transition: "background-color 2s ease, width 0.7s ease",
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                {completedSteps.length} of {steps.length} steps
              </p>
            </div>
          )}

          {/* Progress bar (done — full) */}
          {isDone && (
            <div className="mb-6">
              <div className="h-0.5 w-full bg-foreground" />
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[11px] text-muted-foreground">
                  {steps.length} of {steps.length} steps
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {formatElapsed(elapsed)}
                </p>
              </div>
            </div>
          )}

          {/* Completed steps */}
          <AnimatePresence initial={false}>
            {completedSteps.map((step) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 2 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2.5 px-1 py-1"
              >
                <Check className="h-3 w-3 text-brand shrink-0" />
                <span className="text-xs text-muted-foreground flex-1">{step.label}</span>
                {step.durationMs != null && (
                  <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                    {(step.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Active steps */}
          <AnimatePresence mode="wait">
            {activeSteps.length > 0 && (
              <motion.div
                key={activeSteps.map((s) => s.id).join("-")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "border border-border bg-accent px-4 py-4",
                  completedSteps.length > 0 && "mt-2",
                )}
              >
                {activeSteps.map((step) => (
                  <div key={step.id} className="mb-2 last:mb-0">
                    <div className="flex items-center gap-2.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand shrink-0" />
                      <span className="text-sm font-medium flex-1">{step.label}</span>
                      {step.model && (
                        <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider">
                          {step.model.includes("haiku")
                            ? "H"
                            : step.model.includes("opus")
                              ? "O"
                              : "S"}
                        </span>
                      )}
                    </div>
                    <div className="pl-6 mt-0.5 truncate">
                      <StepShimmer text={getMsg(step.id, msgTick)} />
                    </div>
                  </div>
                ))}
                {activity.length > 0 && (
                  <div className="mt-2 space-y-0.5 pl-6">
                    {activity.slice(-1).map((a, i) => (
                      <p key={i} className="font-mono text-[9px] text-muted-foreground/40 truncate">
                        {a.message}
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pending steps */}
          {started && pendingSteps.length > 0 && !isError && !isDone && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1">
              {pendingSteps.map((s) => (
                <span key={s.id} className="text-[11px] text-muted-foreground/25">
                  {s.label}
                </span>
              ))}
            </div>
          )}

          {/* Live resume preview */}
          {Object.keys(liveResume).length > 0 && !isDone && (
            <div className="mt-4 border border-border/50 bg-muted/20 p-4 animate-in fade-in duration-300">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-2">
                Live preview
              </p>
              {liveResume.summary && (
                <p className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-3 mb-1">
                  {liveResume.summary.slice(0, 280)}
                  {liveResume.summary.length > 280 ? "…" : ""}
                </p>
              )}
              {liveResume.skills && !liveResume.summary && (
                <p className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2">
                  {liveResume.skills.slice(0, 200)}
                  {liveResume.skills.length > 200 ? "…" : ""}
                </p>
              )}
              {liveResume.experience && (
                <p className="font-mono text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2 mt-1">
                  {liveResume.experience.slice(0, 200)}
                  {liveResume.experience.length > 200 ? "…" : ""}
                </p>
              )}
            </div>
          )}

          {/* ATS score badge */}
          <div className="mt-8 min-h-[44px] flex items-center justify-center">
            <AnimatePresence>
              {atsScore != null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="inline-flex items-center gap-3 bg-background border px-5 py-2.5"
                >
                  <span className="text-sm font-medium">ATS Score</span>
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      atsScore >= 85 ? "text-brand" : "text-muted-foreground",
                    )}
                  >
                    {Math.round(atsScore)}%
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User action required (DO_NOT_APPLY / WEAK_FIT / profile gaps) */}
          {userActionRequired && (
            <div className="mt-8 border border-border bg-muted/30 p-6 text-center">
              <p className="text-xs text-muted-foreground mb-2">
                {getActionUi(userActionRequired.action, userActionRequired.message).title}
              </p>
              <p className="text-sm text-foreground mb-4">
                {getActionUi(userActionRequired.action, userActionRequired.message).message}
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                {(userActionRequired.action === "weak_fit_consent" ||
                  userActionRequired.action === "do_not_apply_consent") && (
                  <button type="button" onClick={handleProceedAnyway} className="rt-btn text-sm">
                    Generate Anyway
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="rt-btn-ghost text-sm"
                >
                  {userActionRequired.action === "profile_completion_required"
                    ? "Complete Profile"
                    : "Back to Dashboard"}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {isError && errorMessage && !userActionRequired && (
            <div className="mt-8 bg-destructive/10 border border-destructive/30 p-6 text-center">
              {failedStep && (
                <p className="text-xs text-muted-foreground mb-2">
                  Failed during: <span className="font-medium text-foreground">{failedStep}</span>
                </p>
              )}
              <p className="text-base font-medium text-destructive mb-1">
                {errorMeta?.headline ?? "Generation failed"}
              </p>
              <p className="text-sm text-foreground mb-2">{errorMeta?.detail ?? errorMessage}</p>
              <p className="text-xs text-muted-foreground mb-4">{errorMeta?.action}</p>
              <details className="mb-4 text-left">
                <summary className="text-[10px] text-muted-foreground/40 cursor-pointer hover:text-muted-foreground">
                  Technical detail
                </summary>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground/50 break-all">
                  {errorMessage.slice(0, 300)}
                </p>
              </details>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                {errorMeta?.retryable !== false && (
                  <button type="button" onClick={handleRetry} className="rt-btn text-sm">
                    Retry Generation
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="rt-btn-ghost text-sm"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Success card */}
          {isDone && (
            <div className="mt-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 text-brand mb-3">
                  <Check className="h-5 w-5" />
                  <span className="text-base font-medium">Application package ready</span>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Your tailored resume, cover letter, and application strategy are complete.
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/applications/${applicationId}`)}
                  className="rt-btn"
                >
                  View Results <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {completionData &&
                (completionData.submissionConfidence !== null ||
                  completionData.interviewReadyScore !== null) && (
                  <div className="border border-border bg-accent/30 p-5 space-y-4">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                      Quality Analysis
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {completionData.interviewReadyScore !== null && (
                        <div className="bg-background border border-border p-3 text-center">
                          <p
                            className={cn(
                              "text-2xl font-semibold tabular-nums",
                              completionData.interviewReadyScore >= 75
                                ? "text-brand"
                                : completionData.interviewReadyScore >= 55
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                            )}
                          >
                            {completionData.interviewReadyScore}
                            <span className="text-sm font-normal text-muted-foreground">/100</span>
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Interview Ready
                          </p>
                        </div>
                      )}
                      {completionData.submissionConfidence !== null && (
                        <div className="bg-background border border-border p-3 text-center">
                          <p
                            className={cn(
                              "text-2xl font-semibold tabular-nums",
                              completionData.submissionConfidence >= 0.65
                                ? "text-brand"
                                : "text-foreground",
                            )}
                          >
                            {Math.round(completionData.submissionConfidence * 100)}
                            <span className="text-sm font-normal text-muted-foreground">%</span>
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Submission Confidence
                          </p>
                        </div>
                      )}
                    </div>
                    {completionData.outcomeEstimate && (
                      <div className="flex items-center justify-between py-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          Predicted callback probability
                        </span>
                        <span className="text-sm font-medium tabular-nums">
                          {Math.round(completionData.outcomeEstimate.point * 100)}%
                          {completionData.outcomeEstimate.lower !== null &&
                            completionData.outcomeEstimate.upper !== null && (
                              <span className="text-[11px] text-muted-foreground ml-1">
                                [{Math.round(completionData.outcomeEstimate.lower * 100)}–
                                {Math.round(completionData.outcomeEstimate.upper * 100)}%]
                              </span>
                            )}
                        </span>
                      </div>
                    )}
                    {completionData.recruiterBeliefState?.projected_first_question && (
                      <div className="border-t border-border pt-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          Recruiter's likely first question
                        </p>
                        <p className="text-xs text-foreground italic leading-relaxed">
                          &ldquo;{completionData.recruiterBeliefState.projected_first_question}
                          &rdquo;
                        </p>
                        {completionData.recruiterBeliefState.hiring_intent_prediction && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Intent:{" "}
                            <span className="text-foreground">
                              {completionData.recruiterBeliefState.hiring_intent_prediction.replace(
                                /_/g,
                                " ",
                              )}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

              {completionData?.wellBeingConcerns && completionData.wellBeingConcerns.length > 0 && (
                <div className="mt-4 border border-border/50 bg-muted/20 p-4 space-y-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Advisory
                  </p>
                  {completionData.wellBeingConcerns
                    .filter((c) => c.severity !== "low")
                    .slice(0, 2)
                    .map((concern, i) => (
                      <div key={i} className="text-xs text-muted-foreground leading-relaxed">
                        <span className="text-foreground">{concern.nudge}</span>
                      </div>
                    ))}
                </div>
              )}

              {completionData?.gdprSummary && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                    {completionData.gdprSummary}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
