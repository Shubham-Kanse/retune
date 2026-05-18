"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as React from "react";
import { EditModalShell } from "./edit-modal-shell";

export interface PreferencesFormState {
  target_role: string;
  target_role_specificity: string;
  resume_frame: string;
  underrepresented_skills: string[];
  deemphasis_preferences: string[];
  career_transition_framing: string;
  gap_handling: string;
  achievement_depth: string;
}

interface EditPreferencesModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: PreferencesFormState;
  onSave: (next: PreferencesFormState) => Promise<void> | void;
}

const HIGHLIGHT_OPTIONS = [
  { label: "Side projects", value: "side_projects" },
  { label: "Open source", value: "open_source" },
  { label: "Leadership", value: "leadership" },
  { label: "Specific technologies", value: "specific_tech" },
  { label: "Domain knowledge", value: "domain_knowledge" },
];

const DEEMPHASIS_OPTIONS = [
  { label: "Older roles (5+ years)", value: "older_roles" },
  { label: "Academic work", value: "academic" },
  { label: "A specific job", value: "specific_job" },
  { label: "A particular skill", value: "specific_skill" },
];

const TRANSITION_OPTIONS = [
  { label: "Feature it as relevant context", value: "feature_as_context" },
  { label: "Keep it brief", value: "keep_brief" },
  { label: "Only what transfers directly", value: "transferable_only" },
  { label: "I'll figure it out later", value: "deferred" },
];

const GAP_OPTIONS = [
  { label: "Leave them as is", value: "leave_as_is" },
  { label: "Add a brief note", value: "add_note" },
  { label: "Minimise them", value: "minimise" },
  { label: "Handle in resume", value: "handle_in_resume" },
];

const ACHIEVEMENT_OPTIONS = [
  { label: "I'll share metrics", value: "will_share" },
  { label: "Not easily measured", value: "not_applicable" },
  { label: "Prefer not to include", value: "prefer_not" },
];

export function EditPreferencesModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: EditPreferencesModalProps) {
  const [state, setState] = React.useState<PreferencesFormState>(initial);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setState(initial);
  }, [initial, open]);

  const toggle = (key: "underrepresented_skills" | "deemphasis_preferences", v: string) =>
    setState((s) => ({
      ...s,
      [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v],
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
      title="Edit resume preferences"
      description="These preferences shape every resume Retune generates for you."
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-5">
        <FieldGroup label="Target role">
          <Input
            value={state.target_role}
            onChange={(e) => setState({ ...state, target_role: e.target.value })}
            placeholder="Senior Backend Engineer"
          />
          <Input
            value={state.target_role_specificity}
            onChange={(e) => setState({ ...state, target_role_specificity: e.target.value })}
            placeholder="Focus, company size, type of work..."
          />
        </FieldGroup>

        <FieldGroup label="Resume frame">
          <Textarea
            rows={2}
            value={state.resume_frame}
            onChange={(e) => setState({ ...state, resume_frame: e.target.value })}
            placeholder="What's the single most important takeaway?"
          />
        </FieldGroup>

        <FieldGroup label="Highlight">
          <ChipGroup
            options={HIGHLIGHT_OPTIONS}
            selected={state.underrepresented_skills}
            onToggle={(v) => toggle("underrepresented_skills", v)}
          />
        </FieldGroup>

        <FieldGroup label="De-emphasise">
          <ChipGroup
            options={DEEMPHASIS_OPTIONS}
            selected={state.deemphasis_preferences}
            onToggle={(v) => toggle("deemphasis_preferences", v)}
          />
        </FieldGroup>

        <FieldGroup label="Career transition framing">
          <SingleChipGroup
            options={TRANSITION_OPTIONS}
            value={state.career_transition_framing}
            onChange={(v) => setState({ ...state, career_transition_framing: v })}
          />
        </FieldGroup>

        <FieldGroup label="Employment gaps">
          <SingleChipGroup
            options={GAP_OPTIONS}
            value={state.gap_handling}
            onChange={(v) => setState({ ...state, gap_handling: v })}
          />
        </FieldGroup>

        <FieldGroup label="Achievement depth">
          <SingleChipGroup
            options={ACHIEVEMENT_OPTIONS}
            value={typeof state.achievement_depth === "string" ? state.achievement_depth : ""}
            onChange={(v) => setState({ ...state, achievement_depth: v })}
          />
        </FieldGroup>
      </div>
    </EditModalShell>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
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

function SingleChipGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
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
