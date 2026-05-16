"use client";

import { EvidenceMapSection } from "@/components/profile/evidence-map-section";
import { PositioningCardsSection } from "@/components/profile/positioning-cards-section";
import { ProfileEditor, type ProfileEditorData, getApplyImportedProfile } from "@/components/profile/profile-editor";
import { ResumeFuelSection } from "@/components/profile/resume-fuel-section";
import { RetuneUnderstandingSection } from "@/components/profile/retune-understanding-section";
import { PageShell } from "@/components/app/page-shell";
import { RetuneLensPanel } from "@/components/retune-lens";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import { Button } from "@/components/ui/button";
import { useRetuneLens } from "@/hooks/use-retune-lens";
import type { CareerUnderstandingV1, UnderstandingScope } from "@/lib/career-understanding";
import type { ProfileReadiness } from "@/lib/onboarding/types";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ColorOrb } from "@/components/retune-lens/color-orb";
import { useResumeUpload } from "@/components/profile/use-resume-upload";
import { ResumePreviewModal } from "@/components/profile/resume-preview-modal";

export interface CareerProfilePageProps {
  initialProfileData: ProfileEditorData;
  initialUnderstanding: CareerUnderstandingV1 | null;
  understandingPersisted: boolean;
  profileFingerprint: string | null;
  staleAtLoad: boolean;
  canGenerateUnderstanding: boolean;
  readiness: ProfileReadiness | null;
}

export function CareerProfilePage(props: CareerProfilePageProps) {
  const router = useRouter();
  const [understanding, setUnderstanding] = React.useState<CareerUnderstandingV1 | null>(
    props.initialUnderstanding,
  );
  const [understandingPersisted, setUnderstandingPersisted] = React.useState(
    props.understandingPersisted,
  );
  const [stale, setStale] = React.useState(props.staleAtLoad);
  const [localStale, setLocalStale] = React.useState(false);

  const upload = useResumeUpload({
    onCommitted: (result) => {
      // Apply imported profile to the editor form state
      if (result.profile && getApplyImportedProfile()) {
        getApplyImportedProfile()!(result.profile);
      }
      const exp = Array.isArray(result.profile?.experience) ? (result.profile.experience as unknown[]).length : 0;
      const skills = [result.profile?.skillsTier1, result.profile?.skillsTier2, result.profile?.skillsTier3]
        .reduce<number>((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
      const proj = Array.isArray(result.profile?.projects) ? (result.profile.projects as unknown[]).length : 0;
      toast.success(`Imported ${exp} experience${exp !== 1 ? "s" : ""}, ${skills} skills, ${proj} project${proj !== 1 ? "s" : ""}`);
      router.refresh();
    },
  });

  React.useEffect(() => {
    setUnderstanding(props.initialUnderstanding);
    setUnderstandingPersisted(props.understandingPersisted);
    setStale(props.staleAtLoad);
  }, [props.initialUnderstanding, props.understandingPersisted, props.staleAtLoad]);

  const onApplied = React.useCallback((next: CareerUnderstandingV1) => {
    setUnderstanding(next);
    setUnderstandingPersisted(true);
    setStale(false);
    setLocalStale(false);
    toast.success("Retune updated.");
  }, []);

  const lens = useRetuneLens({
    expectedProfileFingerprint: props.profileFingerprint ?? null,
    expectedUnderstandingRevision: understanding?.revision ?? 0,
    onApplied,
  });

  const initialLens = useRetuneLens({
    expectedProfileFingerprint: props.profileFingerprint ?? null,
    expectedUnderstandingRevision: 0,
    initial: true,
    onApplied,
  });

  async function previewWithFlag(
    req: RetuneLensPreviewRequest,
    opts: { initial?: boolean },
  ): Promise<RetuneLensPreviewResponse> {
    return opts.initial ? initialLens.onPreview(req) : lens.onPreview(req);
  }

  async function handleMarkAccurate() {
    try {
      const res = await fetch("/api/profile/understanding/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "summary_feedback", value: "accurate" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUnderstanding(data.understanding);
      setUnderstandingPersisted(true);
      toast.success("Marked as accurate.");
    } catch {
      toast.error("Could not save feedback.");
    }
  }

  async function handleSelectDefault(positioningId: string) {
    try {
      const res = await fetch("/api/profile/understanding/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "select_positioning", positioningId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUnderstanding(data.understanding);
      setUnderstandingPersisted(true);
      toast.success("Default angle updated.");
    } catch {
      toast.error("Could not update default.");
    }
  }

  async function handleRejectPositioning(positioningId: string) {
    try {
      const res = await fetch("/api/profile/understanding/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "reject_positioning", positioningId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUnderstanding(data.understanding);
      setUnderstandingPersisted(true);
      toast.success("Marked not me.");
    } catch {
      toast.error("Could not record rejection.");
    }
  }

  function handleFactsDirty() {
    setLocalStale(true);
  }

  function handleFactsSaved() {
    router.refresh();
  }

  const showStaleBanner = stale || localStale;

  return (
    <PageShell width="wide">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
            Career profile
          </p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-foreground md:text-3xl">
            This is what Retune knows.
          </h1>
        </div>
        {upload.phase === "previewing" || upload.phase === "committing" ? (
          <div className="flex items-center gap-2 mt-2 rounded-full border border-border bg-muted/50 px-3 py-1.5">
            <ColorOrb size={16} spinDuration={8} />
            <span className="text-xs text-muted-foreground">Reading your resume… (5–15s)</span>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 mt-2"
            onClick={upload.triggerUpload}
          >
            <Upload className="mr-1.5 size-3.5" />
            Upload resume
          </Button>
        )}
        {/* Hidden file input — Task 2: only .pdf,.docx */}
        <input
          ref={upload.inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={upload.handleFileChange}
        />
      </header>

      {/* Resume preview modal (Task 8) */}
      {upload.preview && (
        <ResumePreviewModal
          preview={upload.preview}
          onApply={upload.commit}
          onCancel={upload.cancel}
          committing={upload.phase === "committing"}
        />
      )}

      <div className="space-y-8">
        {/* Section 1: Retune Understanding */}
        <RetuneUnderstandingSection
          understanding={understanding}
          understandingPersisted={understandingPersisted}
          stale={showStaleBanner}
          canGenerate={props.canGenerateUnderstanding}
          onMarkAccurate={handleMarkAccurate}
          onPreview={previewWithFlag}
          onApply={lens.onApply}
        />

        <hr className="border-border/30" />

        {/* Section 2: Best Angles */}
        <PositioningCardsSection
          understanding={understanding}
          understandingPersisted={understandingPersisted}
          canGenerate={props.canGenerateUnderstanding}
          stale={showStaleBanner}
          onSelectDefault={handleSelectDefault}
          onReject={handleRejectPositioning}
          onPreview={lens.onPreview}
          onApply={lens.onApply}
        />

        <hr className="border-border/30" />

        {/* Section 3: Evidence */}
        <EvidenceMapSection
          understanding={understanding}
          understandingPersisted={understandingPersisted}
          stale={showStaleBanner}
          onPreview={lens.onPreview}
          onApply={lens.onApply}
        />

        <hr className="border-border/30" />

        {/* Section 4: Resume Fuel */}
        <ResumeFuelSection
          understanding={understanding}
          understandingPersisted={understandingPersisted}
          stale={showStaleBanner}
          onPreview={lens.onPreview}
          onApply={lens.onApply}
        />

        <hr className="border-border/30" />

        {/* Stale banner (only when stale + persisted) */}
        {showStaleBanner && understandingPersisted && (
          <ProfileStaleBanner onPreview={lens.onPreview} onApply={lens.onApply} stale />
        )}

        {/* Section 5: Profile Details */}
        <ProfileDetailsSection
          profile={props.initialProfileData}
          onDirty={handleFactsDirty}
          onSaved={handleFactsSaved}
          stale={showStaleBanner}
          onPreview={lens.onPreview}
          onApply={lens.onApply}
        />
      </div>
    </PageShell>
  );
}

function ProfileStaleBanner({
  onPreview,
  onApply,
}: {
  onPreview: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply: (id: string, token: string) => Promise<void>;
  stale: boolean;
}) {
  const scopes: UnderstandingScope[] = [
    "summary",
    "all_positioning",
    "skills_interpretation",
    "resume_strategy",
    "everything_affected",
  ];
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-[11px] font-medium uppercase tracking-widest text-amber-700 dark:text-amber-400">
        Stale read
      </p>
      <p className="mt-1 text-sm text-foreground">
        You edited profile details after this read was generated.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Re-read the edited fields before using this as resume strategy.
      </p>
      <div className="mt-3">
        <RetuneLensPanel
          label="Re-read edited fields"
          section="summary"
          defaultScope="everything_affected"
          availableScopes={scopes}
          stale
          intents={["re_read_profile", "more_technical", "more_product_focused"]}
          onPreview={onPreview}
          onApply={onApply}
        />
      </div>
    </div>
  );
}

function ProfileDetailsSection({
  profile,
  onDirty,
  onSaved,
  stale,
  onPreview,
  onApply,
}: {
  profile: ProfileEditorData;
  onDirty: () => void;
  onSaved: () => void;
  stale: boolean;
  onPreview: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply: (id: string, token: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);

  const skills = [
    ...(profile.skillsTier1 ?? []).map((s) => s.name),
    ...(profile.skillsTier2 ?? []).map((s) => s.name),
  ].filter(Boolean).slice(0, 8);

  const roles = (profile.targetRoles ?? []).slice(0, 4);

  return (
    <section aria-labelledby="profile-details-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="profile-details-heading" className="text-base font-semibold tracking-tight text-foreground">
          Profile Details
        </h2>
        <div className="flex items-center gap-2">
          <RetuneLensPanel
            label="Re-read evidence"
            section="summary"
            defaultScope="everything_affected"
            availableScopes={["summary", "all_positioning", "evidence_map", "resume_fuel", "everything_affected"]}
            defaultInstruction="Re-read my profile and update all sections."
            intents={["re_read_profile", "more_technical", "more_product_focused", "more_senior"]}
            stale={stale}
            onPreview={onPreview}
            onApply={onApply}
          />
          <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)} className="text-xs text-muted-foreground">
            {editing ? "Done editing" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Read-only summary — always visible */}
      {!editing && (
        <div className="rounded-xl border border-border bg-background divide-y divide-border/50">
          {/* Identity row */}
          <div className="flex items-center gap-6 px-5 py-4">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-foreground shrink-0">
              {profile.fullName?.charAt(0) ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{profile.fullName || ""}</p>
              <p className="text-xs text-muted-foreground">{profile.currentTitle || "No title set"}{profile.location ? ` · ${profile.location}` : ""}</p>
              {(profile.github || profile.portfolio || profile.website) && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {[profile.github, profile.portfolio, profile.website].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Professional Snapshot */}
          {(profile.professionalSummary || profile.careerHighlights.length > 0 || profile.domainExperience.length > 0) && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Professional snapshot</p>
              {profile.yearsOfExperience != null && (
                <p className="text-xs text-muted-foreground">{profile.yearsOfExperience} years of experience</p>
              )}
              {profile.professionalSummary && (
                <p className="text-sm text-foreground/80 line-clamp-3">{profile.professionalSummary}</p>
              )}
              {profile.careerHighlights.length > 0 && (
                <div className="space-y-1">
                  {profile.careerHighlights.slice(0, 3).map((h, i) => (
                    <p key={i} className="text-xs text-foreground/70">• {h}</p>
                  ))}
                </div>
              )}
              {profile.domainExperience.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {profile.domainExperience.map((d) => (
                    <span key={d} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Experience */}
          {profile.experience.length > 0 && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Experience</p>
              {profile.experience.slice(0, 3).map((exp, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{exp.title}</span>
                    <span className="text-sm text-muted-foreground"> · {exp.company}</span>
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0">
                    {exp.startDate}{exp.endDate ? ` – ${exp.endDate}` : ""}
                  </span>
                </div>
              ))}
              {profile.experience.length > 3 && (
                <p className="text-xs text-muted-foreground/60">+{profile.experience.length - 3} more roles</p>
              )}
            </div>
          )}

          {/* Education */}
          {profile.education.length > 0 && (
            <div className="px-5 py-4 space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Education</p>
              {profile.education.slice(0, 2).map((edu, i) => (
                <p key={i} className="text-sm text-foreground">
                  {edu.degree} <span className="text-muted-foreground">· {edu.institution}</span>
                </p>
              ))}
            </div>
          )}

          {/* Skills — 6 buckets */}
          {(() => {
            const buckets = [
              { label: "Technical", items: profile.skillsTechnical },
              { label: "Tools", items: profile.skillsTools },
              { label: "Professional", items: profile.skillsBusiness },
              { label: "Methodologies", items: profile.skillsMethodologies },
              { label: "Soft Skills", items: profile.skillsSoft },
              { label: "Domain", items: profile.skillsDomain },
            ].filter((b) => b.items.length > 0);
            // Fallback to legacy tiers if no 6-bucket data
            const legacySkills = [
              ...(profile.skillsTier1 ?? []).map((s) => s.name),
              ...(profile.skillsTier2 ?? []).map((s) => s.name),
            ].filter(Boolean);
            if (buckets.length === 0 && legacySkills.length === 0) return null;
            return (
              <div className="px-5 py-4 space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Skills</p>
                {buckets.length > 0 ? buckets.map((b) => (
                  <div key={b.label}>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1">{b.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {b.items.slice(0, 8).map((s) => (
                        <span key={s} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">{s}</span>
                      ))}
                      {b.items.length > 8 && <span className="text-xs text-muted-foreground/60 self-center">+{b.items.length - 8} more</span>}
                    </div>
                  </div>
                )) : (
                  <div className="flex flex-wrap gap-1.5">
                    {legacySkills.slice(0, 8).map((s) => (
                      <span key={s} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">{s}</span>
                    ))}
                    {legacySkills.length > 8 && <span className="text-xs text-muted-foreground/60 self-center">+{legacySkills.length - 8} more</span>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Projects */}
          {profile.projects.length > 0 && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Projects</p>
              {profile.projects.slice(0, 3).map((proj, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-foreground">{proj.name || "Untitled"}</span>
                  {proj.context && <span className="text-muted-foreground"> · {proj.context}</span>}
                </div>
              ))}
              {profile.projects.length > 3 && (
                <p className="text-xs text-muted-foreground/60">+{profile.projects.length - 3} more</p>
              )}
            </div>
          )}

          {/* Career Intent */}
          {(profile.interestedRoles.length > 0 || profile.careerDirection || profile.workPreference) && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Career intent</p>
              {profile.careerDirection && (
                <p className="text-xs text-muted-foreground">Direction: <span className="text-foreground">{profile.careerDirection.replace(/_/g, " ")}</span></p>
              )}
              {profile.workPreference && (
                <p className="text-xs text-muted-foreground">Work: <span className="text-foreground">{profile.workPreference}</span></p>
              )}
              {profile.interestedRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.interestedRoles.map((r) => (
                    <span key={r} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">{r}</span>
                  ))}
                </div>
              )}
              {profile.industriesOfInterest.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {profile.industriesOfInterest.map((ind) => (
                    <span key={ind} className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">{ind}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resume Writing Preferences */}
          {(profile.toneSignals.length > 0 || profile.emphasisAreas.length > 0 || profile.styleConstraints.length > 0) && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Writing preferences</p>
              {profile.toneSignals.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.toneSignals.map((t) => (
                    <span key={t} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">{t}</span>
                  ))}
                </div>
              )}
              {profile.emphasisAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.emphasisAreas.map((e) => (
                    <span key={e} className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-0.5 text-xs text-foreground">{e}</span>
                  ))}
                </div>
              )}
              {profile.deEmphasisAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.deEmphasisAreas.map((d) => (
                    <span key={d} className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-0.5 text-xs text-muted-foreground">{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Extras */}
          {(profile.languages.length > 0 || profile.awards.length > 0 || profile.publications.length > 0 || profile.volunteering.length > 0) && (
            <div className="px-5 py-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Extras</p>
              {profile.languages.length > 0 && (
                <p className="text-xs text-muted-foreground">Languages: <span className="text-foreground">{profile.languages.join(", ")}</span></p>
              )}
              {profile.awards.length > 0 && (
                <p className="text-xs text-muted-foreground">Awards: <span className="text-foreground">{profile.awards.slice(0, 3).join("; ")}</span></p>
              )}
              {profile.publications.length > 0 && (
                <p className="text-xs text-muted-foreground">Publications: <span className="text-foreground">{profile.publications.length}</span></p>
              )}
              {profile.volunteering.length > 0 && (
                <p className="text-xs text-muted-foreground">Volunteering: <span className="text-foreground">{profile.volunteering.slice(0, 2).join("; ")}</span></p>
              )}
            </div>
          )}

          {/* Target roles (legacy) */}
          {roles.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60 mb-2">Target roles</p>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <span key={r} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* Empty state — only when truly nothing to show */}
          {profile.experience.length === 0 && skills.length === 0 && roles.length === 0 && profile.skillsTechnical.length === 0 && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-muted-foreground">No profile data yet.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
                Fill in your profile
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Edit form — shown when editing */}
      {editing && (
        <ProfileEditor
          profile={profile}
          onDirty={onDirty}
          onSaved={() => { onSaved(); setEditing(false); }}
          hideOuterShell
        />
      )}
    </section>
  );
}
