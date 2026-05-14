"use client";

import { BloomTransition } from "@/components/onboarding/BloomTransition";
import { ConfirmDialog } from "@/components/onboarding/ConfirmDialog";
import { ProfileDisplayCard } from "@/components/onboarding/ChatComponents";
import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { BrainIcon, type BrainIconHandle } from "@/components/ui/brain-icon";
import { ShiningText } from "@/components/ui/shining-text";
import { type UIMessage, type Pill, type DisplayCard, useOnboardingChat } from "@/hooks/use-onboarding-chat";
import { cn } from "@/lib/utils";
import { ArrowUp, Check, CornerDownLeft } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TRANSITION_INTRO_COMPLETE_MS, TRANSITION_INTRO_STEP_MS } from "@/lib/onboarding/transition";

// ─── Animated Brain helper ────────────────────────────────────────────────────

function AnimatedBrain({ size = 24, animate = true, className }: { size?: number; animate?: boolean; className?: string }) {
  const ref = useRef<BrainIconHandle>(null);
  useEffect(() => {
    if (animate) ref.current?.startAnimation();
    else ref.current?.stopAnimation();
  }, [animate]);
  return <BrainIcon ref={ref} size={size} className={className} />;
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
        className="text-foreground"
      >
        <AnimatedBrain size={72} animate />
      </motion.div>
      <div className="text-center space-y-2">
        <motion.p
          initial={false}
          animate={
            step >= 1
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: 18, filter: "blur(6px)" }
          }
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-[2.25rem] font-semibold tracking-tight text-foreground"
        >
          Hello
        </motion.p>
        <motion.p
          initial={false}
          animate={
            step >= 2
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: 14, filter: "blur(6px)" }
          }
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-[0.9375rem] text-muted-foreground"
        >
          I&apos;m Retuned — your career profile builder.
        </motion.p>
        <motion.p
          initial={false}
          animate={
            step >= 3
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: 14, filter: "blur(6px)" }
          }
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-[0.9375rem] text-muted-foreground"
        >
          Upload your resume and I&apos;ll build your profile from it.
        </motion.p>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isLast, isStreaming }: { msg: UIMessage; isLast: boolean; isStreaming: boolean }) {
  const isUser = msg.role === "user";

  if (msg.isProcessing) {
    return (
      <motion.div className="flex w-full gap-2 items-start" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div className="h-8 w-8 shrink-0 flex items-center justify-center text-foreground pt-1">
          <AnimatedBrain size={20} animate />
        </div>
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border max-w-[90%]">
          <ShiningText text={msg.content} />
        </div>
      </motion.div>
    );
  }

  if (isUser) {
    return (
      <motion.div
        className="ml-auto w-fit max-w-[85%] px-4 py-3 rounded-2xl rounded-br-md text-sm text-foreground bg-card border border-border"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      </motion.div>
    );
  }

  return (
    <motion.div className="flex w-full gap-2 items-start" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="h-8 w-8 shrink-0 flex items-center justify-center text-foreground pt-1">
        <AnimatedBrain size={20} animate={isStreaming && isLast} />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-md text-sm text-foreground bg-card border border-border max-w-[90%]">
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div className="flex w-full gap-2 items-start" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="h-8 w-8 shrink-0 flex items-center justify-center text-foreground pt-1">
        <AnimatedBrain size={20} animate />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border">
        <ShiningText text="Thinking..." />
      </div>
    </motion.div>
  );
}

function CompletionOverlay() {
  return (
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
        className="text-foreground"
      >
        <AnimatedBrain size={64} animate />
      </motion.div>
      <p className="mt-7 text-3xl font-semibold tracking-tight text-foreground">Thank you</p>
      <p className="mt-2 text-sm text-muted-foreground">Your Retuned profile is complete. Opening your dashboard...</p>
    </motion.div>
  );
}

// ─── Display Cards ────────────────────────────────────────────────────────────

function CardList({ cards }: { cards: DisplayCard[] }) {
  if (!cards.length) return null;
  return (
    <div className="pl-10 space-y-2">
      {cards.map((card, i) => (
        <ProfileDisplayCard key={`${card.type}-${card.id ?? card.title}-${i}`} card={card} />
      ))}
    </div>
  );
}

type SkillBuckets = { technical: string[]; tools: string[]; business: string[] };

function splitSkills(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function cardsToSkillBuckets(cards: DisplayCard[]): SkillBuckets {
  return {
    technical: cards.find((card) => card.id === "technical")?.metadata ?? [],
    tools: cards.find((card) => card.id === "tools")?.metadata ?? [],
    business: cards.find((card) => card.id === "business")?.metadata ?? [],
  };
}

function SkillEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: SkillBuckets;
  onCancel: () => void;
  onSave: (skills: SkillBuckets) => void;
}) {
  const [technical, setTechnical] = useState(initial.technical.join(", "));
  const [tools, setTools] = useState(initial.tools.join(", "));
  const [business, setBusiness] = useState(initial.business.join(", "));

  return (
    <motion.div className="ml-10 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-md" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <p className="text-sm font-medium text-foreground">Edit extracted skills</p>
      <div className="mt-3 space-y-3">
        {[
          ["Tier 1 skills", technical, setTechnical],
          ["Tier 2 tools", tools, setTools],
          ["Tier 3 strengths", business, setBusiness],
        ].map(([label, value, setter]) => (
          <label key={String(label)} className="block">
            <span className="text-xs text-muted-foreground">{String(label)}</span>
            <textarea
              value={String(value)}
              onChange={(event) => (setter as (next: string) => void)(event.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              placeholder="Java, Spring Boot, REST APIs"
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave({ technical: splitSkills(technical), tools: splitSkills(tools), business: splitSkills(business) })}
          className="rounded-full bg-primary px-4 py-2 text-[0.8125rem] font-medium text-primary-foreground hover:opacity-90"
        >
          Save skills
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-border bg-background px-4 py-2 text-[0.8125rem] font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ─── Pills ────────────────────────────────────────────────────────────────────

function PillList({ pills, onSelect, disabled }: { pills: Pill[]; onSelect: (p: Pill) => void; disabled: boolean }) {
  if (!pills.length) return null;
  return (
    <motion.div className="ml-10 flex flex-wrap gap-2" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      {pills.map((pill) => {
        const disabledUntilSelected =
          pill.action === "confirm_field" &&
          pill.label === "Continue" &&
          !pills.some((candidate) => candidate.field === pill.field && candidate.action === "set_field" && candidate.selected);
        const isDisabled = disabled || disabledUntilSelected;

        return (
          <button key={pill.value} type="button" disabled={isDisabled} onClick={() => onSelect(pill)}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[0.8125rem] font-medium transition-colors",
              pill.selected
                ? "border border-primary bg-primary text-primary-foreground"
                : pill.recommended
                  ? "bg-brand/10 text-brand hover:bg-brand/15"
                  : "border border-border bg-card text-foreground hover:bg-muted",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}>
            {pill.selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {pill.label}
          </button>
        );
      })}
    </motion.div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView() {
  const router = useRouter();
  const { messages, isStreaming, isComplete, phase, readiness, errorMessage, extractionStatus, sendMessage, clickPill, stageMultiSelect, submitMultiSelect, submitSkills, uploadFile, startOver } = useOnboardingChat();

  const [inputValue, setInputValue] = useState("");
  const [skillEditor, setSkillEditor] = useState<SkillBuckets | null>(null);
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [showFinishLaterConfirm, setShowFinishLaterConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-follow the conversation: keep the user pinned to the newest
  // content whenever they were already near the bottom. Uses a
  // ResizeObserver on the inner scroll content so post-stream mounts
  // (skill cards, pill rows, error rows) also pin into view, not just
  // streamed text tokens.
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updatePinned = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinnedRef.current = dist < 240;
    };

    const stickToBottom = () => {
      if (!pinnedRef.current) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    };

    el.addEventListener("scroll", updatePinned, { passive: true });

    const inner = el.firstElementChild as HTMLElement | null;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) stickToBottom();
    });
    if (inner) observer.observe(inner);
    observer.observe(el);

    // Initial snap on mount so a refreshed page lands at the latest msg.
    stickToBottom();

    return () => {
      el.removeEventListener("scroll", updatePinned);
      observer.disconnect();
    };
  }, []);

  const handleSend = (overrideText?: string) => {
    const text = (overrideText ?? inputValue).trim();
    if (!text || isStreaming || isComplete) return;
    if (!overrideText) {
      setInputValue("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    sendMessage(text);
    // Force-pin: user just sent, they want to follow the reply.
    pinnedRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  };

  const handlePillClick = (pill: Pill) => {
    if (pill.action === "navigate" && (pill.value === "upload" || pill.value === "upload_resume")) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
      return;
    }
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();
    const isMultiSelect = lastAssistant?.pills?.some((candidate) => candidate.action === "confirm_field" && candidate.field === pill.field && candidate.label === "Continue");
    if (isMultiSelect && pill.action === "set_field") {
      stageMultiSelect(lastAssistant?.questionKey, pill);
      return;
    }
    if (isMultiSelect && pill.action === "confirm_field" && pill.field) {
      const values = lastAssistant?.pills
        ?.filter((candidate) => candidate.field === pill.field && candidate.action === "set_field" && candidate.selected)
        .map((candidate) => candidate.value) ?? [];
      submitMultiSelect(lastAssistant?.questionKey, pill.field, values);
      return;
    }
    if (pill.action === "ask_text" && pill.field === "skills") {
      setSkillEditor(cardsToSkillBuckets(lastAssistant?.cards ?? []));
      return;
    }
    clickPill(pill, lastAssistant?.questionKey);
  };

  const handleFinishLater = async () => {
    setShowFinishLaterConfirm(false);
    await fetch("/api/onboarding/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "finish_later" }) });
    router.push("/");
  };

  const lastIdx = messages.length - 1;
  const visibleMessages = messages.filter(m => m.content?.trim());
  const showThinking = isStreaming && !visibleMessages.some((m) => m.isProcessing);

  // Pills attached to the latest assistant message become the composer's
  // inline suggestion chips. Hidden while streaming so they don't flicker.
  const lastAssistantWithPills = [...visibleMessages].reverse().find(
    (m) => m.role === "assistant" && m.pills && m.pills.length > 0,
  );
  const activePills =
    lastAssistantWithPills && !isStreaming && !isComplete ? lastAssistantWithPills.pills ?? null : null;

  return (
    <div className="relative flex h-full w-full flex-col">
      <OnboardingHeader stage={phase} isStreaming={isStreaming} onStartOver={() => setShowStartOverConfirm(true)} onSkip={() => setShowFinishLaterConfirm(true)} />

      <div className="flex-shrink-0 border-b border-border/50 bg-background/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[680px] items-center justify-between gap-4 px-4 py-2 text-[0.72rem] md:px-6">
          <span className="tabular-nums font-medium text-foreground">{Math.round(readiness.score ?? 0)}%</span>
          <span className="truncate text-muted-foreground">
            {readiness.blockers?.[0] ?? "Profile ready"}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 md:px-6">
        <div className="mx-auto flex h-full max-w-[720px] flex-col">

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto w-full max-w-[680px] space-y-4 pt-6 pb-4">
          {visibleMessages.map((msg, i) => (
            <div key={msg.id} className="space-y-3">
              <MessageBubble msg={msg} isLast={i === lastIdx} isStreaming={isStreaming} />
              {msg.cards && i === visibleMessages.length - 1 && <CardList cards={msg.cards} />}
              {i === visibleMessages.length - 1 && skillEditor && (
                <SkillEditor
                  initial={skillEditor}
                  onCancel={() => setSkillEditor(null)}
                  onSave={(skills) => {
                    setSkillEditor(null);
                    submitSkills(skills);
                  }}
                />
              )}
            </div>
          ))}
          {showThinking && <ThinkingBubble />}
          {errorMessage && <div className="ml-10 text-xs text-destructive">{errorMessage}</div>}
        </div>
      </div>

      {/* Composer */}
      {!isComplete && (
        <div className="flex-shrink-0 pb-4 pt-2">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.7 }}
            className="ml-10 overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-md"
          >
            {/* Claude-style options panel — expands above the textarea */}
            {activePills && (
              <motion.div
                key={lastAssistantWithPills?.id ?? "pills"}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {(() => {
                  // Only the literal "Continue" pill acts as the multi-select submit button.
                  // Other confirm_field pills (e.g. "Looks correct") are normal numbered options.
                  const confirmPill = activePills.find((p) => p.action === "confirm_field" && p.label === "Continue");
                  const isMulti = !!confirmPill;
                  const optionPills = activePills.filter((p) => p !== confirmPill);
                  const hasSelection = activePills.some((p) => p.action === "set_field" && p.selected);
                  return (
                    <>
                      <div className="px-4 py-2.5 border-b border-border/40">
                        <p className="text-xs font-medium text-muted-foreground">Please choose</p>
                      </div>
                      {optionPills.map((pill, idx) => (
                        <button
                          key={`${pill.value}-${idx}`}
                          type="button"
                          disabled={isStreaming}
                          onClick={() => handlePillClick(pill)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-sm text-left transition-colors border-b border-border/40",
                            pill.selected ? "bg-muted/80 font-medium" : "hover:bg-muted/40",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {optionPills.length > 1 && (
                            <span
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono transition-colors",
                                pill.selected
                                  ? "bg-foreground text-background"
                                  : "border border-border bg-background text-muted-foreground",
                              )}
                            >
                              {idx + 1}
                            </span>
                          )}
                          <span className="flex-1 text-foreground">{pill.label}</span>
                          {pill.selected && !isMulti && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          {pill.selected && isMulti && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        </button>
                      ))}
                      {isMulti && (
                        <div className="flex justify-end px-4 py-2 border-b border-border/40">
                          <button
                            type="button"
                            disabled={isStreaming || !hasSelection}
                            onClick={() => confirmPill && handlePillClick(confirmPill)}
                            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Continue
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </motion.div>
            )}

            {/* Textarea row */}
            <div className="flex gap-2 items-center px-4 py-3">
              <textarea ref={textareaRef} value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; } }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={activePills ? "Or reply directly…" : "Type a message…"} disabled={isStreaming} rows={1}
                className="flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-[200px]" />
              <button type="button" onClick={() => handleSend()} disabled={!inputValue.trim() || isStreaming} aria-label="Send"
                className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-primary text-primary-foreground", !inputValue.trim() || isStreaming ? "opacity-40" : "hover:scale-105 hover:opacity-90")}>
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
            {/* Hidden file input — resume uploads triggered via AI pills */}
            <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
          </motion.div>
        </div>
      )}

        </div>
      </div>

      <ConfirmDialog open={showStartOverConfirm} title="Start over?" description="This will clear your profile and start fresh." confirmLabel="Start over" onConfirm={() => { setShowStartOverConfirm(false); startOver(); }} onCancel={() => setShowStartOverConfirm(false)} />
      <ConfirmDialog open={showFinishLaterConfirm} title="Finish later?" description="Your draft will be saved. Retuned will not mark onboarding complete until the career profile is ready." confirmLabel="Finish later" onConfirm={handleFinishLater} onCancel={() => setShowFinishLaterConfirm(false)} />
      {isComplete && <CompletionOverlay />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [showChat, setShowChat] = useState(false);
  const handleIntroComplete = useCallback(() => setShowChat(true), []);

  return (
    <div className="h-full min-h-[100dvh] w-full">
      <BloomTransition showChat={showChat} introContent={<IntroPhase onComplete={handleIntroComplete} />} chatContent={<ChatView />} />
    </div>
  );
}
