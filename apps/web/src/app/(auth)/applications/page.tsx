"use client";

import { FileText, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface GenerationSummary {
  id: string;
  company: string;
  role: string;
  verdict: string | null;
  interviewReadyScore: number | null;
  atsScore: number | null;
  createdAt: string | null;
}

function statusLabel(verdict: string | null): string {
  if (!verdict) return "Pending";
  switch (verdict) {
    case "ship":
    case "completed":
      return "Shipped";
    case "revise":
      return "Revising";
    case "refuse":
    case "refused":
      return "Refused";
    case "running":
    case "pending":
      return "Running";
    case "failed":
      return "Failed";
    default:
      return verdict;
  }
}

function statusStyle(verdict: string | null): string {
  switch (verdict) {
    case "ship":
    case "completed":
      return "text-[#16a34a] bg-[#d4f5e0] border border-[#bbf7d0]";
    case "refuse":
    case "refused":
      return "text-[#dc2626] bg-[#fef2f2] border border-[#fecaca]";
    case "running":
    case "pending":
      return "text-[#d97706] bg-[#fef9c3] border border-[#fde68a]";
    default:
      return "text-[#6b6b6b] bg-[#f0ede8] border border-[#e5e2dd]";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ApplicationsPage() {
  const [items, setItems] = useState<GenerationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/brain/generations");
        if (!res.ok) throw new Error(`status_${res.status}`);
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "load_failed");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/brain/generations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRemovingId(id);
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setRemovingId(null);
      }, 350);
    } catch {
      // silently fail — item stays in list
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0ede8] flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#00d4d4]" />
            </div>
            <div>
              <p className="rt-label">History</p>
              <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] leading-tight">
                Applications
              </h1>
            </div>
          </div>
          <Link href="/dashboard" className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors">
            <X className="w-4 h-4" />
          </Link>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              <div
                key={i}
                className="flex items-center gap-4 p-4 bg-white border border-[#e5e2dd] rounded-xl"
              >
                <div className="h-3 w-20 bg-[#f0ede8] rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-[#f0ede8] rounded-full animate-pulse" />
                  <div className="h-3 w-32 bg-[#f0ede8] rounded-full animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-[#f0ede8] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="p-6 text-sm rounded-2xl bg-[#fef2f2] border border-[#fecaca] text-[#dc2626]">
            Couldn&apos;t load applications.{" "}
            <Link href="/generate/new" className="underline text-[#1a1a1a]">
              Start a new one
            </Link>
            .
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
          <div className="text-center py-16">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#f0ede8] flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#6b6b6b]" />
            </div>
            <p className="font-serif text-xl text-[#1a1a1a] mb-2">No applications yet</p>
            <p className="text-sm text-[#6b6b6b] mb-6">
              Generate your first application package to see it here.
            </p>
            <Link href="/generate/new" className="rt-btn text-sm">
              Generate your first
            </Link>
          </div>
        )}

        {/* Applications list */}
        {!isLoading && !error && items.length > 0 && (
          <div>
            {items.map((item) => {
              const href =
                item.verdict === "ship" || item.verdict === "completed"
                  ? `/generate/${item.id}/result`
                  : `/generate/${item.id}`;
              const isPendingDelete = confirmId === item.id;
              const isDeleting = deletingId === item.id;
              const isRemoving = removingId === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateRows: isRemoving ? "0fr" : "1fr",
                    opacity: isRemoving ? 0 : 1,
                    transform: isRemoving ? "translateX(10px)" : "translateX(0)",
                    transition:
                      "grid-template-rows 0.3s ease, opacity 0.25s ease, transform 0.3s ease",
                  }}
                >
                  <div style={{ overflow: "hidden" }}>
                    <div className="group flex items-center gap-4 p-5 bg-white border border-[#e5e2dd] rounded-xl hover:shadow-md hover:border-[#d5d2cd] mb-3">
                      <Link href={href} className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-xs text-[#6b6b6b] shrink-0 w-20">
                          {formatDate(item.createdAt)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-[#1a1a1a]">
                            {item.role || "Untitled role"}
                          </p>
                          <p className="text-xs text-[#6b6b6b] truncate">
                            {item.company || "Unknown company"}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-medium px-2.5 py-1 shrink-0 rounded-full ${statusStyle(item.verdict)}`}
                        >
                          {statusLabel(item.verdict)}
                        </span>
                        <span className="text-sm font-medium tabular-nums shrink-0 w-14 text-right text-[#1a1a1a]">
                          {item.interviewReadyScore != null
                            ? `${Math.round(item.interviewReadyScore)}/100`
                            : "—"}
                        </span>
                      </Link>

                      {/* Delete — inline at end, replaces arrow */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          if (isPendingDelete) {
                            handleDelete(item.id);
                          } else {
                            setConfirmId(item.id);
                            setTimeout(
                              () => setConfirmId((prev) => (prev === item.id ? null : prev)),
                              3000,
                            );
                          }
                        }}
                        disabled={isDeleting}
                        className={`shrink-0 opacity-0 group-hover:opacity-100 transition-all disabled:cursor-not-allowed ${
                          isPendingDelete ? "text-[#dc2626] opacity-100" : "text-[#9a9690]"
                        }`}
                        aria-label={isPendingDelete ? "Confirm delete" : "Delete application"}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
