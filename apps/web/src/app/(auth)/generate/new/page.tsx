"use client";

import { ColorOrb } from "@/components/ui/color-orb";
import { ArrowRight, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DriftCheckDialog } from "@/components/generate/drift-check-dialog";
import type {
  DriftAnswer,
  PreflightDetectResponse,
  PreflightResolveResponse,
} from "@/lib/drift-preflight";

type InputMode = "text" | "url";
type Market = "us" | "uk";
type GenerationUiPhase = "form" | "captured" | "preflight" | "starting";

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hasPreflightToken(v: unknown): v is PreflightResolveResponse {
  return typeof v === "object" && v !== null && "preflight_token" in v;
}

export default function NewGenerationPage() {
  const router = useRouter();

  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [jdText, setJdText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [market, setMarket] = useState<Market>("us");
  const [loading, setLoading] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [driftSaving, setDriftSaving] = useState(false);
  const [driftModalOpen, setDriftModalOpen] = useState(false);
  const [preflight, setPreflight] = useState<PreflightDetectResponse | null>(null);
  const [preflightJdHash, setPreflightJdHash] = useState<string | null>(null);
  const [uiPhase, setUiPhase] = useState<GenerationUiPhase>("form");
  const [error, setError] = useState("");

  const loadingCopy = useMemo(() => {
    switch (uiPhase) {
      case "captured":
        return "Input captured. Retune is waking up the pipeline...";
      case "preflight":
        return "Running JD structuring and profile drift checks...";
      case "starting":
        return "Drift resolved. Starting generation workflow...";
      default:
        return "";
    }
  }, [uiPhase]);

  async function resolveJdForPreflight(): Promise<string> {
    if (inputMode === "text") return jdText.trim();
    const res = await fetch(`/api/jd/fetch?url=${encodeURIComponent(urlInput.trim())}`);
    const data = (await res.json().catch(() => null)) as { markdown?: string; error?: string } | null;
    if (!res.ok || !data?.markdown) {
      throw new Error(data?.error ?? "Could not fetch job description from URL.");
    }
    return data.markdown;
  }

  const canSubmit =
    !loading && (inputMode === "url" ? isValidUrl(urlInput.trim()) : jdText.trim().length > 50);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setUiPhase("captured");
    setPreflightLoading(true);

    try {
      const profileRes = await fetch("/api/profile");
      if (!profileRes.ok && profileRes.status !== 404) throw new Error("Failed to load profile.");
      const profile = await profileRes.json().catch(() => null);
      const jdBody = await resolveJdForPreflight();
      setUiPhase("preflight");

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
        setPreflightLoading(false);
        return;
      }

      const autoResolve = await fetch("/api/generate/preflight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_hash: preflightData.jd_hash, answers: [] }),
      });
      const autoData = (await autoResolve.json().catch(() => null)) as PreflightResolveResponse | null;
      if (!autoResolve.ok || !autoData?.preflight_token) {
        throw new Error("Could not finalize drift preflight.");
      }
      setPreflightJdHash(preflightData.jd_hash ?? null);

      setLoading(true);
      setPreflightLoading(false);
      setUiPhase("starting");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // In URL mode send the URL — pipeline fetches it server-side during JD analysis
          jd_url: inputMode === "url" ? urlInput.trim() : undefined,
          jd_text: inputMode === "text" ? jdText.trim() : undefined,
          profile_text: profile?.profileMarkdown ?? "",
          market: market.toUpperCase(),
          preflight_token: autoData.preflight_token,
          jd_hash: preflightData.jd_hash,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "System failure.");
      }
      const { generation_id } = (await res.json()) as { generation_id: string };
      router.push(`/generate/${generation_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error");
      setLoading(false);
      setPreflightLoading(false);
      setUiPhase("form");
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
        const err = typeof saveData === "object" && saveData && "error" in saveData ? saveData.error : undefined;
        throw new Error(err || "Could not save drift answers.");
      }

      const profileRes = await fetch("/api/profile");
      if (!profileRes.ok && profileRes.status !== 404) throw new Error("Failed to load profile.");
      const profile = await profileRes.json().catch(() => null);

      setDriftModalOpen(false);
      setLoading(true);
      setUiPhase("starting");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_url: inputMode === "url" ? urlInput.trim() : undefined,
          jd_text: inputMode === "text" ? jdText.trim() : undefined,
          profile_text: profile?.profileMarkdown ?? "",
          market: market.toUpperCase(),
          preflight_token: saveData.preflight_token,
          jd_hash: preflightJdHash,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "System failure.");
      }
      const { generation_id } = (await res.json()) as { generation_id: string };
      router.push(`/generate/${generation_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Internal error");
      setLoading(false);
      setUiPhase("form");
    } finally {
      setDriftSaving(false);
    }
  }

  const showAliveLoading =
    preflightLoading || loading || uiPhase === "captured" || uiPhase === "preflight" || uiPhase === "starting";
  const orbTones = {
    base: "oklch(96% 0.01 120)",
    accent1: "oklch(60% 0.16 155)",
    accent2: "oklch(82% 0.12 155)",
    accent3: "oklch(55% 0.12 170)",
  };

  return (
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      <div className="w-full">
        {showAliveLoading ? (
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-6 text-center">
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                <ColorOrb dimension="80px" tones={orbTones} spinDuration={8} />
              </motion.div>
              <div className="space-y-2">
                <p className="font-serif text-2xl text-foreground">Retune is working</p>
                <p className="text-sm text-muted-foreground">{loadingCopy}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[#7c746b]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
                  style={{ animationDelay: "120ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
                  style={{ animationDelay: "240ms" }}
                />
              </div>
              {error && (
                <p role="alert" className="text-xs text-[#dc2626]">
                  {error}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="rt-label mb-3">New application</p>
            <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
              Generate
            </h1>
          </div>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors mb-2">
            <X className="w-4 h-4" />
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] overflow-hidden">
            {/* Mode + market toggles */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e0ddd9]">
              <div className="flex items-center gap-0 border border-[#e0ddd9] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode("url");
                    setError("");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    inputMode === "url"
                      ? "bg-[#f0ede8] text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  
                  Job URL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode("text");
                    setError("");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    inputMode === "text"
                      ? "bg-[#f0ede8] text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  
                  Paste text
                </button>
              </div>

              <div className="flex items-center gap-0 border border-[#e0ddd9] rounded-lg overflow-hidden">
                {(["us", "uk"] as Market[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarket(m)}
                    className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                      market === m
                        ? "bg-[#f0ede8] text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {m === "us" ? "US" : "UK"}
                  </button>
                ))}
              </div>
            </div>

            {/* URL input */}
            {inputMode === "url" && (
              <div className="p-4">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setError("");
                  }}
                  placeholder="https://company.com/careers/role-123"
                  disabled={loading}
                  className="w-full rt-input text-sm font-mono"
                  autoFocus
                />
              </div>
            )}

            {/* Text input */}
            {inputMode === "text" && (
              <textarea
                value={jdText}
                onChange={(e) => {
                  setJdText(e.target.value);
                  setError("");
                }}
                placeholder="Paste the full job description here…"
                disabled={loading}
                autoFocus
                className="w-full px-4 py-4 text-sm leading-relaxed placeholder:text-[#ccc8c3] focus:outline-none resize-none bg-transparent"
                style={{ minHeight: 200 }}
              />
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-xl px-3 py-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || preflightLoading}
            className="rt-btn w-full py-3.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {preflightLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking profile drift...
              </>
            ) : loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building your package…
              </>
            ) : (
              <>
                Start generation
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {!loading && (
            <p className="text-center text-xs text-muted-foreground">30–60 seconds · live progress</p>
          )}
        </form>
          </>
        )}
      </div>

      {preflight && (
        <DriftCheckDialog
          open={driftModalOpen}
          summary={preflight.drift_summary}
          questions={preflight.questions}
          saving={driftSaving}
          errorText={error}
          onClose={() => {
            setDriftModalOpen(false);
            setDriftSaving(false);
            setUiPhase("form");
          }}
          onSubmit={continueAfterDrift}
        />
      )}
    </div>
  );
}
