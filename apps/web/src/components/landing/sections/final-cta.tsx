"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section id="contact" className="py-24 md:py-32">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-[0.15em] mb-6">Ready to start?</p>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-[1.1]">
            Your next role is one paste away
          </h2>
          <p className="mt-6 text-muted-foreground text-lg leading-relaxed max-w-xl mx-auto">
            Join thousands of professionals who&apos;ve transformed their job search with AI-powered applications.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link href="/signup" className="rt-btn text-base px-8 py-4">
              Get started free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="#works" className="rt-btn-ghost text-base px-8 py-4">
              See how it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
