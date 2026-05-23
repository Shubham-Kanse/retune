"use client";

import type { UnderstandingIntentPreset, UnderstandingSection } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { ColorOrb } from "./color-orb";

export interface RetuneLensTriggerProps {
  label: string;
  stale?: boolean;
  className?: string;
  ariaLabel?: string;
  onSubmit: (instruction: string) => void;
  loading?: boolean;
  defaultInstruction?: string;
  intents?: UnderstandingIntentPreset[];
  forceOpen?: number;
  compact?: boolean;
  section?: UnderstandingSection;
}

const FORM_WIDTH = 360;

const INTENT_LABELS: Record<UnderstandingIntentPreset, string> = {
  accurate: "Mark accurate",
  different_angle: "Different angle",
  more_technical: "More technical",
  more_product_focused: "More product-focused",
  more_senior: "More senior",
  less_exaggerated: "Less exaggerated",
  re_read_profile: "Re-read profile",
};

/**
 * Section-aware prompt templates. Some sections (positioning, evidence, resume_fuel)
 * regenerate multiple items in one call, so the prompt must instruct the AI to keep
 * each item's distinct role while applying the requested lean across all of them.
 */
const SUMMARY_PROMPTS: Partial<Record<UnderstandingIntentPreset, string>> = {
  accurate: "This summary is accurate. Keep it as is.",
  different_angle:
    "Reframe the summary with a different angle on my experience. Try a fresh narrative that still fits the evidence on my profile.",
  more_technical:
    "Lean the summary more technical. Emphasize engineering depth, systems thinking, and hands-on craft. Stay grounded in evidence.",
  more_product_focused:
    "Lean the summary more product-focused. Emphasize outcomes, user impact, product judgment, and cross-functional work. Stay grounded in evidence.",
  more_senior:
    "Position the summary more senior. Emphasize scope, leadership, strategic impact, and ownership. Do not exaggerate beyond evidence.",
  less_exaggerated:
    "Tone the summary down. Remove anything that overstates my experience. Stay closer to literal evidence on my profile.",
  re_read_profile:
    "Re-read my profile from scratch and regenerate the summary based purely on the latest evidence.",
};

const POSITIONING_PROMPTS: Partial<Record<UnderstandingIntentPreset, string>> = {
  different_angle: `Regenerate all three positioning angles with fresh framing.

Apply this lean across all three: try genuinely different narratives I have not seen yet — pull from less-obvious threads in my background.

Keep each angle's distinct role:
- Primary: my strongest, most defensible positioning for the majority of roles I'd target.
- Alternative: a meaningfully different positioning for a different slice of roles.
- Stretch: an aspirational positioning that's a reach but defensible from my evidence.

Stay grounded in evidence. Do not invent experience.`,

  more_technical: `Regenerate all three positioning angles with a more technical lean.

Apply this lean across all three: emphasize engineering depth, systems thinking, technical craft, and hands-on building.

Keep each angle's distinct role:
- Primary: my strongest technical positioning for the majority of roles I'd target.
- Alternative: a different technical angle for a different slice of roles (e.g., infra vs product eng, or research vs applied).
- Stretch: a more ambitious technical positioning that's a reach but defensible.

Stay grounded in evidence. Do not invent experience.`,

  more_product_focused: `Regenerate all three positioning angles with a more product-focused lean.

Apply this lean across all three: emphasize outcomes, user impact, product judgment, cross-functional collaboration, and shipped value.

Keep each angle's distinct role:
- Primary: my strongest product-leaning positioning for the majority of roles.
- Alternative: a different product-leaning angle for a different slice of roles.
- Stretch: a more ambitious product positioning that's a reach but defensible.

Stay grounded in evidence. Do not invent experience.`,

  more_senior: `Regenerate all three positioning angles with more seniority.

Apply this lean across all three: emphasize scope, leadership, strategic impact, ownership, and influence.

Keep each angle's distinct role:
- Primary: my strongest senior-level positioning for the majority of roles.
- Alternative: a different senior positioning (e.g., IC track vs management track, or breadth vs depth).
- Stretch: an aspirational senior positioning that's a reach but defensible from my evidence.

Do not exaggerate beyond what my profile supports.`,

  less_exaggerated: `Regenerate all three positioning angles with a more grounded, less embellished tone.

Apply this lean across all three: stay close to literal evidence, drop anything that overstates my experience, prefer honest framing over confident framing.

Keep each angle's distinct role:
- Primary: my strongest defensible positioning, conservatively framed.
- Alternative: a different conservatively-framed positioning for a different slice of roles.
- Stretch: an aspirational positioning, but only as much of a stretch as evidence honestly supports.`,

  re_read_profile: `Re-read my profile from scratch and regenerate all three positioning angles based purely on the latest evidence.

Keep each angle's distinct role:
- Primary: my strongest defensible positioning for the majority of roles.
- Alternative: a meaningfully different positioning for a different slice of roles.
- Stretch: an aspirational but defensible positioning.`,
};

const EVIDENCE_PROMPTS: Partial<Record<UnderstandingIntentPreset, string>> = {
  re_read_profile:
    "Re-read my profile and rebuild the evidence map. Pull the strongest signals, supporting evidence, and any gaps directly from my latest profile.",
  more_technical:
    "Re-prioritize evidence to emphasize technical signals — engineering depth, systems work, and hands-on craft.",
  more_product_focused:
    "Re-prioritize evidence to emphasize product signals — outcomes, user impact, and cross-functional work.",
  more_senior:
    "Re-prioritize evidence to emphasize signals of seniority — scope, leadership, ownership, strategic impact.",
};

const RESUME_FUEL_PROMPTS: Partial<Record<UnderstandingIntentPreset, string>> = {
  re_read_profile:
    "Re-read my profile and regenerate the resume fuel — strongest bullets, achievements, and language to use across resume sections.",
  more_technical:
    "Regenerate resume fuel with a more technical lean. Emphasize engineering work, systems, and craft.",
  more_product_focused:
    "Regenerate resume fuel with a more product-focused lean. Emphasize outcomes, user impact, and cross-functional contributions.",
  more_senior:
    "Regenerate resume fuel with more senior framing. Emphasize scope, leadership, and strategic impact.",
  less_exaggerated:
    "Regenerate resume fuel with more grounded language. Stay close to literal evidence.",
};

const SECTION_PROMPTS: Record<
  UnderstandingSection,
  Partial<Record<UnderstandingIntentPreset, string>>
> = {
  summary: SUMMARY_PROMPTS,
  positioning: POSITIONING_PROMPTS,
  evidence: EVIDENCE_PROMPTS,
  resume_fuel: RESUME_FUEL_PROMPTS,
  skills_interpretation: SUMMARY_PROMPTS,
  resume_strategy: SUMMARY_PROMPTS,
};

function getIntentPrompt(
  section: UnderstandingSection | undefined,
  intent: UnderstandingIntentPreset,
): string {
  if (section) {
    const sectionMap = SECTION_PROMPTS[section];
    const prompt = sectionMap?.[intent];
    if (prompt) return prompt;
  }
  // Fallback to summary prompt or label
  return SUMMARY_PROMPTS[intent] ?? INTENT_LABELS[intent];
}

const MAX_CHIPS = 3;

export const RetuneLensTrigger = React.forwardRef<HTMLButtonElement, RetuneLensTriggerProps>(
  function RetuneLensTrigger(
    {
      label,
      stale,
      className,
      ariaLabel,
      onSubmit,
      loading,
      defaultInstruction,
      intents,
      forceOpen,
      compact,
      section,
    },
    _ref,
  ) {
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState("");
    const hasChips = intents && intents.length > 0;

    const triggerOpen = React.useCallback(() => {
      if (defaultInstruction) {
        onSubmit(defaultInstruction);
        return;
      }
      setOpen(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }, [defaultInstruction, onSubmit]);

    const triggerClose = React.useCallback(() => {
      setOpen(false);
      setValue("");
    }, []);

    const prevForceOpen = React.useRef(forceOpen ?? 0);
    React.useEffect(() => {
      if ((forceOpen ?? 0) > prevForceOpen.current) {
        prevForceOpen.current = forceOpen ?? 0;
        setOpen(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    }, [forceOpen]);

    React.useEffect(() => {
      if (!open) return;
      function handler(e: MouseEvent) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          if (value.trim().length === 0) triggerClose();
        }
      }
      function escHandler(e: KeyboardEvent) {
        if (e.key === "Escape") {
          e.preventDefault();
          triggerClose();
        }
      }
      document.addEventListener("mousedown", handler);
      document.addEventListener("keydown", escHandler);
      return () => {
        document.removeEventListener("mousedown", handler);
        document.removeEventListener("keydown", escHandler);
      };
    }, [open, value, triggerClose]);

    function handleKeys(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === "Escape") {
        e.preventDefault();
        triggerClose();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }

    function handleSubmit() {
      if (!value.trim() || loading) return;
      onSubmit(value.trim());
      triggerClose();
    }

    function handleChip(intent: UnderstandingIntentPreset) {
      setValue(getIntentPrompt(section, intent));
      setTimeout(() => textareaRef.current?.focus(), 0);
    }

    return (
      <div
        ref={wrapperRef}
        className={cn(compact ? "relative inline-flex items-center" : "relative", className)}
      >
        {/* Resting pill — always in normal flow, hidden when open */}
        {!open && (
          <button
            type="button"
            aria-label={ariaLabel ?? `Tune with AI: ${label}`}
            onClick={triggerOpen}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border bg-background text-foreground font-medium hover:bg-accent transition-colors whitespace-nowrap",
              compact ? "px-2.5 h-7 text-xs" : "px-3 h-11 text-sm",
            )}
          >
            <ColorOrb size={compact ? 14 : 20} />
            {label}
            {stale && (
              <span
                aria-label="needs re-read"
                className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
              />
            )}
          </button>
        )}

        {/* Expanded panel — absolutely positioned, morphs open */}
        <AnimatePresence>
          {open && (
            <motion.div
              data-retune-lens
              layout
              className="overflow-hidden rounded-3xl border border-border bg-card/60 shadow-sm backdrop-blur-sm"
              initial={{ width: 160, opacity: 0, scale: 0.95 }}
              animate={{ width: FORM_WIDTH, opacity: 1, scale: 1 }}
              exit={{ width: 160, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 32, mass: 0.6 }}
            >
              <div className="flex flex-col gap-2 p-3">
                {/* Header: orb on the left, close X on the right */}
                <div className="flex items-center justify-between">
                  <ColorOrb size={18} />
                  <button
                    type="button"
                    onClick={triggerClose}
                    aria-label="Close"
                    className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      role="img"
                      aria-hidden="true"
                    >
                      <title>Close</title>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Intent chips */}
                {hasChips && (
                  <div className="flex flex-wrap gap-1.5">
                    {intents.slice(0, MAX_CHIPS).map((intent) => (
                      <button
                        key={intent}
                        type="button"
                        onClick={() => handleChip(intent)}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-accent transition-colors"
                      >
                        {INTENT_LABELS[intent]}
                      </button>
                    ))}
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeys}
                  placeholder="Type your instruction…"
                  rows={3}
                  className="w-full resize-none rounded-xl bg-background border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10 placeholder:text-muted-foreground/60"
                  spellCheck={false}
                />

                {/* Footer with Tune button */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground/60">Press Enter to tune</p>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!value.trim() || loading}
                    className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Tune
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);
