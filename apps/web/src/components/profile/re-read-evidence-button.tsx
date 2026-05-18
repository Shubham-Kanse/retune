"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { RefreshCw, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
  kind: "added" | "removed" | "changed";
}

interface ReReadEvidenceButtonProps {
  onApplied?: () => void;
}

/**
 * "Re-read evidence" button — re-runs Stage 2 against the stored raw_text
 * and surfaces a diff dialog the user can apply.
 */
export function ReReadEvidenceButton({ onApplied }: ReReadEvidenceButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [diff, setDiff] = React.useState<DiffEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDiff = async () => {
    setLoading(true);
    setError(null);
    setDiff(null);
    try {
      const res = await fetch("/api/profile-v2/re-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Re-read failed");
      }
      const data = await res.json();
      setDiff(data.diff ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-read failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async () => {
    setOpen(true);
    await fetchDiff();
  };

  const apply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/profile-v2/re-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      });
      if (!res.ok) throw new Error("Apply failed");
      toast.success("Applied changes from your resume.");
      setOpen(false);
      onApplied?.();
    } catch {
      toast.error("Could not apply changes.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={handleOpen} className="text-xs">
        <RefreshCw className="mr-1.5 size-3" />
        Re-read evidence
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Re-read evidence
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  I re-ran my reader against your resume. Here&apos;s what changed.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {loading && (
                <p className="text-sm text-muted-foreground">Re-reading your resume...</p>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              {!loading && !error && diff && diff.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No changes — your committed profile already matches the latest read.
                </p>
              )}
              {!loading && !error && diff && diff.length > 0 && (
                <ul className="space-y-1.5">
                  {diff.map((d, i) => (
                    <li
                      key={`${d.field}-${i}`}
                      className="flex items-baseline gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-xs"
                    >
                      <span className={`font-medium ${kindColor(d.kind)}`}>
                        {kindLabel(d.kind)}
                      </span>
                      <span className="text-muted-foreground">{d.field}</span>
                      <span className="ml-auto truncate text-foreground">
                        {d.kind === "removed"
                          ? String(d.before ?? "")
                          : String(d.after ?? "")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                size="sm"
                onClick={apply}
                disabled={applying || loading || !diff || diff.length === 0}
              >
                {applying ? "Applying..." : "Apply changes"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function kindLabel(kind: DiffEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "+ Added";
    case "removed":
      return "− Removed";
    default:
      return "± Changed";
  }
}

function kindColor(kind: DiffEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "text-emerald-500";
    case "removed":
      return "text-red-500";
    default:
      return "text-amber-500";
  }
}
