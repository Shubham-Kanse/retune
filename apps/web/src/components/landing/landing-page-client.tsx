"use client";

import { UserMenu } from "@/components/layout/user-menu";
import { LegalLinksBlock } from "@/components/ui/legal-links";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  FileText,
  Globe,
  Link2,
  Menu,
  Moon,
  Shield,
  Sun,
  Target,
  X,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const px = "px-8 md:px-16 lg:px-24";

// ── Floating geometry shapes ──────────────────────────────────────────────

const SHAPES = [
  { w: 180, h: 1, top: "22%", left: "5%", dur: 18, delay: 0, dx: 12, dy: 6 },
  { w: 1, h: 120, top: "15%", left: "18%", dur: 24, delay: 3, dx: -8, dy: 14 },
  { w: 60, h: 60, top: "60%", left: "8%", dur: 28, delay: 6, dx: 10, dy: -8, hollow: true },
  { w: 240, h: 1, top: "72%", left: "12%", dur: 20, delay: 1, dx: -14, dy: 4 },
  { w: 1, h: 80, top: "45%", left: "88%", dur: 22, delay: 8, dx: 6, dy: -12 },
  { w: 100, h: 100, top: "30%", left: "85%", dur: 32, delay: 4, dx: -10, dy: 8, hollow: true },
  { w: 160, h: 1, top: "80%", left: "78%", dur: 16, delay: 2, dx: 8, dy: -6 },
  { w: 1, h: 150, top: "65%", left: "65%", dur: 26, delay: 9, dx: -6, dy: 10 },
  { w: 40, h: 40, top: "18%", left: "55%", dur: 30, delay: 5, dx: 14, dy: -10, hollow: true },
];

function FloatingShape({ w, h, top, left, dur, delay, dx, dy, hollow }: (typeof SHAPES)[0]) {
  const style: React.CSSProperties = {
    position: "absolute",
    top,
    left,
    width: w,
    height: h,
    opacity: 0.06,
    animation: `floatDrift ${dur}s ease-in-out ${delay}s infinite alternate`,
  } as unknown as React.CSSProperties;
  (style as Record<string, unknown>)["--dx"] = `${dx}px`;
  (style as Record<string, unknown>)["--dy"] = `${dy}px`;
  if (hollow) {
    (style as Record<string, unknown>).border = "1px solid currentColor";
    (style as Record<string, unknown>).background = "transparent";
  } else {
    (style as Record<string, unknown>).background = "currentColor";
  }
  return <div style={style} aria-hidden="true" />;
}

// ── Scroll reveal hook ────────────────────────────────────────────────────

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
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

// ── Reveal wrapper ────────────────────────────────────────────────────────

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
  const translateMap = {
    bottom: "translateY(28px)",
    left: "translateX(-28px)",
    right: "translateX(28px)",
  };
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(0)" : translateMap[from],
        transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────

function useCountUp(target: number, dur = 1400, enabled = false) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [enabled, target, dur]);
  return display;
}

function AnimatedStat({
  value,
  suffix = "",
  dur = 1400,
}: { value: number; suffix?: string; dur?: number }) {
  const { ref, visible } = useReveal(0.3);
  const display = useCountUp(value, dur, visible);
  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

// ── Magnetic button ───────────────────────────────────────────────────────

function MagneticCta({
  href,
  children,
  className,
}: { href: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const handleMove = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.25;
    const dy = (e.clientY - cy) * 0.25;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);
  const handleLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  }, []);
  return (
    <Link
      ref={ref}
      href={href}
      className={cn("rt-btn-dark transition-transform duration-150", className)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
    </Link>
  );
}

// ── Feature card with scan line ───────────────────────────────────────────

// ── How it works — animated input→output demo ────────────────────────────

const DEMO_URL = "https://jobs.lever.co/stripe/senior-software-engineer";

const DEMO_OUTPUTS = [
  {
    name: "Resume.docx",
    detail: "ATS-safe · T1/T2/T3 keywords · Voice-matched bullets",
    icon: FileText,
    delay: 0,
  },
  {
    name: "CoverLetter.docx",
    detail: "Company-specific hook · Quantified value bridge",
    icon: FileText,
    delay: 700,
  },
  {
    name: "Strategy.pdf",
    detail: "Referral targets · Outreach templates · Interview prep",
    icon: Target,
    delay: 1400,
  },
];

function HowItWorksDemo() {
  const { ref, visible } = useReveal(0.2);

  // Phase 0: idle → 1: typing URL → 2: button lit → 3: generating → 4: outputs appearing
  const [phase, setPhase] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [btnFlash, setBtnFlash] = useState(false);
  const [visibleOutputs, setVisibleOutputs] = useState<number[]>([]);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    cancelRef.current = false;

    function schedule(fn: () => void, ms: number) {
      const id = setTimeout(() => {
        if (!cancelRef.current) fn();
      }, ms);
      return id;
    }

    function runCycle() {
      setPhase(1);
      setTypedChars(0);
      setVisibleOutputs([]);

      // Type the URL character by character
      let charIdx = 0;
      const typeInterval = setInterval(() => {
        if (cancelRef.current) {
          clearInterval(typeInterval);
          return;
        }
        charIdx++;
        setTypedChars(charIdx);
        if (charIdx >= DEMO_URL.length) {
          clearInterval(typeInterval);
          // Button lights up
          schedule(() => {
            setPhase(2);
            setBtnFlash(true);
            // Button "clicks" — generating state
            schedule(() => {
              setBtnFlash(false);
              setPhase(3);
              // Outputs appear one by one
              DEMO_OUTPUTS.forEach((o, i) => {
                schedule(() => {
                  setVisibleOutputs((prev) => [...prev, i]);
                  if (i === DEMO_OUTPUTS.length - 1) {
                    // All done — pause then reset
                    schedule(() => {
                      if (!cancelRef.current) runCycle();
                    }, 3200);
                  }
                }, 600 + o.delay);
              });
            }, 600);
          }, 300);
        }
      }, 28);
    }

    const startId = setTimeout(runCycle, 400);
    return () => {
      cancelRef.current = true;
      clearTimeout(startId);
    };
  }, [visible]);

  const displayedUrl = DEMO_URL.slice(0, typedChars);
  const isGenerating = phase === 3;

  return (
    <div ref={ref} className="grid md:grid-cols-[1fr_80px_1fr] items-center gap-6 md:gap-4">
      {/* ── Left: input ── */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0)" : "translateX(-24px)",
          transition:
            "opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <p className="rt-label mb-4">You provide</p>
        <div className="border border-border bg-background">
          <div className="border-b border-border px-4 py-3 flex items-center gap-2">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              Job posting URL
            </p>
          </div>
          <div className="p-4 space-y-3">
            {/* URL input */}
            <div className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2.5 min-h-[36px]">
              <span className="text-xs font-mono text-foreground flex-1 truncate">
                {displayedUrl || <span className="text-muted-foreground/50">https://...</span>}
                {phase >= 1 && typedChars < DEMO_URL.length && (
                  <span
                    className="inline-block w-px h-3 bg-foreground/80 ml-px align-middle"
                    style={{ animation: "dotPulse 0.9s ease-in-out infinite" }}
                  />
                )}
              </span>
            </div>
            {/* Generate button */}
            <div
              className="rt-btn-dark w-full justify-center text-xs pointer-events-none select-none transition-all duration-150"
              style={{
                opacity: phase < 1 ? 0.4 : 1,
                transform: btnFlash ? "scale(0.97)" : "scale(1)",
                background: btnFlash ? "oklch(0.35 0.13 155)" : undefined,
              }}
              aria-hidden="true"
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full border border-brand-foreground/40 border-t-brand-foreground"
                    style={{ animation: "spin 0.8s linear infinite" }}
                  />
                  Generating…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  Generate <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Middle: arrow ── */}
      <div
        className="flex flex-col items-center gap-2"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 0.6s ease 0.2s",
        }}
        aria-hidden="true"
      >
        <div className="w-px flex-1 bg-border min-h-[24px]" />
        <div
          className="w-7 h-7 border border-border flex items-center justify-center transition-colors duration-300"
          style={{ borderColor: isGenerating ? "oklch(0.42 0.13 155 / 60%)" : undefined }}
        >
          <Zap
            className="h-3.5 w-3.5 transition-colors duration-300"
            style={{ color: isGenerating ? "oklch(0.42 0.13 155)" : undefined }}
          />
        </div>
        <div className="w-px flex-1 bg-border min-h-[24px]" />
        <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
      </div>

      {/* ── Right: outputs ── */}
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0)" : "translateX(24px)",
          transition:
            "opacity 0.6s cubic-bezier(0.16,1,0.3,1) 0.15s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.15s",
        }}
      >
        <p className="rt-label mb-4">You receive</p>
        <div className="space-y-2">
          {DEMO_OUTPUTS.map((output, i) => {
            const shown = visibleOutputs.includes(i);
            return (
              <div
                key={output.name}
                className="border border-border bg-background p-3.5 flex items-start gap-3"
                style={{
                  opacity: shown ? 1 : 0.12,
                  transform: shown ? "translateX(0)" : "translateX(8px)",
                  transition: shown
                    ? "opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)"
                    : "opacity 0.3s ease, transform 0.3s ease",
                }}
              >
                <div className="mt-0.5 shrink-0 relative">
                  <output.icon className="h-4 w-4 text-muted-foreground" />
                  {shown && (
                    <span
                      className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center bg-[#b84ed1] rounded-full"
                      style={{ animation: "animate-in zoom-in-50 duration-200" }}
                    >
                      <Check className="h-2 w-2 text-white" />
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium font-mono">{output.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {output.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function FeatureCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="group relative flex gap-4 p-4 -mx-4 overflow-hidden cursor-default border border-transparent hover:border-border transition-colors duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Scan line */}
      <div
        className="absolute inset-y-0 w-px bg-foreground/15 pointer-events-none"
        style={{
          left: hovered ? "100%" : "-2px",
          transition: hovered ? "left 0.55s cubic-bezier(0.4,0,0.2,1)" : "none",
        }}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground mt-0.5 w-6 shrink-0 font-mono">{num}</span>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ── Full 8-phase animated pipeline ───────────────────────────────────────

const PIPELINE_PHASES = [
  { label: "Fetching job description", sub: "Extracting requirements & tone" },
  { label: "Company research", sub: "Culture signals, tech stack, hiring context" },
  { label: "Profiling your fit", sub: "Mapping experience to requirements" },
  { label: "Writing your resume", sub: "Tailored bullets, voice-matched" },
  { label: "ATS optimisation", sub: "Keyword coverage: targeting 85%+" },
  { label: "Quality gate", sub: "10 checks before shipping" },
  { label: "Cover letter", sub: "Company-specific hook & value bridge" },
  { label: "Application strategy", sub: "Referrals, outreach, interview prep" },
];

function AnimatedPipeline() {
  const { ref, visible } = useReveal(0.1);
  const [active, setActive] = useState(-1);
  const [done, setDone] = useState<number[]>([]);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    if (!visible) return;

    let stopped = false;
    const pending: ReturnType<typeof setTimeout>[] = [];

    function clearPending() {
      while (pending.length) clearTimeout(pending.pop());
    }

    function schedule(fn: () => void, ms: number) {
      const id = setTimeout(() => {
        if (stopped) return;
        fn();
      }, ms);
      pending.push(id);
    }

    function runCycle() {
      clearPending();
      setActive(-1);
      setDone([]);

      PIPELINE_PHASES.forEach((_, i) => {
        const activeAt = 600 + i * 1100;
        const doneAt = activeAt + 750;
        schedule(() => setActive(i), activeAt);
        schedule(() => setDone((d) => (d.includes(i) ? d : [...d, i])), doneAt);
      });

      const restartAt = 600 + PIPELINE_PHASES.length * 1100 + 2200;
      schedule(runCycle, restartAt);
    }

    runCycle();
    return () => {
      stopped = true;
      clearPending();
    };
  }, [visible]);

  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(t);
  }, []);

  return (
    <div ref={ref} className="w-full">
      <p className="mb-3 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <span>Pipeline running</span>
        <span
          className="inline-block w-1.5 h-3 bg-[#b84ed1]/80"
          style={{ opacity: blink ? 1 : 0, transition: "opacity 0.1s" }}
        />
      </p>
      <div className="space-y-0">
        {PIPELINE_PHASES.map((phase, index) => {
          const isDone = done.includes(index);
          const isActive = active === index && !isDone;
          return (
            <div
              key={phase.label}
              className="border-t border-border first:border-t-0"
              style={{
                transition: "opacity 0.35s, transform 0.35s",
                opacity: (active !== -1 && active >= index) || done.includes(index) ? 1 : 0.28,
                transform:
                  (active !== -1 && active >= index) || done.includes(index)
                    ? "translateX(0)"
                    : "translateX(-8px)",
              }}
            >
              <div
                className="flex items-start gap-3 py-2.5 pl-3 pr-2 transition-all duration-300"
                style={{
                  borderLeft: isActive ? "2px solid #b84ed1" : "2px solid transparent",
                }}
              >
                <span className="text-[10px] text-muted-foreground font-mono w-5 shrink-0 mt-0.5">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className="flex h-4 w-4 items-center justify-center text-[9px] shrink-0 mt-0.5 transition-colors duration-300"
                  style={{
                    background: isDone
                      ? "#b84ed1"
                      : isActive
                        ? "var(--foreground)"
                        : "transparent",
                    color: isDone || isActive ? "var(--background)" : "var(--muted-foreground)",
                    border: isDone || isActive ? "none" : "1px solid var(--border)",
                  }}
                >
                  {isDone ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-tight">{phase.label}</p>
                  <p
                    className="text-[10px] text-muted-foreground mt-0.5 leading-tight"
                    style={{
                      opacity: isActive || isDone ? 1 : 0,
                      transition: "opacity 0.4s ease 0.1s",
                    }}
                  >
                    {phase.sub}
                  </p>
                </div>
                {isActive && (
                  <span className="ml-auto flex gap-0.5 items-center mt-1 shrink-0">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                      className="w-1 h-1 rounded-full bg-[#b84ed1]/60"
                        style={{ animation: `dotPulse 1s ease-in-out ${d * 0.2}s infinite` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function LandingPageClient({
  session,
}: {
  session?: { userId: string; email: string; fullName: string | null } | null;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {/* ── Global animation keyframes ── */}
      <style>{`
        @keyframes floatDrift {
          from { transform: translate(0, 0); }
          to   { transform: translate(var(--dx), var(--dy)); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
        @keyframes heroLineGrow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes pulseBadge {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/85 border-b border-border"
        style={{
          opacity: heroVisible ? 1 : 0,
          transform: heroVisible ? "translateY(0)" : "translateY(-8px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <div className={`flex items-center justify-between h-[56px] ${px}`}>
          <Link href="/">
            <Logo variant="text" size="sm" />
          </Link>
          <div className="absolute left-1/2 transform -translate-x-1/2 hidden md:flex items-center gap-6">
            {["How it works", "Features", "Pricing"].map((label, i) => (
              <Link
                key={label}
                href={`/#${label.toLowerCase().replace(/ /g, "-")}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transition: `opacity 0.5s ease ${200 + i * 80}ms`,
                }}
              >
                {label}
              </Link>
            ))}
            {session && (
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => mounted && setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {mounted &&
                (resolvedTheme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                ))}
            </button>
            <div className="hidden border-l border-border pl-3 md:flex items-center gap-3">
              {session ? (
                <UserMenu userName={session.fullName} userEmail={session.email} />
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link href="/signup" className="rt-btn-dark text-sm">
                    Join
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 md:hidden">
              {!session && (
                <Link href="/signup" className="rt-btn-dark text-xs min-h-8 px-3">
                  Join
                </Link>
              )}
              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 top-[56px] z-40 bg-background/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 right-0 top-[56px] z-50 border-b border-border bg-background animate-in fade-in slide-in-from-top-2 duration-150 md:hidden">
              <div className="flex flex-col divide-y divide-border">
                {[
                  { href: "/#how-it-works", label: "How it works" },
                  { href: "/#features", label: "Features" },
                  { href: "/#pricing", label: "Pricing" },
                  ...(session ? [{ href: "/dashboard", label: "Dashboard" }] : []),
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className="px-8 py-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                ))}
                {!session && (
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="px-8 py-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </nav>

      <main id="main-content" tabIndex={-1}>
        {/* ── Section 1: Hero ── */}
        <section
          className={`pt-[112px] pb-20 ${px} relative overflow-hidden min-h-screen flex items-center`}
        >
          {/* Floating geometry */}
          <div
            className="absolute inset-0 text-foreground pointer-events-none select-none"
            aria-hidden="true"
          >
            {SHAPES.map((s, i) => (
              <FloatingShape key={i} {...s} />
            ))}
          </div>

          {/* Decorative horizontal rule */}
          <div
            className="absolute top-[111px] left-0 right-0 h-px bg-border origin-left"
            style={{
              animation: heroVisible
                ? "heroLineGrow 1.2s cubic-bezier(0.16,1,0.3,1) 0.1s both"
                : "none",
            }}
            aria-hidden="true"
          />

          <div className="mx-auto grid max-w-6xl w-full items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(460px,1.1fr)] relative z-10">
            {/* Left: headline + CTA */}
            <div>
              <div
                style={{
                  overflow: "hidden",
                  opacity: heroVisible ? 1 : 0,
                  transition: "opacity 0.4s ease 0.1s",
                }}
              >
                <p
                  className="rt-label mb-5"
                  style={{
                    transform: heroVisible ? "translateY(0)" : "translateY(100%)",
                    transition: "transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s",
                  }}
                >
                  AI resume architect
                </p>
              </div>

              {["Every application,", "your best application."].map((line, i) => (
                <div key={i} style={{ overflow: "hidden" }}>
                  <h1
                    className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal leading-[1.06] tracking-tight"
                    style={{
                      display: "block",
                      transform: heroVisible ? "translateY(0)" : "translateY(110%)",
                      transition: `transform 0.75s cubic-bezier(0.16,1,0.3,1) ${0.2 + i * 0.1}s`,
                    }}
                  >
                    {line}
                  </h1>
                </div>
              ))}

              <p
                className="mt-6 max-w-lg text-base text-muted-foreground leading-relaxed"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0)" : "translateY(16px)",
                  transition:
                    "opacity 0.7s ease 0.5s, transform 0.7s cubic-bezier(0.16,1,0.3,1) 0.5s",
                }}
              >
                Paste a job description. Get a tailored resume, cover letter, and application
                strategy in 2 minutes. Zero edits needed.
              </p>

              <div
                className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0)" : "translateY(12px)",
                  transition:
                    "opacity 0.6s ease 0.65s, transform 0.6s cubic-bezier(0.16,1,0.3,1) 0.65s",
                }}
              >
                {session ? (
                  <MagneticCta href="/dashboard">
                    Go to Dashboard <ArrowRight className="h-4 w-4" />
                  </MagneticCta>
                ) : (
                  <MagneticCta href="/signup">
                    Join <ArrowRight className="h-4 w-4" />
                  </MagneticCta>
                )}
                <p className="text-xs text-muted-foreground">
                  2 free generations · No credit card required
                </p>
              </div>
            </div>

            {/* Right: full 8-phase pipeline */}
            <div
              className="border border-border bg-background"
              aria-hidden="true"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? "translateX(0)" : "translateX(40px)",
                transition:
                  "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 0.35s, transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.35s",
              }}
            >
              <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    Live run
                  </p>
                  <p className="mt-0.5 text-sm font-medium">Senior Engineer · Vercel</p>
                </div>
                <span className="text-xs font-semibold text-[#7e22ce]">ATS 91%</span>
              </div>
              <div className="p-5">
                <AnimatedPipeline />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 2: Social proof bar ── */}
        <section className="border-t border-border bg-muted/30">
          <div className={`${px} py-4`}>
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
                {[
                  "2–5 min generation",
                  <>
                    <AnimatedStat value={85} suffix="%" />
                    {" ATS median"}
                  </>,
                  "18 cognitive specialists",
                  "0 edits needed",
                ].map((item, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i !== 0 && (
                      <span className="hidden sm:inline text-border select-none" aria-hidden="true">
                        ·
                      </span>
                    )}
                    <span className="font-normal">{item}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 3: The problem ── */}
        <section className={`border-t border-border py-24 ${px}`}>
          <div className="mx-auto max-w-5xl">
            <Reveal className="mb-14">
              <h2 className="text-3xl md:text-4xl font-normal">Job searching is broken.</h2>
            </Reveal>
            <div className="grid gap-px bg-border sm:grid-cols-3 mb-14">
              {[
                {
                  num: "250",
                  label: "Average applications per job opening",
                },
                {
                  num: "2%",
                  label: "Callback rate with a generic resume",
                },
                {
                  num: "4hrs",
                  label: "Time spent tailoring one application, manually",
                },
              ].map((stat, i) => (
                <Reveal key={stat.num} delay={i * 100}>
                  <div className="bg-background p-8">
                    <p className="text-5xl md:text-6xl font-normal tracking-tight text-foreground">
                      {stat.num}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-[200px]">
                      {stat.label}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={300}>
              <p className="text-xl md:text-2xl font-normal text-center text-muted-foreground max-w-2xl mx-auto leading-snug">
                Retuned is how serious job seekers get serious results.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── Section 4: How it works — animated demo ── */}
        <section id="how-it-works" className={`border-t border-border py-24 ${px}`}>
          <div className="mx-auto max-w-5xl">
            <Reveal className="mb-4">
              <h2 className="text-3xl md:text-4xl font-normal">One input. Complete package.</h2>
            </Reveal>
            <Reveal delay={80} className="mb-16">
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                Paste a job posting URL. Watch the pipeline run. Receive a submission-ready
                application package — resume, cover letter, and strategy — in under 2 minutes.
              </p>
            </Reveal>

            <HowItWorksDemo />
          </div>
        </section>

        {/* ── Section 5: Pipeline features ── */}
        <section id="features" className={`border-t border-border py-24 ${px}`}>
          <div className="mx-auto max-w-5xl">
            <Reveal className="mb-4">
              <h2 className="text-3xl md:text-4xl font-normal">Not just autocomplete.</h2>
            </Reveal>
            <Reveal delay={80} className="mb-14">
              <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
                A cognitive system. 18 specialist agents coordinate like a senior hiring expert
                thinks.
              </p>
            </Reveal>
            <div className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
              {[
                {
                  num: "01",
                  title: "JD Intelligence",
                  desc: "Extracts T1/T2/T3 keyword tiers, seniority signals, company tone, and implied requirements. Not just keyword matching.",
                },
                {
                  num: "02",
                  title: "Company Research",
                  desc: "Web-searches culture signals, recent news, tech stack, and hiring context. Your cover letter hook is grounded in reality.",
                },
                {
                  num: "03",
                  title: "Evidence Mapping",
                  desc: "Links every JD requirement to specific evidence from your profile. Prevents fabrication at the source.",
                },
                {
                  num: "04",
                  title: "Voice Preservation",
                  desc: "Fingerprints your writing style. Generated bullets match your vocabulary level, sentence length, and verb quality.",
                },
                {
                  num: "05",
                  title: "ATS Optimisation",
                  desc: "Scores keyword coverage. Auto-patches below 85% with surgical insertions that preserve voice authenticity.",
                },
                {
                  num: "06",
                  title: "Cognitive Quality Gate",
                  desc: "10 checks: banned phrases, date formats, section order, AI-detection audit. Refuses to ship if it can't do good work.",
                },
                {
                  num: "07",
                  title: "Recruiter Modelling",
                  desc: "Simulates how a recruiter reads your application. Surfaces the questions they'll ask and the gaps they'll notice.",
                },
                {
                  num: "08",
                  title: "Outcome Prediction",
                  desc: "Bayesian estimate of your interview probability. With a confidence interval. So you know what you're submitting.",
                },
              ].map((f, i) => (
                <Reveal key={f.num} delay={i * 50}>
                  <FeatureCard {...f} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 6: Output breakdown ── */}
        <section className={`border-t border-border py-24 ${px}`}>
          <div className="mx-auto max-w-5xl">
            <Reveal className="mb-14">
              <h2 className="text-3xl md:text-4xl font-normal">Everything in the package.</h2>
            </Reveal>
            <div className="grid gap-px bg-border md:grid-cols-3">
              {[
                {
                  title: "Resume",
                  icon: FileText,
                  items: [
                    "ATS-safe DOCX (no tables, no columns)",
                    "Tailored bullets from your actual experience",
                    "T1/T2/T3 keyword coverage report",
                    "Voice authenticity score",
                  ],
                },
                {
                  title: "Cover Letter",
                  icon: Globe,
                  items: [
                    "Company-specific opening hook",
                    "Quantified value bridge",
                    "Calibrated to JD tone (startup/enterprise/technical)",
                    "250–350 words, submission-ready",
                  ],
                },
                {
                  title: "Strategy",
                  icon: Target,
                  items: [
                    "Referral target queries for LinkedIn",
                    "Hiring manager outreach templates",
                    "STAR-method interview prep for this role",
                    "Application timeline: Day 1, 3, 7 follow-up",
                  ],
                },
              ].map((col, i) => (
                <Reveal key={col.title} delay={i * 100}>
                  <div
                    className="bg-background p-8 h-full"
                    style={{ borderTop: "2px solid #b84ed1" }}
                  >
                    <div className="flex items-center gap-2.5 mb-6">
                      <col.icon className="h-4 w-4 text-[#7e22ce] shrink-0" />
                      <h3 className="text-base font-medium">{col.title}</h3>
                    </div>
                    <ul className="space-y-3">
                      {col.items.map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#7e22ce]" />
                          <span className="text-sm text-muted-foreground leading-relaxed">
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 7: GDPR / Transparency ── */}
        <section className={`border-t border-border py-24 ${px}`}>
          <div className="mx-auto max-w-5xl">
            <div className="grid md:grid-cols-[1fr_auto] gap-12 items-start">
              <div>
                <Reveal>
                  <div className="flex items-center gap-2.5 mb-5">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <p className="rt-label">Transparency by default</p>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-normal mb-4">You own every decision.</h2>
                  <p className="text-base text-muted-foreground max-w-xl leading-relaxed mb-10">
                    Every generation produces a GDPR Article 22 audit packet. See exactly which
                    specialist made which decision, why, and how to contest it.
                  </p>
                </Reveal>
                <div className="grid sm:grid-cols-3 gap-4 items-stretch">
                  {[
                    {
                      title: "Full audit trail",
                      desc: "Every specialist logged with reasoning",
                    },
                    {
                      title: "Right to contest",
                      desc: "Built-in contest form on every result",
                    },
                    {
                      title: "Right to explanation",
                      desc: "Plain-language summary of every decision",
                    },
                  ].map((item, i) => (
                    <Reveal key={item.title} delay={i * 80} className="h-full">
                      <div className="border border-border p-5 h-full">
                        <p className="text-sm font-medium mb-1.5">{item.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
                <Reveal delay={240}>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Available on every application result via the audit packet viewer.
                  </p>
                </Reveal>
              </div>
              <Reveal from="right" className="hidden md:block">
                <div className="border border-border bg-background p-5 w-48">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4">
                    Audit packet
                  </p>
                  <div className="space-y-2">
                    {["JD Analysis", "Evidence Map", "ATS Score", "Voice Check", "Gate Pass"].map(
                      (item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2 text-[11px] text-muted-foreground"
                        >
                          <Check className="h-3 w-3 text-[#7e22ce] shrink-0" />
                          {item}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Section 8: Pricing ── */}
        <section id="pricing" className={`border-t border-border py-24 ${px}`}>
          <div className="mx-auto max-w-5xl">
            <Reveal className="mb-4">
              <h2 className="text-3xl md:text-4xl font-normal">Pricing</h2>
            </Reveal>
            <Reveal delay={80} className="mb-14">
              <p className="text-base text-muted-foreground">Start free. Scale when you need to.</p>
            </Reveal>
            <div className="grid md:grid-cols-2 gap-px bg-border">
              {[
                {
                  name: "Free",
                  price: "$0",
                  period: "",
                  desc: "Try it out",
                  features: [
                    "2 full generations",
                    "Resume DOCX + PDF",
                    "Cover letter included",
                    "Application strategy",
                    "ATS scoring report",
                  ],
                  cta: "Join",
                  href: "/signup",
                  popular: false,
                },
                {
                  name: "Pro",
                  price: "$19",
                  period: "/mo",
                  desc: "For active job seekers",
                  features: [
                    "Unlimited generations",
                    "Everything in Free",
                    "AI refinements per application",
                    "Priority generation queue",
                    "Email support",
                  ],
                  cta: "Get Pro",
                  href: "/signup",
                  popular: true,
                },
              ].map((plan, i) => (
                <Reveal key={plan.name} delay={i * 100}>
                  <div className="bg-background p-8 h-full flex flex-col">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <div className="flex items-center gap-2.5 mb-1">
                          <h3 className="text-base font-medium">{plan.name}</h3>
                          {plan.popular && (
                            <span
                              className="bg-[#e9d5ff] text-[#7e22ce] text-[10px] uppercase tracking-wider px-1.5 py-0.5 font-medium"
                              style={{ animation: "pulseBadge 2.5s ease-in-out infinite" }}
                            >
                              Most popular
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{plan.desc}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-normal">{plan.price}</span>
                        {plan.period && (
                          <span className="text-sm text-muted-foreground">{plan.period}</span>
                        )}
                      </div>
                    </div>
                    <ul className="space-y-2.5 mb-8 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#7e22ce]" />
                          <span className="text-sm text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <MagneticCta
                      href={plan.href}
                      className={cn(
                        "w-full justify-center",
                        !plan.popular && "rt-btn-ghost bg-transparent border border-border",
                      )}
                    >
                      {plan.cta}
                    </MagneticCta>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-5">
              No credit card required · Cancel anytime
            </p>
          </div>
        </section>

        {/* ── Section 9: CTA banner ── */}
        <section
          className={`border-t border-border py-24 ${px} bg-foreground text-background relative overflow-hidden`}
        >
          {/* Floating shapes — use currentColor so they invert correctly in dark mode */}
          <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
            {SHAPES.slice(0, 5).map((s, i) => (
              <FloatingShape key={i} {...s} />
            ))}
          </div>
          <div className="mx-auto max-w-3xl text-center relative z-10">
            <Reveal>
              <h2 className="text-3xl md:text-5xl font-normal mb-4 text-background">
                Start with your next application.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <p className="text-base mb-8" style={{ color: "oklch(0.7 0 0)" }}>
                2 free generations. No credit card.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <div className="flex items-center justify-center gap-4">
                {session ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 bg-background text-foreground text-sm font-medium px-6 py-2 hover:bg-background/90 active:opacity-80 transition-colors"
                  >
                    Go to Dashboard <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    href="/signup"
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 bg-background text-foreground text-sm font-medium px-6 py-2 hover:bg-background/90 active:opacity-80 transition-colors"
                  >
                    Join <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border">
        <div className={`py-16 ${px}`}>
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
              <div>
                <Logo variant="full" size="sm" className="mb-6" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Land interviews. Not rejections.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-4">Product</h3>
                <div className="space-y-2.5">
                  {["How it works", "Features", "Pricing"].map((l) => (
                    <Link
                      key={l}
                      href={`/#${l.toLowerCase().replace(/ /g, "-")}`}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors block"
                    >
                      {l}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-4">Account</h3>
                <div className="space-y-2.5">
                  {session ? (
                    <>
                      <Link
                        href="/dashboard"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors block"
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/profile"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors block"
                      >
                        Profile
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors block"
                      >
                        Sign in
                      </Link>
                      <Link
                        href="/signup"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors block"
                      >
                        Join
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-4">Legal</h3>
                <LegalLinksBlock linkClassName="text-sm text-muted-foreground hover:text-foreground transition-colors block" />
              </div>
            </div>
            <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Retuned. All rights reserved.
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full bg-[#b84ed1]"
                  style={{ animation: "dotPulse 2s ease-in-out infinite" }}
                />
                <span className="text-sm text-muted-foreground">All systems operational</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
