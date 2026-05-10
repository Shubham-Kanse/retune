"use client";

import { UpgradeButton } from "@/components/layout/upgrade-button";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Link2,
  LogOut,
  MessageSquare,
  Settings,
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
  createdAt,
}: { subscription: Sub; email: string; fullName: string; createdAt: Date | null }) {
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
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0ede8] flex items-center justify-center">
              <Settings className="w-4 h-4 text-[#5fc3ff]" />
            </div>
            <div>
              <p className="rt-label">Account</p>
              <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] leading-tight">
                Settings
              </h1>
            </div>
          </div>
          <Link href="/dashboard" className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors">
            <X className="w-4 h-4" />
          </Link>
        </div>

        {/* Main settings list */}
        <div className="bg-white border border-[#e5e2dd] rounded-2xl overflow-hidden mb-6">
          <Link
            href="/profile"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[#faf8f5] transition-colors border-b border-[#e5e2dd] group"
          >
            <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center">
              <User className="w-4 h-4 text-[#ff5555]" />
            </div>
            <span className="flex-1 text-sm font-medium text-[#1a1a1a]">Profile settings</span>
            <ChevronRight className="w-4 h-4 text-[#6b6b6b] group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/voice"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[#faf8f5] transition-colors border-b border-[#e5e2dd] group"
          >
            <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center">
              <Link2 className="w-4 h-4 text-[#b84ed1]" />
            </div>
            <span className="flex-1 text-sm font-medium text-[#1a1a1a]">Voice &amp; style</span>
            <ChevronRight className="w-4 h-4 text-[#6b6b6b] group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/honesty"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[#faf8f5] transition-colors border-b border-[#e5e2dd] group"
          >
            <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-[#f59e0b]" />
            </div>
            <span className="flex-1 text-sm font-medium text-[#1a1a1a]">Honesty calibration</span>
            <ChevronRight className="w-4 h-4 text-[#6b6b6b] group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/settings/data"
            className="flex items-center gap-4 px-6 py-5 hover:bg-[#faf8f5] transition-colors group"
          >
            <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#2d8a5e]" />
            </div>
            <span className="flex-1 text-sm font-medium text-[#1a1a1a]">Privacy &amp; data</span>
            <ChevronRight className="w-4 h-4 text-[#6b6b6b] group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Subscription card */}
        <div className="bg-white border border-[#e5e2dd] rounded-2xl overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-[#e5e2dd]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center">
                  <Database className="w-4 h-4 text-[#5fc3ff]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a1a] capitalize">
                    {subscription.plan} Plan
                  </p>
                  <p className="text-xs text-[#6b6b6b]">
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
            className="flex items-center gap-4 px-6 py-5 hover:bg-[#faf8f5] transition-colors w-full text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-[#f0ede8] flex items-center justify-center">
              <LogOut className="w-4 h-4 text-[#dc2626]" />
            </div>
            <span className="flex-1 text-sm font-medium text-[#dc2626]">Log out</span>
            <ChevronRight className="w-4 h-4 text-[#dc2626] opacity-50" />
          </button>
        </div>

        {/* Account info */}
        <div className="mt-8 space-y-3">
          <p className="text-xs text-[#6b6b6b]">
            <span className="font-medium">{fullName}</span> · {email}
          </p>
          <p className="text-xs text-[#6b6b6b]">
            Member since{" "}
            {createdAt
              ? createdAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "—"}
          </p>
        </div>

        {/* Delete account */}
        <div className="mt-12 pt-8 border-t border-[#e5e2dd]">
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
                <label className="text-xs text-[#6b6b6b] block mb-2" htmlFor="delete-confirm-input">
                  Type <strong className="text-[#1a1a1a]">DELETE</strong> to confirm
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
                  className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
