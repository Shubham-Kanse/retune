"use client";

import { cn } from "@/lib/utils";
import { ArrowUp, Square } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";

type PromptInputContextValue = {
  value: string;
  setValue: (value: string) => void;
  isLoading: boolean;
  disabled: boolean;
  onSubmit?: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

function usePromptInput() {
  const context = useContext(PromptInputContext);
  if (!context) throw new Error("PromptInput components must be used inside PromptInput");
  return context;
}

export function PromptInput({
  value,
  onValueChange,
  onSubmit,
  isLoading = false,
  disabled = false,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(value ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentValue = value ?? internalValue;
  const setValue = onValueChange ?? setInternalValue;

  return (
    <PromptInputContext.Provider value={{ value: currentValue, setValue, isLoading, disabled, onSubmit, textareaRef }}>
      <div
        onClick={() => !disabled && textareaRef.current?.focus()}
        className={cn(
          "cursor-text rounded-3xl border border-input bg-popover p-2 shadow-[0_9px_18px_rgba(0,0,0,0.04)] transition-colors",
          "focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/10",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  );
}

export function PromptInputTextarea({ className, placeholder }: { className?: string; placeholder?: string }) {
  const { value, setValue, disabled, onSubmit, textareaRef } = usePromptInput();

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value, textareaRef]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.();
        }
      }}
      className={cn(
        "min-h-11 w-full resize-none border-0 bg-transparent px-3 py-3 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50",
        className,
      )}
    />
  );
}

export function PromptInputActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between gap-2 px-1 pb-1", className)}>{children}</div>;
}

export function PromptInputAction({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="group relative">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm group-hover:block">
        {label}
      </span>
    </div>
  );
}

export function PromptSubmitButton({ onClick }: { onClick?: () => void }) {
  const { value, isLoading, disabled, onSubmit } = usePromptInput();
  const blocked = disabled || (!value.trim() && !isLoading);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
        if (!isLoading) onSubmit?.();
      }}
      disabled={blocked}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={isLoading ? "Stop" : "Send"}
    >
      {isLoading ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
    </button>
  );
}
