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

function statusTone(v: string | null) {
  switch (v) {
    case "ship":
    case "completed":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400";
    case "refuse":
    case "refused":
    case "failed":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "running":
    case "pending":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
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
        subtitle="Every tuning you've run, with current status and readiness score."
        action={
          <Button asChild size="sm">
            <Link href="/generate/new">
              <Plus className="mr-1.5 size-4" /> New tuning
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Couldn&apos;t load applications.{" "}
          <Link href="/generate/new" className="underline">
            Start a new tuning
          </Link>
          .
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">No applications yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run your first tuning to see it here.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link href="/generate/new">Run a tuning</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item) => {
            const href =
              item.verdict === "ship" || item.verdict === "completed"
                ? `/generate/${item.id}/result`
                : `/generate/${item.id}`;
            const pending = confirmId === item.id;
            const deleting = deletingId === item.id;
            return (
              <li
                key={item.id}
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent"
              >
                <Link href={href} className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="hidden w-20 shrink-0 text-xs text-muted-foreground sm:inline">
                    {fmt(item.createdAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.role || "Untitled role"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.company || "Unknown company"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusTone(item.verdict)}`}
                  >
                    {statusLabel(item.verdict)}
                  </span>
                  <span className="hidden w-14 shrink-0 text-right font-mono text-xs tabular-nums text-foreground sm:inline">
                    {item.interviewReadyScore != null
                      ? `${Math.round(item.interviewReadyScore)}/100`
                      : "—"}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
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
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
