"use client";

import { RetuneLensPanel } from "@/components/retune-lens";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import { ColorOrb } from "@/components/retune-lens/color-orb";
import type { CareerUnderstandingV1, ResumeFuelItem } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Check, Wrench } from "lucide-react";

export interface ResumeFuelSectionProps {
  understanding: CareerUnderstandingV1 | null;
  understandingPersisted: boolean;
  stale?: boolean;
  onPreview?: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply?: (previewId: string, previewToken: string) => Promise<void>;
}

export function ResumeFuelSection({
  understanding,
  understandingPersisted,
  stale,
  onPreview,
  onApply,
}: ResumeFuelSectionProps) {
  if (!understanding || !understandingPersisted) {
    return (
      <section aria-labelledby="resume-fuel-heading" className="space-y-3">
        <h2 id="resume-fuel-heading" className="text-base font-semibold tracking-tight text-foreground mt-0">
          Resume Fuel
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { label: "Ready to use",           hint: "e.g. Roles, skills, education, projects" },
            { label: "Needs sharpening",        hint: "e.g. Metrics, career direction, writing tone" },
            { label: "Risks before generation", hint: "e.g. Missing evidence, unconfirmed claims" },
            { label: "Suggested next edits",    hint: "e.g. Add 2 measurable achievements" },
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
              section="resume_fuel"
              defaultScope="resume_fuel"
              availableScopes={["resume_fuel", "everything_affected"]}
              intents={["re_read_profile", "more_senior", "more_technical"]}
              stale={false}
              onPreview={onPreview}
              onApply={onApply}
            />
          </div>
        )}
      </section>
    );
  }

  const fuel = understanding.resumeFuel;
  const total = fuel.ready.length + fuel.needsSharpening.length + fuel.risks.length + fuel.suggestedNextEdits.length;
  if (total === 0) return null;

  const suggestion = fuel.suggestedNextEdits[0];

  return (
    <section aria-labelledby="resume-fuel-heading" className="space-y-3">
      <h2 id="resume-fuel-heading" className="text-base font-semibold tracking-tight text-foreground mt-0">
        Resume Fuel
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <FuelGroup label="Ready to use" tone="ready" icon={Check} items={fuel.ready} />
        <FuelGroup label="Needs sharpening" tone="warn" icon={Wrench} items={fuel.needsSharpening} />
        <FuelGroup label="Risks before generation" tone="risk" icon={AlertTriangle} items={fuel.risks} />
        <FuelGroup label="Suggested next edits" tone="next" icon={ArrowRight} items={fuel.suggestedNextEdits} />
      </div>

      {suggestion && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
            Retune suggestion
          </p>
          <p className="mt-1 text-sm text-foreground">{suggestion.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{suggestion.whyItMatters}</p>
        </div>
      )}

      {onPreview && onApply && (
        <div className="pt-1">
          <RetuneLensPanel
            label="Tune with AI"
            section="resume_fuel"
            defaultScope="resume_fuel"
            availableScopes={["resume_fuel", "everything_affected"]}
            intents={["re_read_profile", "more_senior", "more_technical"]}
            stale={stale}
            onPreview={onPreview}
            onApply={onApply}
          />
        </div>
      )}
    </section>
  );
}

function FuelGroup({
  label,
  items,
  tone,
  icon: Icon,
}: {
  label: string;
  items: ResumeFuelItem[];
  tone: "ready" | "warn" | "risk" | "next";
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
        <Icon className={cn("size-3.5", tone === "ready" && "text-emerald-600", tone === "warn" && "text-amber-600", tone === "risk" && "text-destructive")} />
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground italic">Nothing here.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.whyItMatters}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
