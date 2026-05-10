"use client";

import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface RefinementUsageBadgeProps {
  used: number;
  limit: number | null;
  isPro: boolean;
}

export function RefinementUsageBadge({ used, limit, isPro }: RefinementUsageBadgeProps) {
  if (isPro) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20">
        <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Unlimited refinements
        </span>
      </div>
    );
  }

  if (!limit) {
    return null;
  }

  const remaining = limit - used;
  const percentage = (remaining / limit) * 100;

  const color = remaining === 0 ? "red" : remaining === 1 ? "amber" : "emerald";

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-sm border",
        color === "red"
          ? "bg-red-500/10 border-red-500/20"
          : color === "amber"
            ? "bg-amber-500/10 border-amber-500/20"
            : "bg-emerald-500/10 border-emerald-500/20",
      )}
    >
      <Sparkles
        className={cn(
          "h-4 w-4",
          color === "red"
            ? "text-red-600 dark:text-red-400"
            : color === "amber"
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400",
        )}
      />
      <span
        className={cn(
          "text-xs font-medium",
          color === "red"
            ? "text-red-700 dark:text-red-300"
            : color === "amber"
              ? "text-amber-700 dark:text-amber-300"
              : "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {remaining} of {limit} refinements
      </span>
    </div>
  );
}
