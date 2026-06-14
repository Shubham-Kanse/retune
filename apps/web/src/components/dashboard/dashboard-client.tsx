"use client";

import { JdPrompt } from "@/components/generate/jd-prompt";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function DashboardClient({
  profileScore,
  hasV2Profile,
  shipped,
  total,
}: {
  firstName: string;
  profileScore: number;
  hasV2Profile: boolean;
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

  const showProfileBanner = profileScore < 60;

  return (
    <div className="space-y-12">
      {/* Profile completion banner */}
      {showProfileBanner && (
        <section>
          <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasV2Profile ? "Your profile needs more detail" : "Complete your profile to start tuning"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {hasV2Profile
                  ? `Profile readiness is ${profileScore}%. Add more evidence to get better tunings.`
                  : "Answer a few questions so Retuned can write applications that sound like you."}
              </p>
            </div>
            <Link
              href="/onboarding-v2?enhance=1"
              className="shrink-0 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {hasV2Profile ? "Add more detail" : "Complete profile"}
            </Link>
          </div>
        </section>
      )}

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
            { label: "Total tunings", value: total || "—" },
            { label: "Profile readiness", value: `${profileScore}%` },
            { label: "Status", value: profileScore >= 60 ? "Ready to tune" : "Build your profile" },
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
