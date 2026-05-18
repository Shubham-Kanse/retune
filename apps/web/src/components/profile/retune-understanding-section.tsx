"use client";

import { RetuneLensPanel } from "@/components/retune-lens";
import { ColorOrb } from "@/components/retune-lens/color-orb";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import type { CareerUnderstandingV1 } from "@/lib/career-understanding";
import { Check, Eye } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

export interface RetuneUnderstandingSectionProps {
  understanding: CareerUnderstandingV1 | null;
  understandingPersisted: boolean;
  stale: boolean;
  canGenerate: boolean;
  onMarkAccurate: () => void;
  onPreview: (
    req: RetuneLensPreviewRequest,
    opts: { initial?: boolean },
  ) => Promise<RetuneLensPreviewResponse>;
  onApply: (previewId: string, previewToken: string) => Promise<void>;
}

export function RetuneUnderstandingSection({
  understanding,
  understandingPersisted,
  stale,
  canGenerate,
  onMarkAccurate,
  onPreview,
  onApply,
}: RetuneUnderstandingSectionProps) {
  const [showWhy, setShowWhy] = React.useState(false);

  const [regenerating, setRegenerating] = React.useState(false);

  async function handleRegenerate() {
    if (!canGenerate) {
      toast.warning("Please complete your profile first.");
      return;
    }
    setRegenerating(true);
    try {
      const preview = await onPreview(
        { section: "summary", scope: "everything_affected", instruction: "Re-read my profile and regenerate understanding." },
        { initial: !understandingPersisted },
      );
      await onApply(preview.previewId, preview.previewToken);
    } catch {
      toast.error("Could not regenerate understanding.");
    } finally {
      setRegenerating(false);
    }
  }

  const regenerateButton = (
    <button
      type="button"
      onClick={handleRegenerate}
      disabled={regenerating}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-normal text-foreground hover:bg-accent transition-colors disabled:opacity-50 overflow-hidden"
    >
      <ColorOrb size={14} />
      {regenerating ? "Regenerating…" : "Regenerate"}
    </button>
  );

  // ── Empty state: no persisted understanding yet ──────────────────────────
  if (!understandingPersisted) {
    return (
      <section aria-labelledby="retune-understanding-heading" className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2
            id="retune-understanding-heading"
            className="text-base font-semibold tracking-tight text-foreground mt-0"
          >
            Retune's Understanding
          </h2>
          {regenerateButton}
        </div>
      </section>
    );
  }

  // ── Populated state ───────────────────────────────────────────────────────
  if (!understanding) return null;

  return (
    <section aria-labelledby="retune-understanding-heading" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2
          id="retune-understanding-heading"
          className="text-base font-semibold tracking-tight text-foreground mt-0"
        >
          Retune's Understanding
        </h2>
        {regenerateButton}
      </div>

      <div className="rounded-xl border border-border bg-background p-5 space-y-5">
        {/* Headline */}
        <h3 className="text-base font-semibold text-foreground mt-0">
          {understanding.summary.headline}
        </h3>

        {/* Structured narrative */}
        <StructuredNarrative narrative={understanding.summary.narrative} />

        {/* Show why panel */}
        {showWhy && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
              Why Retune thinks this
            </p>
            {understanding.summary.sourceRefs.length === 0 ? (
              <p className="mt-2 text-muted-foreground italic">No evidence attached to this read.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {understanding.summary.sourceRefs.map((ref) => (
                  <li key={ref.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground/60">{ref.source}</span>
                    <span className="text-foreground">{ref.label}</span>
                    {ref.quote && <span className="text-muted-foreground italic">"{ref.quote}"</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Actions — outside the card */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onMarkAccurate}
          aria-pressed={understanding.userFeedback.summary === "accurate"}
          className={`inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent ${understanding.userFeedback.summary === "accurate" ? "border-foreground bg-accent" : ""}`}
        >
          <Check className="size-4" />
          {understanding.userFeedback.summary === "accurate" ? "Marked accurate" : "Accurate"}
        </button>

        <RetuneLensPanel
          label="Tune with AI"
          section="summary"
          defaultScope="summary"
          availableScopes={["summary", "all_positioning", "everything_affected"]}
          intents={["different_angle", "more_technical", "more_product_focused", "more_senior", "less_exaggerated"]}
          stale={stale}
          onPreview={(req) => onPreview(req, {})}
          onApply={onApply}
        />

        <button
          type="button"
          onClick={() => setShowWhy((s) => !s)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Eye className="size-4" />
          {showWhy ? "Hide why" : "Show why"}
        </button>
      </div>
    </section>
  );
}


// ─── Structured narrative parser ────────────────────────────────────────────

/**
 * The understanding document is generated by the LLM with a fixed set of
 * uppercase section headers (see UNDERSTANDING_GENERATION_SYSTEM_PROMPT in
 * apps/web/src/lib/onboarding-v2/llm/prompts.ts). We parse those headers
 * out of the prose and render each as its own block so the narrative is
 * readable instead of a wall of text.
 */
const KNOWN_SECTIONS: Array<{ key: string; label: string; isList?: boolean }> = [
  { key: "PROFESSIONAL IDENTITY", label: "Professional identity" },
  { key: "CAREER NARRATIVE", label: "Career narrative" },
  { key: "DISTINCTIVE STRENGTHS", label: "Distinctive strengths", isList: true },
  { key: "POSITIONING STRATEGY", label: "Positioning strategy" },
  { key: "VOICE INSTRUCTIONS", label: "Voice instructions" },
  { key: "KNOWN GAPS AND SENSITIVITIES", label: "Known gaps & sensitivities", isList: true },
  { key: "GENERATION DEFAULTS", label: "Generation defaults" },
];

interface ParsedSection {
  label: string;
  isList: boolean;
  body: string;
}

function parseNarrative(narrative: string): ParsedSection[] | null {
  if (!narrative) return null;
  // Build a regex to split on any known header (case-insensitive, whole word)
  const headers = KNOWN_SECTIONS.map((s) => s.key);
  const pattern = new RegExp(`(${headers.join("|")})\\s*[:\\-]?\\s*`, "g");
  const matches: Array<{ key: string; index: number; matchEnd: number }> = [];
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = pattern.exec(narrative)) !== null) {
    matches.push({ key: match[1]!.toUpperCase(), index: match.index, matchEnd: pattern.lastIndex });
  }
  if (matches.length === 0) return null;

  const sections: ParsedSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = matches[i + 1];
    const body = narrative.slice(current.matchEnd, next ? next.index : undefined).trim();
    const meta = KNOWN_SECTIONS.find((s) => s.key === current.key);
    if (!meta) continue;
    sections.push({ label: meta.label, isList: !!meta.isList, body });
  }
  return sections.length > 0 ? sections : null;
}

function StructuredNarrative({ narrative }: { narrative: string }) {
  const sections = React.useMemo(() => parseNarrative(narrative), [narrative]);

  // Fallback: render plain prose if we couldn't find any known headers
  if (!sections) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
        {narrative}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.label} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {section.label}
          </p>
          {section.isList ? (
            <ListBody body={section.body} />
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90">{section.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ListBody({ body }: { body: string }) {
  // Split on bullet-like markers ("- ", "• ", or sentence-bullets " - ")
  const items = body
    .split(/(?:^|\s)[-•]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length <= 1) {
    return <p className="text-sm leading-relaxed text-foreground/90">{body}</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm text-foreground/90">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-1 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
