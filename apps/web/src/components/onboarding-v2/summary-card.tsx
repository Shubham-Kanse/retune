"use client";

import { ChipSelector } from "./chip-selector";
import { ConfirmationButtons } from "./confirmation-buttons";
import { type ExtractionCardData, ExtractionDropdown } from "./extraction-dropdown";

interface AmbiguityQuestion {
  field: "role_family" | "seniority";
  question: string;
  options: string[];
}

interface SummaryCardProps {
  message: string;
  extractionCards: ExtractionCardData[];
  ambiguityQuestions: AmbiguityQuestion[];
  flags?: {
    careerTransition?: boolean;
    newGrad?: boolean;
    lowExtractionQuality?: boolean;
  };
  onConfirm: () => void;
  onReject: () => void;
  onSelectAmbiguity: (field: "role_family" | "seniority", value: string) => void;
}

/**
 * Stage 4 summary presentation card. Shown to the user immediately after
 * extraction completes. Renders:
 *   - The natural-language summary message
 *   - Optional ambiguity questions (if role/seniority were unclear)
 *   - A collapsible dropdown with the structured extraction
 *   - Looks correct / Something is wrong action buttons
 */
export function SummaryCard({
  message,
  extractionCards,
  ambiguityQuestions,
  flags,
  onConfirm,
  onReject,
  onSelectAmbiguity,
}: SummaryCardProps) {
  return (
    <div className="rounded-2xl bg-stone-800 p-4 text-stone-200">
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>

      {flags?.lowExtractionQuality && (
        <p className="mt-2 text-xs text-amber-400/80">
          Some sections were harder to parse than usual — let me know if anything looks off.
        </p>
      )}

      {ambiguityQuestions.length > 0 && (
        <div className="mt-3 space-y-2">
          {ambiguityQuestions.map((q) => (
            <div key={q.field} className="rounded-lg bg-stone-900/40 p-3">
              <p className="text-xs text-stone-300">{q.question}</p>
              <div className="mt-2">
                <ChipSelector
                  chips={q.options.map((o) => ({ label: o, value: o }))}
                  multiSelect={false}
                  onSelect={(v) => onSelectAmbiguity(q.field, v as string)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <ExtractionDropdown cards={extractionCards} />

      <div className="mt-4">
        <ConfirmationButtons onPrimary={onConfirm} onSecondary={onReject} />
      </div>
    </div>
  );
}
