import { cn } from "@/lib/utils";
import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";

export function Message({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex w-full gap-3", className)}>{children}</div>;
}

export function MessageContent({
  children,
  role = "assistant",
  className,
}: {
  children: React.ReactNode;
  role?: "assistant" | "user";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 whitespace-pre-wrap break-words text-sm leading-6",
        role === "assistant" && "max-w-[760px] text-foreground",
        role === "user" && "max-w-[75%] rounded-3xl bg-muted px-5 py-2.5 text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MessageActions({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100", className)}>
      <button type="button" className="rounded-full p-2 hover:bg-muted" aria-label="Copy message">
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="rounded-full p-2 hover:bg-muted" aria-label="Helpful">
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="rounded-full p-2 hover:bg-muted" aria-label="Not helpful">
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function RetunedMark({ className }: { className?: string }) {
  return (
    <div className={cn("mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm", className)}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        {[ [3,15],[3,13],[3,11],[3,9],[3,7],[3,5],[5,3],[7,3],[9,3],[11,5],[11,7],[11,15],[9,13],[13,13],[7,11],[15,11] ].map(([x, y], i) => (
          <rect key={`${x}-${y}-${i}`} x={x} y={y} width={2} height={2} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}
