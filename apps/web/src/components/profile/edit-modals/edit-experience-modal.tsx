"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractionExperience } from "@/lib/onboarding-v2/types";
import * as React from "react";
import { EditModalShell } from "./edit-modal-shell";

interface EditExperienceModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ExtractionExperience | null;
  onSave: (entry: ExtractionExperience) => Promise<void> | void;
}

export function EditExperienceModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: EditExperienceModalProps) {
  const [entry, setEntry] = React.useState<ExtractionExperience>(initial ?? emptyExperience());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setEntry(initial ?? emptyExperience());
  }, [initial, open]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(entry);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditModalShell
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit experience" : "Add experience"}
      description="Update the role, company, dates and bullet points for this entry."
      onSave={handleSave}
      saving={saving}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={entry.title ?? ""}
              onChange={(e) => setEntry({ ...entry, title: e.target.value })}
              placeholder="Senior Software Engineer"
            />
          </Field>
          <Field label="Company">
            <Input
              value={entry.company ?? ""}
              onChange={(e) => setEntry({ ...entry, company: e.target.value })}
              placeholder="Acme Corp"
            />
          </Field>
          <Field label="Location">
            <Input
              value={entry.location ?? ""}
              onChange={(e) => setEntry({ ...entry, location: e.target.value })}
              placeholder="Dublin, Ireland"
            />
          </Field>
          <Field label="Currently here">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={entry.is_current}
                onChange={(e) =>
                  setEntry({
                    ...entry,
                    is_current: e.target.checked,
                    end_date: e.target.checked ? null : entry.end_date,
                  })
                }
              />
              I still work here
            </label>
          </Field>
          <Field label="Start">
            <Input
              value={entry.start_date ?? ""}
              onChange={(e) => setEntry({ ...entry, start_date: e.target.value })}
              placeholder="2022-03"
            />
          </Field>
          <Field label="End">
            <Input
              value={entry.end_date ?? ""}
              disabled={entry.is_current}
              onChange={(e) => setEntry({ ...entry, end_date: e.target.value })}
              placeholder="2024-08 or Present"
            />
          </Field>
        </div>

        <Field label="Bullets (one per line)">
          <Textarea
            value={(entry.bullets || []).join("\n")}
            onChange={(e) =>
              setEntry({
                ...entry,
                bullets: e.target.value
                  .split("\n")
                  .map((b) => b.trim())
                  .filter(Boolean),
              })
            }
            rows={6}
            placeholder="Reduced API latency by 40% by introducing Redis caching layer..."
          />
        </Field>
      </div>
    </EditModalShell>
  );
}

function emptyExperience(): ExtractionExperience {
  return {
    title: "",
    company: "",
    location: "",
    start_date: "",
    end_date: "",
    is_current: false,
    bullets: [],
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
