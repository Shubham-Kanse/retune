"use client";

import { Briefcase, FileText, Sparkles, Check } from "lucide-react";
import { SectionTitle } from "@/components/ui/section-title";

const steps = [
  {
    num: "01. UPLOAD",
    icon: <Briefcase className="w-4 h-4" style={{ color: "#f59e0b" }} />,
    iconBg: "#fef3c7",
    title: (
      <>
        Upload your resume and the system extracts your{" "}
        <span className="inline-flex items-center gap-1 bg-[#fed7aa] rounded px-1.5 py-0.5 text-[#9a3412]">
          voice fingerprint
        </span>{" "}
        and evidence automatically.
      </>
    ),
  },
  {
    num: "02. PASTE",
    icon: <FileText className="w-4 h-4" style={{ color: "#7e22ce" }} />,
    iconBg: "#f3e8ff",
    title: (
      <>
        Paste the{" "}
        <span className="inline-flex items-center gap-1 bg-[#f3e8ff] rounded px-1.5 py-0.5 text-[#7e22ce]">
          job description
        </span>{" "}
        . The cognitive system maps every requirement to your real experience.
      </>
    ),
  },
  {
    num: "03. GENERATE",
    icon: <Sparkles className="w-4 h-4" style={{ color: "#b84ed1" }} />,
    iconBg: "#f3e8ff",
    title: (
      <>
        18 specialists{" "}
        <span className="inline-flex items-center gap-1 bg-[#fde68a] rounded px-1.5 py-0.5 text-[#92400e]">
          <Sparkles className="w-3.5 h-3.5" />
          produce
        </span>{" "}
        your package: resume, cover letter, strategy, and full audit trail.
      </>
    ),
  },
  {
    num: "04. SHIP OR REFUSE",
    icon: <Check className="w-4 h-4" style={{ color: "#7e22ce" }} />,
    iconBg: "#f3e8ff",
    title: (
      <>
        The quality gate either{" "}
        <span className="inline-flex items-center gap-1 bg-[#f3e8ff] rounded px-1.5 py-0.5 text-[#7e22ce]">
          ships
        </span>{" "}
        or explains honestly why it can&apos;t do the work credibly.
      </>
    ),
  },
];

export function SelectedWorks() {
  return (
    <section id="works" className="py-24 px-6 md:px-12">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4">
          <span className="text-xs text-[#6b6b6b] uppercase tracking-[0.1em]">The cognitive cycle</span>
        </div>
        <SectionTitle className="font-serif text-4xl md:text-5xl lg:text-6xl font-normal text-center leading-[1.1] mb-16">
          A senior coach thinks.<br />The system does it in 60 seconds.
        </SectionTitle>

        <div className="grid md:grid-cols-2 gap-6">
          {steps.map((step) => (
            <div
              key={step.num}
              className="rounded-3xl border border-border bg-white/90 p-10 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] transition-transform duration-200 hover:-translate-y-[3px]"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: step.iconBg }}>
                  {step.icon}
                </div>
                <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
                  {step.num}
                </span>
              </div>
              <p className="font-serif text-2xl md:text-[1.7rem] font-normal leading-snug text-foreground">
                {step.title}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
