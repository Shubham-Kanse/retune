"use client";

import { useState } from "react";
import { ChipSelector } from "./chip-selector";

export interface QuestionPresentation {
  field: string;
  prompt: string;
  chips: Array<{ label: string; value: string }> | null;
  freeTextAllowed: boolean;
  multiSelect: boolean;
  skipAllowed: boolean;
}

interface QuestionCardProps {
  question: QuestionPresentation;
  onAnswer: (value: string | string[]) => void;
  onSkip?: () => void;
  loading?: boolean;
}

/**
 * Stage 7 question card. Renders a single resume-generation question with
 * its chips, optional free-text input, and (if applicable) a skip button.
 * One question is shown at a time — the parent flow drives sequencing.
 */
export function QuestionCard({ question, onAnswer, onSkip, loading }: QuestionCardProps) {
  const [text, setText] = useState("");

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

      {question.freeTextAllowed && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={question.chips ? "Or type your own answer..." : "Type your answer..."}
            disabled={loading}
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
      )}

      {question.skipAllowed && onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-stone-500 transition-colors hover:text-stone-300"
        >
          Skip this question
        </button>
      )}
    </div>
  );
}
