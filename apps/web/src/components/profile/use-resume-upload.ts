"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export interface ParseQuality {
  score: number;
  weakAreas: string[];
  hasIdentity: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  hasSkills: boolean;
  hasProjects: boolean;
}

export interface ResumePreview {
  extracted: Record<string, unknown>;
  parseQuality: ParseQuality;
  currentProfile: Record<string, unknown> | null;
}

export interface ResumeImportResult {
  profile: Record<string, unknown>;
  completenessScore: number;
  missingQuestions: unknown[];
  ingestionId: string | null;
  parseQuality: ParseQuality | null;
}

type UploadPhase = "idle" | "previewing" | "committing";

export function useResumeUpload(opts: {
  onPreview?: (preview: ResumePreview) => void;
  onCommitted?: (result: ResumeImportResult) => void;
  onError?: (msg: string) => void;
}) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerUpload = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";
    fileRef.current = file;
    setPhase("previewing");

    try {
      const data = new FormData();
      data.append("file", file);
      data.append("dryRun", "true");
      const res = await fetch("/api/profile/import-resume", { method: "POST", body: data });
      if (res.status === 429) {
        toast.error("Too many uploads. Try again in a few minutes.");
        setPhase("idle");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(body.error || "Import failed");
      }
      const result: ResumePreview = await res.json();
      setPreview(result);
      opts.onPreview?.(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
      opts.onError?.(msg);
      setPhase("idle");
    }
  }, [opts]);

  const commit = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setPhase("committing");

    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/profile/import-resume", { method: "POST", body: data });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(body.error || "Import failed");
      }
      const result: ResumeImportResult = await res.json();
      setPreview(null);
      setPhase("idle");
      fileRef.current = null;
      opts.onCommitted?.(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
      opts.onError?.(msg);
      setPhase("idle");
    }
  }, [opts]);

  const cancel = useCallback(() => {
    setPreview(null);
    setPhase("idle");
    fileRef.current = null;
  }, []);

  return {
    phase,
    preview,
    inputRef,
    triggerUpload,
    handleFileChange,
    commit,
    cancel,
    isLoading: phase !== "idle",
  };
}
