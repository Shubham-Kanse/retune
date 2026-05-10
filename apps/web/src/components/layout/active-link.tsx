"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

interface ActiveLinkProps extends ComponentProps<typeof Link> {
  navLink?: boolean;
  exact?: boolean;
}

export function ActiveLink({
  href,
  navLink,
  exact,
  className,
  children,
  ...props
}: ActiveLinkProps) {
  const pathname = usePathname() ?? "";
  const hrefStr = href.toString();
  const isActive = exact ? pathname === hrefStr : pathname.startsWith(hrefStr);

  if (navLink) {
    return (
      <Link
        href={href}
        className={cn(
          "text-sm transition-colors pb-0.5",
          isActive
            ? "text-foreground font-medium border-b border-brand/60"
            : "text-muted-foreground hover:text-foreground",
        )}
        {...props}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link href={href} className={className} {...props}>
      {children}
    </Link>
  );
}
