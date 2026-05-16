"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, FileText, Plus, X } from "lucide-react";
import { useEffect } from "react";
import type { ParseQuality, ResumePreview } from "./use-resume-upload";

interface ResumePreviewModalProps {
  preview: ResumePreview;
  onApply: () => void;
  onCancel: () => void;
  committing: boolean;
}

export function ResumePreviewModal({ preview, onApply, onCancel, committing }: ResumePreviewModalProps) {
  const { extracted, parseQuality, currentProfile } = preview;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onCancel]);

  const changes = computeChanges(extracted, currentProfile);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] bg-background border border-border rounded-2xl flex flex-col shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Review import</h2>
          </div>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {/* Parse quality warning (Task 9) */}
        {parseQuality.score < 55 && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              We had trouble reading parts of your resume. Review and edit manually below.
              {parseQuality.weakAreas.length > 0 && (
                <span className="block mt-0.5 text-amber-700/80 dark:text-amber-400/80">
                  Weak areas: {parseQuality.weakAreas.join(", ")}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Changes list */}
        <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No changes detected.</p>
          ) : (
            changes.map((change) => (
              <ChangeRow key={change.field} change={change} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <p className="text-xs text-muted-foreground">
            {changes.length} section{changes.length !== 1 ? "s" : ""} will be updated
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={committing}>
              Cancel
            </Button>
            <Button size="sm" onClick={onApply} disabled={committing}>
              {committing ? "Applying…" : "Apply changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChangeItem {
  field: string;
  label: string;
  type: "added" | "changed" | "unchanged";
  summary: string;
}

function ChangeRow({ change }: { change: ChangeItem }) {
  if (change.type === "unchanged") return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <span className={cn(
        "mt-0.5 shrink-0 rounded-full p-0.5",
        change.type === "added" ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600",
      )}>
        {change.type === "added" ? <Plus className="size-3" /> : <Check className="size-3" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{change.label}</p>
        <p className="text-xs text-muted-foreground truncate">{change.summary}</p>
      </div>
      <span className={cn(
        "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        change.type === "added" ? "bg-emerald-500/10 text-emerald-700" : "bg-blue-500/10 text-blue-700",
      )}>
        {change.type === "added" ? "new" : "updated"}
      </span>
    </div>
  );
}

function computeChanges(extracted: Record<string, unknown>, current: Record<string, unknown> | null): ChangeItem[] {
  const changes: ChangeItem[] = [];

  // Identity
  const identityFields = ["fullName", "email", "phone", "location", "linkedin"];
  const identityChanges = identityFields.filter((f) => extracted[f] && extracted[f] !== (current as any)?.[f]);
  if (identityChanges.length > 0) {
    changes.push({
      field: "identity",
      label: "Identity",
      type: current ? "changed" : "added",
      summary: identityChanges.map((f) => `${f}: ${String(extracted[f]).slice(0, 30)}`).join(", "),
    });
  }

  // Experience
  const expArr = Array.isArray(extracted.experience) ? extracted.experience : [];
  if (expArr.length > 0) {
    changes.push({
      field: "experience",
      label: "Experience",
      type: "added",
      summary: `${expArr.length} role${expArr.length !== 1 ? "s" : ""} found`,
    });
  }

  // Education
  const eduArr = Array.isArray(extracted.education) ? extracted.education : [];
  if (eduArr.length > 0) {
    changes.push({
      field: "education",
      label: "Education",
      type: "added",
      summary: `${eduArr.length} entr${eduArr.length !== 1 ? "ies" : "y"} found`,
    });
  }

  // Skills
  const skillSources = [
    extracted.skillsTier1, extracted.skillsTier2, extracted.skillsTier3,
    extracted.technicalSkills, extracted.tools, extracted.professionalSkills,
  ];
  const skillCount = skillSources.reduce<number>((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  if (skillCount > 0) {
    changes.push({
      field: "skills",
      label: "Skills",
      type: "added",
      summary: `${skillCount} skill${skillCount !== 1 ? "s" : ""} found`,
    });
  }

  // Projects
  const projArr = Array.isArray(extracted.projects) ? extracted.projects : [];
  if (projArr.length > 0) {
    changes.push({
      field: "projects",
      label: "Projects",
      type: "added",
      summary: `${projArr.length} project${projArr.length !== 1 ? "s" : ""} found`,
    });
  }

  // Certifications
  const certArr = Array.isArray(extracted.certifications) ? extracted.certifications : [];
  if (certArr.length > 0) {
    changes.push({
      field: "certifications",
      label: "Certifications",
      type: "added",
      summary: `${certArr.length} certification${certArr.length !== 1 ? "s" : ""} found`,
    });
  }

  return changes;
}
