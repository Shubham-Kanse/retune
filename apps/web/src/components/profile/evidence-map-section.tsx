"use client";

import { RetuneLensPanel } from "@/components/retune-lens";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import { ColorOrb } from "@/components/retune-lens/color-orb";
import type { CareerUnderstandingV1, EvidenceSignal } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";
import { AlertCircle, ChevronUp, HelpCircle, Minus } from "lucide-react";

export interface EvidenceMapSectionProps {
  understanding: CareerUnderstandingV1 | null;
  understandingPersisted: boolean;
  stale?: boolean;
  onPreview?: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply?: (previewId: string, previewToken: string) => Promise<void>;
}

export function EvidenceMapSection({
  understanding,
  understandingPersisted,
  stale,
  onPreview,
  onApply,
}: EvidenceMapSectionProps) {
  if (!understanding || !understandingPersisted) {
    return (
      <section aria-labelledby="evidence-heading" className="space-y-3">
        <h2 id="evidence-heading" className="text-base font-semibold tracking-tight text-foreground">
          Evidence Retune Is Using
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { label: "Strongest signals",       hint: "e.g. Built production systems, shipped AI workflows" },
            { label: "Supporting signals",       hint: "e.g. Cross-functional work, team leadership" },
            { label: "Weak or missing signals",  hint: "e.g. Quantified impact, seniority evidence" },
            { label: "Inferred but unconfirmed", hint: "e.g. Inferred from tools and project patterns" },
          ].map(({ label, hint }) => (
            <div key={label} className="rounded-lg border border-dashed border-border bg-background p-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50">{label}</p>
              <p className="mt-1.5 text-xs text-muted-foreground/40 italic">{hint}</p>
            </div>
          ))}
        </div>
        {onPreview && onApply && (
          <div className="pt-1">
            <RetuneLensPanel
              label="Tune with AI"
              section="evidence"
              defaultScope="evidence_map"
              availableScopes={["evidence_map", "everything_affected"]}
              intents={["re_read_profile", "more_technical", "more_product_focused"]}
              stale={false}
              onPreview={onPreview}
              onApply={onApply}
            />
          </div>
        )}
      </section>
    );
  }

  const map = understanding.evidenceMap;
  const total = map.strongestSignals.length + map.supportingSignals.length + map.weakSignals.length + map.inferredUnconfirmed.length;
  if (total === 0) return null;

  return (
    <section aria-labelledby="evidence-heading" className="space-y-3">
      <h2 id="evidence-heading" className="text-base font-semibold tracking-tight text-foreground">
        Evidence Retune Is Using
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <SignalGroup label="Strongest signals" tone="strong" icon={ChevronUp} signals={map.strongestSignals} />
        <SignalGroup label="Supporting signals" tone="medium" icon={Minus} signals={map.supportingSignals} />
        <SignalGroup label="Weak or missing signals" tone="weak" icon={AlertCircle} signals={map.weakSignals} />
        <SignalGroup label="Inferred but unconfirmed" tone="inferred" icon={HelpCircle} signals={map.inferredUnconfirmed} />
      </div>
      {onPreview && onApply && (
        <div className="pt-1">
          <RetuneLensPanel
            label="Tune with AI"
            section="evidence"
            defaultScope="evidence_map"
            availableScopes={["evidence_map", "everything_affected"]}
            intents={["re_read_profile", "more_technical", "more_product_focused"]}
            stale={stale}
            onPreview={onPreview}
            onApply={onApply}
          />
        </div>
      )}
    </section>
  );
}

function SignalGroup({
  label,
  signals,
  tone,
  icon: Icon,
}: {
  label: string;
  signals: EvidenceSignal[];
  tone: "strong" | "medium" | "weak" | "inferred";
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
        <Icon className={cn("size-3.5", tone === "strong" && "text-emerald-600", tone === "weak" && "text-amber-600")} />
        {label}
      </p>
      {signals.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground italic">No signals here.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {signals.map((sig) => (
            <li key={sig.id} className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{sig.label}</p>
              <p className="text-xs text-muted-foreground">{sig.interpretation}</p>
              {sig.sourceRefs.length > 0 && (
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  Found in: {sig.sourceRefs.map((r) => r.profilePath).slice(0, 3).join(", ")}
                  {sig.sourceRefs.length > 3 ? ` +${sig.sourceRefs.length - 3}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
