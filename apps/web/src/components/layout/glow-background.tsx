import { cn } from "@/lib/utils";

type GlowBackgroundProps = {
  variant?: "landing" | "app" | "chat";
  className?: string;
};

export function GlowBackground({ variant = "app", className }: GlowBackgroundProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div
        className={cn(
          "absolute rounded-full blur-3xl",
          variant === "landing" && "left-1/2 top-28 h-[320px] w-[760px] -translate-x-1/2 bg-amber-200/60 dark:bg-amber-500/15",
          variant === "app" && "-right-40 top-24 h-[460px] w-[460px] bg-emerald-300/20 dark:bg-emerald-400/10",
          variant === "chat" && "left-1/2 bottom-16 h-[260px] w-[620px] -translate-x-1/2 bg-zinc-300/35 dark:bg-zinc-700/30",
        )}
      />
      <div
        className={cn(
          "absolute rounded-full blur-3xl",
          variant === "landing" && "-right-32 top-[520px] h-[360px] w-[360px] bg-emerald-300/25 dark:bg-emerald-400/10",
          variant === "app" && "-left-48 bottom-0 h-[420px] w-[420px] bg-amber-200/30 dark:bg-amber-500/10",
          variant === "chat" && "-right-32 top-20 h-[280px] w-[280px] bg-emerald-300/15 dark:bg-emerald-400/10",
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(24_24_27/0.08)_1px,transparent_0)] bg-[size:28px_28px] opacity-[0.18] dark:bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.18)_1px,transparent_0)] dark:opacity-[0.08]" />
    </div>
  );
}
