"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as React from "react";
import { EditModalShell } from "./edit-modal-shell";

interface VoiceFormState {
  natural_voice_sample: string;
  tone_preferences: string[];
  tone_aversions: string[];
}

interface EditVoiceModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: VoiceFormState;
  onSave: (next: VoiceFormState) => Promise<void> | void;
}

const TONE_OPTIONS = [
  { label: "Direct and confident", value: "direct_confident" },
  { label: "Technical and precise", value: "technical_precise" },
  { label: "Warm and collaborative", value: "warm_collaborative" },
  { label: "Leadership-focused", value: "leadership_focused" },
  { label: "Results-driven", value: "results_driven" },
  { label: "Understated", value: "understated" },
  { label: "Bold", value: "bold" },
  { label: "Conversational", value: "conversational" },
];

const AVERSION_OPTIONS = [
  { label: "Corporate buzzwords", value: "corporate_buzzwords" },
  { label: "Overly humble", value: "overly_humble" },
  { label: "Overly boastful", value: "overly_boastful" },
  { label: "Jargon-heavy", value: "jargon_heavy" },
  { label: "Vague or fluffy", value: "vague_fluffy" },
  { label: "Too casual", value: "too_casual" },
  { label: "First-person (I/we)", value: "first_person" },
];

/**
 * Re-runs the Stage 8 voice questions in modal form. On save, the parent
 * persists the answers and triggers the voice-extraction LLM call which
 * produces an updated tone_calibration_summary.
 */
export function EditVoiceModal({ open, onOpenChange, initial, onSave }: EditVoiceModalProps) {
  const [state, setState] = React.useState<VoiceFormState>(initial);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setState(initial);
  }, [initial, open]);

  const togglePref = (val: string) =>
    setState((s) => ({
      ...s,
      tone_preferences: s.tone_preferences.includes(val)
        ? s.tone_preferences.filter((v) => v !== val)
        : [...s.tone_preferences, val],
    }));

  const toggleAversion = (val: string) =>
    setState((s) => ({
      ...s,
      tone_aversions: s.tone_aversions.includes(val)
        ? s.tone_aversions.filter((v) => v !== val)
        : [...s.tone_aversions, val],
    }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(state);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Edit voice profile"
      description="Update the voice and tone Retune uses when generating resumes for you."
      onSave={handleSave}
      saving={saving}
      saveLabel="Save & re-tune"
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Describe what you do (in your own words)
          </Label>
          <Textarea
            rows={5}
            value={state.natural_voice_sample}
            onChange={(e) => setState({ ...state, natural_voice_sample: e.target.value })}
            placeholder="Just write naturally — like you're explaining it to a colleague."
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tone preferences</Label>
          <ChipGroup
            options={TONE_OPTIONS}
            selected={state.tone_preferences}
            onToggle={togglePref}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tone aversions</Label>
          <ChipGroup
            options={AVERSION_OPTIONS}
            selected={state.tone_aversions}
            onToggle={toggleAversion}
          />
        </div>
      </div>
    </EditModalShell>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ label: string; value: string }>;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-muted/40 text-foreground hover:bg-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
