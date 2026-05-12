"use client";

import { SectionTitle } from "@/components/ui/section-title";

const capabilities = [
  "ATS Optimization",
  "Resume Tailoring",
  "Cover Letter Generation",
  "Interview Prep",
  "Skill Gap Analysis",
  "Career Strategy",
  "Application Tracking",
  "AI Coaching",
  "Multi-format Export",
];

const stats = [
  { value: "3min", label: "Average Generation" },
  { value: "94%", label: "ATS Pass Rate" },
  { value: "10k+", label: "Applications Sent" },
];

export function About() {
  return (
    <section id="about" className="py-20 md:py-32">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left — headline + description */}
          <div>
            <SectionTitle className="font-serif text-4xl md:text-5xl lg:text-[3.5rem] font-normal tracking-tight leading-[1.1] text-foreground">
              AI that understands your career story
            </SectionTitle>
            <p className="mt-8 text-muted-foreground text-lg leading-relaxed">
              Retune uses advanced language models to deeply understand your professional background, then crafts perfectly tailored application materials for every opportunity.
            </p>
            <p className="mt-5 text-muted-foreground text-lg leading-relaxed">
              No more generic resumes. No more hours spent rewriting. Just paste a job description and let our AI specialists handle the rest — from keyword optimization to narrative framing.
            </p>
          </div>

          {/* Right — capabilities + stats */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-5">
              Capabilities
            </p>
            <div className="flex flex-wrap gap-2.5">
              {capabilities.map((skill) => (
                <span
                  key={skill}
                  className="px-4 py-2.5 text-sm border border-border rounded-full text-foreground"
                >
                  {skill}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-10">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="text-center py-6 px-3 bg-[#f0ede8] rounded-2xl"
                >
                  <div className="font-serif text-3xl md:text-4xl font-normal text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-2">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
