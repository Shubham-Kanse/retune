"use client";

import { DriftCheckDialog, DriftCheckLoading } from "@/components/generate/drift-check-dialog";
import type {
  DriftAnswer,
  PreflightDetectResponse,
  PreflightResolveResponse,
} from "@/lib/drift-preflight";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MIN_JOB_DESCRIPTION_LENGTH = 50;

export function validateJobDescriptionInput(jd: string): string | null {
  if (jd.trim().length < MIN_JOB_DESCRIPTION_LENGTH) {
    return `Paste at least ${MIN_JOB_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}

export function NewApplicationModal({
  open,
  onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [driftSaving, setDriftSaving] = useState(false);
  const [driftModalOpen, setDriftModalOpen] = useState(false);
  const [preflight, setPreflight] = useState<PreflightDetectResponse | null>(null);
  const [preflightJdHash, setPreflightJdHash] = useState<string | null>(null);
  const [error, setError] = useState("");

  function hasPreflightToken(v: unknown): v is PreflightResolveResponse {
    return typeof v === "object" && v !== null && "preflight_token" in v;
  }

  async function launchGeneration(token: string, jdHash: string | null) {
    const profileRes = await fetch("/api/profile");
    if (!profileRes.ok && profileRes.status !== 404) throw new Error("Failed to load profile.");
    const profile = await profileRes.json().catch(() => null);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jd_text: jd.trim(),
        profile_text: profile?.profileMarkdown ?? "",
        preflight_token: token,
        jd_hash: jdHash,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    onOpenChange(false);
    router.push(`/generate/${data.generation_id}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateJobDescriptionInput(jd);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setPreflightLoading(true);
    try {
      const pre = await fetch("/api/generate/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jd.trim() }),
      });
      const preData = (await pre.json().catch(() => null)) as PreflightDetectResponse | null;
      if (!pre.ok || !preData) {
        setError("Failed to run preflight drift check.");
        return;
      }
      if (preData.questions.length > 0) {
        setPreflight(preData);
        setPreflightJdHash(preData.jd_hash ?? null);
        setDriftModalOpen(true);
        return;
      }
      const autoResolve = await fetch("/api/generate/preflight", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_hash: preData.jd_hash, answers: [] }),
      });
      const autoData = (await autoResolve.json().catch(() => null)) as PreflightResolveResponse | null;
      if (!autoResolve.ok || !autoData?.preflight_token) {
        throw new Error("Could not finalize drift preflight.");
      }
      setLoading(true);
      await launchGeneration(autoData.preflight_token, preData.jd_hash ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPreflightLoading(false);
      setLoading(false);
    }
  }

  async function continueAfterDrift(answers: DriftAnswer[]) {
    setDriftSaving(true);
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
        throw new Error(err || "Failed to save drift answers.");
      }
      setLoading(true);
      await launchGeneration(saveData.preflight_token, preflightJdHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDriftSaving(false);
      setLoading(false);
      setDriftModalOpen(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="rt-card fixed left-1/2 top-1/2 z-50 max-h-[calc(100svh-4rem)] w-[calc(100vw-4rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-medium">New Application</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="rt-icon-btn" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="jd" className="rt-label">
                Job Description
              </label>
              <textarea
                id="jd"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                placeholder="Paste the full job description here..."
                rows={12}
                maxLength={15000}
                autoFocus
                className="rt-textarea mt-2 resize-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {jd.length.toLocaleString()} / 15,000
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || preflightLoading || validateJobDescriptionInput(jd) !== null}
              className="rt-btn w-full justify-center"
            >
              {preflightLoading ? "Checking drift..." : loading ? "Creating..." : "Generate Package →"}
            </button>
          </form>
          {preflightLoading && (
            <div className="mt-4 rounded-xl border border-[#e5e2dd] p-3">
              <DriftCheckLoading />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      {preflight && (
        <DriftCheckDialog
          open={driftModalOpen}
          summary={preflight.drift_summary}
          questions={preflight.questions}
          saving={driftSaving}
          errorText={error}
          onClose={() => setDriftModalOpen(false)}
          onSubmit={continueAfterDrift}
        />
      )}
    </Dialog.Root>
  );
}
