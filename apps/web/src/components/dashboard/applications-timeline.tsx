"use client";

import { cn } from "@/lib/utils";
import { RotateCcw, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface TimelineApplication {
  id: string;
  companyName: string;
  roleTitle: string;
  atsScore: number | null;
  status: string;
  createdAt: string;
}

interface ApplicationsTimelineProps {
  applications: TimelineApplication[];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AtsCounter({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 600;

  useEffect(() => {
    if (target <= 0) return;
    function step(now: number) {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return <>{display}</>;
}

function AtsPill({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs px-1.5 py-0.5",
        score >= 85
          ? "bg-brand/10 text-brand"
          : score >= 70
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "bg-muted text-muted-foreground",
      )}
    >
      <Zap className="h-2.5 w-2.5" />
      <AtsCounter target={Math.round(score)} />%
    </span>
  );
}

function TimelineRow({
  app,
  index,
}: {
  app: TimelineApplication;
  index: number;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  const isCompleted = app.status === "completed";
  const isFailed = app.status === "failed" || app.status === "error";
  const isRetryable = isFailed || app.status === "cancelled";
  const isGenerating = app.status === "generating" || app.status === "pending";

  const rowTarget = isGenerating ? `/generate/${app.id}` : `/applications/${app.id}`;
  const rowClickable = !isRetryable;
  const delay = Math.min(index * 40, 300);

  // Left border color based on status
  const leftBorderClass = isCompleted
    ? hovered
      ? "border-l-brand/60"
      : "border-l-brand/30"
    : isGenerating
      ? hovered
        ? "border-l-amber-400/60"
        : "border-l-amber-400/40"
      : "border-l-muted-foreground/20";

  return (
    <div
      onClick={rowClickable ? () => router.push(rowTarget) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 duration-300",
        "relative flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0",
        "border-l-2 transition-all duration-150",
        leftBorderClass,
        rowClickable ? "cursor-pointer hover:bg-muted/30" : "cursor-default",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Pulse dot for generating */}
          {isGenerating && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
            </span>
          )}
          <p className="truncate text-sm font-medium leading-tight">{app.companyName}</p>
          {isFailed && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-destructive font-medium">
              Failed
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground sm:inline hidden">
          {app.roleTitle}
        </p>
        {/* Role below on mobile */}
        <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">{app.roleTitle}</p>
      </div>

      {/* Right side: ATS pill + retry + time */}
      <div className="shrink-0 flex items-center gap-3">
        {app.atsScore != null && <AtsPill score={app.atsScore} />}

        {isRetryable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/generate/${app.id}`);
            }}
            className={cn(
              "inline-flex items-center gap-1 text-xs text-destructive transition-opacity",
              hovered ? "opacity-100" : "opacity-0",
            )}
            aria-label="Retry generation"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}

        <span
          className="text-xs text-muted-foreground whitespace-nowrap"
          suppressHydrationWarning
          title={new Date(app.createdAt).toLocaleString()}
        >
          {formatRelativeTime(app.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function ApplicationsTimeline({ applications }: ApplicationsTimelineProps) {
  if (applications.length === 0) {
    return (
      <div className="border border-dashed border-border py-14 text-center">
        <span className="block text-2xl text-muted-foreground/30 mb-3 font-light">+</span>
        <p className="text-sm font-medium">No applications yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a job posting URL above to generate your first application package.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border divide-y-0">
      {applications.map((app, index) => (
        <TimelineRow key={app.id} app={app} index={index} />
      ))}
    </div>
  );
}
