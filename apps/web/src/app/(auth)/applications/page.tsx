"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Plus, Trash2 } from "lucide-react";
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

function statusLabel(v: string | null) {
  if (!v) return "Pending";
  switch (v) {
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
      return v;
  }
}

function statusColor(v: string | null) {
  switch (v) {
    case "ship":
    case "completed":
      return "text-emerald-600 dark:text-emerald-400";
    case "refuse":
    case "refused":
    case "failed":
      return "text-red-500";
    case "running":
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ApplicationsPage() {
  const [items, setItems] = useState<GenerationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        if (!cancelled) setLoading(false);
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
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {}
    finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="History"
        title="Applications"
        subtitle="Every tuning you've run."
        action={
          <Button asChild size="sm">
            <Link href="/generate/new">
              <Plus className="mr-1.5 size-4" /> New tuning
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load applications.{" "}
          <Link href="/generate/new" className="underline">
            Start a new tuning
          </Link>
          .
        </p>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="mx-auto size-5 text-muted-foreground/60" />
          <p className="mt-4 text-sm text-muted-foreground">No applications yet</p>
          <Button asChild size="sm" className="mt-5">
            <Link href="/generate/new">Run a tuning</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {items.map((item) => {
            const href =
              item.verdict === "ship" || item.verdict === "completed"
                ? `/generate/${item.id}/result`
                : `/generate/${item.id}`;
            const pending = confirmId === item.id;
            const deleting = deletingId === item.id;
            return (
              <div
                key={item.id}
                className="group flex items-center gap-4 py-3 -mx-2 px-2 rounded-md transition-colors hover:bg-muted/30"
              >
                <Link href={href} className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="hidden w-16 shrink-0 text-xs text-muted-foreground sm:inline">
                    {fmt(item.createdAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.role || "Untitled role"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.company || "Unknown company"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${statusColor(item.verdict)}`}>
                    {statusLabel(item.verdict)}
                  </span>
                  <span className="hidden w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground sm:inline">
                    {item.interviewReadyScore != null
                      ? Math.round(item.interviewReadyScore)
                      : "—"}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground/50" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (pending) handleDelete(item.id);
                    else {
                      setConfirmId(item.id);
                      setTimeout(
                        () => setConfirmId((p) => (p === item.id ? null : p)),
                        3000,
                      );
                    }
                  }}
                  disabled={deleting}
                  aria-label={pending ? "Confirm delete" : "Delete"}
                  className={`shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${
                    pending ? "text-destructive opacity-100" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
