import { cn } from "@/lib/utils";

export function DotsLoader({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1", className)} aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-[bounce-dots_1.4s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

export function PulseDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
    </span>
  );
}

export function TextShimmer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "bg-[linear-gradient(110deg,var(--color-muted-foreground),35%,var(--color-foreground),50%,var(--color-muted-foreground),75%,var(--color-muted-foreground))] bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2s_linear_infinite]",
        className,
      )}
    >
      {children}
    </span>
  );
}
