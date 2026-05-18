"use client";

import { Button } from "@/components/ui/button";
import type { ExtractionEducation } from "@/lib/onboarding-v2/types";
import { Pencil, Plus } from "lucide-react";
import { ProfileSourceBadge } from "./profile-source-badge";

interface EducationSectionProps {
  education: ExtractionEducation[];
  fieldSources?: Record<string, string>;
  onEdit?: (index: number) => void;
  onAdd?: () => void;
}

export function EducationSection({
  education,
  fieldSources = {},
  onEdit,
  onAdd,
}: EducationSectionProps) {
  if (education.length === 0) return null;

  return (
    <section aria-labelledby="education-heading" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          id="education-heading"
          className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
        >
          Education
        </h3>
        {onAdd && (
          <Button variant="ghost" size="sm" onClick={onAdd} className="text-xs">
            <Plus className="mr-1 size-3" /> Add
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {education.map((edu, i) => {
          const source = fieldSources[`education[${i}]`];
          return (
            <div
              key={i}
              className="group flex items-start justify-between gap-2 rounded-lg border border-border/50 bg-background p-3"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {edu.institution || "Institution"}
                  </p>
                  {source && <ProfileSourceBadge source={source} />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[edu.degree, edu.field].filter(Boolean).join(" in ") || "Not specified"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                  {edu.start_date || "?"} – {edu.end_date || "?"}
                  {edu.gpa ? ` · GPA ${edu.gpa}` : ""}
                </p>
              </div>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                  aria-label={`Edit ${edu.institution || "education entry"}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
