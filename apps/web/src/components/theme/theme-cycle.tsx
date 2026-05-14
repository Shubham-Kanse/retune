"use client";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeCycleButton() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme ?? "system";
  const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  const label = current === "system" ? "System" : current === "dark" ? "Dark" : "Light";

  return (
    <SidebarMenuButton
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${label}. Click to switch to ${next}.`}
      className={cn(
        "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/50 hover:text-primary w-auto transition-all duration-150",
      )}
    >
      {label}
    </SidebarMenuButton>
  );
}
