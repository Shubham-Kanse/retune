"use client";

import { AnimatedOrb } from "@/components/onboarding/AnimatedOrb";
import { BloomTransition } from "@/components/onboarding/BloomTransition";
import {
  CompletionAnimation,
  QuickReplyChips,
  SectionCard,
  UploadDropzone,
} from "@/components/onboarding/ChatComponents";
import { type UIMessage, useOnboardingChat } from "@/hooks/use-onboarding-chat";
import { CHAT_GUTTER_CLASS, UPLOAD_CHIP_LABEL } from "@/lib/onboarding/chat-ui";
import {
  TRANSITION_INTRO_COMPLETE_MS,
  TRANSITION_INTRO_STEP_MS,
} from "@/lib/onboarding/transition";
import { cn } from "@/lib/utils";
import { ArrowUp, Paperclip, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 26, delay: 0.1 }}
      >
        <AnimatedOrb size={88} />
      </motion.div>

      <div className="text-center space-y-2">
        <AnimatePresence>
          {step >= 1 && (
            <motion.p
              key="hello"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif text-[2.25rem] text-[#1a1a1a] leading-tight"
            >
              Hello
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 2 && (
            <motion.p
              key="tagline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="text-[0.9375rem] text-[#6b6b6b]"
            >
              I&apos;m retune — your career companion.
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 3 && (
            <motion.p
              key="action"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="text-[0.9375rem] text-[#6b6b6b]"
            >
              Let&apos;s build your professional profile together.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
// Single component handling user + assistant + streaming states with
// consistent styling — no abrupt bubble-shape changes mid-stream.

function MessageBubble({
  role,
  content,
  isStreaming,
}: {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}) {
  const isUser = role === "user";

  return (
    <motion.div
      className={cn(
        "flex max-w-[90%] md:max-w-[80%] gap-2 items-end",
        isUser ? "ml-auto flex-row-reverse" : "mr-auto",
      )}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser && "bg-white",
        )}
        style={{
          boxShadow: isUser
            ? "rgba(14,63,126,0.04) 0px 0px 0px 1px, rgba(42,51,69,0.04) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 3px 3px -1.5px"
            : "none",
        }}
      >
        {isUser ? <User className="w-4 h-4 text-stone-800" /> : <AnimatedOrb size={32} />}
      </div>

      <div
        className={cn(
          "px-4 py-3 rounded-2xl text-sm text-stone-800 bg-white",
          isUser ? "rounded-br-md" : "rounded-bl-md",
        )}
        style={{
          boxShadow:
            "rgba(14,63,126,0.04) 0px 0px 0px 1px, rgba(42,51,69,0.04) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 3px 3px -1.5px",
        }}
      >
        {isStreaming && content.length === 0 ? (
          <TypingDots />
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {content}
            {isStreaming && content.length > 0 && <StreamingCursor />}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" style={{ height: "1.1em" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-400 inline-block"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{
            duration: 1.1,
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.18,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block w-[2px] h-[0.9em] ml-[2px] align-middle bg-[#b84ed1] opacity-75 rounded-sm animate-[blink_0.9s_ease-in-out_infinite]" />
  );
}

// ─── Message row (bubble + optional attachments) ──────────────────────────────

function MessageRow({
  msg,
  isLast,
  isStreaming,
  disabled,
  onSelectChip,
}: {
  msg: UIMessage;
  isLast: boolean;
  isStreaming: boolean;
  disabled: boolean;
  onSelectChip: (chip: string) => void;
}) {
  const showChips =
    isLast && !isStreaming && msg.role === "assistant" && (msg.chips?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <MessageBubble
        role={msg.role}
        content={msg.content}
        isStreaming={isStreaming && msg.role === "assistant" && isLast}
      />
      {msg.card && (
        <div className={CHAT_GUTTER_CLASS}>
          <SectionCard section={msg.card.section} data={msg.card.data} />
        </div>
      )}
      {showChips && (
        <div className={CHAT_GUTTER_CLASS}>
          <QuickReplyChips chips={msg.chips ?? []} onSelect={onSelectChip} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

function ChatView() {
  const {
    messages,
    isStreaming,
    isComplete,
    extractionStatus,
    errorMessage,
    sendMessage,
    confirmChip,
    uploadFile,
  } = useOnboardingChat();

  const [inputValue, setInputValue] = useState("");
  const [showDropzone, setShowDropzone] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any content change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [messages, isStreaming, showDropzone, isComplete]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isStreaming || isComplete) return;
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(text);
  };

  const handleChipSelect = (chip: string) => {
    if (chip === UPLOAD_CHIP_LABEL) {
      setShowDropzone(true);
      return;
    }
    confirmChip(chip);
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  const [canScrollUp, setCanScrollUp] = useState(false);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      // In flex-col-reverse, scrollTop > 0 means user has scrolled up (away from bottom)
      setCanScrollUp(scrollContainerRef.current.scrollTop > 40);
    }
  };

  const lastIndex = messages.length - 1;

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[680px] flex-col overflow-hidden">
      {/* Subtle scroll indicator — only visible when user has scrolled up */}
      <AnimatePresence>
        {canScrollUp && (
          <motion.div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm shadow-sm border border-[#e5e2dd]">
              <ArrowUp className="w-3.5 h-3.5 text-stone-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* flex-col-reverse: items stack from bottom up; overflow scrolls upward naturally */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse px-3 md:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="space-y-4 pt-4 pb-4">
          {messages.map((msg, i) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              isLast={i === lastIndex}
              isStreaming={isStreaming}
              disabled={isStreaming || isComplete}
              onSelectChip={handleChipSelect}
            />
          ))}

          <AnimatePresence>
            {showDropzone && !isComplete && (
              <motion.div
                key="dropzone"
                className={CHAT_GUTTER_CLASS}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                <UploadDropzone
                  onFile={(f) => {
                    setShowDropzone(false);
                    uploadFile(f);
                  }}
                  disabled={extractionStatus === "pending"}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {errorMessage && !isStreaming && (
            <div className={cn(CHAT_GUTTER_CLASS, "text-xs text-red-600")}>{errorMessage}</div>
          )}

          <AnimatePresence>
            {isComplete && (
              <motion.div
                key="completion"
                className="flex items-center justify-center py-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CompletionAnimation />
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Composer — pinned bottom of the column */}
      {!isComplete && (
        <div className="flex-shrink-0 px-3 md:px-4 pb-3 pt-2">
          <div
            className="flex flex-col gap-3 p-4 bg-white rounded-3xl w-full"
            style={{
              boxShadow:
                "rgba(14, 63, 126, 0.06) 0px 0px 0px 1px, rgba(42, 51, 69, 0.06) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.06) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.06) 0px 6px 6px -3px, rgba(14, 63, 126, 0.06) 0px 12px 12px -6px, rgba(14, 63, 126, 0.06) 0px 24px 24px -12px",
            }}
          >
            <div className="flex gap-2 items-center">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  handleInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none disabled:opacity-50 max-h-[200px] overflow-y-auto"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputValue.trim() || isStreaming}
                className={cn(
                  "relative h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-all bg-[#1a1a1a]",
                  !inputValue.trim() || isStreaming
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer hover:scale-105 hover:bg-[#333]",
                )}
                aria-label="Send message"
              >
                <ArrowUp className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setShowDropzone(false);
                    uploadFile(f);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || extractionStatus === "pending"}
                className="h-9 w-9 shrink-0 bg-zinc-100 hover:bg-zinc-200 text-stone-700 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
                title="Attach resume"
                aria-label="Attach resume"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <span className="text-xs text-stone-400">PDF or DOCX</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [showChat, setShowChat] = useState(false);
  const handleIntroComplete = useCallback(() => setShowChat(true), []);

  return (
    <div className="h-full w-full px-2 md:px-4">
      <div className="relative h-full w-full max-w-[760px] mx-auto">
        <BloomTransition
          showChat={showChat}
          introContent={<IntroPhase onComplete={handleIntroComplete} />}
          chatContent={<ChatView />}
        />
      </div>
    </div>
  );
}
