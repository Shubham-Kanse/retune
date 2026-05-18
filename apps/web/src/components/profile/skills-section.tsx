"use client";

import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { ProfileSourceBadge } from "./profile-source-badge";

interface SkillsSectionProps {
  skills: { raw_list: string[]; grouped: Record<string, string[]> };
  /** Source flag for the skills bundle as a whole (e.g. "extracted", "user_supplied"). */
  source?: string;
  onEdit?: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  technical: "Technical",
  tools: "Tools",
  professional: "Professional",
  methodologies: "Methodologies",
  soft_skills: "Soft Skills",
  domain: "Domain",
  business: "Business",
  languages: "Languages",
};

export function SkillsSection({ skills, source, onEdit }: SkillsSectionProps) {
  const groups = Object.entries(skills.grouped || {}).filter(
    ([, list]) => Array.isArray(list) && list.length > 0,
  );
  const hasGroups = groups.length > 0;

  return (
    <section aria-labelledby="skills-heading" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          id="skills-heading"
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
        >
          Skills ({skills.raw_list.length})
          {source && <ProfileSourceBadge source={source} />}
        </h3>
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="text-xs">
            <Pencil className="mr-1 size-3" /> Edit
          </Button>
        )}
      </div>

      {hasGroups ? (
        <div className="space-y-2">
          {groups.map(([key, list]) => (
            <div key={key}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {GROUP_LABELS[key] ?? labelize(key)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {list.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {skills.raw_list.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function labelize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
