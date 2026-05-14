"use client";

import Link from "next/link";

interface OnboardingHeaderProps {
  stage?: string;
  isStreaming?: boolean;
  onStartOver?: () => void;
  onSkip?: () => void;
}

export function OnboardingHeader({ stage, isStreaming, onStartOver, onSkip }: OnboardingHeaderProps) {
  const showActions = stage && stage !== "complete";
  const showStartOver = showActions && stage !== "greeting";

  return (
    <header className="flex-shrink-0 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        <nav className="flex items-center justify-between h-14">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
            Retuned
          </Link>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground hidden md:block">Setting up your profile</p>
            {showStartOver && onStartOver && (
              <button
                type="button"
                onClick={onStartOver}
                disabled={isStreaming}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Start over
              </button>
            )}
            {showActions && onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={isStreaming}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Skip for now
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
