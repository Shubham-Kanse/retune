"use client";
import { motion } from "motion/react";
import React from "react";

const testimonials = [
  {
    text: "Got my dream job at Google after using Retuned. The ATS optimization alone was worth it - 3 rejections turned into 2 interviews.",
    name: "Marcus T.",
    role: "Staff Engineer, Google",
    avatar: "MT",
  },
  {
    text: "Applied to 12 companies, got 9 first-round interviews. Before Retuned I was getting 1 in 20. The difference is night and day.",
    name: "Priya K.",
    role: "Senior PM, Stripe",
    avatar: "PK",
  },
  {
    text: "The cover letter it generated sounded more like me than anything I've ever written. Hired in 3 weeks.",
    name: "James L.",
    role: "Data Scientist, Anthropic",
    avatar: "JL",
  },
  {
    text: "I was skeptical but the narrative arc feature genuinely found a story in my resume I'd never seen. Negotiated 40% higher.",
    name: "Sofia M.",
    role: "Engineering Lead, Figma",
    avatar: "SM",
  },
  {
    text: "Retuned caught skills I'd completely forgotten to mention. My profile completeness went from 52% to 94% in one session.",
    name: "David C.",
    role: "Backend Engineer, Notion",
    avatar: "DC",
  },
  {
    text: "The strategy doc it generates is incredible - referral queries, outreach templates, interview prep all tailored to the exact role.",
    name: "Aisha R.",
    role: "Product Designer, Linear",
    avatar: "AR",
  },
  {
    text: "Applied to Shopify on a whim using a Retuned package. Got the offer. The predicted callback was 78% - they were right.",
    name: "Tom H.",
    role: "Senior SWE, Shopify",
    avatar: "TH",
  },
  {
    text: "Most AI resume tools feel generic. This one felt like it actually read my profile and understood what makes me different.",
    name: "Elena V.",
    role: "ML Engineer, OpenAI",
    avatar: "EV",
  },
  {
    text: "The fact that it refuses applications it can't win is a feature, not a bug. Saved me from wasting time on 3 bad fits.",
    name: "Ryan P.",
    role: "Director of Eng, Vercel",
    avatar: "RP",
  },
];

export const TestimonialsColumn = ({
  testimonials: items,
  duration = 15,
  className,
}: { testimonials: typeof testimonials; duration?: number; className?: string }) => (
  <div className={className}>
    <motion.div
      animate={{ translateY: "-50%" }}
      transition={{
        duration,
        repeat: Number.POSITIVE_INFINITY,
        ease: "linear",
        repeatType: "loop",
      }}
      className="flex flex-col gap-4 pb-4"
    >
      {[...Array(2)].fill(0).map((_, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: duplicate columns for infinite scroll
        <React.Fragment key={idx}>
          {items.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static testimonial list
            <div
              key={i}
              className="p-6 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#111111] max-w-xs w-full"
            >
              <p className="text-sm text-[#888888] leading-relaxed mb-4">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center text-[10px] font-bold text-[#22C55E]">
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#ebebeb]">{t.name}</p>
                  <p className="text-[11px] text-[#666666]">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </React.Fragment>
      ))}
    </motion.div>
  </div>
);

export { testimonials };
