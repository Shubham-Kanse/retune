"use client";

import { JdPrompt } from "@/components/generate/jd-prompt";
import { PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Recent = {
  id: string;
  role: string;
  company: string;
  verdict: string | null;
  interviewReadyScore: number | null;
  createdAt: string | null;
};

function greet() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late";
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function DashboardClient({
  firstName,
  profileScore,
  totalGenerations,
  shippedCount,
}: {
  firstName: string;
  profileScore: number;
  totalGenerations: number;
  shippedCount: number;
}) {
  const router = useRouter();
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/brain/generations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        setRecent(Array.isArray(data) ? data.slice(0, 6) : []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function handleStart(payload: {
    mode: "text" | "url";
    jdText?: string;
    jdUrl?: string;
    market: "us" | "uk";
  }) {
    const params = new URLSearchParams();
    if (payload.jdText) params.set("jd", payload.jdText);
    if (payload.jdUrl) params.set("url", payload.jdUrl);
    params.set("market", payload.market);
    router.push(`/generate/new?${params.toString()}`);
  }

  return (
    <PageShell width="wide">
      <div className="mb-10 text-center">
        <p className="text-sm text-muted-foreground">{greet()}{firstName ? `, ${firstName}` : ""}.</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          What are we applying to today?
        </h1>
      </div>

      <JdPrompt onStart={handleStart} />

      <div className="mt-14">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Recent tunings
          </h2>
          <Link
            href="/applications"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-muted/30" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <FileText className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No tunings yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste a JD above to run your first tuning.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {recent.map((r) => {
              const href =
                r.verdict === "ship" || r.verdict === "completed"
                  ? `/generate/${r.id}/result`
                  : `/generate/${r.id}`;
              return (
                <li key={r.id}>
                  <Link
                    href={href}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.role || "Untitled role"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.company || "Unknown"} · {timeAgo(r.createdAt)}
                      </p>
                    </div>
                    {r.interviewReadyScore != null ? (
                      <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
                        {Math.round(r.interviewReadyScore)}/100
                      </span>
                    ) : null}
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Profile readiness", value: `${profileScore}%`, href: "/profile" },
          { label: "Total tunings", value: String(totalGenerations || "—"), href: "/applications" },
          { label: "Shipped", value: String(shippedCount || "—"), href: "/applications" },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{s.value}</p>
          </Link>
        ))}
      </div>

      {profileScore < 60 ? (
        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm">
            Your profile is <span className="font-medium">{profileScore}%</span> complete. Tunings improve sharply above 60%.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/profile">Improve profile</Link>
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
