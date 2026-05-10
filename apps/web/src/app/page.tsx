"use client";

import {
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  MessageSquare,
  Scale,
  Shield,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { motion, useInView } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LegalLinks, LegalLinksBlock } from "@/components/ui/legal-links";

const ease = [0.16, 1, 0.3, 1] as const;

// Soft icon colours matching dashboard
const COLORS = {
  teal:   "#00d4d4",
  red:    "#ff5555",
  purple: "#b84ed1",
  blue:   "#5fc3ff",
  amber:  "#f59e0b",
  green:  "#16a34a",
  brand:  "#2d8a5e",
};

function RetunedLogoMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="15" width="2" height="2" fill="currentColor" />
      <rect x="3" y="13" width="2" height="2" fill="currentColor" />
      <rect x="3" y="11" width="2" height="2" fill="currentColor" />
      <rect x="3" y="9" width="2" height="2" fill="currentColor" />
      <rect x="3" y="7" width="2" height="2" fill="currentColor" />
      <rect x="3" y="5" width="2" height="2" fill="currentColor" />
      <rect x="5" y="3" width="2" height="2" fill="currentColor" />
      <rect x="7" y="3" width="2" height="2" fill="currentColor" />
      <rect x="9" y="3" width="2" height="2" fill="currentColor" />
      <rect x="11" y="5" width="2" height="2" fill="currentColor" />
      <rect x="11" y="7" width="2" height="2" fill="currentColor" />
      <rect x="11" y="15" width="2" height="2" fill="currentColor" />
      <rect x="9" y="13" width="2" height="2" fill="currentColor" />
      <rect x="13" y="13" width="2" height="2" fill="currentColor" />
      <rect x="7" y="11" width="2" height="2" fill="currentColor" />
      <rect x="15" y="11" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300"
      style={{ width: "min(90vw, 720px)" }}
    >
      <div
        className={`rt-nav-pill flex items-center justify-between px-3 py-2 transition-shadow duration-300 ${scrolled ? "shadow-lg" : ""}`}
      >
        <Link href="/" className="flex items-center gap-2 px-2 text-[#2d8a5e]">
          <RetunedLogoMark size={18} />
          <span className="text-sm font-semibold text-[#1a1a1a]">Retuned</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {[
            { label: "How it works", href: "#how-it-works" },
            { label: "Features", href: "#features" },
            { label: "Pricing", href: "#pricing" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="px-3 py-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] rounded-full hover:bg-[#f0ede8] transition-all"
            >
              {item.label}
            </a>
          ))}
        </div>

        <Link href="/signup" className="rt-btn text-xs px-4 py-2">
          Go to app
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="pt-32 pb-16 px-6 md:px-12">
      <div className="max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="inline-flex items-center gap-2 bg-white border border-[#e5e2dd] rounded-full px-4 py-1.5 mb-10 shadow-sm rt-float"
        >
          <span className="w-2 h-2 rounded-full rt-pulse" style={{ background: COLORS.teal }} />
          <span className="text-xs text-[#6b6b6b]">Replaces the $300/hr resume coach</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          className="font-serif text-5xl md:text-7xl lg:text-8xl font-normal leading-[0.95] tracking-tight text-[#1a1a1a]"
        >
          Your AI resume architect
          <br />
          <span className="italic text-[#2d8a5e]">for every role.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45, ease }}
          className="mt-8 text-base md:text-lg text-[#6b6b6b] max-w-xl mx-auto leading-relaxed"
        >
          Paste a job description. Get a tailored resume, cover letter, and application strategy —
          with provenance for every claim. If it can&apos;t do the work credibly, it refuses.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link href="/signup" className="rt-btn text-base px-8 py-3.5">
            Start generating
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#how-it-works" className="rt-btn-ghost text-sm px-6 py-3">
            See how it works
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 flex items-center justify-center gap-6 text-sm text-[#6b6b6b]"
        >
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" style={{ color: COLORS.teal }} />
            Under 60 seconds
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" style={{ color: COLORS.blue }} />
            GDPR compliant
          </span>
          <span className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" style={{ color: COLORS.purple }} />
            Zero fabrication
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function LiveDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setTick((t) => t + 1), 9000);
    return () => clearInterval(t);
  }, [inView]);

  return (
    <section className="py-16 px-6 md:px-12" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
          className="grid md:grid-cols-3 gap-4"
        >
          {/* Card 1 — Paste */}
          <div className="bg-white border border-[#e5e2dd] rounded-2xl p-5 shadow-sm rt-card-lift">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9a9690] mb-1">01 — Paste</p>
            <p className="font-serif text-base text-[#1a1a1a] mb-4">Drop in the job URL.</p>
            <PastePhase key={`p-${tick}`} />
          </div>

          {/* Card 2 — Pipeline */}
          <div className="bg-white border border-[#e5e2dd] rounded-2xl p-5 shadow-sm rt-card-lift">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9a9690] mb-1">02 — Generate</p>
            <p className="font-serif text-base text-[#1a1a1a] mb-4">Pipeline runs in seconds.</p>
            <PipelinePhase key={`pl-${tick}`} compact startDelay={2800} />
          </div>

          {/* Card 3 — Document */}
          <div className="bg-white border border-[#e5e2dd] rounded-2xl p-5 shadow-sm rt-card-lift">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#9a9690] mb-1">03 — Download</p>
            <p className="font-serif text-base text-[#1a1a1a] mb-4">Package ready to ship.</p>
            <DocumentPhase key={`d-${tick}`} compact startDelay={6500} />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const URL_TEXT = "stripe.com/jobs/backend-engineer-infra";

function PastePhase() {
  const [pasted, setPasted] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setPasted(true), 800);
    const t2 = setTimeout(() => setClicking(true), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const b = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(b);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-[#faf8f5] border border-[#e5e2dd] rounded-lg px-2.5 py-2">
        <div className="w-2 h-2 rounded-full bg-[#e5e2dd] shrink-0" />
        <span className="flex-1 font-mono text-[11px] truncate">
          {pasted
            ? <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="text-[#1a1a1a]">{URL_TEXT}</motion.span>
            : <span className="text-[#ccc8c3]">Paste job URL…<span className="inline-block w-[2px] h-[10px] bg-[#9a9690] ml-px align-middle" style={{ opacity: cursorVisible ? 1 : 0 }} /></span>
          }
        </span>
      </div>
      <div className="relative">
        <motion.button
          type="button"
          animate={clicking ? { scale: 0.95, opacity: 0.85 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.12 }}
          className="w-full flex items-center justify-center gap-1.5 text-white text-[11px] font-medium py-2.5 rounded-xl"
          style={{ background: pasted ? "#2d8a5e" : "#ccc8c3" }}
        >
          <Sparkles className="w-3 h-3" />
          Generate package
        </motion.button>
        {pasted && !clicking && (
          <motion.div
            initial={{ opacity: 0, x: 16, y: 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute pointer-events-none"
            style={{ right: 24, bottom: -8 }}
          >
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
              <path d="M1 1L1 14L4.5 10.5L7 16L9 15L6.5 9.5L10.5 9.5Z" fill="#1a1a1a" stroke="white" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  );
}

const PIPELINE_STEPS = [
  { label: "Job description read", specialist: "jd_span_extractor", color: COLORS.teal },
  { label: "Profile understood", specialist: "voice_fingerprint_extractor", color: COLORS.purple },
  { label: "Evidence matched", specialist: "evidence_solver", color: COLORS.amber },
  { label: "Resume written", specialist: "sequential_bullet_composer", color: COLORS.blue },
  { label: "Quality approved", specialist: "refuse_or_ship_gate", color: COLORS.green },
];

function PipelinePhase({ compact, startDelay = 0 }: { compact?: boolean; startDelay?: number }) {
  const [activeIdx, setActiveIdx] = useState(-1); // -1 = waiting
  const [doneIdxs, setDoneIdxs] = useState<number[]>([]);

  useEffect(() => {
    // Start after delay, then advance each step
    const start = setTimeout(() => setActiveIdx(0), startDelay);
    return () => clearTimeout(start);
  }, [startDelay]);

  useEffect(() => {
    if (activeIdx < 0 || activeIdx >= PIPELINE_STEPS.length) return;
    const t = setTimeout(() => {
      setDoneIdxs((d) => [...d, activeIdx]);
      setActiveIdx((i) => i + 1);
    }, 700);
    return () => clearTimeout(t);
  }, [activeIdx]);

  const started = activeIdx >= 0;
  const isComplete = activeIdx >= PIPELINE_STEPS.length;

  if (!started) return (
    <div className="space-y-1.5">
      {PIPELINE_STEPS.map((step) => (
        <div key={step.label} className="flex items-center gap-2 px-3 py-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#e5e2dd]" />
          <span className="text-[11px] text-[#ccc8c3]">{step.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={compact ? "" : "p-6"}>
      {!compact && (
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-[#f3e8ff] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" style={{ color: COLORS.purple, animation: !isComplete ? "iconShine 1.2s ease-in-out infinite" : undefined }} />
          </div>
          <span className="text-xs font-medium text-[#1a1a1a]">{isComplete ? "Package ready" : "Building your package"}</span>
          <span className="ml-auto text-[10px]" style={{ color: isComplete ? COLORS.green : COLORS.amber }}>{isComplete ? "complete" : "running"}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {PIPELINE_STEPS.map((step, i) => {
          const isDone = doneIdxs.includes(i);
          const isActive = i === activeIdx;
          return (
            <div key={step.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 ${isDone ? "border-[#e5e2dd] bg-white" : isActive ? "border-[#e5d6f5] bg-white shadow-sm" : "border-transparent"}`}>
              {isDone ? (
                <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: COLORS.green }} />
              ) : isActive ? (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: step.color, animation: "iconShine 1.2s ease-in-out infinite" }} />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#e5e2dd]" />
              )}
              <span className={`text-[11px] ${isDone || isActive ? "text-[#1a1a1a]" : "text-[#ccc8c3]"}`}>{step.label}</span>
            </div>
          );
        })}
      </div>

      {isComplete && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-1.5 bg-[#d4f5e0] rounded-lg px-3 py-2">
          <Check className="w-3 h-3" style={{ color: COLORS.green }} />
          <span className="text-[11px] font-medium" style={{ color: COLORS.brand }}>SHIP — quality gate passed</span>
        </motion.div>
      )}
    </div>
  );
}

const DOC_LINES = [
  { w: "w-32", delay: 0 },
  { w: "w-full", delay: 0.1 },
  { w: "w-5/6", delay: 0.2 },
  { w: "w-full", delay: 0.3 },
  { w: "w-4/5", delay: 0.4 },
  { w: "w-full", delay: 0.5 },
  { w: "w-3/4", delay: 0.6 },
  { w: "w-full", delay: 0.7 },
  { w: "w-5/6", delay: 0.8 },
  { w: "w-2/3", delay: 0.9 },
];

function DocumentPhase({ compact, startDelay = 0 }: { compact?: boolean; startDelay?: number }) {
  const [started, setStarted] = useState(startDelay === 0);

  useEffect(() => {
    if (startDelay === 0) return;
    const t = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay]);

  if (!started) return (
    <div className="bg-[#faf8f5] border border-[#e5e2dd] rounded-xl p-3 space-y-2">
      {[28, 36, 20, "full", "5/6", "4/5"].map((w, i) => (
        <div key={i} className={`h-1.5 bg-[#f0ede8] rounded w-${w}`} />
      ))}
    </div>
  );
  return (
    <div>
      <div className="bg-[#faf8f5] border border-[#e5e2dd] rounded-xl p-3 space-y-2">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0 }} className="h-3 bg-[#1a1a1a] rounded w-28" />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="h-2 bg-[#9a9690] rounded w-36" />
        <div className="pt-1 border-t border-[#e5e2dd]" />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="h-2 rounded w-20" style={{ background: COLORS.brand }} />
        {DOC_LINES.slice(0, 6).map((line, i) => (
          <motion.div key={i} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ duration: 0.2, delay: 0.3 + i * 0.08, ease: "easeOut" }} style={{ transformOrigin: "left" }} className={`h-1.5 bg-[#e5e2dd] rounded ${line.w}`} />
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }} className="mt-3 flex gap-2">
        <div className="flex items-center gap-1 bg-[#f0ede8] border border-[#e5e2dd] rounded-lg px-2.5 py-1.5 text-[11px] text-[#1a1a1a] font-medium">
          <FileText className="w-3 h-3" style={{ color: COLORS.teal }} />
          Resume.docx
        </div>
        <div className="flex items-center gap-1 bg-[#f0ede8] border border-[#e5e2dd] rounded-lg px-2.5 py-1.5 text-[11px] text-[#1a1a1a] font-medium">
          <FileText className="w-3 h-3" style={{ color: COLORS.purple }} />
          Cover Letter.docx
        </div>
      </motion.div>
    </div>
  );
}

function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const steps = [
    {
      num: "01. Upload",
      icon: <Briefcase className="w-4 h-4" style={{ color: COLORS.amber }} />,
      iconBg: "#fef3c7",
      title: (
        <>
          Upload your resume — the system extracts your{" "}
          <span className="inline-flex items-center gap-1 bg-[#fed7aa] rounded px-1.5 py-0.5 text-[#9a3412]">
            voice fingerprint
          </span>{" "}
          and evidence automatically.
        </>
      ),
    },
    {
      num: "02. Paste",
      icon: <FileText className="w-4 h-4" style={{ color: COLORS.teal }} />,
      iconBg: "#ccfbf1",
      title: (
        <>
          Paste the{" "}
          <span className="inline-flex items-center gap-1 bg-[#d4f5e0] rounded px-1.5 py-0.5 text-[#2d8a5e]">
            job description
          </span>{" "}
          — the cognitive system maps every requirement to your real experience.
        </>
      ),
    },
    {
      num: "03. Generate",
      icon: <Sparkles className="w-4 h-4" style={{ color: COLORS.purple }} />,
      iconBg: "#f3e8ff",
      title: (
        <>
          18 specialists{" "}
          <span className="inline-flex items-center gap-1 bg-[#fde68a] rounded px-1.5 py-0.5 text-[#92400e]">
            <Sparkles className="w-3.5 h-3.5" />
            produce
          </span>{" "}
          your package — resume, cover letter, strategy, and GDPR audit trail.
        </>
      ),
    },
    {
      num: "04. Ship or refuse",
      icon: <Check className="w-4 h-4" style={{ color: COLORS.green }} />,
      iconBg: "#dcfce7",
      title: (
        <>
          The quality gate either{" "}
          <span className="inline-flex items-center gap-1 bg-[#d4f5e0] rounded px-1.5 py-0.5 text-[#2d8a5e]">
            ships
          </span>{" "}
          or explains honestly why it can&apos;t do the work credibly.
        </>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 md:px-12" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4">
          <span className="text-xs text-[#6b6b6b]">The cognitive cycle</span>
        </div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease }}
          className="font-serif text-4xl md:text-5xl lg:text-6xl font-normal text-center leading-[1.1] text-[#1a1a1a] mb-16"
        >
          A senior coach thinks.
          <br />
          The system does it in 60 seconds.
        </motion.h2>

        <div className="grid md:grid-cols-2 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease }}
              className="bg-white border border-[#e5e2dd] rounded-2xl p-8 shadow-sm rt-card-lift"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: step.iconBg }}>
                  {step.icon}
                </div>
                <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-[#6b6b6b]">
                  {step.num}
                </span>
              </div>
              <h3 className="font-serif text-2xl font-normal leading-snug text-[#1a1a1a]">
                {step.title}
              </h3>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const features = [
    {
      icon: <Target className="w-4 h-4" style={{ color: COLORS.purple }} />,
      iconBg: "#f3e8ff",
      title: "Zero fabrication.",
      desc: "Every bullet has provenance — traced back to your actual experience. The system refuses to ship claims it can't verify.",
    },
    {
      icon: <Shield className="w-4 h-4" style={{ color: COLORS.blue }} />,
      iconBg: "#e0f2fe",
      title: "GDPR Article 22 audit.",
      desc: "Every decision logged. Every specialist traced. A full audit packet you can read, contest, or replay end-to-end.",
    },
    {
      icon: <Sparkles className="w-4 h-4" style={{ color: COLORS.teal }} />,
      iconBg: "#ccfbf1",
      title: "Voice preservation.",
      desc: "Your writing style is fingerprinted. Generated bullets match your vocabulary, sentence length, and verb quality — not generic AI tone.",
    },
  ];

  return (
    <section id="features" className="py-24 px-6 md:px-12" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4">
          <span className="text-xs text-[#6b6b6b]">What makes it different</span>
        </div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease }}
          className="font-serif text-4xl md:text-5xl font-normal text-center leading-[1.1] text-[#1a1a1a] mb-4"
        >
          Not autocomplete. A cognitive system.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="text-center text-[#6b6b6b] text-base mb-14 max-w-lg mx-auto"
        >
          18 specialists coordinate like a senior hiring expert thinks — comprehension, strategy,
          production, critique, decision.
        </motion.p>

        <div className="grid md:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease }}
              className="rt-feature-card"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6" style={{ background: f.iconBg }}>
                {f.icon}
              </div>
              <h3 className="font-serif text-xl font-normal text-[#1a1a1a] mb-3">{f.title}</h3>
              <p className="text-sm text-[#6b6b6b] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Outputs() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  const outputs = [
    {
      icon: <FileText className="w-4 h-4" style={{ color: COLORS.teal }} />,
      iconBg: "#ccfbf1",
      title: "Tailored Resume",
      items: [
        "DOCX + PDF, ATS-safe (no tables, no columns)",
        "Every bullet has provenance to your real evidence",
        "T1/T2/T3 keyword coverage scored and patched",
        "Voice-matched to your natural writing style",
      ],
    },
    {
      icon: <Zap className="w-4 h-4" style={{ color: COLORS.amber }} />,
      iconBg: "#fef3c7",
      title: "Cover Letter",
      items: [
        "Company-specific opening hook",
        "Calibrated to JD tone (startup vs enterprise)",
        "Quantified value bridge from your experience",
        "250–350 words, submission-ready",
      ],
    },
    {
      icon: <Scale className="w-4 h-4" style={{ color: COLORS.blue }} />,
      iconBg: "#e0f2fe",
      title: "Audit + Strategy",
      items: [
        "GDPR Article 22 audit packet (every decision traced)",
        "Callback probability with confidence interval",
        "Recruiter outreach templates + referral routes",
        "Right to contest every automated decision",
      ],
    },
  ];

  return (
    <section className="py-24 px-6 md:px-12" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease }}
          className="font-serif text-4xl md:text-5xl font-normal text-center leading-[1.1] text-[#1a1a1a] mb-14"
        >
          Everything in the package.
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-5">
          {outputs.map((col, i) => (
            <motion.div
              key={col.title}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease }}
              className="bg-white border border-[#e5e2dd] rounded-2xl p-6 shadow-sm rt-card-lift"
            >
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: col.iconBg }}>
                  {col.icon}
                </div>
                <h3 className="text-base font-medium text-[#1a1a1a]">{col.title}</h3>
              </div>
              <ul className="space-y-2.5">
                {col.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#2d8a5e]" />
                    <span className="text-sm text-[#6b6b6b] leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Differentiator() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="py-24 px-6 md:px-12" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease }}
            >
              <span className="text-xs text-[#6b6b6b]">Why not ChatGPT?</span>
              <h2 className="font-serif text-4xl md:text-5xl font-normal leading-[1.1] text-[#1a1a1a] mt-4">
                ChatGPT generates text.
                <br />
                Retuned thinks.
              </h2>
              <p className="text-[#6b6b6b] text-base mt-6 leading-relaxed max-w-md">
                A deterministic cognitive pipeline with 18 specialists, quality gates, and a refuse
                mechanism. It won&apos;t ship something it can&apos;t stand behind.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3, ease }}
              className="mt-10 grid grid-cols-3 gap-6"
            >
              {[
                { v: "≤ 60s", l: "Per generation" },
                { v: "≥ 35%", l: "Target callback rate" },
                { v: "$0.005", l: "Cost per ship" },
              ].map((stat) => (
                <div key={stat.l}>
                  <p className="font-serif text-2xl font-normal text-[#1a1a1a]">{stat.v}</p>
                  <p className="text-xs text-[#6b6b6b] mt-1">{stat.l}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease }}
            className="bg-white border border-[#e5e2dd] rounded-2xl p-6 shadow-sm"
          >
            <div className="flex gap-2 mb-4">
              <span className="text-xs bg-[#f0ede8] text-[#6b6b6b] px-3 py-1.5 rounded-full">
                ChatGPT
              </span>
              <span className="text-xs bg-[#2d8a5e] text-white px-3 py-1.5 rounded-full">
                Retuned
              </span>
            </div>
            <div className="space-y-3">
              {[
                { text: "Provenance for every claim", color: COLORS.teal },
                { text: "Refuses when quality is low", color: COLORS.red },
                { text: "Voice-matched to your style", color: COLORS.purple },
                { text: "GDPR audit trail included", color: COLORS.blue },
                { text: "Calibrated callback prediction", color: COLORS.amber },
              ].map((item, i) => (
                <div
                  key={item.text}
                  className="flex items-center justify-between bg-[#f8fffe] border border-[#e5e2dd] rounded-full px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: item.color }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-medium text-[#1a1a1a]">{item.text}</span>
                  </div>
                  <Check className="w-4 h-4" style={{ color: item.color }} />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="pricing" className="py-24 px-6 md:px-12" ref={ref}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-4">
          <span className="text-xs text-[#6b6b6b]">Pricing</span>
        </div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease }}
          className="font-serif text-4xl md:text-5xl font-normal text-center leading-[1.1] text-[#1a1a1a] mb-4"
        >
          Simple pricing. Real output.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="text-center text-[#6b6b6b] text-base mb-14"
        >
          Try with 2 generations. Upgrade when you&apos;re serious about every application.
        </motion.p>

        <div className="grid md:grid-cols-2 gap-5">
          {[
            {
              name: "Starter",
              price: "$0",
              period: "",
              desc: "See what the system produces",
              features: [
                "2 full generations",
                "Resume DOCX + PDF",
                "Cover letter + strategy",
                "GDPR audit packet",
                "ATS scoring report",
              ],
              cta: "Get started",
              href: "/signup",
              highlighted: false,
            },
            {
              name: "Pro",
              price: "$19",
              period: "/mo",
              desc: "For active job seekers",
              features: [
                "Unlimited generations",
                "Everything in Starter",
                "AI refinements per application",
                "Outcome tracking + calibration",
                "Priority generation queue",
              ],
              cta: "Get Pro",
              href: "/signup",
              highlighted: true,
            },
          ].map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease }}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlighted
                  ? "bg-[#2d8a5e] text-white"
                  : "bg-white border border-[#e5e2dd] shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3
                    className={`text-base font-medium ${plan.highlighted ? "text-white" : "text-[#1a1a1a]"}`}
                  >
                    {plan.name}
                  </h3>
                  <p
                    className={`text-xs mt-1 ${plan.highlighted ? "text-white/60" : "text-[#6b6b6b]"}`}
                  >
                    {plan.desc}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-3xl font-serif ${plan.highlighted ? "text-white" : "text-[#1a1a1a]"}`}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      className={`text-sm ${plan.highlighted ? "text-white/60" : "text-[#6b6b6b]"}`}
                    >
                      {plan.period}
                    </span>
                  )}
                </div>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${plan.highlighted ? "text-[#86efac]" : "text-[#2d8a5e]"}`}
                    />
                    <span
                      className={`text-sm ${plan.highlighted ? "text-white/80" : "text-[#6b6b6b]"}`}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`inline-flex items-center justify-center gap-2 w-full py-3 rounded-full text-sm font-medium transition-all ${
                  plan.highlighted
                    ? "bg-white text-[#2d8a5e] hover:bg-white/90"
                    : "bg-[#2d8a5e] text-white hover:bg-[#236e4a]"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="py-24 overflow-hidden" ref={ref}>
      <div className="rt-dark-section rounded-3xl mx-4 md:mx-8 p-12 md:p-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-4">
            <span className="text-xs text-white/50">The promise</span>
          </div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease }}
            className="font-serif text-4xl md:text-5xl font-normal text-center text-white leading-[1.1] mb-8"
          >
            A $300/hr coach,
            <br />
            at machine speed.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1, ease }}
            className="text-center text-white/60 text-base max-w-xl mx-auto mb-14"
          >
            Retuned thinks about your application the way a senior coach + recruiter + hiring
            manager would — then decides honestly whether the output is good enough to ship.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                stat: "≤ 60s",
                label: "Generation time",
                desc: "Full cognitive cycle — comprehension through decision",
              },
              {
                stat: "≥ 92%",
                label: "Provenance coverage",
                desc: "Every bullet traced to real evidence from your profile",
              },
              {
                stat: "≤ 15%",
                label: "Refuse rate",
                desc: "The system explains honestly when it can't do the work credibly",
              },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease }}
                className="text-center"
              >
                <p className="font-serif text-4xl text-white mb-2">{item.stat}</p>
                <p className="text-sm font-medium text-white/80 mb-1">{item.label}</p>
                <p className="text-xs text-white/50">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="py-24 px-6 md:px-12" ref={ref}>
      <div className="max-w-3xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease }}
          className="font-serif text-4xl md:text-5xl font-normal leading-[1.1] text-[#1a1a1a] mb-6"
        >
          Your next application,
          <br />
          architect-grade.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="text-[#6b6b6b] text-base mb-8 max-w-md mx-auto"
        >
          2 generations to try. See how a cognitive system handles your next job application —
          provenance, quality gates, and all.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2, ease }}
        >
          <Link href="/signup" className="rt-btn text-base px-8 py-3.5">
            Start generating
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function MintBar() {
  return <div className="rt-mint-bar w-full" />;
}

function Footer() {
  return (
    <footer className="rt-dark-section">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-16">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-12 mb-16">
          <div>
            <div className="flex items-center gap-2 mb-4 text-white">
              <RetunedLogoMark size={18} />
              <span className="text-base font-semibold">Retuned</span>
            </div>
            <p className="text-sm text-white/60 max-w-xs leading-relaxed mt-4">
              The multi-mind cognitive system that replaces the $300/hr resume coach. Ships when it
              can do the work. Refuses when it can&apos;t.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 mt-6 bg-white text-[#2d8a5e] text-sm font-medium px-5 py-2.5 rounded-full hover:bg-white/90 transition-colors"
            >
              Start generating
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/40 mb-4">
              Product
            </h4>
            <div className="space-y-3">
              {["How it works", "Features", "Pricing"].map((l) => (
                <a
                  key={l}
                  href={`#${l.toLowerCase().replace(/ /g, "-")}`}
                  className="text-sm text-white/70 hover:text-white transition-colors block"
                >
                  {l}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/40 mb-4">
              Legal
            </h4>
            <div className="space-y-3">
              <LegalLinksBlock />
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/40 mb-4">
              Account
            </h4>
            <div className="space-y-3">
              <Link
                href="/login"
                className="text-sm text-white/70 hover:text-white transition-colors block"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm text-white/70 hover:text-white transition-colors block"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden h-32 md:h-48 mb-8">
          <span
            className="absolute bottom-0 left-0 font-serif font-bold text-[12vw] leading-none text-white/[0.04] whitespace-nowrap select-none pointer-events-none"
            aria-hidden="true"
          >
            retuned.
          </span>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">© 2026 Retuned. All rights reserved.</p>
          <LegalLinks />
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-[#faf8f5]">
      <Nav />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <LiveDemo />
        <HowItWorks />
        <Features />
        <Outputs />
        <Differentiator />
        <Testimonials />
        <Pricing />
        <CTA />
        <MintBar />
      </main>
      <Footer />
    </div>
  );
}
