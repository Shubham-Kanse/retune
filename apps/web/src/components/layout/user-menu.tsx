"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, Crown, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserMenuProps {
  userName?: string | null;
  userEmail: string;
  isPro?: boolean;
}

export function UserMenu({ userName, userEmail, isPro }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = userName
    ? userName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0]?.toUpperCase() ?? "")
        .join("")
    : userEmail.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>{userName?.split(" ")[0] || userEmail.split("@")[0]}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-20 mt-2 w-[min(16rem,calc(100vw-2rem))] border border-border bg-background shadow-lg animate-in fade-in slide-in-from-top-2 duration-150"
            role="menu"
            aria-label="User menu"
          >
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-foreground text-sm font-semibold text-background">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {userName || userEmail.split("@")[0]}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
                  {isPro && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Crown className="h-3 w-3 text-brand" />
                      <span className="text-xs text-brand font-medium">Pro</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-2">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push("/settings");
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">Settings</div>
                  <div className="text-xs text-muted-foreground">Account & billing</div>
                </div>
              </button>
            </div>
            <div className="p-2 border-t border-border">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted">
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">Sign out</div>
                  <div className="text-xs text-muted-foreground">End your session</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
