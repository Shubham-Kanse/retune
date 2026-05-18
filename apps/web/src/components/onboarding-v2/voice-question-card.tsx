"use client";

import { useState } from "react";
import { ChipSelector } from "./chip-selector";

export interface VoiceQuestionPresentation {
  field: "natural_voice_sample" | "tone_preferences" | "tone_aversions";
  prompt: string;
  chips: Array<{ label: string; value: string }> | null;
  freeTextAllowed: boolean;
  multiSelect: boolean;
  /** Minimum word count for the natural voice sample (Q1). */
  minWords?: number;
}

interface VoiceQuestionCardProps {
  question: VoiceQuestionPresentation;
  onAnswer: (value: string | string[]) => void;
  loading?: boolean;
}

/**
 * Stage 8 voice question card. Question 1 ("how would you describe what
 * you do") uses a textarea with a live word counter to encourage a
 * substantive answer; Q2 and Q3 use multi-select chips with an optional
 * free-text override.
 */
export function VoiceQuestionCard({ question, onAnswer, loading }: VoiceQuestionCardProps) {
  const [text, setText] = useState("");
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minWords = question.minWords ?? 30;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAnswer(text.trim());
      setText("");
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-stone-800 p-4 text-stone-200">
      <p className="text-sm leading-relaxed">{question.prompt}</p>

      {question.chips && question.chips.length > 0 && (
        <ChipSelector
          chips={question.chips}
          multiSelect={question.multiSelect}
          onSelect={onAnswer}
        />
      )}

      {question.field === "natural_voice_sample" ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder="Just write naturally — like you're explaining it to a colleague."
            aria-label={question.prompt}
            className="h-28 w-full resize-none rounded-lg bg-stone-900 p-3 text-sm text-stone-200 placeholder-stone-500 outline-none ring-1 ring-stone-700 transition-all focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between gap-3">
            <span
              className={`text-[11px] ${
                wordCount >= minWords ? "text-emerald-400" : "text-stone-500"
              }`}
            >
              {wordCount} / {minWords} words
            </span>
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        question.freeTextAllowed && (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
              placeholder="Or describe in your own words..."
              aria-label={question.prompt}
              className="flex-1 rounded-lg bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 outline-none ring-1 ring-stone-700 transition-all focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        )
      )}
    </div>
  );
}
