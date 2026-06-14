"use client";

import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

const DISMISS_KEY = "retune.onboarding_v2.migration_dismissed";

interface OnboardingV2MigrationCardProps {
  /** Pass true when the user has a v1 profile but no committed v2 profile. */
  show: boolean;
}

/**
 * Dashboard prompt offering existing v1 users an upgrade path into the new
 * v2 onboarding system. Dismissible (localStorage) so users aren't nagged.
 */
export function OnboardingV2MigrationCard({ show }: OnboardingV2MigrationCardProps) {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    if (!show) return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, [show]);

  if (!show || dismissed) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="relative mt-6 overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-card/70 to-transparent p-6 backdrop-blur-md">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 size-4 text-indigo-400" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Your profile just got smarter
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Take 3 minutes to add your voice, positioning, and work-style
            preferences. Your existing evidence carries over — we&apos;ll just
            learn how you write so every tuning sounds like you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/onboarding-v2?enhance=1"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Enhance my profile
            </Link>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
