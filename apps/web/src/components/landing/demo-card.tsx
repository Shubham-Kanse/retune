"use client";

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { Button } from "@/components/ui/button";
import { ArrowUp, Link2, Paperclip } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const sampleJD =
  "Senior Product Manager — Stripe\n• Lead 0→1 payment products for SMB merchants\n• 5+ yrs PM, fintech preferred\n• Strong ownership of metrics, GTM, and roadmap";

export function LandingDemoCard() {
  const [value, setValue] = useState(sampleJD);
  return (
    <section className="mx-auto w-full max-w-3xl pt-6">
      <div className="rounded-3xl border border-border bg-card/50 p-3 shadow-sm backdrop-blur-sm">
        <PromptInput
          value={value}
          onValueChange={setValue}
          className="border-0 bg-transparent shadow-none"
        >
          <PromptInputTextarea
            placeholder="Paste a job description, a job URL, or describe the role…"
            className="min-h-[120px] text-base"
            disableAutosize
          />
          <PromptInputActions className="justify-between pt-2">
            <div className="flex items-center gap-1">
              <PromptInputAction tooltip="Attach a JD file">
                <Button variant="ghost" size="icon" className="size-8" type="button">
                  <Paperclip className="size-4" />
                </Button>
              </PromptInputAction>
              <PromptInputAction tooltip="Paste a job URL">
                <Button variant="ghost" size="icon" className="size-8" type="button">
                  <Link2 className="size-4" />
                </Button>
              </PromptInputAction>
            </div>
            <Button asChild size="sm" className="rounded-full">
              <Link href="/signup">
                Tune <ArrowUp className="ml-1 size-4" />
              </Link>
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Sign up to run a real tuning on your resume — 3 free generations, no credit card.
      </p>
    </section>
  );
}
