"use client";

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Lightbulb,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface GenerationResult {
  generation_id: string;
  status: "running" | "complete" | "refused" | "error" | "unknown";
  verdict: string | null;
  resume: string | null;
  cover_letter: string | null;
  strategy: string | null;
  ats_score: number | null;
  interview_ready_score: number | null;
  submission_confidence: number | null;
  outcome_estimate: { point: number; lower: number | null; upper: number | null } | null;
  narrative_arc: { thesis: string; voice: string } | null;
  conflicts: Array<{ id: string; monitor: string; severity: string; summary: string }>;
  pending_revisions: Array<{ target: string; reason: string }>;
  total_cost_usd: number;
  ticks_executed: number;
  termination: string | null;
}

type Tab = "resume" | "cover_letter" | "strategy";

const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  resume: {
    label: "Resume",
    icon: <FileText className="h-3.5 w-3.5 text-[#00d4d4]" />,
  },
  cover_letter: {
    label: "Cover letter",
    icon: <BookOpen className="h-3.5 w-3.5 text-[#ff5555]" />,
  },
  strategy: {
    label: "Strategy",
    icon: <Lightbulb className="h-3.5 w-3.5 text-[#ff8c42]" />,
  },
};

function StatCard({
  label,
  value,
  sub,
  color = "#1a1a1a",
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-[#e5e2dd] rounded-2xl bg-white p-5">
      <p className="rt-label mb-3">{label}</p>
      <p
        className="text-2xl font-semibold leading-tight tabular-nums tracking-tight"
        style={{ color }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-[#9a9690] mt-1.5">{sub}</p>}
    </div>
  );
}

function DocPanel({
  content,
  generationId,
  docType,
}: { content: string; generationId: string; docType: "resume" | "cover_letter" }) {
  const downloadUrl = (fmt: string) => `/api/generate/${generationId}/${docType}.${fmt}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <a
          href={downloadUrl("docx")}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e5e2dd] rounded-lg hover:bg-[#f0ede8] transition-colors text-xs text-[#6b6b6b] hover:text-[#1a1a1a]"
        >
          <Download className="h-3.5 w-3.5 text-[#00d4d4]" />
          DOCX
        </a>
        <a
          href={downloadUrl("pdf")}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e5e2dd] rounded-lg hover:bg-[#f0ede8] transition-colors text-xs text-[#6b6b6b] hover:text-[#1a1a1a]"
        >
          <Download className="h-3.5 w-3.5 text-[#ff8c42]" />
          PDF
        </a>
      </div>
      <div className="border border-[#e5e2dd] rounded-2xl bg-white p-8 shadow-sm">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

// Convert 4-space / tab indented blocks to blockquotes so remark
// doesn't parse them as code blocks. Strategy docs use indentation
// for template text (e.g. LinkedIn outreach templates) not for code.
function normaliseMarkdown(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      if (line.startsWith("    ")) return `> ${line.slice(4)}`;
      if (line.startsWith("\t")) return `> ${line.slice(1)}`;
      return line;
    })
    .join("\n");
}

let h2Count = 0;

function MarkdownContent({ content }: { content: string }) {
  h2Count = 0;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-base font-semibold text-[#1a1a1a] mt-0 mb-5">{children}</h1>
        ),
        h2: ({ children }) => {
          const isFirst = h2Count++ === 0;
          return (
            <div className="mt-6">
              {!isFirst && <hr className="border-[#e5e2dd] mb-4" />}
              <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-3 uppercase tracking-wide">
                {children}
              </h2>
            </div>
          );
        },
        // H3 — subsection, no divider
        h3: ({ children }) => (
          <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-2 mt-4">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm leading-[1.7] text-[#1a1a1a] mb-3">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-4 pl-5 list-disc space-y-2 text-sm text-[#1a1a1a]">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 pl-5 list-decimal space-y-2 text-sm text-[#1a1a1a]">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm leading-[1.7] text-[#1a1a1a] pl-1">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-[#1a1a1a]">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-[#6b6b6b]">{children}</em>,
        // Inline backtick code — subtle pill, normal size
        code: ({ children }) => (
          <code className="bg-[#f0ede8] px-1.5 py-0.5 rounded text-[13px] font-sans text-[#1a1a1a]">
            {children}
          </code>
        ),
        // Fenced code blocks (LLM uses these for template text like LinkedIn messages)
        // Render as a readable card, NOT monospace
        pre: ({ children }) => (
          <div className="bg-[#faf8f5] border border-[#e5e2dd] rounded-xl px-5 py-4 my-4 text-sm text-[#1a1a1a] leading-[1.7] [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-sm [&_code]:font-sans">
            {children}
          </div>
        ),
        // Template blocks (converted from 4-space indent) — card-like background
        blockquote: ({ children }) => (
          <blockquote className="bg-[#faf8f5] border border-[#e5e2dd] rounded-xl px-5 py-4 my-4 text-sm text-[#1a1a1a] leading-[1.7] [&_p]:mb-1.5 [&_p:last-child]:mb-0">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-[#e5e2dd] my-5" />,
        // GFM tables
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-[#e5e2dd]">{children}</tr>,
        th: ({ children }) => (
          <th className="text-left text-xs font-semibold text-[#1a1a1a] px-3 py-2 bg-[#f0ede8]">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="px-3 py-2 text-[#1a1a1a]">{children}</td>,
      }}
    >
      {normaliseMarkdown(content)}
    </ReactMarkdown>
  );
}

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const generationId = params?.id ?? "";
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resume");

  useEffect(() => {
    if (!generationId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/generate/${generationId}/result?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status_${res.status}`);
        const data: GenerationResult = await res.json();
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [generationId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#9a9690]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b84ed1] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#b84ed1]" />
          </span>
          <span className="text-sm">Loading results…</span>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-[#9a9690]">No results found for this generation.</p>
        <Link href="/dashboard" className="rt-btn-ghost inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  if (result.status === "refused") {
    return (
      <div className="min-h-screen flex items-start justify-center pt-16 px-6 pb-16">
        <div className="w-full max-w-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#fef2f2] flex items-center justify-center">
                <X className="w-4 h-4 text-[#dc2626]" />
              </div>
              <div>
                <p className="rt-label">Result</p>
                <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] leading-tight">
                  Not ready to ship
                </h1>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
          <div className="border border-[#fecaca] bg-[#fef2f2] rounded-2xl p-6 mb-4">
            <p className="text-sm text-[#dc2626] leading-relaxed">
              The quality gate refused to ship. Refine your profile or the job details and retry.
            </p>
          </div>
          {result.conflicts.map((c) => (
            <div key={c.id} className="border border-[#e5e2dd] bg-white rounded-2xl p-5 mb-3">
              <p className="rt-label mb-1.5">
                {c.monitor.replace(/_/g, " ")} · {c.severity}
              </p>
              <p className="text-sm text-[#1a1a1a] leading-relaxed">{c.summary}</p>
            </div>
          ))}
          <div className="flex gap-3 mt-6">
            <Link href="/generate/new" className="rt-btn text-sm">
              Retry
            </Link>
            <Link href="/dashboard" className="rt-btn-ghost text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const shipped = result.verdict === "ship" || result.verdict === "completed";
  const score = result.interview_ready_score ?? result.submission_confidence;
  const callbackPct = result.outcome_estimate
    ? Math.round(result.outcome_estimate.point * 100)
    : null;
  const callbackRange =
    result.outcome_estimate?.lower != null && result.outcome_estimate?.upper != null
      ? `${Math.round(result.outcome_estimate.lower * 100)}–${Math.round(result.outcome_estimate.upper * 100)}% range`
      : undefined;

  const tabs: Tab[] = ["resume", "cover_letter", "strategy"];
  const hasContent: Record<Tab, boolean> = {
    resume: !!result.resume,
    cover_letter: !!result.cover_letter,
    strategy: !!result.strategy,
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-12 px-6 pb-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0ede8] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#b84ed1]" />
            </div>
            <div>
              <p className="rt-label">Your package</p>
              <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] leading-tight">
                Application ready
              </h1>
            </div>
          </div>
          <Link href="/dashboard" className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        {/* Verdict + meta */}
        <div className="flex items-center gap-3 mb-6">
          {shipped ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16a34a] bg-[#d4f5e0] border border-[#bbf7d0] px-2.5 py-1 rounded-full">
              <CheckCircle2 className="h-3 w-3" /> Shipped
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#d97706] bg-[#fef9c3] border border-[#fde68a] px-2.5 py-1 rounded-full">
              {result.verdict ?? "Incomplete"}
            </span>
          )}
          <span className="text-[11px] text-[#9a9690] font-mono">
            {result.ticks_executed} ticks · ${result.total_cost_usd.toFixed(4)}
          </span>
        </div>

        {/* Narrative arc thesis */}
        {result.narrative_arc?.thesis && (
          <p className="text-sm text-[#6b6b6b] italic leading-relaxed mb-6 border-l-2 border-[#e5e2dd] pl-4">
            "{result.narrative_arc.thesis}"
          </p>
        )}

        {/* Score cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard
            label="Interview readiness"
            value={score != null ? `${Math.round(score)}/100` : "—"}
            color={score != null && score >= 80 ? "#16a34a" : "#1a1a1a"}
          />
          <StatCard
            label="ATS score"
            value={result.ats_score != null ? `${Math.round(result.ats_score)}%` : "—"}
            color={result.ats_score != null && result.ats_score >= 80 ? "#16a34a" : "#1a1a1a"}
          />
          <StatCard
            label="Callback chance"
            value={callbackPct != null ? `${callbackPct}%` : "—"}
            sub={callbackRange}
            color={callbackPct != null && callbackPct >= 70 ? "#16a34a" : "#1a1a1a"}
          />
        </div>

        {/* Tab switcher */}
        <div className="border border-[#e5e2dd] rounded-2xl bg-white overflow-hidden mb-4">
          <div className="flex border-b border-[#e5e2dd]">
            {tabs.map((key) => {
              const { label, icon } = TAB_META[key];
              const active = tab === key;
              const enabled = hasContent[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  disabled={!enabled}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "text-[#1a1a1a] bg-[#f0ede8]"
                      : enabled
                        ? "text-[#6b6b6b] hover:bg-[#faf8f5]"
                        : "text-[#ccc8c3] cursor-default"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {tab === "resume" &&
              (result.resume ? (
                <DocPanel content={result.resume} generationId={generationId} docType="resume" />
              ) : (
                <Empty label="Resume not generated" />
              ))}
            {tab === "cover_letter" &&
              (result.cover_letter ? (
                <DocPanel
                  content={result.cover_letter}
                  generationId={generationId}
                  docType="cover_letter"
                />
              ) : (
                <Empty label="Cover letter not generated" />
              ))}
            {tab === "strategy" &&
              (result.strategy ? (
                <MarkdownContent content={result.strategy} />
              ) : (
                <Empty label="Strategy not generated" />
              ))}
          </div>
        </div>

        {/* Conflicts */}
        {result.conflicts.length > 0 && (
          <div className="border border-[#e5e2dd] rounded-2xl bg-white overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-[#e5e2dd]">
              <p className="rt-label">Quality notes</p>
            </div>
            <div className="p-5 space-y-3">
              {result.conflicts.map((c) => (
                <div key={c.id} className="border border-[#e5e2dd] rounded-xl p-4">
                  <p className="rt-label mb-1">
                    {c.monitor.replace(/_/g, " ")} · {c.severity}
                  </p>
                  <p className="text-sm text-[#1a1a1a] leading-relaxed">{c.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link href="/generate/new" className="rt-btn text-sm">
            New application
          </Link>
          <Link href="/dashboard" className="rt-btn-ghost text-sm">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center border border-dashed border-[#e5e2dd] rounded-xl">
      <FileText className="h-6 w-6 text-[#ccc8c3]" />
      <p className="text-sm text-[#9a9690]">{label}</p>
    </div>
  );
}
