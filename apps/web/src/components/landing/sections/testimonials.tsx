"use client";

import { useState } from "react";
import { SectionTitle } from "@/components/ui/section-title";

const testimonials = [
  { id: 1, quote: "Retune helped me land my dream role at a FAANG company. The AI-tailored resume got me past the ATS and the cover letter nailed the tone.", author: "Sarah C.", role: "Software Engineer", blurColor: "bg-emerald-500" },
  { id: 2, quote: "I went from 2% callback rate to 40% after switching to Retune. The keyword optimization is genuinely impressive.", author: "Marcus J.", role: "Product Manager", blurColor: "bg-purple-500" },
  { id: 3, quote: "The speed is incredible. What used to take me 2 hours per application now takes 3 minutes. And the quality is better.", author: "Emily R.", role: "UX Designer", blurColor: "bg-pink-500" },
  { id: 4, quote: "As a career changer, Retune helped me frame my transferable skills in a way that resonated with hiring managers.", author: "David P.", role: "Data Scientist", blurColor: "bg-blue-500" },
  { id: 5, quote: "The application strategy feature is a game-changer. It's like having a career coach available 24/7.", author: "Lisa W.", role: "Marketing Director", blurColor: "bg-orange-500" },
  { id: 6, quote: "I recommended Retune to my entire bootcamp cohort. Everyone who used it got interviews within 2 weeks.", author: "James M.", role: "Full-Stack Developer", blurColor: "bg-cyan-500" },
  { id: 7, quote: "The AI understands nuance. It doesn't just keyword-stuff - it tells a compelling story about your career.", author: "Nina P.", role: "VP of Engineering", blurColor: "bg-rose-500" },
];

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(n => n[0]).join("");
  return (
    <div className="w-10 h-10 rounded-full bg-[#f0ede8] flex items-center justify-center text-sm font-semibold text-[#6b6b6b]">
      {initials}
    </div>
  );
}

export function Testimonials() {
  const [isPaused, setIsPaused] = useState(false);
  const duplicated = [...testimonials, ...testimonials];
  const duplicatedReverse = [...testimonials.slice().reverse(), ...testimonials.slice().reverse()];

  return (
    <section id="testimonials" className="py-20 overflow-hidden md:py-32 pb-0 relative">
      <div className="absolute bottom-0 left-0 right-0 h-96 bg-gradient-to-t from-[#faf8f5] via-[#faf8f5]/80 to-transparent pointer-events-none z-20 hidden lg:block" />

      <div className="hidden lg:block pl-6 md:pl-12">
        <div className="mb-12 md:mb-16 max-w-[1280px]">
          <SectionTitle className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight">What users say</SectionTitle>
        </div>

        <div className="relative mb-6">
          <div className="flex gap-6 animate-scroll-left" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)} style={{ animationPlayState: isPaused ? "paused" : "running" }}>
            {duplicated.map((t, i) => (
              <article key={`${t.id}-${i}`} className="relative flex-shrink-0 w-[85vw] md:w-[400px] p-6 md:p-8 border bg-white hover:shadow-lg transition-shadow overflow-hidden border-[#e5e2dd] rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar name={t.author} />
                  <div><div className="font-semibold">{t.author}</div><div className="text-sm text-[#6b6b6b]">{t.role}</div></div>
                </div>
                <blockquote className="text-base leading-relaxed font-semibold text-[#1a1a1a] relative z-10">&ldquo;{t.quote}&rdquo;</blockquote>
                <div className={`absolute -bottom-12 -right-12 w-48 h-48 ${t.blurColor} rounded-full opacity-10`} style={{ filter: "blur(72px)" }} />
              </article>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="flex gap-6 animate-scroll-right" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)} style={{ animationPlayState: isPaused ? "paused" : "running" }}>
            {duplicatedReverse.map((t, i) => (
              <article key={`r-${t.id}-${i}`} className="relative flex-shrink-0 w-[85vw] md:w-[400px] p-6 md:p-8 border bg-white hover:shadow-lg transition-shadow overflow-hidden border-[#e5e2dd] rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar name={t.author} />
                  <div><div className="font-semibold">{t.author}</div><div className="text-sm text-[#6b6b6b]">{t.role}</div></div>
                </div>
                <blockquote className="text-base leading-relaxed font-semibold text-[#1a1a1a] relative z-10">&ldquo;{t.quote}&rdquo;</blockquote>
                <div className={`absolute -bottom-12 -right-12 w-48 h-48 ${t.blurColor} rounded-full opacity-10`} style={{ filter: "blur(72px)" }} />
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="mb-12"><SectionTitle className="text-3xl md:text-4xl font-semibold tracking-tight">What users say</SectionTitle></div>
        <div className="relative">
          {testimonials.slice(0, 5).map((t, index) => (
            <div key={t.id} className="sticky pt-10" style={{ top: `${70}px`, zIndex: index + 1 }}>
              <article className="relative p-6 border bg-white overflow-hidden border-[#e5e2dd] rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar name={t.author} />
                  <div><div className="font-semibold">{t.author}</div><div className="text-sm text-[#6b6b6b]">{t.role}</div></div>
                </div>
                <blockquote className="text-base leading-relaxed font-semibold relative z-10">&ldquo;{t.quote}&rdquo;</blockquote>
                <div className={`absolute -bottom-12 -right-12 w-48 h-48 ${t.blurColor} rounded-full opacity-10`} style={{ filter: "blur(72px)" }} />
              </article>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#faf8f5] via-[#faf8f5]/90 to-transparent pointer-events-none z-10 lg:hidden" />
    </section>
  );
}
