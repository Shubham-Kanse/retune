"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import Link from "next/link";

export function AppTopbar() {
  return (
    <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur md:hidden">
      <Link href="/dashboard" className="text-sm font-semibold">
        Retuned
      </Link>
      <SidebarTrigger />
    </nav>
  );
}
