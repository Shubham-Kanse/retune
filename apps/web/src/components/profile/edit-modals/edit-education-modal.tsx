"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExtractionEducation } from "@/lib/onboarding-v2/types";
import * as React from "react";
import { EditModalShell } from "./edit-modal-shell";

interface EditEducationModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ExtractionEducation | null;
  onSave: (entry: ExtractionEducation) => Promise<void> | void;
}

export function EditEducationModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: EditEducationModalProps) {
  const [entry, setEntry] = React.useState<ExtractionEducation>(initial ?? empty());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setEntry(initial ?? empty());
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
      title={initial ? "Edit education" : "Add education"}
      onSave={handleSave}
      saving={saving}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Institution">
          <Input
            value={entry.institution ?? ""}
            onChange={(e) => setEntry({ ...entry, institution: e.target.value })}
            placeholder="Trinity College Dublin"
          />
        </Field>
        <Field label="Degree">
          <Input
            value={entry.degree ?? ""}
            onChange={(e) => setEntry({ ...entry, degree: e.target.value })}
            placeholder="MSc"
          />
        </Field>
        <Field label="Field">
          <Input
            value={entry.field ?? ""}
            onChange={(e) => setEntry({ ...entry, field: e.target.value })}
            placeholder="Computer Science"
          />
        </Field>
        <Field label="GPA / Honours">
          <Input
            value={entry.gpa ?? entry.honours ?? ""}
            onChange={(e) => setEntry({ ...entry, gpa: e.target.value })}
            placeholder="First-class honours / 3.8"
          />
        </Field>
        <Field label="Start">
          <Input
            value={entry.start_date ?? ""}
            onChange={(e) => setEntry({ ...entry, start_date: e.target.value })}
            placeholder="2018"
          />
        </Field>
        <Field label="End">
          <Input
            value={entry.end_date ?? ""}
            onChange={(e) => setEntry({ ...entry, end_date: e.target.value })}
            placeholder="2020"
          />
        </Field>
      </div>
    </EditModalShell>
  );
}

function empty(): ExtractionEducation {
  return {
    institution: "",
    degree: "",
    field: "",
    start_date: "",
    end_date: "",
    gpa: "",
    honours: "",
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
