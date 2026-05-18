"use client";

import type { UIStage } from "@/hooks/use-onboarding-v2";
import { useEffect, useRef, useState } from "react";
import { AuditSummary, type AuditSummaryData } from "./audit-summary";
import { ChipSelector } from "./chip-selector";
import { ConfirmationButtons } from "./confirmation-buttons";
import { type ExtractionCardData, ExtractionDropdown } from "./extraction-dropdown";
import { QuestionCard, type QuestionPresentation } from "./question-card";
import { TimedTypingIndicator } from "./timed-typing-indicator";
import { VoiceQuestionCard, type VoiceQuestionPresentation } from "./voice-question-card";

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  type: "text" | "summary" | "question" | "voice_question" | "audit" | "error" | "progress";
  chips?: Array<{ label: string; value: string }>;
  multiSelect?: boolean;
  actions?: Array<{ label: string; action: string; variant: "primary" | "secondary" }>;
  extractionCards?: ExtractionCardData[];
  ambiguityQuestions?: Array<{
    field: "role_family" | "seniority";
    question: string;
    options: string[];
  }>;
  question?: QuestionPresentation;
  voiceQuestion?: VoiceQuestionPresentation;
  audit?: AuditSummaryData;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  loading: boolean;
  uiStage: UIStage;
  currentQuestion: QuestionPresentation | VoiceQuestionPresentation | null;
  onSendMessage: (text: string) => void;
  onAction: (action: string, payload?: unknown) => void;
  onSelectChip: (field: string, value: string | string[]) => void;
  onSkip: (field: string) => void;
  onCommit: () => void;
}

export function ChatInterface({
  messages,
  loading,
  uiStage,
  currentQuestion,
  onSendMessage,
  onAction,
  onSelectChip,
  onSkip,
  onCommit,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when message/rendering state changes even though the effect only touches the ref.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleActionClick = (action: string) => {
    if (action === "commit") return onCommit();
    onAction(action);
  };

  const showTextInput = uiStage === "correction" || uiStage === "audit" || uiStage === "summary";

  return (
    <div className="flex flex-1 flex-col">
      <div role="log" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] ${
                msg.type === "summary" ||
                msg.type === "question" ||
                msg.type === "voice_question" ||
                msg.type === "audit"
                  ? "w-full"
                  : ""
              } ${
                msg.role === "user"
                  ? "rounded-2xl bg-indigo-600 px-4 py-3 text-white"
                  : msg.type === "error"
                    ? "rounded-2xl border border-red-800 bg-red-900/30 px-4 py-3 text-red-300"
                    : msg.type === "summary" ||
                        msg.type === "question" ||
                        msg.type === "voice_question" ||
                        msg.type === "audit"
                      ? ""
                      : "rounded-2xl bg-stone-800 px-4 py-3 text-stone-200"
              }`}
            >
              {/* Specialized message types */}
              {msg.type === "summary" ? (
                <div className="rounded-2xl bg-stone-800 p-4 text-stone-200">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  {msg.ambiguityQuestions && msg.ambiguityQuestions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.ambiguityQuestions.map((q) => (
                        <div key={q.field} className="rounded-lg bg-stone-900/40 p-3">
                          <p className="text-xs text-stone-300">{q.question}</p>
                          <div className="mt-2">
                            <ChipSelector
                              chips={q.options.map((o) => ({ label: o, value: o }))}
                              multiSelect={false}
                              onSelect={(v) => onAction(`select_${q.field}`, v)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.extractionCards && <ExtractionDropdown cards={msg.extractionCards} />}
                  {msg.actions && msg.actions.length === 2 && msg.actions[0] && msg.actions[1] && (
                    <div className="mt-4">
                      <ConfirmationButtons
                        primaryLabel={msg.actions[0].label}
                        secondaryLabel={msg.actions[1].label}
                        onPrimary={() => handleActionClick(msg.actions?.[0]?.action ?? "")}
                        onSecondary={() => handleActionClick(msg.actions?.[1]?.action ?? "")}
                      />
                    </div>
                  )}
                </div>
              ) : msg.type === "question" && msg.question ? (
                <QuestionCard
                  question={msg.question}
                  loading={loading}
                  onAnswer={(v) => msg.question && onSelectChip(msg.question.field, v)}
                  onSkip={
                    msg.question.skipAllowed
                      ? () => msg.question && onSkip(msg.question.field)
                      : undefined
                  }
                />
              ) : msg.type === "voice_question" && msg.voiceQuestion ? (
                <VoiceQuestionCard
                  question={msg.voiceQuestion}
                  loading={loading}
                  onAnswer={(v) => msg.voiceQuestion && onSelectChip(msg.voiceQuestion.field, v)}
                />
              ) : msg.type === "audit" && msg.audit ? (
                <AuditSummary
                  audit={msg.audit}
                  loading={loading}
                  onCommit={onCommit}
                  onResolveCriticalGap={(g) => onAction("resolve_critical_gap", g)}
                />
              ) : (
                <>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {msg.chips && msg.chips.length > 0 && (
                    <div className="mt-3">
                      <ChipSelector
                        chips={msg.chips}
                        multiSelect={msg.multiSelect || false}
                        onSelect={(value) => onSelectChip(currentQuestion?.field ?? "", value)}
                      />
                    </div>
                  )}

                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.actions.map((action) => (
                        <button
                          type="button"
                          key={action.action}
                          onClick={() => handleActionClick(action.action)}
                          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                            action.variant === "primary"
                              ? "bg-indigo-600 text-white hover:bg-indigo-500"
                              : "bg-stone-700 text-stone-300 hover:bg-stone-600"
                          }`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-stone-800 px-4 py-3">
              <TimedTypingIndicator active={loading} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showTextInput && (
        <form onSubmit={handleSubmit} className="mt-4 flex gap-2 border-t border-stone-800 pt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              uiStage === "correction"
                ? "What needs to change?"
                : uiStage === "audit"
                  ? "Add anything we should know..."
                  : "Type your answer..."
            }
            className="flex-1 rounded-xl bg-stone-800 px-4 py-3 text-sm text-stone-200 placeholder-stone-500 outline-none ring-1 ring-stone-700 transition-all focus:ring-indigo-500"
            disabled={loading}
            aria-label="Message input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
