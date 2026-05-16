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
        // editorial type rhythm — only targets raw semantic elements, not components
        "[&_h1]:text-2xl [&_h1]:font-medium [&_h1]:tracking-tight [&_h1]:leading-tight [&_h1]:text-foreground",
        "[&_h2]:text-base [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:mt-12 [&_h2]:mb-4",
        "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-2",
        "[&_p]:text-sm [&_p]:leading-[1.75] [&_p]:text-muted-foreground",
        "[&_p+p]:mt-4",
        "[&_ul]:mt-3 [&_ul]:space-y-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:text-sm [&_ul]:leading-[1.75] [&_ul]:text-muted-foreground",
        "[&_ol]:mt-3 [&_ol]:space-y-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:text-sm [&_ol]:leading-[1.75] [&_ol]:text-muted-foreground",
        "[&_hr]:my-10 [&_hr]:border-border/40",
        "[&_code]:rounded-sm [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-foreground/80",
        "[&_blockquote]:mt-6 [&_blockquote]:border-l [&_blockquote]:border-border/60 [&_blockquote]:pl-4 [&_blockquote]:text-sm [&_blockquote]:text-muted-foreground/80 [&_blockquote]:italic",
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

