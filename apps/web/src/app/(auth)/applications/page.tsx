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
      return "text-brand bg-brand/10 border border-brand/20";
    case "refuse":
    case "refused":
      return "text-[#dc2626] bg-[#fef2f2] border border-[#fecaca]";
    case "running":
    case "pending":
      return "text-[#d97706] bg-[#fef9c3] border border-[#fde68a]";
    default:
      return "text-muted-foreground bg-muted border border-[#e0ddd9]";
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
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between mb-12">
        <div>
          <p className="rt-label mb-3">History</p>
          <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
            Applications
          </h1>
        </div>
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors mb-2">
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
                className="flex items-center gap-4 p-4 rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]"
              >
                <div className="h-3 w-20 bg-muted rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-muted rounded-full animate-pulse" />
                  <div className="h-3 w-32 bg-muted rounded-full animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-muted rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="p-6 text-sm rounded-3xl border border-[#fecaca] bg-[#fef2f2]/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] text-[#dc2626]">
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
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-muted flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="font-serif text-xl text-foreground mb-2">No applications yet</p>
            <p className="text-sm text-muted-foreground mb-6">
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
                    <div className="group flex items-center gap-4 p-5 rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:shadow-lg hover:border-foreground/15 mb-3">
                      <Link href={href} className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground shrink-0 w-20">
                          {formatDate(item.createdAt)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-foreground">
                            {item.role || "Untitled role"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.company || "Unknown company"}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-medium px-2.5 py-1 shrink-0 rounded-full ${statusStyle(item.verdict)}`}
                        >
                          {statusLabel(item.verdict)}
                        </span>
                        <span className="text-sm font-medium tabular-nums shrink-0 w-14 text-right text-foreground">
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
                          isPendingDelete ? "text-[#dc2626] opacity-100" : "text-muted-foreground"
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
  );
}
