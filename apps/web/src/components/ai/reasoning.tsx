"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function Reasoning({
  title = "What Retuned noticed",
  children,
  defaultOpen = false,
  isStreaming = false,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isStreaming?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen || isStreaming);

  return (
    <div className={cn("rounded-2xl border border-border bg-card/70 backdrop-blur-sm", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          {isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />}
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-200", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}> 
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 py-3 text-sm leading-6 text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}
