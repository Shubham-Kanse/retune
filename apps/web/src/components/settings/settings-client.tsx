"use client";

import { UpgradeButton } from "@/components/layout/upgrade-button";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Link2,
  LogOut,
  MessageSquare,
  Shield,
  User,
  X,
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
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      toast.success("Account deleted. Goodbye!");
      setTimeout(() => router.push("/"), 1500);
    } else {
      toast.error("Failed to delete account. Please try again.");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between mb-12">
        <div>
          <p className="rt-label mb-3">Account</p>
          <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
            Settings
          </h1>
        </div>
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors mb-2">
          <X className="w-4 h-4" />
        </Link>
      </div>

        {/* Main settings list */}
        <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] overflow-hidden mb-6">
          <Link
            href="/profile"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[rgba(255,255,255,0.6)] transition-colors border-b border-[#e0ddd9] group"
          >
            <div className="w-9 h-9 rounded-full bg-rose-500/12 flex items-center justify-center">
              <User className="w-4 h-4 text-rose-700" />
            </div>
            <span className="flex-1 text-sm font-medium text-foreground">Profile settings</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/voice"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[rgba(255,255,255,0.6)] transition-colors border-b border-[#e0ddd9] group"
          >
            <div className="w-9 h-9 rounded-full bg-violet-500/12 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-violet-700" />
            </div>
            <span className="flex-1 text-sm font-medium text-foreground">Voice &amp; style</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/honesty"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[rgba(255,255,255,0.6)] transition-colors border-b border-[#e0ddd9] group"
          >
            <div className="w-9 h-9 rounded-full bg-amber-500/12 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-amber-700" />
            </div>
            <span className="flex-1 text-sm font-medium text-foreground">Honesty calibration</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/data"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[rgba(255,255,255,0.6)] transition-colors group"
          >
            <div className="w-9 h-9 rounded-full bg-emerald-500/12 flex items-center justify-center">
              <Shield className="w-4 h-4 text-emerald-700" />
            </div>
            <span className="flex-1 text-sm font-medium text-foreground">Privacy &amp; data</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Subscription card */}
        <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-[#e0ddd9]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-sky-500/12 flex items-center justify-center">
                  <Database className="w-4 h-4 text-sky-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground capitalize">
                    {subscription.plan} Plan
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {subscription.creditsUsed} / {subscription.creditsLimit} credits used
                  </p>
                </div>
              </div>
              {subscription.plan === "free" && <UpgradeButton />}
              {subscription.plan === "pro" && <UpgradeButton />}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-4 px-6 py-5 hover:bg-[rgba(255,255,255,0.6)] transition-colors w-full text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-red-500/12 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-red-700" />
            </div>
            <span className="flex-1 text-sm font-medium text-[#dc2626]">Log out</span>
            <ChevronRight className="w-4 h-4 text-[#dc2626] opacity-50" />
          </button>
        </div>

        {/* Account info */}
        <div className="mt-8 space-y-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">{fullName}</span> · {email}
          </p>
          <p className="text-xs text-muted-foreground">
            Member since {memberSince ?? "—"}
          </p>
        </div>

        {/* Delete account */}
        <div className="mt-12 pt-8 border-t border-[#e0ddd9]">
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="text-xs text-[#dc2626] hover:underline"
            >
              Delete my account permanently
            </button>
          ) : (
            <div className="p-6 border border-[#fecaca] bg-[#fef2f2] rounded-xl space-y-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-[#dc2626] shrink-0 mt-0.5" />
                <p className="text-sm text-[#dc2626]">
                  This permanently deletes all your data, profiles, and generations.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-2" htmlFor="delete-confirm-input">
                  Type <strong className="text-foreground">DELETE</strong> to confirm
                </label>
                <input
                  id="delete-confirm-input"
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  className="rt-input !border-[#fecaca]"
                  placeholder="DELETE"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || deleteInput !== "DELETE"}
                  className="rt-btn-destructive text-xs px-4 py-2"
                >
                  {deleting ? "Deleting..." : "Delete account"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirm(false);
                    setDeleteInput("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
