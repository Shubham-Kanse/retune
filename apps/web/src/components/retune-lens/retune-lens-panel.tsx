"use client";

import { Button } from "@/components/ui/button";
import type {
  CareerUnderstandingPatch,
  CareerUnderstandingSlice,
  EvidenceRef,
  UnderstandingIntentPreset,
  UnderstandingScope,
  UnderstandingSection,
} from "@/lib/career-understanding";
import { cn } from "@/lib/utils";
import * as React from "react";
import { ColorOrb } from "./color-orb";
import { RetuneLensPreview } from "./retune-lens-preview";
import { RetuneLensTrigger } from "./retune-lens-trigger";

export interface RetuneLensPreviewRequest {
  section: UnderstandingSection;
  scope: UnderstandingScope;
  instruction: string;
  intentPreset?: UnderstandingIntentPreset;
}

export interface RetuneLensPreviewResponse {
  previewId: string;
  previewToken: string;
  before: CareerUnderstandingSlice;
  after: CareerUnderstandingSlice;
  changeSummary: string[];
  evidenceRefs?: EvidenceRef[];
  patch?: CareerUnderstandingPatch;
}

export interface RetuneLensPanelProps {
  label: string;
  section: UnderstandingSection;
  defaultScope: UnderstandingScope;
  availableScopes: UnderstandingScope[];
  defaultInstruction?: string;
  intents?: UnderstandingIntentPreset[];
  stale?: boolean;
  compact?: boolean;
  contextId?: string;
  className?: string;
  onPreview: (request: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply: (previewId: string, previewToken: string) => Promise<void>;
}

type PanelState =
  | { kind: "closed" }
  | { kind: "preview"; preview: RetuneLensPreviewResponse }
  | { kind: "applying"; preview: RetuneLensPreviewResponse }
  | { kind: "error"; message: string };

export function RetuneLensPanel({
  label,
  section,
  defaultScope,
  availableScopes,
  defaultInstruction,
  intents,
  stale,
  compact,
  contextId,
  className,
  onPreview,
  onApply,
}: RetuneLensPanelProps) {
  const [state, setState] = React.useState<PanelState>({ kind: "closed" });
  const [retryCount, setRetryCount] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Escape closes the preview panel.
  React.useEffect(() => {
    if (state.kind === "closed") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  function close() {
    setState({ kind: "closed" });
  }

  async function handleApply(preview: RetuneLensPreviewResponse) {
    setState({ kind: "applying", preview });
    try {
      await onApply(preview.previewId, preview.previewToken);
      close();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not apply the preview.",
      });
    }
  }

  function handleTryAgain() {
    setState({ kind: "closed" });
    setRetryCount((c) => c + 1);
  }

  return (
    <div className={cn(compact ? "relative inline-flex items-center" : "relative", className)} data-context-id={contextId}>
      <RetuneLensTrigger
        label={label}
        section={section}
        stale={stale}
        compact={compact}
        loading={state.kind === "applying"}
        defaultInstruction={defaultInstruction}
        intents={intents}
        forceOpen={retryCount}
        onSubmit={(submitted) => {
          setState({ kind: "closed" });
          onPreview({
            section,
            scope: defaultScope,
            instruction: submitted,
          })
            .then((preview) => setState({ kind: "preview", preview }))
            .catch((err) =>
              setState({
                kind: "error",
                message: err instanceof Error ? err.message : "Could not generate a preview.",
              }),
            );
        }}
      />

      {state.kind !== "closed" ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={`Retune Lens: ${label}`}
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg max-w-xl motion-safe:animate-[spinner-fade_180ms_ease-out]"
        >
          <div className="mb-3 flex items-center gap-2">
            <ColorOrb size={18} />
            <p className="text-sm font-medium text-foreground">{label}</p>
            {stale ? (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Re-read needed
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Close Retune Lens"
              onClick={close}
              className="ml-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span aria-hidden>×</span>
            </button>
          </div>

          {state.kind === "error" ? (
            <div className="space-y-3">
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {state.message}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={close}>Close</Button>
              </div>
            </div>
          ) : null}

          {state.kind === "preview" ? (
            <RetuneLensPreview
              before={state.preview.before}
              after={state.preview.after}
              changeSummary={state.preview.changeSummary}
              evidenceRefs={state.preview.evidenceRefs}
              onApply={() => handleApply(state.preview)}
              onTryAgain={handleTryAgain}
              onDiscard={close}
            />
          ) : null}

          {state.kind === "applying" ? (
            <RetuneLensPreview
              before={state.preview.before}
              after={state.preview.after}
              changeSummary={state.preview.changeSummary}
              evidenceRefs={state.preview.evidenceRefs}
              applying
              onApply={() => handleApply(state.preview)}
              onTryAgain={handleTryAgain}
              onDiscard={close}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
