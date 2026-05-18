"use client";

import { AuditSummary } from "@/components/onboarding-v2/audit-summary";
import type { ChatMessage } from "@/components/onboarding-v2/chat-interface";
import { ChipSelector } from "@/components/onboarding-v2/chip-selector";
import { ExtractionDropdown } from "@/components/onboarding-v2/extraction-dropdown";
import { ChainOfThought, ChainOfThoughtStep, ChainOfThoughtTrigger } from "@/components/prompt-kit/chain-of-thought";
import { ShiningText } from "@/components/ui/shining-text";
import { ColorOrb } from "@/components/retune-lens/color-orb";
import { type UIStage, useOnboardingV2 } from "@/hooks/use-onboarding-v2";
import {
  TRANSITION_INTRO_COMPLETE_MS,
  TRANSITION_INTRO_STEP_MS,
} from "@/lib/onboarding/transition";
import { cn } from "@/lib/utils";
import { ArrowUp } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Orb ─────────────────────────────────────────────────────────────────────

function Orb({ size = 24 }: { size?: number; animate?: boolean }) {
  return <ColorOrb size={size} />;
}

// ─── Intro ────────────────────────────────────────────────────────────────────

function IntroPhase({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setStep(1), TRANSITION_INTRO_STEP_MS[0]),
      setTimeout(() => setStep(2), TRANSITION_INTRO_STEP_MS[1]),
      setTimeout(() => setStep(3), TRANSITION_INTRO_STEP_MS[2]),
      setTimeout(onComplete, TRANSITION_INTRO_COMPLETE_MS),
    ];
    return () => t.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="flex h-full min-h-[100dvh] w-full flex-col items-center justify-center gap-7 px-6">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 26, delay: 0.1 }}
      >
        <Orb size={72} animate />
      </motion.div>
      <div className="text-center space-y-2">
        {[
          { text: "Hello", cls: "text-[2.25rem] font-semibold tracking-tight text-foreground" },
          {
            text: "I'm Retuned — your career profile builder.",
            cls: "text-[0.9375rem] text-muted-foreground",
          },
          {
            text: "Upload your resume and I'll build your profile from it.",
            cls: "text-[0.9375rem] text-muted-foreground",
          },
        ].map(({ text, cls }, i) => (
          <motion.p
            key={text}
            initial={false}
            animate={
              step >= i + 1
                ? { opacity: 1, y: 0, filter: "blur(0px)" }
                : { opacity: 0, y: 14, filter: "blur(6px)" }
            }
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className={cls}
          >
            {text}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Bubble({
  message,
  isLast,
  loading,
  onAction,
  onCommit,
}: {
  message: ChatMessage;
  isLast: boolean;
  loading: boolean;
  onAction: (action: string, payload?: unknown) => void;
  onCommit: () => void;
}) {
  if (message.role === "user") {
    return (
      <motion.div
        className="ml-auto w-fit max-w-[85%] px-4 py-3 rounded-2xl rounded-br-md text-sm text-indigo-100 bg-indigo-600/30"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </motion.div>
    );
  }

  const isProcessing = message.type === "progress";

  return (
    <motion.div
      className="flex w-full gap-2 items-start"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="h-8 w-8 shrink-0 flex items-center justify-center pt-1">
        <Orb size={20} animate={isProcessing || (loading && isLast)} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "px-4 py-3 rounded-2xl rounded-bl-md text-sm text-foreground bg-card border border-border max-w-[90%]",
            message.type === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {isProcessing ? (
            <ShiningText text={message.content} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>

        {/* Extraction cards dropdown */}
        {message.extractionCards && message.extractionCards.length > 0 && (
          <div className="mt-2 max-w-[90%]">
            <ExtractionDropdown cards={message.extractionCards} />
          </div>
        )}

        {/* Ambiguity chip questions */}
        {message.ambiguityQuestions?.map((q) => (
          <div key={q.field} className="mt-2 max-w-[90%]">
            <p className="text-xs text-muted-foreground mb-1.5">{q.question}</p>
            <ChipSelector
              chips={q.options.map((o) => ({ label: o, value: o }))}
              multiSelect={false}
              onSelect={(v) => onAction(`select_${q.field}`, v)}
            />
          </div>
        ))}

        {/* Audit summary */}
        {message.type === "audit" && message.audit && (
          <div className="mt-2 max-w-[90%]">
            <AuditSummary
              audit={message.audit}
              loading={loading}
              onCommit={onCommit}
              onResolveCriticalGap={(gap, answer) => onAction("resolve_critical_gap", { ...gap, answer })}
              onSkipCriticalGap={(gap) => onAction("skip_critical_gap", gap)}
              onResolveContradiction={(c, answer) => onAction("resolve_contradiction", { field: c.field, answer })}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div
      className="flex w-full gap-2 items-start"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="h-8 w-8 shrink-0 flex items-center justify-center pt-1">
        <Orb size={20} animate />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border">
        <ShiningText text="Thinking..." />
      </div>
    </motion.div>
  );
}

// ─── Stage label ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<UIStage, string> = {
  loading: "Loading",
  upload: "Upload",
  processing: "Processing",
  summary: "Review",
  correction: "Correction",
  questions: "Questions",
  voice: "Voice",
  audit: "Audit",
  committing: "Saving",
  complete: "Done",
};

// ─── Render messages — groups progress into ChainOfThought ────────────────────

function renderMessages(
  msgs: ChatMessage[],
  loading: boolean,
  onAction: (action: string, payload?: unknown) => void,
  onCommit: () => void,
) {
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < msgs.length) {
    const m = msgs[i]!;

    if (m.type === "progress") {
      const progressGroup: ChatMessage[] = [];
      while (i < msgs.length && msgs[i]!.type === "progress") {
        progressGroup.push(msgs[i]!);
        i++;
      }
      // Hide progress chain once a result message follows
      const isDone = i < msgs.length;
      if (!isDone) {
        elements.push(
          <div key={`progress-${progressGroup[0]!.id}`} className="flex gap-2 items-start">
            <div className="h-8 w-8 shrink-0 flex items-center justify-center pt-1">
              <Orb size={20} animate />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <ChainOfThought>
                {progressGroup.map((pm, pi) => (
                  <ChainOfThoughtStep key={pm.id}>
                    <ChainOfThoughtTrigger hideChevron>
                      {pi === progressGroup.length - 1
                        ? <ShiningText text={pm.content} />
                        : <span className="text-muted-foreground/50">{pm.content}</span>
                      }
                    </ChainOfThoughtTrigger>
                  </ChainOfThoughtStep>
                ))}
              </ChainOfThought>
            </div>
          </div>
        );
      }
      continue;
    }

    elements.push(
      <div key={m.id} className="space-y-3">
        <Bubble message={m} isLast={i === msgs.length - 1} loading={loading} onAction={onAction} onCommit={onCommit} />
      </div>
    );
    i++;
  }

  if (loading && msgs[msgs.length - 1]?.type !== "progress") {
    elements.push(<ThinkingBubble key="thinking" />);
  }

  return elements;
}

// ─── Chat view ────────────────────────────────────────────────────────────────

function ChatView() {
  const onboarding = useOnboardingV2();
  const {
    messages,
    loading,
    uiStage,
    currentQuestion,
    handleAction,
    selectChip,
    skipQuestion,
    commitProfile,
    finishLater,
    startOver,
    sendMessage,
    uploadFile,
  } = onboarding;

  const [inputValue, setInputValue] = useState("");
  const [showStartOver, setShowStartOver] = useState(false);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when message/rendering state changes even though the effect only touches the ref.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Reset multi-select when question changes
  useEffect(() => { setSelectedChips([]); }, [currentQuestion]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || loading) return;
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (activeQuestion && (uiStage === "questions" || uiStage === "voice" || uiStage === "audit")) {
      selectChip(activeQuestion.field, text);
      return;
    }
    sendMessage(text);
  };

  const handleActionClick = (action: string, payload?: unknown) => {
    if (action === "trigger_upload") {
      fileInputRef.current?.click();
      return;
    }
    if (action === "commit") {
      commitProfile();
      return;
    }
    handleAction(action, payload);
  };

  // Get actions from the last assistant message
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.actions && m.actions.length > 0);
  const activeActions = lastAssistant && !loading ? lastAssistant.actions : null;

  const activeQuestion = currentQuestion && !loading ? currentQuestion : null;

  // Get audit from last assistant message
  const lastAudit = [...messages].reverse().find((m) => m.role === "assistant" && m.audit);

  const isComplete = uiStage === "complete";

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border/50 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2">
          <Orb size={20} />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {STAGE_LABELS[uiStage]}
          </span>
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={finishLater}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Finish later
          </button>
          <button
            type="button"
            onClick={() => setShowStartOver(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Start over
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 md:px-6"
      >
        <div className="mx-auto flex h-full max-w-[720px] flex-col">
          <div className="mx-auto w-full max-w-[680px] space-y-4 pt-6 pb-4">
            {renderMessages(messages.filter((m) => m.content?.trim()), loading, handleAction, commitProfile)}
          </div>
        </div>
      </div>

      {/* Composer */}
      {!isComplete && (
        <div className="flex-shrink-0 px-4 md:px-6 pb-4 pt-2">
          <div className="mx-auto w-full max-w-[720px]">
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.7 }}
              className="ml-10 overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-md"
            >
              {/* Action buttons (confirm/reject/etc) */}
              {activeActions &&
                activeActions.length > 0 &&
                !activeQuestion &&
                !lastAudit?.audit && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="px-4 py-2.5 border-b border-border/40">
                      <p className="text-xs font-medium text-muted-foreground">Please choose</p>
                    </div>
                    {activeActions.map((action, idx) => (
                      <button
                        key={action.action}
                        type="button"
                        disabled={loading}
                        onClick={() => handleActionClick(action.action)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-sm text-left transition-colors border-b border-border/40 last:border-b-0",
                          "hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        {activeActions.length > 1 && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-mono text-indigo-200">
                            {idx + 1}
                          </span>
                        )}
                        <span className="flex-1 text-foreground">{action.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}

              {/* Question chips */}
              {activeQuestion?.chips && activeQuestion.chips.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="px-4 py-2.5 border-b border-border/40">
                    <p className="text-xs font-medium text-muted-foreground">
                      {"multiSelect" in activeQuestion && activeQuestion.multiSelect ? "Select all that apply" : "Please choose"}
                    </p>
                  </div>
                  {activeQuestion.chips.map((chip, idx) => {
                    const isMulti = "multiSelect" in activeQuestion && activeQuestion.multiSelect;
                    const isSelected = selectedChips.includes(chip.value);
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          if (isMulti) {
                            setSelectedChips((prev) =>
                              prev.includes(chip.value)
                                ? prev.filter((v) => v !== chip.value)
                                : [...prev, chip.value],
                            );
                          } else {
                            selectChip(activeQuestion.field, chip.value);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-sm text-left transition-colors border-b border-border/40 last:border-b-0 disabled:opacity-50",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/40",
                        )}
                      >
                        {activeQuestion.chips!.length > 1 && (
                          <span className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono",
                            isSelected ? "bg-indigo-600 text-white" : "bg-indigo-600/30 text-indigo-200",
                          )}>
                            {isMulti ? (isSelected ? "✓" : idx + 1) : idx + 1}
                          </span>
                        )}
                        <span className="flex-1 text-foreground">{chip.label}</span>
                      </button>
                    );
                  })}
                  {"multiSelect" in activeQuestion && activeQuestion.multiSelect && selectedChips.length > 0 && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        selectChip(activeQuestion.field, selectedChips);
                        setSelectedChips([]);
                      }}
                      className="flex w-full items-center justify-center gap-2 mx-4 my-2 px-4 py-2.5 text-sm font-medium text-indigo-200 rounded-xl bg-indigo-600/30 transition-colors hover:bg-indigo-600/50"
                    style={{ width: "calc(100% - 2rem)" }}>
                      Continue with {selectedChips.length} selected
                    </button>
                  )}
                  {"skipAllowed" in activeQuestion && activeQuestion.skipAllowed && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => skipQuestion(activeQuestion.field)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-left text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-mono text-indigo-300">
                        —
                      </span>
                      Skip for now
                    </button>
                  )}
                </motion.div>
              )}

              {/* Text input */}
              <div className="flex gap-2 items-center px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (textareaRef.current) {
                      textareaRef.current.style.height = "auto";
                      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    activeActions || activeQuestion ? "Or reply directly…" : "Type a message…"
                  }
                  disabled={loading}
                  rows={1}
                  className="flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-[200px]"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || loading}
                  aria-label="Send"
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-primary text-primary-foreground",
                    !inputValue.trim() || loading
                      ? "opacity-40"
                      : "hover:scale-105 hover:opacity-90",
                  )}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </motion.div>
          </div>
        </div>
      )}

      {/* Start over confirm */}
      {showStartOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-2xl border border-border bg-card p-6 max-w-sm w-full mx-4 space-y-4">
            <p className="font-medium text-foreground">Start over?</p>
            <p className="text-sm text-muted-foreground">
              This will clear your profile and start fresh.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowStartOver(false);
                  startOver();
                }}
                className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Start over
              </button>
              <button
                type="button"
                onClick={() => setShowStartOver(false)}
                className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion overlay */}
      {isComplete && (
        <motion.div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <Orb size={64} animate />
          </motion.div>
          <p className="mt-7 text-3xl font-semibold tracking-tight text-foreground">Thank you</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Retuned profile is complete. Opening your dashboard...
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingV2Page() {
  const [showChat, setShowChat] = useState(false);
  const onIntroComplete = useCallback(() => setShowChat(true), []);

  return (
    <div className="h-full min-h-[100dvh] w-full">
      {showChat ? <ChatView /> : <IntroPhase onComplete={onIntroComplete} />}
    </div>
  );
}
