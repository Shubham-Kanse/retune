"use client";

import { cn } from "@/lib/utils";

// ── Stubs for @retune/ui/cognitive (package not yet built) ──────────────────
type ProvenanceClaim = { id: string; text: string; confidence: number; sourceSpanIds: string[] };

function ProvenanceOverlay({
  markdown,
  className,
}: { markdown: string; claims: ProvenanceClaim[]; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[#1a1a1a]",
        className,
      )}
    >
      {markdown}
    </div>
  );
}

function VerdictCard({
  verdict,
  interviewReadyScore,
  submissionConfidence,
}: {
  verdict: string | null;
  interviewReadyScore: number;
  submissionConfidence: number;
  outcomePoint?: number;
  applicationId?: string;
}) {
  const isShip = verdict === "ship" || verdict === "completed";
  return (
    <div className={`rounded-2xl p-6 ${isShip ? "bg-[#c8e6c9]" : "bg-[#fde8e8]"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#6b6b5b] mb-1">Verdict</p>
      <p className="text-2xl font-bold text-[#1a1a1a] mb-3">
        {isShip ? "SHIPPED" : (verdict?.toUpperCase() ?? "-")}
      </p>
      <div className="flex gap-4 text-sm">
        <div>
          <span className="text-[#6b6b5b]">Interview ready</span>
          <p className="font-bold text-[#1a1a1a]">{interviewReadyScore}/100</p>
        </div>
        <div>
          <span className="text-[#6b6b5b]">Confidence</span>
          <p className="font-bold text-[#1a1a1a]">{Math.round(submissionConfidence * 100)}%</p>
        </div>
      </div>
    </div>
  );
}

function RecruiterBeliefCard({
  belief,
}: {
  belief: {
    hiringIntentPrediction: string;
    projectedFirstQuestion: string;
    perceivedGaps: { topic: string; gapSeverity?: string; severity?: string }[];
    [key: string]: unknown;
  };
}) {
  return (
    <div className="rounded-2xl border border-[rgba(26,26,26,0.08)] bg-white p-5 space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9a9a8a] mb-1">
          Hiring Intent
        </p>
        <p className="text-sm font-medium text-[#1a1a1a] capitalize">
          {belief.hiringIntentPrediction}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9a9a8a] mb-1">
          Likely First Question
        </p>
        <p className="text-sm text-[#6b6b5b]">{belief.projectedFirstQuestion}</p>
      </div>
      {belief.perceivedGaps.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#9a9a8a] mb-2">
            Knowledge Gaps
          </p>
          <div className="flex flex-wrap gap-1.5">
            {belief.perceivedGaps.map((g) => (
              <span
                key={g.topic}
                className="text-[10px] font-medium bg-[#f2ede3] text-[#6b6b5b] px-2 py-1 rounded-full"
              >
                {g.topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceSpanPopover({
  spans,
  children,
}: {
  spans: { text: string; confidence: number; [key: string]: unknown }[];
  children?: React.ReactNode;
  trigger?: unknown;
  [key: string]: unknown;
}) {
  return (
    <span
      title={spans.map((s) => `${s.text} (${Math.round(s.confidence * 100)}%)`).join(", ")}
      className="border-b border-dotted border-[#1B3028] cursor-help"
    >
      {children}
    </span>
  );
}

function TraceTimeline({
  entries,
}: { entries: { specialist: string; latencyMs: number; costUsd: number }[] }) {
  return (
    <div className="space-y-1.5">
      {entries.map((e, i) => (
        <div
          key={i}
          className="flex items-center justify-between text-xs py-1.5 px-3 bg-[#f7f3ec] rounded-lg"
        >
          <span className="font-medium text-[#1a1a1a]">{e.specialist.replace(/_/g, " ")}</span>
          <span className="text-[#9a9a8a]">
            {e.latencyMs}ms · ${e.costUsd.toFixed(4)}
          </span>
        </div>
      ))}
    </div>
  );
}

function GdprPacketViewer({
  verdict,
  packet,
}: { verdict: string; packet: Record<string, unknown> }) {
  return (
    <div className="rounded-2xl border border-[rgba(26,26,26,0.08)] bg-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#9a9a8a] mb-3">
        GDPR Article 22 Audit
      </p>
      <p className="text-xs text-[#6b6b5b] mb-2">
        Verdict: <span className="font-medium text-[#1a1a1a] capitalize">{verdict}</span>
      </p>
      <p className="text-xs text-[#6b6b5b]">
        Generation: <span className="font-mono">{String(packet.generation_id ?? "-")}</span>
      </p>
    </div>
  );
}
import { ArrowLeft, Check, ChevronDown, Copy, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { EmptyState } from "../ui/empty-state";
import { Tooltip } from "../ui/tooltip";
import { ATSAnalysisModal } from "./ats-analysis-modal";
import { StrategyView } from "./strategy-view";

interface CognitiveSignals {
  submissionConfidence: number | null;
  interviewReadyScore: number | null;
  shipVerdict: string | null;
  outcomeEstimate: { point: number; lower: number | null; upper: number | null } | null;
  wellBeingConcerns: Array<{
    kind: string;
    message: string;
    nudge: string;
    severity: string;
  }> | null;
  recruiterBeliefState: {
    hiring_intent_prediction: string;
    projected_first_question: string;
    perceived_gaps: Array<{ topic: string; gap_severity: string; recruiter_question: string }>;
    flight_risk_signal: string;
    inferred_candidate_level: string;
  } | null;
  gdprSummary: string | null;
  gdprAppealInstructions: string | null;
  narrativeSummary: string | null;
}

interface Application {
  id: string;
  companyName: string;
  roleTitle: string;
  jobDescription: string;
  resumeContent: string | null;
  coverLetterContent: string | null;
  applicationStrategy: string | null;
  atsScore: number | null;
  atsReport: string | null;
  companyIntel: string | null;
  resumeDocxPath: string | null;
  resumePdfPath: string | null;
  coverLetterDocxPath: string | null;
  coverLetterPdfPath: string | null;
  pipelineLog: string | null;
  tokenUsage: string | null;
  generationDurationMs: number | null;
  refinementHistory: string | null;
}

function parseCognitiveSignals(pipelineLog: string | null): CognitiveSignals | null {
  if (!pipelineLog) return null;
  try {
    const parsed = JSON.parse(pipelineLog);
    if (parsed && typeof parsed === "object" && "cognitive" in parsed) {
      return parsed.cognitive as CognitiveSignals;
    }
  } catch {
    /* non-critical */
  }
  return null;
}

const PRIMARY_TABS = ["Resume", "Cover Letter", "Strategy"] as const;
const SECONDARY_TABS = ["How It Was Built", "Thinking", "Privacy", "Audit"] as const;
const TABS = [...PRIMARY_TABS, ...SECONDARY_TABS] as const;

/* ── Shared UI ───────────────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      className="rt-btn-ghost min-h-9 px-3 text-xs"
    >
      <span aria-live="polite" aria-atomic="true" className="flex items-center gap-1.5">
        {copied ? (
          <span className="animate-in zoom-in-50 duration-150 flex items-center gap-1.5 text-brand">
            <Check className="h-3.5 w-3.5" /> Copied
          </span>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copy
          </>
        )}
      </span>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function MarkdownDocumentView({ content }: { content: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 md:px-10 md:py-10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-semibold tracking-tight text-foreground mb-1">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-10 mb-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground border-b border-border pb-3">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-6 mb-2 text-sm font-semibold text-foreground">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="my-2 text-sm leading-[1.7] text-muted-foreground">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="my-2 ml-4 space-y-1.5 list-disc marker:text-border">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-2 ml-4 space-y-2 list-decimal marker:text-muted-foreground/40 marker:font-mono marker:text-xs">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-sm leading-[1.7] text-muted-foreground pl-1">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            code: ({ children }) => (
              <code className="bg-muted px-1.5 py-0.5 text-[12px] font-mono text-foreground">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="my-4 overflow-x-auto border border-border bg-muted/50 p-4 text-[12px] font-mono leading-relaxed whitespace-pre-wrap">
                {children}
              </pre>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function DownloadDropdown({ docx, pdf }: { docx?: string; pdf?: string }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!docx && !pdf) return null;

  function handleDownload(href: string, type: string) {
    setDownloading(type);
    setOpen(false);
    // Reset after a brief delay
    setTimeout(() => setDownloading(null), 2000);
  }

  return (
    <div
      className="relative animate-in fade-in slide-in-from-right-2 duration-400"
      style={{ animationDelay: "200ms", animationFillMode: "both" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rt-btn-ghost min-h-9 px-3 text-xs"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          {downloading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading…
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" /> Download
              <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            </>
          )}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[100px] border border-border bg-background shadow-md">
            {docx && (
              <a
                href={docx}
                download
                onClick={() => handleDownload(docx, "DOCX")}
                className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
              >
                <Download className="h-3 w-3" /> DOCX
              </a>
            )}
            {pdf && (
              <a
                href={pdf}
                download
                onClick={() => handleDownload(pdf, "PDF")}
                className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
              >
                <Download className="h-3 w-3" /> PDF
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── ATS data ────────────────────────────────────────────────────────── */

interface AtsKeyword {
  keyword: string;
  count: number;
  status: string;
}

interface AtsData {
  requiredPct: number;
  preferredPct: number;
  required: AtsKeyword[];
  preferred: AtsKeyword[];
  missingRequired: string[];
  missingPreferred: string[];
}

function parseAts(raw: string | null): AtsData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return {
      requiredPct: d.required_pct ?? d.scores?.required_pct ?? 0,
      preferredPct: d.preferred_pct ?? d.scores?.preferred_pct ?? 0,
      required: d.required ?? [],
      preferred: d.preferred ?? [],
      missingRequired: d.missing_required ?? [],
      missingPreferred: d.missing_preferred ?? [],
    };
  } catch {
    return null;
  }
}

/* ── Analysis sidebar ────────────────────────────────────────────────── */

/** Count-up hook: animates from 0 to target over durationMs on first mount only. */
function useCountUp(target: number | null, durationMs = 800): number | null {
  const [display, setDisplay] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (target == null || hasRun.current) return;
    hasRun.current = true;
    const finalTarget = target;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // cubic ease-out
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(finalTarget * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, durationMs]);

  return target == null ? null : display;
}

function AnalysisSidebar({
  application,
  showProvenance,
  onToggleProvenance,
}: {
  application: Application;
  showProvenance?: boolean;
  onToggleProvenance?: () => void;
}) {
  const ats = useMemo(() => parseAts(application.atsReport), [application.atsReport]);
  const animatedAtsScore = useCountUp(
    application.atsScore != null ? Math.round(application.atsScore) : null,
    800,
  );

  const reqFound = ats ? ats.required.filter((k) => k.count > 0).length : 0;
  const reqTotal = ats?.required.length ?? 0;
  const prefFound = ats ? ats.preferred.filter((k) => k.count > 0).length : 0;
  const prefTotal = ats?.preferred.length ?? 0;

  // Compute resume-level stats from content
  const stats = useMemo(() => {
    const content = application.resumeContent ?? "";
    const lines = content.split("\n").filter((l) => l.trim());
    const bullets = lines.filter((l) => /^\s*[-•*]/.test(l) || /^\s*\d+\./.test(l));
    const quantified = bullets.filter((l) =>
      /\d+[%xX$£€]|\$[\d,]+|[\d,]+\+?\s*(users|customers|clients|requests|transactions|records|employees|teams|projects|endpoints|services|applications|deployments|pipelines|servers|instances|clusters|databases|tables|queries|tests|tickets|issues|bugs|features|releases|sprints|stories|points|hours|days|weeks|months|years|revenue|savings|reduction|improvement|increase|decrease|growth)/i.test(
        l,
      ),
    );
    return {
      bulletCount: bullets.length,
      quantifiedCount: quantified.length,
      quantifiedPct:
        bullets.length > 0 ? Math.round((quantified.length / bullets.length) * 100) : 0,
    };
  }, [application.resumeContent]);

  if (!ats && application.atsScore == null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-xs text-muted-foreground/60 text-center">Analysis not available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Resume Analysis
        </p>
        {onToggleProvenance && (
          <button
            type="button"
            onClick={onToggleProvenance}
            className="rt-btn-ghost min-h-7 px-2 text-[10px] uppercase tracking-wider"
          >
            {showProvenance ? "Hide provenance" : "Show provenance"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Top metrics row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 border-b border-border">
          <div className="border-r border-border px-4 py-4 text-center col-span-2 lg:col-span-1 flex flex-col items-center gap-1.5">
            {/* SVG ring around ATS score */}
            <div className="relative inline-flex items-center justify-center">
              <svg
                width="56"
                height="56"
                viewBox="0 0 56 56"
                className="-rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-muted/40"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - (animatedAtsScore ?? 0) / 100)}`}
                  strokeLinecap="square"
                  className="text-foreground transition-all duration-700"
                />
              </svg>
              <span className="absolute text-sm font-semibold tabular-nums text-foreground">
                {animatedAtsScore != null ? animatedAtsScore : "-"}
              </span>
            </div>
            <Tooltip content="Percentage of required JD keywords found in your resume. Target: 85%+. Below 70% risks automatic rejection.">
              <p className="cursor-help text-[10px] uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-2">
                ATS Score
              </p>
            </Tooltip>
          </div>
          <div className="border-r border-border px-4 py-4 text-center">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {stats.bulletCount}
            </p>
            <Tooltip content="Total bullet points across all roles. Aim for 15+ bullets with at least 85% quantified.">
              <p className="mt-0.5 cursor-help text-[10px] uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-2">
                Bullets
              </p>
            </Tooltip>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {stats.quantifiedPct}%
            </p>
            <Tooltip content="Percentage of bullets containing a measurable number, metric, or outcome. Aim for 85%+.">
              <p className="mt-0.5 cursor-help text-[10px] uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-2">
                Quantified
              </p>
            </Tooltip>
          </div>
        </div>

        {/* ── Keyword coverage bars ── */}
        {ats && (
          <div className="border-b border-border px-5 py-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] text-muted-foreground">Required skills</span>
                <span className="font-mono text-[11px] tabular-nums text-foreground">
                  {reqFound}/{reqTotal}
                </span>
              </div>
              <div className="flex gap-px">
                {ats.required.map((kw) => (
                  <div
                    key={kw.keyword}
                    className={cn(
                      "h-2 flex-1 transition-colors",
                      kw.count > 0 ? "bg-foreground" : "bg-muted",
                    )}
                    title={`${kw.keyword}: ${kw.count > 0 ? `matched ×${kw.count}` : "missing"}`}
                  />
                ))}
              </div>
            </div>
            {prefTotal > 0 && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">Preferred skills</span>
                  <span className="font-mono text-[11px] tabular-nums text-foreground">
                    {prefFound}/{prefTotal}
                  </span>
                </div>
                <div className="flex gap-px">
                  {ats.preferred.map((kw) => (
                    <div
                      key={kw.keyword}
                      className={cn(
                        "h-2 flex-1 transition-colors",
                        kw.count > 0 ? "bg-foreground" : "bg-muted",
                      )}
                      title={`${kw.keyword}: ${kw.count > 0 ? `matched ×${kw.count}` : "missing"}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Matched keywords ── */}
        {ats && ats.required.length > 0 && (
          <div className="border-b border-border px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
              Keyword Matches
            </p>
            <div className="space-y-1">
              {ats.required
                .filter((k) => k.count > 0)
                .map((kw) => (
                  <div key={kw.keyword} className="flex items-center justify-between py-1">
                    <span className="text-xs text-foreground">{kw.keyword}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: Math.min(kw.count, 5) }, (_, i) => (
                          <div key={i} className="h-1.5 w-1.5 bg-foreground" />
                        ))}
                        {kw.count > 5 && (
                          <span className="text-[9px] text-muted-foreground ml-0.5">
                            +{kw.count - 5}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-5 text-right">
                        ×{kw.count}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
            {ats.preferred.filter((k) => k.count > 0).length > 0 && (
              <>
                <div className="my-3 border-t border-border" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Preferred
                </p>
                <div className="space-y-1">
                  {ats.preferred
                    .filter((k) => k.count > 0)
                    .map((kw) => (
                      <div key={kw.keyword} className="flex items-center justify-between py-1">
                        <span className="text-xs text-muted-foreground">{kw.keyword}</span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          ×{kw.count}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Gaps ── */}
        {ats && ats.missingRequired.length > 0 && (
          <div className="border-b border-border px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
              Gaps
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ats.missingRequired.map((kw) => (
                <span
                  key={kw}
                  className="border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground line-through decoration-muted-foreground/40"
                >
                  {kw}
                </span>
              ))}
              {ats.missingPreferred.map((kw) => (
                <span
                  key={kw}
                  className="border border-border/50 px-2 py-1 text-[11px] text-muted-foreground/60"
                >
                  {kw}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/50">
              Select text on the resume to incorporate missing keywords with AI.
            </p>
          </div>
        )}

        {/* ── E2: Evidence gap warnings ── */}
        {(() => {
          if (!application.pipelineLog) return null;
          try {
            const log = JSON.parse(application.pipelineLog);
            const gapEvent = (log.events ?? []).find(
              (e: { type?: string }) =>
                e.type === "gap_detected" && (e as { evidenceGaps?: unknown }).evidenceGaps,
            ) as
              | {
                  evidenceGaps?: Array<{
                    jdRequirement: string;
                    requirementTier: string;
                    gapNote?: string;
                  }>;
                }
              | undefined;
            const t1Gaps = (gapEvent?.evidenceGaps ?? []).filter((g) => g.requirementTier === "T1");
            if (t1Gaps.length === 0) return null;
            return (
              <div className="border-b border-border px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
                  Evidence Gaps
                </p>
                <p className="text-[10px] text-muted-foreground/70 mb-3 leading-relaxed">
                  These required skills appear in the JD but have weak backing in your profile. The
                  resume includes them - a recruiter may probe further.
                </p>
                <div className="space-y-1.5">
                  {t1Gaps.slice(0, 4).map((gap) => (
                    <div key={gap.jdRequirement} className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0 text-[11px]">⚠</span>
                      <div className="min-w-0">
                        <span className="text-xs text-foreground font-medium">
                          {gap.jdRequirement}
                        </span>
                        {gap.gapNote && (
                          <span className="text-[10px] text-muted-foreground ml-1.5">
                            {gap.gapNote}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <a
                  href="/profile"
                  className="mt-3 inline-block text-[10px] text-muted-foreground/50 underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Strengthen profile →
                </a>
              </div>
            );
          } catch {
            return null;
          }
        })()}

        {/* ── Why this resume works ── */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Strengths
          </p>
          <div className="space-y-2.5">
            {ats && reqFound > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground font-medium">
                  {reqFound} of {reqTotal}
                </span>{" "}
                required skills from the job description are present in the resume, with key terms
                appearing multiple times for ATS reinforcement.
              </p>
            )}
            {stats.quantifiedPct > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground font-medium">{stats.quantifiedPct}%</span> of
                bullet points include quantified metrics - numbers, percentages, or scale indicators
                that demonstrate measurable impact.
              </p>
            )}
            {stats.bulletCount > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-foreground font-medium">
                  {stats.bulletCount} bullet points
                </span>{" "}
                structured with action verbs and results, tailored to the {application.roleTitle}{" "}
                role at {application.companyName}.
              </p>
            )}
          </div>
        </div>

        {/* ── D1: Generation cost breakdown ── */}
        {(() => {
          if (!application.tokenUsage) return null;
          try {
            const u = JSON.parse(application.tokenUsage) as {
              inputTokens?: number;
              outputTokens?: number;
              cacheReadTokens?: number;
              cacheCreationTokens?: number;
              cacheHitRate?: number;
            };
            const totalIn =
              (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheCreationTokens ?? 0);
            const durationSec = application.generationDurationMs
              ? (application.generationDurationMs / 1000).toFixed(0)
              : null;
            return (
              <details className="px-5 py-3 group">
                <summary className="text-[10px] uppercase tracking-wider text-muted-foreground/50 cursor-pointer hover:text-muted-foreground flex items-center justify-between">
                  <span>Generation stats</span>
                  <span className="text-[9px]">▸</span>
                </summary>
                <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground/70">
                  <div className="flex justify-between">
                    <span>Input tokens</span>
                    <span>{(u.inputTokens ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Output tokens</span>
                    <span>{(u.outputTokens ?? 0).toLocaleString()}</span>
                  </div>
                  {(u.cacheReadTokens ?? 0) > 0 && (
                    <div className="flex justify-between text-brand/60">
                      <span>Cache read</span>
                      <span>
                        {(u.cacheReadTokens ?? 0).toLocaleString()}
                        {u.cacheHitRate ? ` (${u.cacheHitRate}% hit)` : ""}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border/50 pt-1 mt-1 text-foreground/80">
                    <span>Total tokens</span>
                    <span>{totalIn.toLocaleString()}</span>
                  </div>
                  {durationSec && (
                    <div className="flex justify-between text-muted-foreground/40">
                      <span>Duration</span>
                      <span>{durationSec}s</span>
                    </div>
                  )}
                </div>
              </details>
            );
          } catch {
            return null;
          }
        })()}
      </div>
    </div>
  );
}

/* ── Main view ───────────────────────────────────────────────────────── */

export function ResultsView({ application }: { application: Application }) {
  const [resumeContent] = useState(application.resumeContent ?? "");
  const [coverLetterContent] = useState(application.coverLetterContent ?? "");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resume");
  const [atsModalOpen, setAtsModalOpen] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);
  const provenanceClaims: ProvenanceClaim[] = [];
  const cognitive = useMemo(
    () => parseCognitiveSignals(application.pipelineLog),
    [application.pipelineLog],
  );

  // P1: keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when user is typing
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
        return;
      if (e.key === "1") setTab("Resume");
      if (e.key === "2") setTab("Cover Letter");
      if (e.key === "3") setTab("Strategy");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // D3: parse refinement history
  const refinementVersions = useMemo(() => {
    if (!application.refinementHistory) return [];
    try {
      const parsed = JSON.parse(application.refinementHistory) as Array<{
        timestamp: string;
        documentType: string;
        kind: string;
        instruction?: string;
        selectedText?: string;
        replacementText?: string;
      }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [application.refinementHistory]);

  const atsScore = application.atsScore;
  const isDocTab = tab === "Resume" || tab === "Cover Letter";

  const ats = useMemo(() => parseAts(application.atsReport), [application.atsReport]);
  const matchedKeywords = useMemo(
    () =>
      ats
        ? [
            ...ats.required.filter((k) => k.count > 0).map((k) => k.keyword),
            ...ats.preferred.filter((k) => k.count > 0).map((k) => k.keyword),
          ]
        : [],
    [ats],
  );
  const missingKeywords = useMemo(
    () =>
      ats
        ? [
            ...ats.missingRequired.slice(0, 8),
            ...ats.missingPreferred.slice(0, 8 - ats.missingRequired.length),
          ]
        : [],
    [ats],
  );
  const keywordCoverage = useMemo(
    () =>
      ats
        ? {
            required: ats.requiredPct,
            preferred: ats.preferredPct,
          }
        : null,
    [ats],
  );

  const isSecondaryTab = (SECONDARY_TABS as readonly string[]).includes(tab);

  return (
    <>
      {/* ── Header — one-line strip ── */}
      <div className="sticky top-[56px] z-30 h-12 flex items-center justify-between border-b border-border px-6 bg-background animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base font-medium truncate">{application.companyName}</span>
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="text-sm text-muted-foreground truncate">{application.roleTitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(tab === "Resume" || tab === "Cover Letter") && (
            <button
              type="button"
              onClick={() => setAtsModalOpen(true)}
              className="rt-btn-ghost min-h-8 px-3 text-xs lg:hidden"
              aria-label="View ATS analysis"
            >
              ATS
            </button>
          )}
          {tab === "Resume" && resumeContent && (
            <>
              <DownloadDropdown
                docx={`/api/generate/${application.id}/resume.docx`}
                pdf={`/api/generate/${application.id}/resume.pdf`}
              />
              <CopyButton text={resumeContent} />
            </>
          )}
          {tab === "Cover Letter" && coverLetterContent && (
            <>
              <DownloadDropdown
                docx={`/api/generate/${application.id}/cover_letter.docx`}
                pdf={`/api/generate/${application.id}/cover_letter.pdf`}
              />
              <CopyButton text={coverLetterContent} />
            </>
          )}
          {tab === "Strategy" && application.applicationStrategy && (
            <CopyButton text={application.applicationStrategy} />
          )}
        </div>
      </div>

      {/* ── Scores summary bar ── */}
      {cognitive &&
        [cognitive.interviewReadyScore, cognitive.submissionConfidence, atsScore].filter(
          (v) => v !== null && v !== undefined,
        ).length >= 2 && (
          <div className="sticky top-[104px] z-[25] bg-background/95 backdrop-blur border-b border-border px-6 py-2 flex items-center gap-4 text-xs flex-wrap">
            {cognitive.interviewReadyScore !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  cognitive.interviewReadyScore >= 80
                    ? "text-brand font-medium"
                    : cognitive.interviewReadyScore >= 65
                      ? "text-amber-500 font-medium"
                      : "text-muted-foreground",
                )}
              >
                Interview Ready:{" "}
                <span className="font-semibold">{cognitive.interviewReadyScore}/100</span>
              </span>
            )}
            {cognitive.interviewReadyScore !== null &&
              (cognitive.submissionConfidence !== null || atsScore !== null) && (
                <span className="text-muted-foreground/40" aria-hidden="true">
                  ·
                </span>
              )}
            {cognitive.submissionConfidence !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  cognitive.submissionConfidence >= 0.7
                    ? "text-brand font-medium"
                    : cognitive.submissionConfidence >= 0.5
                      ? "text-amber-500 font-medium"
                      : "text-muted-foreground",
                )}
              >
                Confidence:{" "}
                <span className="font-semibold">
                  {Math.round(cognitive.submissionConfidence * 100)}%
                </span>
              </span>
            )}
            {cognitive.submissionConfidence !== null && atsScore !== null && (
              <span className="text-muted-foreground/40" aria-hidden="true">
                ·
              </span>
            )}
            {atsScore !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  atsScore >= 85
                    ? "text-brand font-medium"
                    : atsScore >= 70
                      ? "text-amber-500 font-medium"
                      : "text-muted-foreground",
                )}
              >
                ATS: <span className="font-semibold">{Math.round(atsScore)}%</span>
              </span>
            )}
            {cognitive.shipVerdict &&
              (cognitive.shipVerdict === "ship" ||
                cognitive.shipVerdict === "revise" ||
                cognitive.shipVerdict === "refuse") && (
                <>
                  <span className="text-muted-foreground/40" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className={cn(
                      "font-semibold tracking-wide uppercase text-[11px]",
                      cognitive.shipVerdict === "ship"
                        ? "text-brand"
                        : cognitive.shipVerdict === "revise"
                          ? "text-amber-500"
                          : "text-destructive",
                    )}
                  >
                    {cognitive.shipVerdict}
                  </span>
                </>
              )}
          </div>
        )}

      {/* ── Tab bar ── */}
      <div
        className={cn(
          "sticky z-20 bg-background border-b border-border px-6 flex items-center justify-between",
          cognitive &&
            [cognitive.interviewReadyScore, cognitive.submissionConfidence, atsScore].filter(
              (v) => v !== null && v !== undefined,
            ).length >= 2
            ? "top-[136px]"
            : "top-[104px]",
        )}
      >
        <div className="flex items-center">
          {PRIMARY_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
                tab === t
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
          {/* More dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(
                "flex items-center gap-1 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
                isSecondaryTab
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-expanded={moreOpen}
            >
              {isSecondaryTab ? tab : "More"}
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", moreOpen && "rotate-180")}
              />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-px min-w-[160px] border border-border bg-background shadow-md">
                  {SECONDARY_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTab(t);
                        setMoreOpen(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted",
                        tab === t && "bg-muted font-medium",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Hint ── */}
      {isDocTab && (
        <p className="mb-3 text-[11px] text-muted-foreground/70">
          Select text on the document to edit with AI
        </p>
      )}

      {/* ── Resume tab ── */}
      {tab === "Resume" && (
        <div
          key="resume"
          className="grid animate-in fade-in duration-150 gap-0 lg:grid-cols-[1fr_300px] min-h-[500px] max-h-[calc(100dvh-160px)]"
        >
          <div className="rt-card overflow-hidden">
            {!resumeContent ? (
              <EmptyState type="resume" />
            ) : showProvenance ? (
              <div className="flex flex-col h-full">
                <div className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowProvenance(false)}
                    className="rt-btn-ghost min-h-7 px-2 text-xs flex items-center gap-1.5"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to editor
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <ProvenanceOverlay
                    markdown={resumeContent}
                    claims={provenanceClaims}
                    className="w-full"
                  />
                </div>
              </div>
            ) : (
              <MarkdownDocumentView content={resumeContent} />
            )}
          </div>
          <div className="hidden lg:block rt-card overflow-hidden">
            <AnalysisSidebar
              application={application}
              showProvenance={showProvenance}
              onToggleProvenance={() => setShowProvenance((v) => !v)}
            />
          </div>
        </div>
      )}

      {/* ── Cover Letter tab ── */}
      {tab === "Cover Letter" && (
        <div
          key="cover-letter"
          className="grid animate-in fade-in duration-150 gap-0 lg:grid-cols-[1fr_300px] min-h-[500px] max-h-[calc(100dvh-160px)]"
        >
          <div className="rt-card overflow-hidden">
            {!coverLetterContent ? (
              <EmptyState type="cover-letter" />
            ) : (
              <MarkdownDocumentView content={coverLetterContent} />
            )}
          </div>
          <div className="hidden lg:block rt-card overflow-hidden">
            <AnalysisSidebar application={application} />
          </div>
        </div>
      )}

      {/* ── Strategy tab ── */}
      {tab === "Strategy" && (
        <div key="strategy" className="animate-in fade-in duration-150">
          {application.applicationStrategy ? (
            <StrategyView content={application.applicationStrategy} />
          ) : (
            <div className="rt-card min-h-[500px] max-h-[calc(100dvh-160px)]">
              <EmptyState type="strategy" />
            </div>
          )}
        </div>
      )}

      {/* ── How It Was Built tab ── */}
      {tab === "How It Was Built" && (
        <div key="how-built" className="animate-in fade-in duration-150">
          <div className="rt-card p-6 space-y-6" style={{ minHeight: "400px" }}>
            {cognitive ? (
              <>
                {cognitive.shipVerdict === "ship" ||
                cognitive.shipVerdict === "revise" ||
                cognitive.shipVerdict === "refuse" ? (
                  <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-500">
                    <VerdictCard
                      verdict={cognitive.shipVerdict}
                      interviewReadyScore={cognitive.interviewReadyScore ?? 0}
                      submissionConfidence={cognitive.submissionConfidence ?? 0}
                      outcomePoint={cognitive.outcomeEstimate?.point}
                      applicationId={application.id}
                    />
                  </div>
                ) : (
                  <section>
                    <h3 className="rt-label mb-3">Pipeline Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {cognitive.interviewReadyScore !== null && (
                        <MiniStat
                          label="Interview Ready"
                          value={`${cognitive.interviewReadyScore}/100`}
                        />
                      )}
                      {cognitive.submissionConfidence !== null && (
                        <MiniStat
                          label="Confidence"
                          value={`${Math.round(cognitive.submissionConfidence * 100)}%`}
                        />
                      )}
                      {cognitive.outcomeEstimate?.point != null && (
                        <MiniStat
                          label="Callback Prob."
                          value={`${Math.round(cognitive.outcomeEstimate.point * 100)}%`}
                        />
                      )}
                    </div>
                  </section>
                )}
                {cognitive.narrativeSummary && (
                  <section>
                    <h3 className="rt-label mb-3">What the system considered</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {cognitive.narrativeSummary}
                    </p>
                  </section>
                )}
                {cognitive.wellBeingConcerns && cognitive.wellBeingConcerns.length > 0 && (
                  <section>
                    <h3 className="rt-label mb-3">Notes</h3>
                    <ul className="space-y-1">
                      {cognitive.wellBeingConcerns.map((c, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-amber-500">•</span> {c.message}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Detailed reasoning data is not available for this generation.
              </p>
            )}

            {/* D3: Refinement version history */}
            {refinementVersions.length > 0 && (
              <section>
                <h3 className="rt-label mb-3">Refinement History</h3>
                <div className="space-y-2">
                  {refinementVersions
                    .slice()
                    .reverse()
                    .map((v, i) => (
                      <div key={i} className="border border-border/50 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-foreground capitalize">
                            {v.kind?.replace(/_/g, " ") ?? "Refinement"}
                          </span>
                          <span className="text-muted-foreground/50 shrink-0 tabular-nums text-[10px]">
                            {new Date(v.timestamp).toLocaleString("en", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {v.instruction && (
                          <p className="text-muted-foreground leading-relaxed">
                            {v.instruction.slice(0, 120)}
                            {v.instruction.length > 120 ? "…" : ""}
                          </p>
                        )}
                        {v.selectedText && (
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground/50 line-clamp-1">
                            &ldquo;{v.selectedText.slice(0, 80)}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ── Thinking tab ── */}
      {tab === "Thinking" && (
        <div key="thinking" className="animate-in fade-in duration-150">
          <div className="rt-card p-6 space-y-6" style={{ minHeight: "400px" }}>
            {/* Narrative summary */}
            {(() => {
              let narrativeText = cognitive?.narrativeSummary ?? null;
              if (!narrativeText) {
                // Generate a basic summary from completed pipeline events
                try {
                  const parsed = application.pipelineLog
                    ? JSON.parse(application.pipelineLog)
                    : null;
                  if (parsed?.events && Array.isArray(parsed.events)) {
                    const completedSteps = (
                      parsed.events as Array<{ type?: string; step?: string }>
                    )
                      .filter((e) => e.type === "step_complete" && e.step)
                      .map((e) =>
                        (e.step ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                      );
                    if (completedSteps.length > 0) {
                      const last = completedSteps.length > 1 ? completedSteps.pop() : null;
                      narrativeText = `Your application was processed through ${completedSteps.length + (last ? 1 : 0)} pipeline phases: ${completedSteps.join(", ")}${last ? `, and ${last}` : ""}.`;
                    }
                  }
                } catch {
                  /* non-critical */
                }
              }
              return (
                <section>
                  <h3 className="rt-label mb-3">How I Thought About This</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {narrativeText ??
                      "Analysis complete - this application was assembled using the full pipeline."}
                  </p>
                </section>
              );
            })()}

            {/* Recruiter belief state */}
            {cognitive?.recruiterBeliefState && (
              <section>
                <h3 className="rt-label mb-3">Recruiter Perspective</h3>
                <RecruiterBeliefCard
                  belief={{
                    hiringIntentPrediction:
                      cognitive.recruiterBeliefState.hiring_intent_prediction.replace(/_/g, " "),
                    projectedFirstQuestion: cognitive.recruiterBeliefState.projected_first_question,
                    perceivedGaps: (cognitive.recruiterBeliefState.perceived_gaps ?? []).map(
                      (g) => ({ topic: g.topic, severity: g.gap_severity }),
                    ),
                    inferredLevel: cognitive.recruiterBeliefState.inferred_candidate_level,
                  }}
                />
                {(cognitive.recruiterBeliefState.perceived_gaps ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(cognitive.recruiterBeliefState.perceived_gaps ?? [])
                      .slice(0, 5)
                      .map((gap) => (
                        <EvidenceSpanPopover
                          key={gap.topic}
                          spans={[
                            {
                              text: gap.topic,
                              kind: "gap",
                              confidence:
                                gap.gap_severity === "high"
                                  ? 0.9
                                  : gap.gap_severity === "medium"
                                    ? 0.6
                                    : 0.3,
                              source: "recruiter_belief_model",
                            },
                          ]}
                          trigger={
                            <span className="text-xs border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground cursor-help">
                              {gap.topic}
                            </span>
                          }
                        />
                      ))}
                  </div>
                )}
              </section>
            )}

            {/* Trace timeline — tries structured traces first, falls back to legacy events */}
            {(() => {
              let traceEntries: React.ComponentProps<typeof TraceTimeline>["entries"] = [];
              try {
                const parsed = application.pipelineLog ? JSON.parse(application.pipelineLog) : null;
                if (parsed?.traces && Array.isArray(parsed.traces)) {
                  // Structured trace format
                  traceEntries = parsed.traces.map(
                    (
                      t: {
                        seq: number;
                        specialist: string;
                        latency_ms: number;
                        cost_usd: number;
                        writes_count: number;
                        timestamp: string;
                      },
                      i: number,
                    ) => ({
                      seq: t.seq ?? i,
                      specialist: t.specialist,
                      displayName: t.specialist.replace(/_/g, " "),
                      latencyMs: t.latency_ms ?? 0,
                      costUsd: t.cost_usd ?? 0,
                      writesCount: t.writes_count ?? 0,
                      timestamp: new Date(t.timestamp).getTime(),
                    }),
                  );
                } else if (parsed?.events && Array.isArray(parsed.events)) {
                  // Legacy pipeline event format: {t, type, step, tool, action, message}
                  traceEntries = (
                    parsed.events as Array<{
                      t?: string | number;
                      type?: string;
                      step?: string;
                      tool?: string;
                      action?: string;
                      message?: string;
                    }>
                  )
                    .filter((e) => e.type === "step_complete" && e.step)
                    .map((e, i) => ({
                      seq: i,
                      specialist: e.step ?? `step_${i}`,
                      displayName: (e.step ?? `step_${i}`)
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase()),
                      latencyMs: 0,
                      costUsd: 0,
                      writesCount: 0,
                      timestamp: e.t
                        ? typeof e.t === "number"
                          ? e.t
                          : new Date(e.t).getTime()
                        : 0,
                    }));
                }
              } catch {
                /* non-critical */
              }
              return (
                <section>
                  <h3 className="rt-label mb-3">Pipeline Trace</h3>
                  <TraceTimeline entries={traceEntries} />
                </section>
              );
            })()}

            {/* Well-being concerns */}
            {cognitive?.wellBeingConcerns && cognitive.wellBeingConcerns.length > 0 && (
              <section>
                <h3 className="rt-label mb-3">Advisory Notes</h3>
                <div className="space-y-2">
                  {cognitive.wellBeingConcerns.map((c, i) => (
                    <div
                      key={i}
                      className={cn(
                        "border-l-2 pl-3 py-2 pr-3",
                        c.severity === "high"
                          ? "border-destructive bg-destructive/5"
                          : c.severity === "moderate" || c.severity === "medium"
                            ? "border-amber-500 bg-amber-500/5"
                            : "border-muted-foreground/30 bg-muted/30",
                      )}
                    >
                      <p className="text-sm text-foreground leading-relaxed">{c.message}</p>
                      {c.nudge && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {c.nudge}
                        </p>
                      )}
                      <span
                        className={cn(
                          "inline-block mt-1.5 text-[10px] font-medium uppercase tracking-wide",
                          c.severity === "high"
                            ? "text-destructive"
                            : c.severity === "moderate" || c.severity === "medium"
                              ? "text-amber-500"
                              : "text-muted-foreground",
                        )}
                      >
                        {c.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ── Privacy tab ── */}
      {tab === "Privacy" && (
        <div key="privacy" className="animate-in fade-in duration-150">
          <div className="rt-card p-6 space-y-6" style={{ minHeight: "400px" }}>
            {/* GDPR summary — shown prominently above the viewer when available */}
            {cognitive?.gdprSummary && (
              <section className="border border-border p-4 bg-muted/30">
                <h3 className="rt-label mb-2">Data Processing Summary</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {cognitive.gdprSummary}
                </p>
              </section>
            )}

            {/* GDPR packet viewer */}
            <section>
              <GdprPacketViewer
                verdict={cognitive?.shipVerdict ?? "pending"}
                packet={{
                  generation_id: application.id,
                  company: application.companyName,
                  role: application.roleTitle,
                  ats_score: application.atsScore,
                  gdpr_summary: cognitive?.gdprSummary ?? null,
                  outcome_estimate: cognitive?.outcomeEstimate ?? null,
                  submission_confidence: cognitive?.submissionConfidence ?? null,
                }}
              />
            </section>

            {/* Your Rights */}
            {cognitive?.gdprAppealInstructions && (
              <section>
                <h3 className="rt-label mb-3">Your Rights</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {cognitive.gdprAppealInstructions}
                </p>
              </section>
            )}

            {/* Actions */}
            <section className="flex flex-wrap gap-3 pt-2 border-t border-border">
              <a
                href={`/api/generate/${application.id}/refusal`}
                download
                className="rt-btn-ghost min-h-9 px-4 text-xs flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Download audit packet
              </a>
              <Link
                href={`/generate/${application.id}/contest`}
                className="rt-btn-ghost min-h-9 px-4 text-xs"
              >
                Contest this decision
              </Link>
              <Link
                href="/settings/data"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors self-center"
              >
                Manage your data
              </Link>
            </section>
          </div>
        </div>
      )}

      {/* ── Audit tab ── */}
      {tab === "Audit" && (
        <div key="audit" className="animate-in fade-in duration-150">
          <div className="rt-card p-6" style={{ minHeight: "400px" }}>
            {cognitive?.gdprSummary ? (
              <div className="space-y-6">
                <section>
                  <h3 className="rt-label mb-3">Transparency Disclosure</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {cognitive.gdprSummary}
                  </p>
                </section>
                {cognitive.gdprAppealInstructions && (
                  <section>
                    <h3 className="rt-label mb-3">Your Rights</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {cognitive.gdprAppealInstructions}
                    </p>
                  </section>
                )}
                {application.pipelineLog && (
                  <section>
                    <h3 className="rt-label mb-3">Full Pipeline Record</h3>
                    <details className="group">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        Show raw data
                      </summary>
                      <pre className="mt-2 text-xs font-mono text-muted-foreground overflow-x-auto max-h-60 overflow-y-auto border border-border p-3">
                        {application.pipelineLog}
                      </pre>
                    </details>
                  </section>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No audit data available for this generation.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Cognitive quality panel (shown below any tab when signals are available) ── */}
      {cognitive &&
        (cognitive.submissionConfidence !== null ||
          cognitive.interviewReadyScore !== null ||
          cognitive.recruiterBeliefState !== null) && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {/* Score cards */}
            {(cognitive.submissionConfidence !== null ||
              cognitive.interviewReadyScore !== null) && (
              <div className="rt-card p-5">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-4">
                  Quality Assessment
                </p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {cognitive.interviewReadyScore !== null && (
                    <div className="border border-border p-3 text-center">
                      <p
                        className={cn(
                          "text-2xl font-semibold tabular-nums",
                          cognitive.interviewReadyScore >= 75
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {cognitive.interviewReadyScore}
                        <span className="text-sm font-normal text-muted-foreground">/100</span>
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Interview Ready
                      </p>
                    </div>
                  )}
                  {cognitive.submissionConfidence !== null && (
                    <div className="border border-border p-3 text-center">
                      <p className="text-2xl font-semibold tabular-nums text-foreground">
                        {Math.round(cognitive.submissionConfidence * 100)}
                        <span className="text-sm font-normal text-muted-foreground">%</span>
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Submission Confidence
                      </p>
                    </div>
                  )}
                </div>
                {cognitive.outcomeEstimate && (
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">Predicted callback</span>
                    <span className="text-sm font-medium tabular-nums">
                      {Math.round(cognitive.outcomeEstimate.point * 100)}%
                      {cognitive.outcomeEstimate.lower !== null &&
                        cognitive.outcomeEstimate.upper !== null && (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            [{Math.round(cognitive.outcomeEstimate.lower * 100)}–
                            {Math.round(cognitive.outcomeEstimate.upper * 100)}%]
                          </span>
                        )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recruiter belief state */}
            {cognitive.recruiterBeliefState && (
              <div className="rt-card p-5">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
                  Recruiter Perspective
                </p>
                <div className="space-y-3">
                  {cognitive.recruiterBeliefState.projected_first_question && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Likely first screen question
                      </p>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        &ldquo;
                        {cognitive.recruiterBeliefState.projected_first_question}
                        &rdquo;
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-[11px] text-muted-foreground">Hiring intent</span>
                    <span className="text-[11px] font-medium text-foreground">
                      {cognitive.recruiterBeliefState.hiring_intent_prediction.replace(/_/g, " ")}
                    </span>
                  </div>
                  {cognitive.recruiterBeliefState.flight_risk_signal &&
                    cognitive.recruiterBeliefState.flight_risk_signal !== "none" && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Flight risk</span>
                        <span className="text-[11px] text-muted-foreground">
                          {cognitive.recruiterBeliefState.flight_risk_signal}
                        </span>
                      </div>
                    )}
                  {cognitive.recruiterBeliefState.perceived_gaps?.filter(
                    (g) => g.gap_severity === "critical",
                  ).length > 0 && (
                    <div className="border-t border-border pt-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Gaps to address
                      </p>
                      {cognitive.recruiterBeliefState.perceived_gaps
                        .filter((g) => g.gap_severity === "critical")
                        .slice(0, 2)
                        .map((gap, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                            &rarr; {gap.topic}
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Well-being nudges */}
            {cognitive.wellBeingConcerns && cognitive.wellBeingConcerns.length > 0 && (
              <div className="rt-card p-5 md:col-span-2">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
                  Advisory
                </p>
                <div className="space-y-2">
                  {cognitive.wellBeingConcerns
                    .filter((c) => c.severity !== "low")
                    .slice(0, 3)
                    .map((concern, i) => (
                      <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                        <span className="text-foreground font-medium">{concern.nudge}</span>
                      </p>
                    ))}
                </div>
              </div>
            )}

            {/* GDPR disclosure */}
            {cognitive.gdprSummary && (
              <div className="md:col-span-2 border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/50">
                  {cognitive.gdprSummary}
                  {cognitive.gdprAppealInstructions && <> {cognitive.gdprAppealInstructions}</>}
                </p>
              </div>
            )}
          </div>
        )}

      <ATSAnalysisModal
        isOpen={atsModalOpen}
        onClose={() => setAtsModalOpen(false)}
        atsScore={atsScore}
        matchedKeywords={matchedKeywords}
        missingKeywords={missingKeywords}
        keywordCoverage={keywordCoverage}
      />
    </>
  );
}
