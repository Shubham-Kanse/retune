"use client";

import type { ExtractionCertification, ExtractionProject } from "@/lib/onboarding-v2/types";
import type * as React from "react";

interface ExtrasSectionProps {
  projects: ExtractionProject[];
  certifications: ExtractionCertification[];
  languages: string[];
  awards: string[];
  publications: string[];
  volunteering: string[];
}

export function ExtrasSection({
  projects,
  certifications,
  languages,
  awards,
  publications,
  volunteering,
}: ExtrasSectionProps) {
  const hasAny =
    projects.length > 0 ||
    certifications.length > 0 ||
    languages.length > 0 ||
    awards.length > 0 ||
    publications.length > 0 ||
    volunteering.length > 0;

  if (!hasAny) return null;

  return (
    <section aria-labelledby="extras-heading" className="space-y-3">
      <h3
        id="extras-heading"
        className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
      >
        Extras
      </h3>

      {projects.length > 0 && (
        <ExtraGroup label="Projects">
          <ul className="space-y-1">
            {projects.map((p, i) => (
              <li key={i} className="text-xs text-foreground">
                <span className="font-medium">{p.name || "Untitled project"}</span>
                {p.description && (
                  <span className="text-muted-foreground"> — {p.description.slice(0, 100)}</span>
                )}
              </li>
            ))}
          </ul>
        </ExtraGroup>
      )}

      {certifications.length > 0 && (
        <ExtraGroup label="Certifications">
          <ul className="space-y-1">
            {certifications.map((c, i) => (
              <li key={i} className="text-xs text-foreground">
                {c.name}
                {c.issuer && <span className="text-muted-foreground"> — {c.issuer}</span>}
                {c.date && <span className="text-muted-foreground/70"> ({c.date})</span>}
              </li>
            ))}
          </ul>
        </ExtraGroup>
      )}

      {languages.length > 0 && (
        <ExtraGroup label="Languages">
          <p className="text-xs text-foreground">{languages.join(" · ")}</p>
        </ExtraGroup>
      )}

      {awards.length > 0 && (
        <ExtraGroup label="Awards">
          <ul className="space-y-1">
            {awards.map((a, i) => (
              <li key={i} className="text-xs text-foreground">
                {a}
              </li>
            ))}
          </ul>
        </ExtraGroup>
      )}

      {publications.length > 0 && (
        <ExtraGroup label="Publications">
          <ul className="space-y-1">
            {publications.map((p, i) => (
              <li key={i} className="text-xs text-foreground">
                {p}
              </li>
            ))}
          </ul>
        </ExtraGroup>
      )}

      {volunteering.length > 0 && (
        <ExtraGroup label="Volunteering">
          <ul className="space-y-1">
            {volunteering.map((v, i) => (
              <li key={i} className="text-xs text-foreground">
                {v}
              </li>
            ))}
          </ul>
        </ExtraGroup>
      )}
    </section>
  );
}

function ExtraGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      {children}
    </div>
  );
}
