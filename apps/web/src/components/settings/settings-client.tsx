"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Lock,
  LogOut,
  MessageSquare,
  Shield,
  User,
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
  {
    href: "/profile",
    label: "Career profile",
    sub: "Your details, experience, skills, voice.",
    icon: User,
  },
  {
    href: "/settings/voice",
    label: "Voice & style",
    sub: "How Retuned should sound when it writes as you.",
    icon: MessageSquare,
  },
  {
    href: "/settings/honesty",
    label: "Honesty calibration",
    sub: "How aggressively to claim ownership of evidence.",
    icon: Lock,
  },
  {
    href: "/settings/culture",
    label: "Culture & values",
    sub: "Signals you want reflected in tunings.",
    icon: Shield,
  },
  {
    href: "/settings/data",
    label: "Privacy & data",
    sub: "Export or delete your stored data.",
    icon: Database,
  },
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

      <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.sub}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Subscription
              </p>
              <p className="mt-1 text-base font-medium capitalize">
                {subscription.plan} plan
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · {subscription.status}
                </span>
              </p>
            </div>
            {subscription.plan !== "max" ? (
              <Button asChild size="sm">
                <Link href="/settings/data#billing">Upgrade</Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {subscription.creditsUsed} of {subscription.creditsLimit} credits used
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <LogOut className="size-4" />
          </div>
          <span className="flex-1 text-sm font-medium text-destructive">Sign out</span>
          <ChevronRight className="size-4 text-destructive/60" />
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Account</p>
          <p className="mt-1 text-sm">
            <span className="font-medium">{fullName}</span>
            <span className="text-muted-foreground"> · {email}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Member since {memberSince ?? "—"}</p>
        </div>
      </section>

      <section
        className={cn(
          "mt-8 rounded-xl border p-5",
          deleteConfirm
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-card",
        )}
      >
        {!deleteConfirm ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Danger zone</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and every tuning.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirm(true)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Delete account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                This permanently deletes all your data, profiles, and tunings. This cannot be undone.
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
                className="border-destructive/30"
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
      </section>
    </PageShell>
  );
}
