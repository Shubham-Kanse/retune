"use client";

import { DotsLoader, PulseDot } from "@/components/ai/loader";
import { PromptInput, PromptInputActions, PromptInputAction, PromptInputTextarea, PromptSubmitButton } from "@/components/ai/prompt-input";
import { Reasoning } from "@/components/ai/reasoning";
import { GlowBackground } from "@/components/layout/glow-background";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, FileText, Moon, Search, ShieldCheck, Sparkles, Sun, Target, UploadCloud, Zap } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";

const outputs = [
  { title: "Tailored resume / CV", body: "Role-specific bullets, evidence ordering, and ATS-aware phrasing without keyword stuffing.", icon: FileText },
  { title: "Cover letter", body: "A concise narrative that connects your strongest proof points to the role.", icon: Sparkles },
  { title: "ATS and readiness audit", body: "Matched signals, missing evidence, risky claims, and recommended improvements.", icon: Target },
  { title: "Application strategy", body: "Positioning angle, follow-up notes, and interview prep from the same job context.", icon: Zap },
];

const steps = [
  "Build a durable career profile once.",
  "Paste a job URL or full description.",
  "Review drift questions before generation.",
  "Ship a resume, cover letter, audit, and strategy.",
];

function RetunedMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {[[3,15],[3,13],[3,11],[3,9],[3,7],[3,5],[5,3],[7,3],[9,3],[11,5],[11,7],[11,15],[9,13],[13,13],[7,11],[15,11]].map(([x, y], i) => (
        <rect key={`${x}-${y}-${i}`} x={x} y={y} width={2} height={2} fill="currentColor" />
      ))}
    </svg>
  );
}

function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/70 text-foreground backdrop-blur-md transition-colors hover:bg-muted"
      aria-label="Toggle theme"
    >
      {mounted && resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <RetunedMark />
          Retuned
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#outputs" className="transition-colors hover:text-foreground">Outputs</a>
          <a href="#intelligence" className="transition-colors hover:text-foreground">Intelligence</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">Login</Link>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">
            Start free
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function ProductMock() {
  return (
    <div className="relative mx-auto mt-14 w-full max-w-4xl rounded-[2rem] border border-border bg-card/75 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.10)] backdrop-blur-xl dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="rounded-[1.45rem] border border-border bg-background/80 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Application workspace</p>
            <p className="mt-1 text-sm font-medium">Senior Product Engineer · Linear</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <PulseDot /> ATS 86
          </span>
        </div>

        <PromptInput value="https://jobs.ashbyhq.com/linear/senior-product-engineer" isLoading={false} className="mb-4">
          <PromptInputTextarea placeholder="Paste a job URL or description" className="text-sm" />
          <PromptInputActions>
            <div className="flex items-center gap-2">
              <PromptInputAction label="Attach resume"><button className="rounded-full border border-border p-2 text-muted-foreground"><UploadCloud className="h-4 w-4" /></button></PromptInputAction>
              <PromptInputAction label="Fetch job URL"><button className="rounded-full border border-border p-2 text-muted-foreground"><Search className="h-4 w-4" /></button></PromptInputAction>
            </div>
            <PromptSubmitButton />
          </PromptInputActions>
        </PromptInput>

        <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
          <Reasoning title="What Retuned noticed" defaultOpen>
            <ul className="space-y-2">
              <li>Role asks for product judgment, systems thinking, and customer-facing engineering.</li>
              <li>Your profile has strong backend evidence but weak product storytelling.</li>
              <li>One drift question should be resolved before generation.</li>
            </ul>
          </Reasoning>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium"><DotsLoader /> Generating package</div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {["Resume", "Cover letter", "ATS audit", "Application strategy"].map((item, i) => (
                <div key={item} className="flex items-center justify-between rounded-xl bg-muted/55 px-3 py-2">
                  <span>{item}</span>
                  {i < 2 ? <Check className="h-4 w-4 text-brand" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-brand">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}

export function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <GlowBackground variant="landing" className="fixed" />
      <Header />
      <main id="main-content" className="relative z-10">
        <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-5 pb-20 pt-28 text-center md:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            AI application package workspace
          </div>
          <h1 className="mt-7 max-w-5xl text-5xl font-semibold tracking-[-0.065em] md:text-7xl lg:text-8xl">
            Every job needs a retuned version of you.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
            Retuned turns a job description and your career profile into a tailored resume, cover letter, ATS insights, and an application strategy.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">
              Generate your first package
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex h-11 items-center rounded-full border border-border bg-background/70 px-6 text-sm font-medium backdrop-blur-md transition-colors hover:bg-muted">
              See how it works
            </a>
          </div>
          <ProductMock />
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 py-24 md:px-8">
          <SectionHeading eyebrow="Workflow" title="From job description to application package." body="Retuned keeps your profile durable, then adapts it to each role with evidence, strategy, and clear checks before you send." />
          <div className="mt-12 grid gap-3 md:grid-cols-4">
            {steps.map((step, i) => (
              <div key={step} className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-md">
                <span className="text-xs text-muted-foreground">0{i + 1}</span>
                <p className="mt-8 text-sm leading-6">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="outputs" className="mx-auto max-w-6xl px-5 py-24 md:px-8">
          <SectionHeading eyebrow="Deliverables" title="Outputs that feel ready to ship." body="Not just rewritten text. Retuned gives you the documents, the audit, and the strategy behind the application." />
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {outputs.map((output) => (
              <div key={output.title} className="group rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-md transition-transform hover:-translate-y-1">
                <output.icon className="h-5 w-5 text-brand" />
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{output.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{output.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="intelligence" className="mx-auto max-w-6xl px-5 py-24 md:px-8">
          <div className="grid gap-8 rounded-[2rem] border border-border bg-card/70 p-6 backdrop-blur-xl md:grid-cols-[0.8fr_1.2fr] md:p-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-brand">Profile intelligence</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">See what Retuned sees.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Before writing, Retuned extracts hiring signals, maps your evidence, and asks only the drift questions that matter.
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Hiring signal extraction from job descriptions and URLs.",
                "Profile drift checks for missing or stale evidence.",
                "ATS-safe language that stays honest to your background.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-border bg-background/70 p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-brand" />
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-28 text-center md:px-8">
          <h2 className="text-4xl font-semibold tracking-[-0.05em] md:text-6xl">Retune your next application before you send it.</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Start with one job description. Leave with a complete application package and a clearer story.</p>
          <Link href="/signup" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <footer className="relative z-10 border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Retuned. Built for role-specific applications.
      </footer>
    </div>
  );
}
