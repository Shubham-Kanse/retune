"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface OnboardingHeaderProps {
  stage?: string;
  isStreaming?: boolean;
  onStartOver?: () => void;
  onSkip?: () => void;
  onGoBack?: () => void;
  canGoBack?: boolean;
}

export function OnboardingHeader({ stage, isStreaming, onStartOver, onSkip, onGoBack, canGoBack }: OnboardingHeaderProps) {
  const showActions = stage && stage !== "complete";
  const showStartOver = showActions && stage !== "greeting";

  return (
    <header className="sticky top-0 z-20 flex-shrink-0 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          {canGoBack && onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              disabled={isStreaming}
              className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Go back to previous step"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
            Retuned
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden text-xs text-muted-foreground md:block">Setting up your profile</p>
          {showStartOver && onStartOver && (
            <button
              type="button"
              onClick={onStartOver}
              disabled={isStreaming}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Start over
            </button>
          )}
          {showActions && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isStreaming}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Finish later
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
