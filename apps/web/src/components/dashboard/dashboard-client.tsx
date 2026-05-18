"use client";

import { JdPrompt } from "@/components/generate/jd-prompt";
import { useRouter } from "next/navigation";

export function DashboardClient({
  profileScore,
  shipped,
  total,
}: {
  firstName: string;
  profileScore: number;
  shipped: number;
  total: number;
}) {
  const router = useRouter();

  function handleStart(payload: { mode: "text" | "url"; jdText?: string; jdUrl?: string; market: "us" | "uk" }) {
    const params = new URLSearchParams();
    if (payload.jdText) params.set("jd", payload.jdText);
    if (payload.jdUrl) params.set("url", payload.jdUrl);
    params.set("market", payload.market);
    router.push(`/generate/new?${params.toString()}`);
  }

  return (
    <div className="space-y-12">
      {/* Tune Now */}
      <section>
        <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Tune now
        </p>
        <JdPrompt onStart={handleStart} />
      </section>

      {/* Metrics */}
      <section>
        <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Metrics
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Shipped", value: shipped || "—" },
            { label: "Total generations", value: total || "—" },
            { label: "Profile readiness", value: `${profileScore}%` },
            { label: "Status", value: profileScore >= 60 ? "Ready" : "Build profile" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
              <p className="text-xl font-semibold tracking-tight">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
