"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { MIN_JD_TEXT_LENGTH, MIN_JD_URL_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Type,
  User,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardShortcutsModal } from "../ui/keyboard-shortcuts-modal";
import { ProfileEditModal } from "./profile-edit-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

type Market = "us" | "uk";

interface AppSummary {
  id: string;
  companyName: string;
  roleTitle: string;
  atsScore: number | null;
  status: string;
  generationDurationMs?: number | null;
  createdAt: string;
}

interface ProfileContext {
  fullName: string;
  currentTitle: string | null;
  location: string;
  targetRoles: string[];
  experience: { company: string; title: string; tools?: string[] }[];
  education: { degree: string; institution: string }[];
  skillsTier1: { name: string; evidence?: string }[];
  skillsTier2: { name: string; evidence?: string }[];
  completenessScore: number;
}

// ─── Floating geometry (same as landing page) ─────────────────────────────────

const SHAPES = [
  { w: 160, h: 1, top: "18%", left: "3%", dur: 20, delay: 0, dx: 10, dy: 5 },
  { w: 1, h: 100, top: "12%", left: "15%", dur: 26, delay: 3, dx: -6, dy: 12 },
  { w: 50, h: 50, top: "55%", left: "6%", dur: 30, delay: 6, dx: 8, dy: -7, hollow: true },
  { w: 200, h: 1, top: "75%", left: "10%", dur: 18, delay: 1, dx: -12, dy: 4 },
  { w: 1, h: 70, top: "40%", left: "90%", dur: 24, delay: 8, dx: 5, dy: -10 },
  { w: 80, h: 80, top: "25%", left: "87%", dur: 34, delay: 4, dx: -8, dy: 7, hollow: true },
  { w: 140, h: 1, top: "82%", left: "80%", dur: 16, delay: 2, dx: 7, dy: -5 },
  { w: 1, h: 130, top: "60%", left: "68%", dur: 28, delay: 9, dx: -5, dy: 9 },
  { w: 36, h: 36, top: "15%", left: "58%", dur: 32, delay: 5, dx: 12, dy: -8, hollow: true },
];

function FloatingShape({ w, h, top, left, dur, delay, dx, dy, hollow }: (typeof SHAPES)[0]) {
  const s: React.CSSProperties & Record<string, unknown> = {
    position: "absolute",
    top,
    left,
    width: w,
    height: h,
    opacity: 0.05,
    animation: `floatDrift ${dur}s ease-in-out ${delay}s infinite alternate`,
    "--dx": `${dx}px`,
    "--dy": `${dy}px`,
  };
  if (hollow) {
    s.border = "1px solid currentColor";
    s.background = "transparent";
  } else {
    s.background = "currentColor";
  }
  return <div style={s} aria-hidden="true" />;
}

// ─── Scroll-reveal (same cubic as landing page) ───────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({
  children,
  delay = 0,
  className,
  from = "bottom",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  from?: "bottom" | "left" | "right";
}) {
  const { ref, visible } = useReveal();
  const t = { bottom: "translateY(24px)", left: "translateX(-24px)", right: "translateX(24px)" };
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(0)" : t[from],
        transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Application row ──────────────────────────────────────────────────────────

function formatRel(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AppRow({ app, index }: { app: AppSummary; index: number }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const done = app.status === "completed";
  const failed = app.status === "failed" || app.status === "error";
  const cancelled = app.status === "cancelled";
  const running = app.status === "generating" || app.status === "pending";
  const retryable = failed || cancelled;

  const href = running ? `/generate/${app.id}` : `/applications/${app.id}`;

  return (
    <div
      role={!retryable ? "link" : undefined}
      tabIndex={!retryable ? 0 : undefined}
      onKeyDown={!retryable ? (e) => e.key === "Enter" && router.push(href) : undefined}
      onClick={!retryable ? () => router.push(href) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-b-0",
        "transition-colors duration-100",
        !retryable && "cursor-pointer hover:bg-muted/30",
        retryable && "opacity-55",
      )}
      style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
    >
      {/* Landing-style left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-0.5 transition-colors duration-300"
        style={{
          background: done
            ? `oklch(0.42 0.13 155 / ${hovered ? "70%" : "35%"})`
            : running
              ? `oklch(0.75 0.15 60 / ${hovered ? "80%" : "50%"})`
              : "transparent",
        }}
      />

      {/* Running pulse */}
      {running && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight truncate">{app.companyName}</p>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{app.roleTitle}</p>
      </div>

      {/* Right side */}
      <div className="shrink-0 flex items-center gap-2.5">
        {app.atsScore != null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-[11px] border px-2 py-0.5",
              app.atsScore >= 85
                ? "border-brand/30 text-brand bg-brand/5"
                : app.atsScore >= 70
                  ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                  : "border-border text-muted-foreground bg-muted/50",
            )}
          >
            <Zap className="h-2.5 w-2.5" />
            {Math.round(app.atsScore)}%
          </span>
        )}
        {(failed || cancelled) && (
          <span className="text-[10px] uppercase tracking-wide font-medium text-destructive">
            {failed ? "Failed" : "Cancelled"}
          </span>
        )}
        {retryable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/generate/${app.id}`);
            }}
            className="rt-btn-ghost min-h-7 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 hover:border-destructive/30"
          >
            Retry
          </button>
        )}
        {app.generationDurationMs && done && (
          <Tooltip content={`Built in ${Math.round(app.generationDurationMs / 1000)}s`}>
            <span className="hidden sm:block font-mono text-[10px] text-muted-foreground/30 tabular-nums">
              {Math.round(app.generationDurationMs / 1000)}s
            </span>
          </Tooltip>
        )}
        <span
          className="font-mono text-[10px] text-muted-foreground/40 whitespace-nowrap tabular-nums"
          suppressHydrationWarning
          title={new Date(app.createdAt).toLocaleString()}
        >
          {formatRel(app.createdAt)}
        </span>
        {done && (
          <ArrowRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/25 transition-all duration-150",
              hovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1",
            )}
          />
        )}
      </div>
    </div>
  );
}

// ─── JD input ────────────────────────────────────────────────────────────────

const LOADING_LABELS = [
  "Constellationizing role signals…",
  "Forloopifying the JD…",
  "Juxtaprizing your candidate fit…",
  "Brewing ATS-friendly magic…",
  "Polishing signal. Reducing noise…",
  "Summoning resume wizardry…",
];

function JdForm({ profile, atLimit }: { profile: ProfileContext | null; atLimit: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [market, setMarket] = useState<Market>("us");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pasteFlash, setPasteFlash] = useState(false);
  const [labelIdx, setLabelIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const profileReady = profile && profile.completenessScore >= 60;

  function validate(): string | null {
    const v = input.trim();
    if (mode === "url") {
      if (v.length < MIN_JD_URL_LENGTH) return "Enter a job posting URL.";
      try {
        const u = new URL(v);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw 0;
      } catch {
        return "Enter a valid URL starting with http:// or https://";
      }
    } else {
      if (v.length < MIN_JD_TEXT_LENGTH)
        return `Paste at least ${MIN_JD_TEXT_LENGTH} characters of the job description.`;
    }
    return null;
  }

  async function handleGenerate() {
    setError("");
    if (!profile || profile.completenessScore < 60) {
      setError("Complete your profile (60%+) to generate.");
      return;
    }
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    timerRef.current = setInterval(() => setLabelIdx((i) => (i + 1) % LOADING_LABELS.length), 2800);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: input.trim(), market: market.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Generation failed. Please try again.");
        return;
      }
      router.push(`/generate/${data.generation_id}`);
    } catch {
      setError("Check your internet connection and try again.");
    } finally {
      setLoading(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  useEffect(() => {
    const el = mode === "url" ? inputRef.current : textRef.current;
    const id = setTimeout(() => el?.focus(), 50);
    return () => clearTimeout(id);
  }, [mode]);

  return (
    <div className="border border-[#e5e2dd] rounded-2xl bg-white overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 border-b border-[#e5e2dd] px-5 py-3">
        {/* Market toggle */}
        <div className="flex items-center gap-0 border border-[#e5e2dd] rounded-lg overflow-hidden">
          {(["us", "uk"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMarket(m)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors",
                market === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "us" ? "US Resume" : "UK CV"}
            </button>
          ))}
        </div>
        {/* Mode icons */}
        <div className="flex items-center gap-0 border border-[#e5e2dd] rounded-lg overflow-hidden">
          <Tooltip content="Job posting URL">
            <button
              type="button"
              onClick={() => {
                setMode("url");
                setError("");
              }}
              className={cn(
                "p-2 transition-colors",
                mode === "url"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="URL mode"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="Paste job description text">
            <button
              type="button"
              onClick={() => {
                setMode("text");
                setError("");
              }}
              className={cn(
                "p-2 transition-colors",
                mode === "text"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Text mode"
            >
              <Type className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Input body */}
      <div className="p-6">
        {atLimit ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm font-medium">Generation limit reached</p>
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro for unlimited generations.
            </p>
            <a href="/#pricing" className="rt-btn inline-flex">
              Upgrade to Pro
            </a>
          </div>
        ) : mode === "url" ? (
          <div className="flex gap-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              onPaste={() => {
                setPasteFlash(true);
                setTimeout(() => setPasteFlash(false), 500);
              }}
              placeholder="https://jobs.lever.co/company/senior-engineer"
              disabled={loading}
              aria-label="Job posting URL"
              className={cn(
                "rt-input h-12 flex-1 px-4 font-mono text-sm transition-colors",
                pasteFlash && "border-brand",
              )}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !input.trim() || !profileReady}
              className="rt-btn h-12 px-5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!profileReady ? "Complete your profile first" : ""}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Generate</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <textarea
                ref={textRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError("");
                }}
                onPaste={() => {
                  setPasteFlash(true);
                  setTimeout(() => setPasteFlash(false), 500);
                }}
                placeholder="Paste the full job description here…"
                rows={8}
                maxLength={15000}
                disabled={loading}
                className={cn(
                  "rt-textarea w-full resize-none px-4 py-3 text-sm leading-relaxed transition-colors",
                  pasteFlash && "border-brand",
                )}
              />
              {input.length >= 12000 && (
                <span className="absolute bottom-3 right-3 font-mono text-[10px] text-amber-600">
                  {input.length.toLocaleString()}/15,000
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p
                className={cn(
                  "text-xs",
                  input.length > 0 && input.length < MIN_JD_TEXT_LENGTH
                    ? "text-amber-600"
                    : "text-muted-foreground/50",
                )}
              >
                {input.length === 0
                  ? `Min ${MIN_JD_TEXT_LENGTH} chars`
                  : input.length < MIN_JD_TEXT_LENGTH
                    ? `${MIN_JD_TEXT_LENGTH - input.length} more needed`
                    : "Ready"}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !input.trim() || !profileReady}
                className="rt-btn min-h-10 px-5 disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {LOADING_LABELS[labelIdx]}
                  </>
                ) : (
                  <>
                    Generate {market === "uk" ? "CV" : "Resume"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {!atLimit && mode === "url" && !loading && (
          <p className="mt-2 text-[11px] text-muted-foreground/40">
            Enter ↵ to generate · Works with Lever, Greenhouse, LinkedIn, Workday
          </p>
        )}
        {loading && mode === "url" && (
          <p className="mt-2 text-[11px] text-muted-foreground/60 animate-pulse">
            {LOADING_LABELS[labelIdx]}
          </p>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <p className="flex-1 text-xs text-destructive leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="text-[10px] text-destructive/50 hover:text-destructive shrink-0"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Apps list ────────────────────────────────────────────────────────────────

function AppsList({
  applications,
  totalCount,
  currentPage,
  pageSize,
}: { applications: AppSummary[]; totalCount: number; currentPage: number; pageSize: number }) {
  const router = useRouter();
  if (applications.length === 0) {
    return (
      <div className="border border-dashed border-border py-16 text-center">
        <div className="inline-flex h-9 w-9 items-center justify-center border border-border mb-4">
          <Plus className="h-4 w-4 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-medium mb-1">No applications yet</p>
        <p className="text-xs text-muted-foreground">
          Paste a job URL above to generate your first tailored package.
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="border border-border">
        {applications.map((app, i) => (
          <AppRow key={app.id} app={app} index={i} />
        ))}
      </div>
      {totalCount > pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalCount)} of{" "}
            {totalCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => router.push(currentPage <= 1 ? "?" : `?page=${currentPage - 1}`)}
              className="rt-btn-ghost min-h-8 px-2.5 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={(currentPage + 1) * pageSize >= totalCount}
              onClick={() => router.push(`?page=${currentPage + 1}`)}
              className="rt-btn-ghost min-h-8 px-2.5 disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick-tips strip (inverted — matches landing CTA section) ─────────────────

function TipsStrip() {
  const items = [
    {
      num: "01",
      title: "Use a URL first",
      desc: "Most job boards work. If blocked, paste the text instead.",
    },
    {
      num: "02",
      title: "Richer profile = better bullets",
      desc: "Add metrics to your experience entries - numbers are what the evidence mapper needs.",
    },
    {
      num: "03",
      title: "Check the Analysis sidebar",
      desc: "The ATS breakdown and evidence gaps tell you exactly what to strengthen.",
    },
  ];
  return (
    <div className="border-t border-border bg-foreground text-background relative overflow-hidden">
      {/* Floating shapes inverted */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
        {SHAPES.slice(0, 4).map((s, i) => (
          <FloatingShape key={i} {...s} />
        ))}
      </div>
      <div className="relative z-10 px-5 py-8">
        <p className="text-[10px] uppercase tracking-widest text-background/40 mb-5">
          How to get the best results
        </p>
        <div className="space-y-0">
          {items.map((item, i) => (
            <Reveal key={item.num} delay={i * 80}>
              <div className="flex gap-3 border-t border-background/10 py-3.5 first:border-t-0">
                <span className="font-mono text-[10px] text-background/30 mt-0.5 w-5 shrink-0">
                  {item.num}
                </span>
                <div>
                  <p className="text-xs font-medium text-background/90">{item.title}</p>
                  <p className="text-[11px] text-background/50 mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

const GREETINGS = [
  "Good to see you, {n}.",
  "Welcome back, {n}.",
  "Hey {n}.",
  "Ready when you are, {n}.",
  "Let's make this one count, {n}.",
  "You got this, {n}.",
  "Big day, {n}. Let's go.",
];

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[((h % arr.length) + arr.length) % arr.length] as T;
}

function DashboardInner(props: {
  userName: string | null;
  applications: AppSummary[];
  plan: "free" | "pro" | "max";
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  creditsUsedUsd: number;
  creditsLimitUsd: number;
  creditsRemainingUsd: number;
  currentPage: number;
  totalCount: number;
  averageAtsAllPages: number | null;
  pageSize: number;
  profile: ProfileContext | null;
}) {
  const {
    userName,
    applications,
    plan,
    creditsRemaining,
    creditsRemainingUsd,
    currentPage,
    totalCount,
    averageAtsAllPages,
    pageSize,
    profile,
  } = props;

  const router = useRouter();
  const [showKeys, setShowKeys] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?") {
        e.preventDefault();
        setShowKeys(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSaveProfile = useCallback(
    async (data: { fullName: string; currentTitle: string; location: string }) => {
      setSavingProfile(true);
      try {
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        setShowProfileEdit(false);
        router.refresh();
      } finally {
        setSavingProfile(false);
      }
    },
    [router],
  );

  const firstName = userName?.trim().split(" ")[0] ?? null;
  const greeting = useMemo(
    () => (firstName ? pick(GREETINGS, firstName).replace("{n}", firstName) : "Dashboard"),
    [firstName],
  );

  const completed = applications.filter((a) => a.status === "completed");
  const active = applications.filter((a) => a.status === "generating" || a.status === "pending");
  const atLimit = creditsRemainingUsd <= 0 && plan !== "pro";

  const avgDurationSec = useMemo(() => {
    const w = completed.filter((a) => a.generationDurationMs);
    return w.length
      ? Math.round(w.reduce((s, a) => s + (a.generationDurationMs ?? 0), 0) / w.length / 1000)
      : null;
  }, [completed]);

  return (
    <>
      {/* ── Keyframes (same as landing page) ── */}
      <style>{`
        @keyframes floatDrift {
          from { transform: translate(0,0); }
          to   { transform: translate(var(--dx),var(--dy)); }
        }
        @keyframes pulseBadge {
          0%,100% { opacity:1; }
          50%      { opacity:0.5; }
        }
        @keyframes dotPulse {
          0%,100% { opacity:0.3; transform:scale(0.8); }
          50%      { opacity:1;   transform:scale(1.2); }
        }
      `}</style>

      <div className="mx-auto max-w-5xl pb-16">
        {/* ── Hero area with floating shapes ── */}
        <div className="relative overflow-hidden -mx-8 md:-mx-16 lg:-mx-24 mb-10">
          {/* Floating geometry */}
          <div
            className="absolute inset-0 text-foreground pointer-events-none select-none"
            aria-hidden="true"
          >
            {SHAPES.map((s, i) => (
              <FloatingShape key={i} {...s} />
            ))}
          </div>

          {/* Horizontal rule (same as landing hero) */}
          <div
            className="absolute bottom-0 left-0 right-0 h-px bg-border origin-left"
            style={
              mounted
                ? { animation: "heroLineGrow 1s cubic-bezier(0.16,1,0.3,1) 0.1s both" }
                : undefined
            }
            aria-hidden="true"
          />

          <div
            className="relative z-10 px-8 md:px-16 lg:px-24 pt-12 pb-10"
            style={{
              opacity: mounted ? 1 : 0,
              transition: "opacity 0.4s ease 0.05s",
            }}
          >
            {/* rt-label chip */}
            <div
              style={{
                overflow: "hidden",
                opacity: mounted ? 1 : 0,
                transition: "opacity 0.4s ease 0.1s",
              }}
            >
              <p
                className="rt-label mb-4"
                style={{
                  transform: mounted ? "translateY(0)" : "translateY(100%)",
                  transition: "transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s",
                }}
              >
                AI resume architect
              </p>
            </div>

            {/* Main heading — same split-line reveal as landing */}
            {[greeting].map((line, i) => (
              <div key={i} style={{ overflow: "hidden" }}>
                <h1
                  className="text-3xl md:text-4xl font-normal leading-[1.1] tracking-tight"
                  style={{
                    display: "block",
                    transform: mounted ? "translateY(0)" : "translateY(110%)",
                    transition: `transform 0.75s cubic-bezier(0.16,1,0.3,1) ${0.2 + i * 0.1}s`,
                  }}
                >
                  {line}
                </h1>
              </div>
            ))}

            <p
              className="mt-3 text-sm text-muted-foreground"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(10px)",
                transition:
                  "opacity 0.6s ease 0.45s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.45s",
              }}
            >
              {totalCount > 0
                ? `${totalCount} application${totalCount === 1 ? "" : "s"} · ${completed.length} complete`
                : "Paste a job posting to generate your first tailored application package."}
            </p>
          </div>
        </div>

        {/* ── Active generation banner ── */}
        {active.length > 0 && (
          <div className="mb-6 flex items-center gap-3 border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-300 flex-1">
              {active.length === 1
                ? "1 generation in progress"
                : `${active.length} generations in progress`}
            </span>
            <Link
              href={`/generate/${active[0]?.id}`}
              className="text-xs text-amber-700 dark:text-amber-300 font-medium underline underline-offset-2 hover:opacity-80"
            >
              View →
            </Link>
          </div>
        )}

        {/* ── JD form — first, dominant, nothing competing ── */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.6s ease 0.35s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.35s",
          }}
        >
          <JdForm profile={profile} atLimit={atLimit} />
        </div>

        {/* ── Everything else — secondary, below the fold ── */}
        <div className="space-y-10 mt-12">
          {/* Applications list */}
          <Reveal delay={0}>
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="rt-label">Applications</p>
                {/* Compact meta: stats as plain text, not a boxed grid */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/40 font-mono">
                  {totalCount > 0 && <span>{totalCount} total</span>}
                  {averageAtsAllPages != null && <span>{averageAtsAllPages}% avg ATS</span>}
                  {avgDurationSec != null && <span>{avgDurationSec}s avg</span>}
                </div>
              </div>
              <AppsList
                applications={applications}
                totalCount={totalCount}
                currentPage={currentPage}
                pageSize={pageSize}
              />
            </div>
          </Reveal>

          {/* Tips strip (inverted) — only on empty state */}
          {totalCount === 0 && (
            <Reveal delay={80}>
              <TipsStrip />
            </Reveal>
          )}

          {/* Profile & Credit Cards */}
          {profile && (
            <Reveal delay={60}>
              <div className="grid grid-cols-2 gap-4">
                {/* Profile Card */}
                <div className="border border-[#e5e2dd] rounded-2xl bg-white p-6 hover:shadow-md transition-all">
                  <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center mb-4">
                    <User className="w-5 h-5 text-[#ff5555] icon-shine" />
                  </div>
                  <p className="font-serif text-2xl text-[#1a1a1a] mb-1 leading-tight">
                    {profile.completenessScore}%
                  </p>
                  <p className="text-sm font-medium text-[#1a1a1a]">Complete</p>
                  <div className="mt-3 h-2 bg-[#e5e2dd] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2d8a5e] rounded-full transition-all duration-700"
                      style={{ width: `${profile.completenessScore}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProfileEdit(true)}
                    className="text-xs text-brand hover:opacity-75 transition-opacity mt-3 block"
                  >
                    Edit profile →
                  </button>
                </div>

                {/* Credit Card */}
                <div className="border border-[#e5e2dd] rounded-2xl bg-white p-6 hover:shadow-md transition-all">
                  <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center mb-4">
                    {plan === "max" ? (
                      <Sparkles className="w-5 h-5 text-[#b84ed1] icon-shine" />
                    ) : plan === "pro" ? (
                      <Crown className="w-5 h-5 text-[#fbbf24] icon-shine" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-[#5fc3ff] icon-shine" />
                    )}
                  </div>
                  <p className="font-serif text-2xl text-[#1a1a1a] mb-1 leading-tight">
                    {creditsRemaining <= 0 ? "Depleted" : creditsRemaining}
                  </p>
                  <p className="text-sm font-medium text-[#1a1a1a]">
                    {plan === "max" ? "Max Plan" : plan === "pro" ? "Pro Plan" : "Credits remaining"}
                  </p>
                  {plan === "free" && creditsRemaining > 0 && (
                    <a
                      href="/#pricing"
                      className="text-xs text-brand hover:opacity-75 transition-opacity mt-3 inline-block"
                    >
                      Upgrade to Pro →
                    </a>
                  )}
                </div>
              </div>
            </Reveal>
          )}

          {/* Keyboard shortcuts hint */}
          <Reveal delay={70}>
            <div className="flex items-center justify-end gap-2 mt-6 text-[10px] text-muted-foreground/25">
              <kbd className="border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">
                ?
              </kbd>
              shortcuts
            </div>
          </Reveal>
        </div>
      </div>

      <KeyboardShortcutsModal isOpen={showKeys} onClose={() => setShowKeys(false)} />
      <ProfileEditModal
        isOpen={showProfileEdit}
        onClose={() => setShowProfileEdit(false)}
        profile={profile}
        onSave={handleSaveProfile}
        isSaving={savingProfile}
      />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-10 h-36 bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[1fr_272px]">
        <div className="space-y-6">
          <div className="h-16 bg-muted" />
          <div className="h-[180px] bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-28 bg-muted" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-36 bg-muted" />
          <div className="h-20 bg-muted" />
        </div>
      </div>
    </div>
  );
}

export function DashboardClient(props: {
  userName: string | null;
  applications: AppSummary[];
  plan: "free" | "pro" | "max";
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  creditsUsedUsd: number;
  creditsLimitUsd: number;
  creditsRemainingUsd: number;
  currentPage: number;
  totalCount: number;
  averageAtsAllPages: number | null;
  pageSize: number;
  profile: ProfileContext | null;
}) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardInner {...props} />
    </Suspense>
  );
}
