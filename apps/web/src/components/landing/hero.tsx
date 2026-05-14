"use client";

import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function LandingHero() {
  const parent = {
    hidden: { opacity: 0, y: -20, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { when: "beforeChildren", staggerChildren: 0.1 },
    },
  };
  const child = {
    hidden: { opacity: 0, y: -20, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { type: "spring" as const, bounce: 0 },
    },
  };

  return (
    <motion.section
      variants={parent}
      initial="hidden"
      animate="visible"
      className="relative flex flex-col items-center justify-center space-y-3 pt-32 pb-16 text-center"
    >
      <div className="pointer-events-none absolute left-1/2 top-44 hidden h-[300px] w-[720px] -translate-x-1/2 bg-orange-100 opacity-50 blur-3xl dark:opacity-30 md:block" />
      <motion.span
        variants={child}
        className="inline-flex items-center rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
      >
        Career tuning for serious applicants
      </motion.span>
      <motion.h1
        variants={child}
        className="text-balance text-5xl font-semibold tracking-tight md:text-6xl"
      >
        Retuned
      </motion.h1>
      <motion.p
        variants={child}
        className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg"
      >
        Paste a job description or URL. We tune your resume, write the cover letter, detect profile
        drift, and hand you an application strategy — in under three minutes.
      </motion.p>
      <motion.div variants={child} className="flex items-center gap-3 pt-4">
        <Button asChild>
          <Link href="/signup">
            Try Retuned <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </motion.div>
    </motion.section>
  );
}
