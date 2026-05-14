import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <main
      id="main-content"
      className="relative mx-auto flex w-full max-w-6xl items-center justify-center px-6 py-12 md:py-20"
    >
      <div className="pointer-events-none absolute left-1/2 top-24 hidden h-[280px] w-[640px] -translate-x-1/2 bg-orange-100 opacity-40 blur-3xl dark:opacity-25 md:block" />
      <div
        className={cn(
          "relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm",
          className,
        )}
      >
        <Link href="/" className="mb-8 inline-block text-base font-semibold tracking-tight">
          Retuned
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
