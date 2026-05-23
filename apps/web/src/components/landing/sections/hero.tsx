"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export function Hero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="min-h-screen flex flex-col justify-center pt-20 relative overflow-visible">
      <div className="absolute -right-32 md:-right-48 top-32 md:top-40 w-[500px] h-[500px] md:w-[750px] md:h-[750px] pointer-events-none animate-orb-rotate -z-10 scale-125">
        {/*
         * Charter 11 Epic 02 — let Next image optimisation produce AVIF/WebP
         * variants and resize to the rendered size. The source PNG is 907KB;
         * AVIF at 750px is typically <100KB. `priority` keeps it in the
         * preload manifest for LCP. `sizes` matches the responsive widths
         * defined on the wrapper.
         */}
        <Image
          src="/images/orb.png"
          alt=""
          width={750}
          height={750}
          className="w-full h-full"
          priority
          sizes="(max-width: 768px) 500px, 750px"
        />
      </div>

      <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-20 md:py-32 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center mb-6"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease 0.1s" }}
          >
            <span
              className="text-sm font-medium text-muted-foreground px-4 py-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(255,255,255,0.7)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              }}
            >
              AI-powered job applications, perfected
            </span>
          </div>

          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-normal tracking-tight leading-[1.1]">
            Your career, <span className="bg-[#d4f5e0] rounded-lg px-3 text-brand">retuned.</span>
          </h1>

          <p
            className="mt-8 max-w-xl mx-auto leading-relaxed text-xl text-muted-foreground"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(16px)",
              transition: "opacity 0.7s ease 0.5s, transform 0.7s cubic-bezier(0.16,1,0.3,1) 0.5s",
            }}
          >
            Paste a job. We'll write a resume and cover letter that earn the interview — every claim
            backed by evidence from your career.
          </p>

          <div
            className="flex flex-row items-center justify-center gap-4 mt-10"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease 0.65s" }}
          >
            <Link href="/signup" className="rt-btn text-base px-8 py-4">
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
