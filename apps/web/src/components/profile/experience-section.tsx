"use client";

import { Button } from "@/components/ui/button";
import type { ExtractionExperience } from "@/lib/onboarding-v2/types";
import { Pencil, Plus } from "lucide-react";
import { ProfileSourceBadge } from "./profile-source-badge";

interface ExperienceSectionProps {
  experience: ExtractionExperience[];
  fieldSources?: Record<string, string>;
  onEdit?: (index: number) => void;
  onAdd?: () => void;
}

export function ExperienceSection({
  experience,
  fieldSources = {},
  onEdit,
  onAdd,
}: ExperienceSectionProps) {
  if (experience.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
        <p className="text-sm text-muted-foreground">No work experience on file yet.</p>
        {onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="mt-3">
            <Plus className="mr-1.5 size-3.5" />
            Add experience
          </Button>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="experience-heading" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          id="experience-heading"
          className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
        >
          Experience
        </h3>
        {onAdd && (
          <Button variant="ghost" size="sm" onClick={onAdd} className="text-xs">
            <Plus className="mr-1 size-3" /> Add
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {experience.map((exp, i) => {
          const sourceKey = `experience[${i}]`;
          const source = fieldSources[sourceKey];
          return (
            <div
              key={i}
              className="group rounded-lg border border-border/50 bg-background p-3 transition-colors hover:border-border"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {exp.title || "Untitled role"}
                    </p>
                    {source && <ProfileSourceBadge source={source} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {exp.company || "—"}
                    {exp.location ? ` · ${exp.location}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                    {exp.start_date || "?"} – {exp.is_current ? "Present" : exp.end_date || "?"}
                  </p>
                </div>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(i)}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                    aria-label={`Edit ${exp.title || "experience"}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
              {exp.bullets && exp.bullets.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {exp.bullets.slice(0, 3).map((b, j) => (
                    <li key={j} className="text-xs text-foreground/80">
                      • {b}
                    </li>
                  ))}
                  {exp.bullets.length > 3 && (
                    <li className="text-[11px] text-muted-foreground">
                      + {exp.bullets.length - 3} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
