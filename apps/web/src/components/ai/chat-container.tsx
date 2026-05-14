"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export function ChatContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [children]);

  return (
    <div ref={ref} role="log" className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
      {children}
    </div>
  );
}
