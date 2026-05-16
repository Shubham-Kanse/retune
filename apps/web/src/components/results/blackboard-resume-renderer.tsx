"use client";

/**
 * BlackboardResumeRenderer - Renders resume from cognitive blackboard structure.
 *
 * Takes the blackboard.draft (sections + bullets) and renders it as a
 * formatted resume document.
 */

import type { Blackboard } from "@/lib/api-client";

interface Props {
  blackboard: Blackboard;
}

export function BlackboardResumeRenderer({ blackboard }: Props) {
  const { draft, hypotheses } = blackboard;
  const { sections, bullets } = draft;

  // Get sections in order: summary, skills, experience, education, projects
  const allSections = Object.values(sections);
  type Section = (typeof allSections)[number];
  const sectionOrder = ["summary", "skills", "experience", "education", "projects"];
  const orderedSections: Section[] = sectionOrder
    .map((kind) => allSections.find((s) => s.kind === kind))
    .filter((s): s is Section => s != null);

  return (
    <div className="resume-document space-y-6 bg-white p-8 text-sm text-foreground">
      {/* Header - would come from user profile */}
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold">
          {hypotheses.role_schema?.display_name || "Resume"}
        </h1>
        {hypotheses.company_schema && (
          <p className="text-muted-foreground">
            Application for {hypotheses.company_schema.display_name}
          </p>
        )}
      </div>

      {/* Render each section */}
      {orderedSections.map((section) => (
        <div key={section.id} className="space-y-2">
          <h2 className="text-base font-semibold uppercase tracking-wide text-foreground">
            {section.kind}
          </h2>

          {/* If section has rendered_text, use it */}
          {section.rendered_text ? (
            <div className="whitespace-pre-wrap">{section.rendered_text}</div>
          ) : (
            /* Otherwise render bullets */
            <ul className="space-y-1.5">
              {section.bullet_ids.map((bulletId) => {
                const bullet = bullets[bulletId];
                if (!bullet) return null;
                return (
                  <li key={bullet.id} className="flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{bullet.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}

      {/* Narrative arc indicator (optional, for debugging) */}
      {hypotheses.chosen_narrative_arc && (
        <div className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          <p>
            Narrative: {hypotheses.chosen_narrative_arc.archetype} -{" "}
            {hypotheses.chosen_narrative_arc.thesis}
          </p>
        </div>
      )}
    </div>
  );
}
