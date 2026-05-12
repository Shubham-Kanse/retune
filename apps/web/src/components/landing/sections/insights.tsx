"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionTitle } from "@/components/ui/section-title";

const insights = [
  { id: 1, title: "How AI is Changing Job Applications in 2025", excerpt: "The landscape of job hunting has shifted. Here's how to stay ahead with AI-powered tools.", date: "Jan 15, 2025", readTime: "5 min read", gradient: "from-[#b84ed1]/10 to-[#5fc3ff]/10" },
  { id: 2, title: "ATS Optimization: What Actually Works", excerpt: "We analyzed 10,000 resumes to find what gets past applicant tracking systems.", date: "Dec 28, 2024", readTime: "4 min read", gradient: "from-[#b84ed1]/10 to-[#5fc3ff]/10" },
  { id: 3, title: "The Perfect Cover Letter Formula", excerpt: "Data-driven insights on what makes hiring managers respond to your application.", date: "Dec 10, 2024", readTime: "6 min read", gradient: "from-[#f59e0b]/10 to-[#ff5555]/10" },
];

export function Insights() {
  return (
    <section id="insights" className="py-20 md:py-32">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="flex items-center justify-between mb-12 md:mb-16">
          <SectionTitle className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight">Insights</SectionTitle>
          <Link href="#" className="hidden md:inline-flex items-center gap-2 text-sm transition-colors text-[#7e22ce]">
            View all <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {insights.map((insight) => (
            <Link key={insight.id} href="#" className="group block">
              <article className="h-full">
                <div className={`relative aspect-[3/2] overflow-hidden rounded-2xl bg-gradient-to-br ${insight.gradient} mb-4 flex items-center justify-center border border-[#e5e2dd]`}>
                  <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center shadow-sm">
                    <span className="text-2xl font-serif text-[#7e22ce]">{insight.id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#6b6b6b] mb-3">
                  <span>{insight.date}</span><span>•</span><span>{insight.readTime}</span>
                </div>
                <h3 className="text-lg font-semibold group-hover:text-[#6b6b6b] transition-colors">{insight.title}</h3>
                <p className="text-sm text-[#6b6b6b] mt-2 leading-relaxed">{insight.excerpt}</p>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
