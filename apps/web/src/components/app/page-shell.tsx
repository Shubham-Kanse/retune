import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function PageShell({
  children,
  className,
  width = "default",
}: {
  children: ReactNode;
  className?: string;
  width?: "default" | "narrow" | "wide" | "full";
}) {
  const maxClass =
    width === "narrow"
      ? "max-w-xl"
      : width === "wide"
        ? "max-w-4xl"
        : width === "full"
          ? "max-w-none"
          : "max-w-2xl";
  return (
    <div
      className={cn(
        "mx-auto w-full px-8 py-12 md:py-16",
        maxClass,
        // editorial type rhythm — only targets direct semantic children, not nested components
        "[&>h1]:text-2xl [&>h1]:font-medium [&>h1]:tracking-tight [&>h1]:leading-tight [&>h1]:text-foreground",
        "[&>h2]:text-base [&>h2]:font-medium [&>h2]:tracking-tight [&>h2]:text-foreground [&>h2]:mt-12 [&>h2]:mb-4",
        "[&>h3]:text-sm [&>h3]:font-medium [&>h3]:text-foreground [&>h3]:mt-8 [&>h3]:mb-2",
        "[&>p]:text-sm [&>p]:leading-[1.75] [&>p]:text-muted-foreground",
        "[&>p+p]:mt-4",
        "[&>ul]:mt-3 [&>ul]:space-y-1 [&>ul]:pl-4 [&>ul]:list-disc [&>ul]:text-sm [&>ul]:leading-[1.75] [&>ul]:text-muted-foreground",
        "[&>ol]:mt-3 [&>ol]:space-y-1 [&>ol]:pl-4 [&>ol]:list-decimal [&>ol]:text-sm [&>ol]:leading-[1.75] [&>ol]:text-muted-foreground",
        "[&>hr]:my-10 [&>hr]:border-border/40",
        "[&>code]:rounded-sm [&>code]:bg-muted/60 [&>code]:px-1 [&>code]:py-px [&>code]:font-mono [&>code]:text-[11px] [&>code]:text-foreground/80",
        "[&>blockquote]:mt-6 [&>blockquote]:border-l [&>blockquote]:border-border/60 [&>blockquote]:pl-4 [&>blockquote]:text-sm [&>blockquote]:text-muted-foreground/80 [&>blockquote]:italic",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-medium tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground/80">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

