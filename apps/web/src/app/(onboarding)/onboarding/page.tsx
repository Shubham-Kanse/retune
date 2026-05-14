"use client";

import { BloomTransition } from "@/components/onboarding/BloomTransition";
import { ConfirmDialog } from "@/components/onboarding/ConfirmDialog";
import { ProfileDisplayCard } from "@/components/onboarding/ChatComponents";
import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { ProfilePreviewPanel } from "@/components/onboarding/ProfilePreviewPanel";
import { ProfileStrengthBar } from "@/components/onboarding/ProfileStrengthBar";
import { ColorOrb } from "@/components/ui/color-orb";
import { ShiningText } from "@/components/ui/shining-text";
import { type UIMessage, type Pill, type DisplayCard, useOnboardingChat } from "@/hooks/use-onboarding-chat";
import { cn } from "@/lib/utils";
import { ArrowUp, Check, Paperclip, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TRANSITION_INTRO_COMPLETE_MS, TRANSITION_INTRO_STEP_MS } from "@/lib/onboarding/transition";

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
    <div className="flex flex-col items-center justify-center gap-7 w-full h-full">
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 360, damping: 26, delay: 0.1 }}>
        <ColorOrb dimension="88px" spinDuration={20} />
      </motion.div>
      <div className="text-center space-y-2">
        <AnimatePresence>
          {step >= 1 && <motion.p key="hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[2.25rem] font-semibold tracking-tight text-foreground">Hello</motion.p>}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 2 && <motion.p key="tag" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[0.9375rem] text-muted-foreground">I&apos;m Retuned — your career profile builder.</motion.p>}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 3 && <motion.p key="act" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[0.9375rem] text-muted-foreground">Upload your resume and I&apos;ll build your profile from it.</motion.p>}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isLast, isStreaming }: { msg: UIMessage; isLast: boolean; isStreaming: boolean }) {
  const isUser = msg.role === "user";

  if (msg.isProcessing) {
    return (
      <motion.div className="flex max-w-[80%] gap-2 items-end mr-auto" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <ColorOrb dimension="32px" spinDuration={20} />
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border">
          <ShiningText text={msg.content} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className={cn("flex max-w-[80%] gap-2 items-end", isUser ? "ml-auto flex-row-reverse" : "mr-auto")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isUser && "bg-card border border-border")}>
        {isUser ? <User className="w-4 h-4 text-foreground" /> : <ColorOrb dimension="32px" spinDuration={isStreaming && isLast ? 20 : 0} />}
      </div>
      <div className={cn("px-4 py-3 rounded-2xl text-sm text-foreground bg-card border border-border", isUser ? "rounded-br-md" : "rounded-bl-md")}>
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div className="flex max-w-[80%] gap-2 items-end mr-auto" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <ColorOrb dimension="32px" spinDuration={20} />
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
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
        <ColorOrb dimension="88px" spinDuration={16} />
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
    <div className="ml-10 space-y-2">
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
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Smart auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isStreaming || isComplete) return;
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(text);
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

  const handleSkip = async () => {
    setShowSkipConfirm(false);
    await fetch("/api/onboarding/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "skip_onboarding" }) });
    router.push("/dashboard");
  };

  const lastIdx = messages.length - 1;
  const visibleMessages = messages.filter(m => m.content?.trim());
  const showThinking = isStreaming && !visibleMessages.some((m) => m.isProcessing);

  return (
    <div className="relative h-full w-full">
      <div className="mx-auto flex h-full max-w-[760px] min-h-0 flex-col">
      <OnboardingHeader stage={phase} isStreaming={isStreaming} onStartOver={() => setShowStartOverConfirm(true)} onSkip={() => setShowSkipConfirm(true)} />

      {readiness.score > 0 && phase !== "orb_intro" && phase !== "resume_upload" && (
        <ProfileStrengthBar filledCount={Math.round(readiness.score)} totalRequired={100} />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="max-w-[680px] mx-auto space-y-4 pt-4 pb-4">
          {visibleMessages.map((msg, i) => (
            <div key={msg.id} className="space-y-3">
              <MessageBubble msg={msg} isLast={i === lastIdx} isStreaming={isStreaming} />
              {msg.cards && i === visibleMessages.length - 1 && <CardList cards={msg.cards} />}
              {skillEditor && i === visibleMessages.length - 1 && (
                <SkillEditor
                  initial={skillEditor}
                  onCancel={() => setSkillEditor(null)}
                  onSave={(skills) => {
                    setSkillEditor(null);
                    submitSkills(skills);
                  }}
                />
              )}
              {msg.pills && i === visibleMessages.length - 1 && !isStreaming && (
                <PillList pills={msg.pills} onSelect={handlePillClick} disabled={isStreaming || isComplete} />
              )}
            </div>
          ))}
          {showThinking && <ThinkingBubble />}
          {errorMessage && <div className="ml-10 text-xs text-destructive">{errorMessage}</div>}
        </div>
      </div>

      {/* Composer */}
      {!isComplete && (
        <div className="flex-shrink-0 px-3 md:px-4 pb-3 pt-2">
          <div className="max-w-[680px] mx-auto flex flex-col gap-3 p-4 bg-card/90 rounded-3xl border border-border shadow-sm backdrop-blur-md">
            <div className="flex gap-2 items-center">
              <textarea ref={textareaRef} value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; } }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..." disabled={isStreaming} rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-[200px]" />
              <button type="button" onClick={handleSend} disabled={!inputValue.trim() || isStreaming} aria-label="Send"
                className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-primary text-primary-foreground", !inputValue.trim() || isStreaming ? "opacity-40" : "hover:scale-105 hover:opacity-90")}>
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
              <button type="button" onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); } }} disabled={isStreaming || extractionStatus === "pending"} aria-label="Attach resume"
                className="h-9 w-9 shrink-0 bg-muted hover:bg-secondary text-foreground rounded-full flex items-center justify-center disabled:opacity-50">
                <Paperclip className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground">PDF or DOCX</span>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={showStartOverConfirm} title="Start over?" description="This will clear your profile and start fresh." confirmLabel="Start over" onConfirm={() => { setShowStartOverConfirm(false); startOver(); }} onCancel={() => setShowStartOverConfirm(false)} />
      <ConfirmDialog open={showSkipConfirm} title="Skip onboarding?" description="You can build your profile later from Settings." confirmLabel="Skip" onConfirm={handleSkip} onCancel={() => setShowSkipConfirm(false)} />
      {isComplete && <CompletionOverlay />}
      </div>
      <div className="pointer-events-none absolute bottom-8 left-[calc(50%+420px)] top-8 hidden w-[190px] xl:block">
        <ProfilePreviewPanel readiness={readiness} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [showChat, setShowChat] = useState(false);
  const handleIntroComplete = useCallback(() => setShowChat(true), []);

  return (
    <div className="h-full w-full">
      <BloomTransition showChat={showChat} introContent={<IntroPhase onComplete={handleIntroComplete} />} chatContent={<ChatView />} />
    </div>
  );
}
