"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronRight,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Sub {
  plan: "free" | "pro" | "max";
  status: string;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  creditsUsedUsd: number;
  creditsLimitUsd: number;
  creditsRemainingUsd: number;
}

const sections = [
  { href: "/profile", label: "Career profile", sub: "Details, experience, skills, voice." },
  { href: "/settings/voice", label: "Voice & style", sub: "How Retuned sounds when writing as you." },
  { href: "/settings/honesty", label: "Honesty calibration", sub: "Claim ownership aggressiveness." },
  { href: "/settings/culture", label: "Culture & values", sub: "Signals reflected in tunings." },
  { href: "/settings/data", label: "Privacy & data", sub: "Export or delete stored data." },
];

export function SettingsClient({
  subscription,
  email,
  fullName,
  memberSince,
}: { subscription: Sub; email: string; fullName: string; memberSince: string | null }) {
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      toast.success("Account deleted.");
      setTimeout(() => router.push("/"), 1500);
    } else {
      toast.error("Failed to delete account. Please try again.");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  const pct =
    subscription.creditsLimit > 0
      ? Math.round((subscription.creditsUsed / subscription.creditsLimit) * 100)
      : 0;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Account preferences, subscription, voice and data."
      />

      {/* Navigation — flat list with dividers */}
      <nav className="divide-y divide-border/50">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-center justify-between gap-4 py-3.5 -mx-2 px-2 rounded-md transition-colors hover:bg-muted/30"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </nav>

      {/* Subscription — flat section */}
      <div className="mt-10 border-t border-border/50 pt-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Subscription</p>
            <p className="mt-0.5 text-sm font-medium capitalize">
              {subscription.plan} plan
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {subscription.status}
              </span>
            </p>
          </div>
          {subscription.plan !== "max" && (
            <Button asChild size="sm" variant="ghost">
              <Link href="/settings/data#billing">Upgrade</Link>
            </Button>
          )}
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {subscription.creditsUsed} / {subscription.creditsLimit} credits
            </span>
            <span className="font-mono tabular-nums">{pct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="mt-8 border-t border-border/50 pt-8">
        <p className="text-xs text-muted-foreground">Account</p>
        <p className="mt-1 text-sm">
          <span className="font-medium">{fullName}</span>
          <span className="text-muted-foreground"> · {email}</span>
        </p>
        {memberSince && (
          <p className="mt-0.5 text-xs text-muted-foreground">Member since {memberSince}</p>
        )}
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={handleLogout}
        className="mt-6 flex items-center gap-2 text-sm text-destructive hover:underline underline-offset-4"
      >
        <LogOut className="size-3.5" />
        Sign out
      </button>

      {/* Danger zone */}
      <div className={cn("mt-10 border-t border-border/50 pt-8", deleteConfirm && "")}>
        {!deleteConfirm ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Danger zone</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and every tuning.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteConfirm(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Delete account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                This permanently deletes all your data. This cannot be undone.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm-input">
                Type <strong className="text-foreground">DELETE</strong> to confirm
              </Label>
              <Input
                id="delete-confirm-input"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="DELETE"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDelete}
                disabled={deleting || deleteInput !== "DELETE"}
                variant="destructive"
                size="sm"
              >
                {deleting ? "Deleting…" : "Delete account"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteConfirm(false);
                  setDeleteInput("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
