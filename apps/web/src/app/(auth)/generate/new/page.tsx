"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { DriftCheckDialog } from "@/components/generate/drift-check-dialog";
import { JdPrompt } from "@/components/generate/jd-prompt";
import { Loader } from "@/components/prompt-kit/loader";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/prompt-kit/reasoning";
import type {
  DriftAnswer,
  PreflightDetectResponse,
  PreflightResolveResponse,
} from "@/lib/drift-preflight";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function hasPreflightToken(v: unknown): v is PreflightResolveResponse {
  return typeof v === "object" && v !== null && "preflight_token" in v;
}

type Phase = "form" | "captured" | "preflight" | "starting";

function NewGenerationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledJd = params?.get("jd") ?? "";
  const prefilledUrl = params?.get("url") ?? "";
  const prefilledMarket = (params?.get("market") as "us" | "uk" | null) ?? "us";

  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [preflight, setPreflight] = useState<PreflightDetectResponse | null>(null);
  const [preflightJdHash, setPreflightJdHash] = useState<string | null>(null);
  const [driftModalOpen, setDriftModalOpen] = useState(false);
  const [driftSaving, setDriftSaving] = useState(false);

  // Auto-start if prefilled from dashboard
  const initialMode: "text" | "url" = prefilledUrl ? "url" : "text";

  async function resolveJd(mode: "text" | "url", jdText?: string, jdUrl?: string): Promise<string> {
    if (mode === "text") return (jdText ?? "").trim();
    const res = await fetch(`/api/jd/fetch?url=${encodeURIComponent((jdUrl ?? "").trim())}`);
    const data = (await res.json().catch(() => null)) as { markdown?: string; error?: string } | null;
    if (!res.ok || !data?.markdown) {
      throw new Error(data?.error ?? "Could not fetch job description from URL.");
    }
    return data.markdown;
  }

  async function start(payload: {
    mode: "text" | "url";
    jdText?: string;
    jdUrl?: string;
    market: "us" | "uk";
  }) {
    setError("");
    setPhase("captured");
    try {
      const profileRes = await fetch("/api/profile");
      if (!profileRes.ok && profileRes.status !== 404) throw new Error("Failed to load profile.");
      const profile = await profileRes.json().catch(() => null);
      const jdBody = await resolveJd(payload.mode, payload.jdText, payload.jdUrl);

      setPhase("preflight");
      const preflightRes = await fetch("/api/generate/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jdBody }),
      });
      const preflightData = (await preflightRes.json().catch(() => null)) as PreflightDetectResponse | null;
      if (!preflightRes.ok || !preflightData) {
        throw new Error("Failed to run preflight drift detection.");
      }

      if (preflightData.questions.length > 0) {
        setPreflight(preflightData);
        setPreflightJdHash(preflightData.jd_hash ?? null);
        setDriftModalOpen(true);
        return;
      }

      const auto = await fetch("/api/generate/preflight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_hash: preflightData.jd_hash, answers: [] }),
      });
      const autoData = (await auto.json().catch(() => null)) as PreflightResolveResponse | null;
      if (!auto.ok || !autoData?.preflight_token) {
        throw new Error("Could not finalize drift preflight.");
      }
      setPreflightJdHash(preflightData.jd_hash ?? null);
      setPhase("starting");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_url: payload.mode === "url" ? payload.jdUrl : undefined,
          jd_text: payload.mode === "text" ? payload.jdText : undefined,
          profile_text: profile?.profileMarkdown ?? "",
          market: payload.market.toUpperCase(),
          preflight_token: autoData.preflight_token,
          jd_hash: preflightData.jd_hash,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "System failure.");
      }
      const { generation_id } = (await res.json()) as { generation_id: string };
      router.push(`/generate/${generation_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error");
      setPhase("form");
    }
  }

  async function continueAfterDrift(answers: DriftAnswer[]) {
    setDriftSaving(true);
    setError("");
    try {
      const save = await fetch("/api/generate/preflight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_hash: preflightJdHash, answers }),
      });
      const saveData = (await save.json().catch(() => null)) as
        | PreflightResolveResponse
        | { error?: string }
        | null;
      if (!save.ok || !hasPreflightToken(saveData)) {
        const err =
          typeof saveData === "object" && saveData && "error" in saveData ? saveData.error : undefined;
        throw new Error(err || "Could not save drift answers.");
      }

      const profileRes = await fetch("/api/profile");
      const profile = await profileRes.json().catch(() => null);

      setDriftModalOpen(false);
      setPhase("starting");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_url: prefilledUrl || undefined,
          jd_text: prefilledJd || undefined,
          profile_text: profile?.profileMarkdown ?? "",
          market: prefilledMarket.toUpperCase(),
          preflight_token: saveData.preflight_token,
          jd_hash: preflightJdHash,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? "System failure.");
      }
      const { generation_id } = (await res.json()) as { generation_id: string };
      router.push(`/generate/${generation_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error");
      setPhase("form");
    } finally {
      setDriftSaving(false);
    }
  }

  const busy = phase !== "form";
  const loadingCopy =
    phase === "captured"
      ? "Capturing the job description…"
      : phase === "preflight"
        ? "Extracting role signals and checking profile drift…"
        : phase === "starting"
          ? "Starting the tuning workflow…"
          : "";

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="New tuning"
        title="What are you applying to?"
        subtitle="Paste a job URL or the full description. We'll check profile drift, then run a tuning."
        action={
          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Dashboard
          </Link>
        }
      />

      {busy ? (
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="flex items-start gap-4">
            <Loader variant="circular" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Retuned is starting your tuning</p>
              <p className="text-sm text-muted-foreground">{loadingCopy}</p>
            </div>
          </div>
        </div>
      ) : (
        <JdPrompt
          onStart={start}
          busy={busy}
          placeholderText={prefilledJd || "Paste a job description, a job URL, or describe the role…"}
        />
      )}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        <Reasoning>
          <ReasoningTrigger>What Retuned will produce</ReasoningTrigger>
          <ReasoningContent>
            A tailored resume (or UK CV), cover letter, ATS / readiness audit, and application
            strategy — each editable and exportable.
          </ReasoningContent>
        </Reasoning>
        <Reasoning>
          <ReasoningTrigger>Before tuning</ReasoningTrigger>
          <ReasoningContent>
            Retuned may ask a few drift questions if the role needs evidence not yet in your
            career profile.
          </ReasoningContent>
        </Reasoning>
      </div>

      {preflight ? (
        <DriftCheckDialog
          open={driftModalOpen}
          summary={preflight.drift_summary}
          questions={preflight.questions}
          saving={driftSaving}
          errorText={error}
          onClose={() => {
            setDriftModalOpen(false);
            setDriftSaving(false);
            setPhase("form");
          }}
          onSubmit={continueAfterDrift}
        />
      ) : null}
    </PageShell>
  );
}

export default function NewGenerationPage() {
  return (
    <Suspense fallback={<PageShell><Loader variant="circular" /></PageShell>}>
      <NewGenerationInner />
    </Suspense>
  );
}
