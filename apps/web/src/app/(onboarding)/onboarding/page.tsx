"use client";

import { BloomTransition } from "@/components/onboarding/BloomTransition";
import { ConfirmDialog } from "@/components/onboarding/ConfirmDialog";
import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { ProfileStrengthBar } from "@/components/onboarding/ProfileStrengthBar";
import { ColorOrb } from "@/components/ui/color-orb";
import { ShiningText } from "@/components/ui/shining-text";
import { type UIMessage, type Pill, type DisplayCard, useOnboardingChat } from "@/hooks/use-onboarding-chat";
import { cn } from "@/lib/utils";
import { ArrowUp, Paperclip, User } from "lucide-react";
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
          {step >= 1 && <motion.p key="hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-serif text-[2.25rem] text-[#1a1a1a]">Hello</motion.p>}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 2 && <motion.p key="tag" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[0.9375rem] text-[#6b6b6b]">I&apos;m Retuned — your career profile builder.</motion.p>}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 3 && <motion.p key="act" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[0.9375rem] text-[#6b6b6b]">Upload your resume and I&apos;ll build your profile from it.</motion.p>}
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
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-[#e8e5e0]">
          <ShiningText text={msg.content} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className={cn("flex max-w-[80%] gap-2 items-end", isUser ? "ml-auto flex-row-reverse" : "mr-auto")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isUser && "bg-white border border-[#e8e5e0]")}>
        {isUser ? <User className="w-4 h-4 text-stone-800" /> : <ColorOrb dimension="32px" spinDuration={isStreaming && isLast ? 20 : 0} />}
      </div>
      <div className={cn("px-4 py-3 rounded-2xl text-sm text-stone-800 bg-white border border-[#e8e5e0]", isUser ? "rounded-br-md" : "rounded-bl-md")}>
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      </div>
    </motion.div>
  );
}

// ─── Display Cards ────────────────────────────────────────────────────────────

function CardList({ cards }: { cards: DisplayCard[] }) {
  if (!cards.length) return null;
  return (
    <div className="ml-10 space-y-2">
      {cards.map((card, i) => (
        <motion.div key={card.id ?? i} className="rounded-xl border border-[#e8e5e0] bg-white p-3" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
          <p className="text-sm font-medium text-[#1a1a1a]">{card.title}</p>
          {card.subtitle && <p className="text-xs text-[#6b6b6b] mt-0.5">{card.subtitle}</p>}
          {card.metadata?.length ? <div className="flex flex-wrap gap-1 mt-2">{card.metadata.map(m => <span key={m} className="px-2 py-0.5 rounded-full bg-[#f0ede8] text-[0.7rem] text-[#555]">{m}</span>)}</div> : null}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Pills ────────────────────────────────────────────────────────────────────

function PillList({ pills, onSelect, disabled }: { pills: Pill[]; onSelect: (p: Pill) => void; disabled: boolean }) {
  if (!pills.length) return null;
  return (
    <motion.div className="ml-10 flex flex-wrap gap-2" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      {pills.map((pill) => (
        <button key={pill.value} type="button" disabled={disabled} onClick={() => onSelect(pill)}
          className={cn("px-4 py-2 rounded-full text-[0.8125rem] font-medium transition-colors", pill.recommended ? "bg-[#1a1a1a] text-white hover:bg-[#333]" : "border border-[#e0ddd9] bg-white text-[#1a1a1a] hover:bg-[#f5f3f0]", "disabled:opacity-40 disabled:cursor-not-allowed")}>
          {pill.label}
        </button>
      ))}
    </motion.div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView() {
  const router = useRouter();
  const { messages, isStreaming, isComplete, phase, readiness, currentPills, currentCards, errorMessage, extractionStatus, sendMessage, clickPill, uploadFile, startOver } = useOnboardingChat();

  const [inputValue, setInputValue] = useState("");
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
    if (pill.action === "navigate" && pill.value === "upload") {
      fileInputRef.current?.click();
      return;
    }
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();
    clickPill(pill, (lastAssistant as any)?.questionKey);
  };

  const handleSkip = async () => {
    setShowSkipConfirm(false);
    await fetch("/api/onboarding/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "skip_onboarding" }) });
    router.push("/dashboard");
  };

  const lastIdx = messages.length - 1;
  const visibleMessages = messages.filter(m => m.content?.trim());

  return (
    <div className="flex flex-col h-full">
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
              {msg.pills && i === visibleMessages.length - 1 && !isStreaming && (
                <PillList pills={msg.pills} onSelect={handlePillClick} disabled={isStreaming || isComplete} />
              )}
            </div>
          ))}
          {errorMessage && <div className="ml-10 text-xs text-red-600">{errorMessage}</div>}
        </div>
      </div>

      {/* Composer */}
      {!isComplete && (
        <div className="flex-shrink-0 px-3 md:px-4 pb-3 pt-2">
          <div className="max-w-[680px] mx-auto flex flex-col gap-3 p-4 bg-white rounded-2xl border border-[#e0ddd9]">
            <div className="flex gap-2 items-center">
              <textarea ref={textareaRef} value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; } }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..." disabled={isStreaming} rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none disabled:opacity-50 max-h-[200px]" />
              <button type="button" onClick={handleSend} disabled={!inputValue.trim() || isStreaming} aria-label="Send"
                className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-[#1a1a1a]", !inputValue.trim() || isStreaming ? "opacity-40" : "hover:scale-105 hover:bg-[#333]")}>
                <ArrowUp className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isStreaming || extractionStatus === "pending"} aria-label="Attach resume"
                className="h-9 w-9 shrink-0 bg-zinc-100 hover:bg-zinc-200 text-stone-700 rounded-full flex items-center justify-center disabled:opacity-50">
                <Paperclip className="w-4 h-4" />
              </button>
              <span className="text-xs text-stone-400">PDF or DOCX</span>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={showStartOverConfirm} title="Start over?" description="This will clear your profile and start fresh." confirmLabel="Start over" onConfirm={() => { setShowStartOverConfirm(false); startOver(); }} onCancel={() => setShowStartOverConfirm(false)} />
      <ConfirmDialog open={showSkipConfirm} title="Skip onboarding?" description="You can build your profile later from Settings." confirmLabel="Skip" onConfirm={handleSkip} onCancel={() => setShowSkipConfirm(false)} />
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
