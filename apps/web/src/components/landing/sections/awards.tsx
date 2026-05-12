"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/ui/section-title";

const awards = [
  { title: "Best AI Career Tool", year: "2025", organization: "Product Hunt", link: "#" },
  { title: "Top Resume Builder", year: "2025", organization: "G2 Reviews", link: "#" },
  { title: "Innovation in HR Tech", year: "2024", organization: "TechCrunch Disrupt", link: "#" },
  { title: "Best Job Search Platform", year: "2024", organization: "Forbes Advisor", link: "#" },
  { title: "AI Excellence Award", year: "2024", organization: "AI Breakthrough", link: "#" },
];

export function Awards() {
  return (
    <section id="awards" className="py-20 md:py-32 md:pt-0 md:pb-0">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <SectionTitle className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-12 md:mb-16">
          Recognition
        </SectionTitle>
        <div className="flex flex-col gap-4">
          {awards.map((award, index) => (
            <Link key={index} href={award.link} className="group flex items-center justify-between p-5 md:p-6 border border-[#e5e2dd] rounded-2xl hover:bg-[#f0ede8]/50 transition-all hover:border-[#1a1a1a]/20">
              <div className="flex items-center gap-6 flex-1">
                <div className="flex-1">
                  <h3 className="font-semibold text-xl md:text-2xl">{award.title}</h3>
                  <p className="text-sm text-[#6b6b6b] mt-1">{award.organization}</p>
                </div>
                <span className="text-sm text-[#6b6b6b] font-medium">{award.year}</span>
              </div>
              <ArrowUpRight className="w-8 h-8 md:w-10 md:h-10 ml-6 text-[#7e22ce] transition-all group-hover:translate-x-1" strokeWidth={1} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
