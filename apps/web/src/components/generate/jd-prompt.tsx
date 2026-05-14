"use client";

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { Button } from "@/components/ui/button";
import { ArrowUp, Link2, Type } from "lucide-react";
import { useState } from "react";

export type InputMode = "text" | "url";
export type Market = "us" | "uk";

const suggestions = [
  "Senior PM at a fintech",
  "Founding engineer at an early-stage SaaS",
  "FAANG software engineer",
  "Staff designer at a healthcare startup",
];

export function JdPrompt({
  onStart,
  busy,
  placeholderUrl = "https://company.com/careers/senior-engineer",
  placeholderText = "Paste a job description, a job URL, or describe the role you're applying to…",
}: {
  onStart: (payload: { mode: InputMode; jdText?: string; jdUrl?: string; market: Market }) => void;
  busy?: boolean;
  placeholderUrl?: string;
  placeholderText?: string;
}) {
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Market>("us");

  const value = mode === "url" ? url : text;
  const setValue = (v: string) => (mode === "url" ? setUrl(v) : setText(v));
  const canSubmit =
    !busy && (mode === "url" ? /^https?:\/\//.test(url.trim()) : text.trim().length > 50);

  function fire() {
    if (!canSubmit) return;
    onStart({
      mode,
      jdText: mode === "text" ? text.trim() : undefined,
      jdUrl: mode === "url" ? url.trim() : undefined,
      market,
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card/60 p-3 shadow-sm backdrop-blur-sm">
        <PromptInput
          value={value}
          onValueChange={setValue}
          onSubmit={fire}
          isLoading={busy}
          className="border-0 bg-transparent shadow-none"
        >
          <PromptInputTextarea
            placeholder={mode === "url" ? placeholderUrl : placeholderText}
            className={
              mode === "url"
                ? "min-h-[44px] font-mono text-sm"
                : "min-h-[140px] text-base"
            }
            disableAutosize={mode === "text"}
          />
          <PromptInputActions className="flex-wrap justify-between gap-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-border bg-background p-0.5">
                {(["text", "url"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      mode === m
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "url" ? <Link2 className="size-3" /> : <Type className="size-3" />}
                    {m === "url" ? "URL" : "Text"}
                  </button>
                ))}
              </div>
              <div className="flex rounded-full border border-border bg-background p-0.5">
                {(["us", "uk"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarket(m)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                      market === m
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "us" ? "US resume" : "UK CV"}
                  </button>
                ))}
              </div>
            </div>
            <PromptInputAction tooltip="Tune">
              <Button
                size="icon"
                className="size-9 rounded-full"
                disabled={!canSubmit}
                onClick={fire}
              >
                <ArrowUp className="size-4" />
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <PromptSuggestion
            key={s}
            onClick={() => {
              setMode("text");
              setText(s);
            }}
          >
            {s}
          </PromptSuggestion>
        ))}
      </div>
    </div>
  );
}
