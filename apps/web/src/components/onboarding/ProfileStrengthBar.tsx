"use client";

import { motion } from "motion/react";

interface Props {
  filledCount: number;
  totalRequired: number;
}

export function ProfileStrengthBar({ filledCount, totalRequired }: Props) {
  const pct = totalRequired > 0 ? Math.round((filledCount / totalRequired) * 100) : 0;
  const color = pct < 40 ? "bg-red-400" : pct < 80 ? "bg-amber-400" : "bg-emerald-400";
  const label = pct === 100 ? "Complete!" : `${filledCount}/${totalRequired} fields`;

  return (
    <div className="w-full px-4 py-2 border-b border-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">Profile progress</span>
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
