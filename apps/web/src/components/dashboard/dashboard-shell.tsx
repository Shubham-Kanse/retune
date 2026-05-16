"use client";

import { JdPrompt } from "@/components/generate/jd-prompt";
import { PageShell } from "@/components/app/page-shell";
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
  if (!iso) return "-";
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
      {/* Greeting + prompt */}
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50">
          {greet()}{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="mt-1.5 text-xl font-medium tracking-tight text-foreground">
          What are we applying to?
        </h1>
      </div>

      <JdPrompt onStart={handleStart} />

      {/* Stats */}
      <div className="mt-12 flex gap-10 border-t border-border/40 pt-8">
        {[
          { label: "Profile", value: `${profileScore}%`, href: "/profile" },
          { label: "Tunings", value: String(totalGenerations || "0"), href: "/applications" },
          { label: "Shipped", value: String(shippedCount || "0"), href: "/applications" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="group">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50">{s.label}</p>
            <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums transition-colors group-hover:text-muted-foreground">
              {s.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Recent tunings */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50">Recent</p>
          <Link href="/applications" className="text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground">
            All →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground/50">No tunings yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {recent.map((r) => {
              const href =
                r.verdict === "ship" || r.verdict === "completed"
                  ? `/generate/${r.id}/result`
                  : `/generate/${r.id}`;
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="group flex items-center gap-4 py-2.5 -mx-2 px-2 rounded transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                      {r.role || "Untitled role"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground/50">
                      {r.company || "Unknown"} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  {r.interviewReadyScore != null && (
                    <span className="hidden font-mono text-xs tabular-nums text-muted-foreground/40 sm:inline">
                      {Math.round(r.interviewReadyScore)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {profileScore < 60 && (
        <div className="mt-10 flex items-center justify-between border-t border-border/30 pt-6">
          <p className="text-xs text-muted-foreground/60">
            Profile {profileScore}% complete - tunings improve above 60%.
          </p>
          <Link href="/profile" className="text-xs text-muted-foreground/60 transition-colors hover:text-foreground">
            Improve →
          </Link>
        </div>
      )}
    </PageShell>
  );
}
