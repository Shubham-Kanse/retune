"use client";

import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import * as React from "react";
import { EditModalShell } from "./edit-modal-shell";

interface EditSkillsModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: string[];
  onSave: (skills: string[]) => Promise<void> | void;
}

export function EditSkillsModal({ open, onOpenChange, initial, onSave }: EditSkillsModalProps) {
  const [skills, setSkills] = React.useState<string[]>(initial);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setSkills(initial);
  }, [initial, open]);

  const addSkill = () => {
    const value = draft.trim();
    if (!value) return;
    if (skills.includes(value)) return;
    setSkills([...skills, value]);
    setDraft("");
  };

  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(skills);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Edit skills"
      description="Add, remove, or reorder skills. Press Enter to add."
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSkill();
          }}
          className="flex gap-2"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a skill — e.g. Rust"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Add
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {skills.length === 0 ? (
            <p className="text-xs text-muted-foreground">No skills yet.</p>
          ) : (
            skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground"
              >
                {skill}
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  onClick={() => removeSkill(skill)}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>
    </EditModalShell>
  );
}
