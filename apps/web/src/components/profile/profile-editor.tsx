"use client";

import { PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Check,
  GraduationCap,
  MessageSquare,
  Plus,
  Sparkles,
  Target,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface MetricEntry {
  metric?: string;
  value?: string;
  context?: string;
  direction?: string;
}
interface ExperienceEntry {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  bullets?: string[];
  metrics?: MetricEntry[];
  tools?: string[];
}
interface EducationEntry {
  degree: string;
  institution: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}
interface SkillEntry {
  name: string;
}
interface ProjectEntry {
  name?: string;
  context?: string;
  description?: string;
  tools?: string[];
  outcome?: string;
}
interface ProfileData {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  visaStatus: string;
  relocationPreferences: string[];
  targetRoles: string[];
  currentTitle: string;
  experienceLevel: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: string[];
  projects: ProjectEntry[];
  /** @deprecated Use skillsTechnical/skillsTools/etc. Kept for backward compat. */
  skillsTier1: SkillEntry[];
  /** @deprecated */
  skillsTier2: SkillEntry[];
  /** @deprecated */
  skillsTier3: SkillEntry[];
  tools: string[];
  voiceNotes: string;
  profileMarkdown: string;
  completenessScore: number;

  // ── Identity (NEW) ──
  github: string;
  portfolio: string;
  website: string;

  // ── Professional Profile (NEW) ──
  yearsOfExperience: number | null;
  professionalSummary: string;
  summarySignals: string[];
  domainExperience: string[];
  careerHighlights: string[];

  // ── Skills 6-bucket (NEW) ──
  skillsTechnical: string[];
  skillsTools: string[];
  skillsBusiness: string[];
  skillsMethodologies: string[];
  skillsSoft: string[];
  skillsDomain: string[];

  // ── Extras (NEW) ──
  languages: string[];
  awards: string[];
  publications: string[];
  volunteering: string[];

  // ── Career Intent (NEW) ──
  interestedRoles: string[];
  careerDirection: "same" | "slight_shift" | "major_switch" | "not_sure" | "";
  preferredMarkets: string[];
  workPreference: "remote" | "hybrid" | "onsite" | "open" | "";
  seniorityComfort: string[];
  industriesOfInterest: string[];
  roleDealbreakers: string[];

  // ── Resume Writing Preferences (NEW) ──
  toneSignals: string[];
  styleConstraints: string[];
  emphasisAreas: string[];
  deEmphasisAreas: string[];
}

export type ProfileEditorData = ProfileData;

/** Static ref for parent to call applyImportedProfile on the active editor instance */
let _applyImportedProfileFn: ((imported: Record<string, unknown>) => void) | null = null;
export function getApplyImportedProfile() { return _applyImportedProfileFn; }

const FIELD_POINTS: Record<string, { check: (form: ProfileData) => boolean; points: number }> = {
  fullName: { check: (f) => !!f.fullName, points: 8 },
  email: { check: (f) => !!f.email, points: 5 },
  phone: { check: (f) => !!f.phone, points: 3 },
  linkedin: { check: (f) => !!f.linkedin, points: 3 },
  location: { check: (f) => !!f.location, points: 5 },
  currentTitle: { check: (f) => !!f.currentTitle, points: 5 },
  targetRoles: { check: (f) => f.targetRoles.length > 0 || f.interestedRoles.length > 0, points: 8 },
  experience: { check: (f) => f.experience.length > 0, points: 15 },
  education: { check: (f) => f.education.length > 0, points: 5 },
  skills: { check: (f) => f.skillsTier1.length > 0 || f.skillsTechnical.length > 0 || f.skillsTools.length > 0, points: 10 },
  voiceNotes: { check: (f) => !!(f.voiceNotes || f.profileMarkdown), points: 3 },
  careerHighlights: { check: (f) => f.careerHighlights.length > 0, points: 8 },
  professionalSummary: { check: (f) => !!f.professionalSummary, points: 5 },
  careerIntent: { check: (f) => !!f.careerDirection || f.interestedRoles.length > 0, points: 7 },
  writingPrefs: { check: (f) => f.toneSignals.length > 0 || f.emphasisAreas.length > 0, points: 5 },
  projects: { check: (f) => f.projects.length > 0, points: 5 },
};

function calculateCompleteness(form: ProfileData): number {
  let score = 0;
  for (const entry of Object.values(FIELD_POINTS)) {
    if (entry.check(form)) score += entry.points;
  }
  return Math.min(score, 100);
}

function splitIntoBullets(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[\s•\-*]+/, "").trim())
    .filter((s) => s.length > 5);
}

function PointsBadge({ points }: { points: number }) {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full border border-border bg-background px-1.5 py-0 font-mono text-[10px] font-medium text-muted-foreground">
      +{points}
    </span>
  );
}

function BulletPills({
  bullets,
  onChange,
  placeholder,
}: {
  bullets: string[];
  onChange: (b: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const t = input.trim();
    if (!t) return;
    onChange([...bullets, t]);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="space-y-2">
      {bullets.map((bullet, i) => (
        <div
          key={`${i}-${bullet.slice(0, 20)}`}
          className="group flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed"
        >
          <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
          <span className="flex-1">{bullet}</span>
          <button
            type="button"
            onClick={() => onChange(bullets.filter((_, idx) => idx !== i))}
            className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
            aria-label="Remove bullet"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={add} className="shrink-0">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function SkillPills({
  skills,
  onChange,
  placeholder,
}: {
  skills: SkillEntry[];
  onChange: (s: SkillEntry[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const t = input.trim();
    if (!t) return;
    if (!skills.some((s) => s.name.toLowerCase() === t.toLowerCase())) {
      onChange([...skills, { name: t }]);
    }
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
    if (e.key === "Backspace" && !input && skills.length) onChange(skills.slice(0, -1));
  }

  return (
    <div className="space-y-3">
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s, i) => (
            <span
              key={`${s.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
            >
              {s.name}
              <button
                type="button"
                onClick={() => onChange(skills.filter((_, idx) => idx !== i))}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Remove ${s.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={add} className="shrink-0">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  actions,
  icon: Icon,
  pendingPoints,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  pendingPoints?: number;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 className="flex items-center text-xs font-semibold uppercase tracking-widest text-foreground">
          {title}
          {pendingPoints ? <PointsBadge points={pendingPoints} /> : null}
        </h2>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function ProfileEditor({
  profile,
  onDirty,
  onSaved,
  hideOuterShell,
}: {
  profile: ProfileData;
  onDirty?: () => void;
  onSaved?: () => void;
  /** When true, ProfileEditor renders the form without the PageShell + heading + sticky bar wrapper. */
  hideOuterShell?: boolean;
}) {
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const router = useRouter();
  const tToasts = useTranslations("toasts");

  function updateForm(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
    setIsDirty(true);
    onDirty?.();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        completenessScore: calculateCompleteness(form),
        // Map 6-bucket skill names to API schema names
        technicalSkills: form.skillsTechnical,
        tools: form.skillsTools,
        professionalSkills: form.skillsBusiness,
        methodologies: form.skillsMethodologies,
        softSkills: form.skillsSoft,
        domainSkills: form.skillsDomain,
      };
      // Remove editor-only keys that don't exist in patchProfileSchema
      delete payload.skillsTechnical;
      delete payload.skillsTools;
      delete payload.skillsBusiness;
      delete payload.skillsMethodologies;
      delete payload.skillsSoft;
      delete payload.skillsDomain;
      // careerDirection/workPreference/interestedRoles etc. are not in the flat profile schema
      // They persist via careerProfile JSONB — handled by normalizer when it detects them
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setIsDirty(false);
      toast.success(tToasts("profile_saved"));
      onSaved?.();
      router.refresh();
    } catch {
      toast.error(tToasts("profile_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  /** Called by parent (career-profile-page) after a successful resume import commit */
  function applyImportedProfile(imported: Record<string, unknown>) {
    const patch: Partial<ProfileData> = {};
    if (imported.fullName) patch.fullName = String(imported.fullName);
    if (imported.email) patch.email = String(imported.email);
    if (imported.phone) patch.phone = String(imported.phone);
    if (imported.linkedin) patch.linkedin = String(imported.linkedin);
    if (imported.location) patch.location = String(imported.location);
    if (imported.currentTitle) patch.currentTitle = String(imported.currentTitle);
    if (Array.isArray(imported.experience)) {
      patch.experience = imported.experience.map((e: any) => ({
        title: e.title ?? "",
        company: e.company ?? "",
        startDate: e.startDate,
        endDate: e.endDate,
        description: e.description ?? (Array.isArray(e.bullets) ? e.bullets.join("\n") : ""),
      }));
    }
    if (Array.isArray(imported.education)) {
      patch.education = imported.education.map((e: any) => ({
        degree: e.degree ?? "",
        institution: e.institution ?? "",
        startDate: e.startDate,
        endDate: e.endDate,
      }));
    }
    if (Array.isArray(imported.skillsTier1)) patch.skillsTier1 = imported.skillsTier1.map((s: any) => typeof s === "string" ? { name: s } : { name: s.name ?? String(s) });
    if (Array.isArray(imported.skillsTier2)) patch.skillsTier2 = imported.skillsTier2.map((s: any) => typeof s === "string" ? { name: s } : { name: s.name ?? String(s) });
    if (Array.isArray(imported.skillsTier3)) patch.skillsTier3 = imported.skillsTier3.map((s: any) => typeof s === "string" ? { name: s } : { name: s.name ?? String(s) });
    if (Array.isArray(imported.targetRoles)) patch.targetRoles = imported.targetRoles.map(String);
    if (Array.isArray(imported.projects)) {
      patch.projects = imported.projects.map((p: any) => ({
        name: p.title ?? p.name ?? "",
        description: p.description ?? "",
        context: p.context ?? "",
        tools: Array.isArray(p.techStack) ? p.techStack : [],
        outcome: p.impact ?? "",
      }));
    }
    setForm((f) => ({ ...f, ...patch }));
    setIsDirty(true);
    onDirty?.();
  }

  // Expose applyImportedProfile to parent via module-level ref
  _applyImportedProfileFn = applyImportedProfile;

  const completeness = calculateCompleteness(form);
  const completenessTone =
    completeness >= 80
      ? "text-emerald-500"
      : completeness >= 60
        ? "text-amber-500"
        : "text-destructive";

  const personalFields: Array<{
    id: keyof ProfileData;
    label: string;
    placeholder?: string;
    type?: string;
  }> = [
    { id: "fullName", label: "Full name", placeholder: "Jane Smith" },
    { id: "currentTitle", label: "Current title", placeholder: "Senior Engineer" },
    { id: "email", label: "Email", type: "email" },
    { id: "phone", label: "Phone", type: "tel" },
    { id: "location", label: "Location", placeholder: "San Francisco, CA" },
    { id: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/…" },
    { id: "visaStatus", label: "Work authorization", placeholder: "e.g. Work visa, Citizen" },
    { id: "experienceLevel", label: "Experience level", placeholder: "entry / mid / senior" },
  ];

  return (
    <ConditionalShell hideOuterShell={hideOuterShell}>
      {hideOuterShell ? null : (
        <header className="mb-8 flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your details
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Career profile</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The career brain Retuned tunes from. The more evidence in here, the sharper every
            tuning.
          </p>
        </header>
      )}

      <div
        className={cn(
          "z-30 mb-3 flex items-center justify-between gap-4 py-2",
          hideOuterShell ? "" : "sticky top-2",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-700"
              style={{ width: `${completeness}%` }}
            />
          </div>
          <span className={cn("shrink-0 font-mono text-xs tabular-nums", completenessTone)}>
            {completeness}%
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDirty ? <span className="text-[11px] font-medium text-amber-500">Unsaved</span> : null}
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-5 [&_input]:text-foreground/85 [&_textarea]:text-foreground/85 [&_select]:text-foreground/85">
        <Section
          title="Personal info"
          subtitle="Basic details and contact information."
          icon={User}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {personalFields.map((field) => {
              const fp = FIELD_POINTS[field.id as string];
              const showPoints = fp && !fp.check(form);
              return (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={`f-${field.id}`} className="flex items-center">
                    {field.label}
                    {showPoints ? <PointsBadge points={fp.points} /> : null}
                  </Label>
                  <Input
                    id={`f-${field.id}`}
                    type={field.type ?? "text"}
                    value={(form as unknown as Record<string, string>)[field.id as string] ?? ""}
                    onChange={(e) =>
                      updateForm({ [field.id]: e.target.value } as Partial<ProfileData>)
                    }
                    placeholder={field.placeholder}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-1.5">
            <Label>Relocation preferences</Label>
            <SkillPills
              skills={(Array.isArray(form.relocationPreferences)
                ? form.relocationPreferences
                : [form.relocationPreferences].filter(Boolean)
              ).map((r) => ({ name: r }))}
              onChange={(s) => updateForm({ relocationPreferences: s.map((x) => x.name) })}
              placeholder="e.g. Remote, Open to relocation"
            />
          </div>
        </Section>

        <Section
          title="Target roles"
          subtitle="Job titles you're applying for."
          icon={Target}
          pendingPoints={
            !FIELD_POINTS.targetRoles?.check(form) ? FIELD_POINTS.targetRoles?.points : undefined
          }
        >
          <SkillPills
            skills={form.targetRoles.map((r) => ({ name: r }))}
            onChange={(s) => updateForm({ targetRoles: s.map((x) => x.name) })}
            placeholder="e.g. Senior Product Manager"
          />
        </Section>

        <Section
          title="Certifications"
          subtitle="Professional certifications and licenses."
          icon={Check}
        >
          <SkillPills
            skills={(Array.isArray(form.certifications) ? form.certifications : []).map((c) => ({
              name: c,
            }))}
            onChange={(s) => updateForm({ certifications: s.map((x) => x.name) })}
            placeholder="e.g. AWS Solutions Architect, PMP"
          />
        </Section>

        <Section
          title="Work experience"
          subtitle="Your work history. More detail means sharper bullets."
          icon={Briefcase}
          pendingPoints={
            !FIELD_POINTS.experience?.check(form) ? FIELD_POINTS.experience?.points : undefined
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateForm({
                  experience: [...form.experience, { title: "", company: "", description: "" }],
                })
              }
            >
              <Plus className="mr-1 size-3.5" />
              Add role
            </Button>
          }
        >
          <div className="space-y-3">
            {form.experience.length === 0 ? (
              <button
                type="button"
                onClick={() =>
                  updateForm({ experience: [{ title: "", company: "", description: "" }] })
                }
                className="w-full rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                + Add your first role
              </button>
            ) : null}
            {form.experience.map((exp, idx) => (
              <div
                key={idx}
                className="group relative space-y-3 border-b border-border/40 pb-4 last:border-b-0 last:pb-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    updateForm({ experience: form.experience.filter((_, i) => i !== idx) })
                  }
                  className="absolute right-3 top-3 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                  aria-label="Remove role"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <div className="grid gap-3 pr-6 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input
                      value={exp.title}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, title: e.target.value } : ex,
                          ),
                        })
                      }
                      placeholder="e.g. Senior Engineer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company</Label>
                    <Input
                      value={exp.company}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, company: e.target.value } : ex,
                          ),
                        })
                      }
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start date</Label>
                    <Input
                      value={exp.startDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, startDate: e.target.value } : ex,
                          ),
                        })
                      }
                      placeholder="YYYY-MM"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End date</Label>
                    <Input
                      value={exp.endDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, endDate: e.target.value } : ex,
                          ),
                        })
                      }
                      placeholder="YYYY-MM or present"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>What you did &amp; impact</Label>
                  <Textarea
                    value={exp.description ?? (exp.bullets ? exp.bullets.join("\n") : "")}
                    onChange={(e) =>
                      updateForm({
                        experience: form.experience.map((ex, i) =>
                          i === idx ? { ...ex, description: e.target.value, bullets: undefined } : ex,
                        ),
                      })
                    }
                    rows={4}
                    placeholder="Describe what you did and the impact. One achievement per line."
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Education"
          subtitle="Degrees and qualifications."
          icon={GraduationCap}
          pendingPoints={
            !FIELD_POINTS.education?.check(form) ? FIELD_POINTS.education?.points : undefined
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateForm({
                  education: [...form.education, { degree: "", institution: "" }],
                })
              }
            >
              <Plus className="mr-1 size-3.5" />
              Add
            </Button>
          }
        >
          <div className="space-y-3">
            {form.education.length === 0 ? (
              <button
                type="button"
                onClick={() => updateForm({ education: [{ degree: "", institution: "" }] })}
                className="w-full rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                + Add education
              </button>
            ) : null}
            {form.education.map((edu, idx) => (
              <div
                key={idx}
                className="group relative border-b border-border/40 pb-4 last:border-b-0 last:pb-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    updateForm({ education: form.education.filter((_, i) => i !== idx) })
                  }
                  className="absolute right-3 top-3 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                  aria-label="Remove education"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <div className="grid gap-3 pr-6 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Degree</Label>
                    <Input
                      value={edu.degree}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, degree: e.target.value } : ed,
                          ),
                        })
                      }
                      placeholder="e.g. BSc Computer Science"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Institution</Label>
                    <Input
                      value={edu.institution}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, institution: e.target.value } : ed,
                          ),
                        })
                      }
                      placeholder="e.g. University of Edinburgh"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start year</Label>
                    <Input
                      value={edu.startDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, startDate: e.target.value } : ed,
                          ),
                        })
                      }
                      placeholder="YYYY"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End year</Label>
                    <Input
                      value={edu.endDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, endDate: e.target.value } : ed,
                          ),
                        })
                      }
                      placeholder="YYYY or present"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Projects"
          subtitle="Side projects, open source, notable work."
          icon={Sparkles}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateForm({
                  projects: [...form.projects, { name: "", description: "" }],
                })
              }
            >
              <Plus className="mr-1 size-3.5" />
              Add
            </Button>
          }
        >
          <div className="space-y-4">
            {form.projects.length === 0 ? (
              <button
                type="button"
                onClick={() => updateForm({ projects: [{ name: "", description: "" }] })}
                className="w-full rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                + Add a project
              </button>
            ) : null}
            {form.projects.map((proj, idx) => (
              <div key={idx} className="group relative space-y-3 border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => updateForm({ projects: form.projects.filter((_, i) => i !== idx) })}
                  className="absolute right-3 top-3 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                  aria-label="Remove project"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <div className="grid gap-3 pr-6 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Project name</Label>
                    <Input
                      value={proj.name ?? ""}
                      onChange={(e) => updateForm({ projects: form.projects.map((p, i) => i === idx ? { ...p, name: e.target.value } : p) })}
                      placeholder="e.g. ResumeAI"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Context</Label>
                    <Input
                      value={proj.context ?? ""}
                      onChange={(e) => updateForm({ projects: form.projects.map((p, i) => i === idx ? { ...p, context: e.target.value } : p) })}
                      placeholder="e.g. Side project, Open source"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={proj.description ?? ""}
                    onChange={(e) => updateForm({ projects: form.projects.map((p, i) => i === idx ? { ...p, description: e.target.value } : p) })}
                    rows={2}
                    placeholder="What you built and why it matters."
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Professional snapshot"
          subtitle="Summary, highlights, and domain expertise."
          icon={Sparkles}
          pendingPoints={!FIELD_POINTS.professionalSummary?.check(form) ? FIELD_POINTS.professionalSummary?.points : undefined}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Years of experience</Label>
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={form.yearsOfExperience ?? ""}
                  onChange={(e) => updateForm({ yearsOfExperience: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>GitHub</Label>
                <Input value={form.github} onChange={(e) => updateForm({ github: e.target.value })} placeholder="github.com/username" />
              </div>
              <div className="space-y-1.5">
                <Label>Portfolio</Label>
                <Input value={form.portfolio} onChange={(e) => updateForm({ portfolio: e.target.value })} placeholder="portfolio URL" />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => updateForm({ website: e.target.value })} placeholder="personal website" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Professional summary</Label>
              <Textarea
                value={form.professionalSummary}
                onChange={(e) => updateForm({ professionalSummary: e.target.value })}
                rows={3}
                placeholder="A brief summary of your professional identity and strengths."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Career highlights</Label>
              <BulletPills bullets={form.careerHighlights} onChange={(b) => updateForm({ careerHighlights: b })} placeholder="e.g. Led migration to microservices, reducing deploy time 80%" />
            </div>
            <div className="space-y-1.5">
              <Label>Summary signals</Label>
              <SkillPills skills={form.summarySignals.map((s) => ({ name: s }))} onChange={(s) => updateForm({ summarySignals: s.map((x) => x.name) })} placeholder="e.g. distributed systems, team leadership" />
            </div>
            <div className="space-y-1.5">
              <Label>Domain experience</Label>
              <SkillPills skills={form.domainExperience.map((s) => ({ name: s }))} onChange={(s) => updateForm({ domainExperience: s.map((x) => x.name) })} placeholder="e.g. fintech, healthcare, e-commerce" />
            </div>
          </div>
        </Section>

        <Section
          title="Skills"
          subtitle="Organized by category."
          icon={Sparkles}
          pendingPoints={!FIELD_POINTS.skills?.check(form) ? FIELD_POINTS.skills?.points : undefined}
        >
          <div className="space-y-5">
            {([
              { key: "skillsTechnical" as const, label: "Technical (languages, frameworks)", ph: "e.g. TypeScript, React, Python" },
              { key: "skillsTools" as const, label: "Tools & Platforms", ph: "e.g. AWS, Docker, Jira" },
              { key: "skillsBusiness" as const, label: "Professional / Business", ph: "e.g. Stakeholder Management, Requirements" },
              { key: "skillsMethodologies" as const, label: "Methodologies", ph: "e.g. Agile, TDD, Kanban" },
              { key: "skillsSoft" as const, label: "Soft Skills", ph: "e.g. Leadership, Communication" },
              { key: "skillsDomain" as const, label: "Domain Knowledge", ph: "e.g. Payments, ML Ops" },
            ] as const).map((bucket) => (
              <div key={bucket.key} className="space-y-2">
                <Label>{bucket.label}</Label>
                <SkillPills
                  skills={form[bucket.key].map((s) => ({ name: s }))}
                  onChange={(skills) => updateForm({ [bucket.key]: skills.map((x) => x.name) } as Partial<ProfileData>)}
                  placeholder={bucket.ph}
                />
              </div>
            ))}
            {/* Legacy tiers — show only if populated */}
            {(form.skillsTier1.length > 0 || form.skillsTier2.length > 0 || form.skillsTier3.length > 0) && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Legacy skill tiers (read-only)</summary>
                <div className="mt-2 space-y-2">
                  {form.skillsTier1.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground/80 mb-1">Core skills</p>
                      <div className="flex flex-wrap gap-1">
                        {form.skillsTier1.map((s, i) => (
                          <span key={i} className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px]">{s.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {form.skillsTier2.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground/80 mb-1">Supporting skills</p>
                      <div className="flex flex-wrap gap-1">
                        {form.skillsTier2.map((s, i) => (
                          <span key={i} className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px]">{s.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {form.skillsTier3.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground/80 mb-1">Familiar with</p>
                      <div className="flex flex-wrap gap-1">
                        {form.skillsTier3.map((s, i) => (
                          <span key={i} className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px]">{s.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </Section>

        <Section
          title="Career intent"
          subtitle="What you're looking for next."
          icon={Target}
          pendingPoints={!FIELD_POINTS.careerIntent?.check(form) ? FIELD_POINTS.careerIntent?.points : undefined}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Experience level</Label>
                <select
                  value={form.experienceLevel}
                  onChange={(e) => updateForm({ experienceLevel: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="entry">Entry</option>
                  <option value="early">Early</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                  <option value="staff">Staff / Principal</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Career direction</Label>
                <select
                  value={form.careerDirection}
                  onChange={(e) => updateForm({ careerDirection: e.target.value as ProfileData["careerDirection"] })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Not set</option>
                  <option value="same">Same direction</option>
                  <option value="slight_shift">Slight shift</option>
                  <option value="major_switch">Major switch</option>
                  <option value="not_sure">Not sure</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Work preference</Label>
                <select
                  value={form.workPreference}
                  onChange={(e) => updateForm({ workPreference: e.target.value as ProfileData["workPreference"] })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Not set</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                  <option value="open">Open to all</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Visa / work auth</Label>
                <Input value={form.visaStatus} onChange={(e) => updateForm({ visaStatus: e.target.value })} placeholder="e.g. UK citizen, US work auth" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Interested roles</Label>
              <SkillPills skills={form.interestedRoles.map((r) => ({ name: r }))} onChange={(s) => updateForm({ interestedRoles: s.map((x) => x.name) })} placeholder="e.g. Staff Engineer, Engineering Manager" />
            </div>
            <div className="space-y-1.5">
              <Label>Seniority comfort</Label>
              <SkillPills skills={form.seniorityComfort.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ seniorityComfort: ss.map((x) => x.name) })} placeholder="e.g. senior, staff, principal" />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred markets</Label>
              <SkillPills skills={form.preferredMarkets.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ preferredMarkets: ss.map((x) => x.name) })} placeholder="e.g. US, UK, Remote" />
            </div>
            <div className="space-y-1.5">
              <Label>Industries of interest</Label>
              <SkillPills skills={form.industriesOfInterest.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ industriesOfInterest: ss.map((x) => x.name) })} placeholder="e.g. AI/ML, Fintech, Climate" />
            </div>
            <div className="space-y-1.5">
              <Label>Role dealbreakers</Label>
              <SkillPills skills={form.roleDealbreakers.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ roleDealbreakers: ss.map((x) => x.name) })} placeholder="e.g. no on-call, no travel >20%" />
            </div>
            <div className="space-y-1.5">
              <Label>Relocation preferences</Label>
              <SkillPills skills={form.relocationPreferences.map((r) => ({ name: r }))} onChange={(s) => updateForm({ relocationPreferences: s.map((x) => x.name) })} placeholder="e.g. Remote, London, New York" />
            </div>
          </div>
        </Section>

        <Section
          title="Resume writing preferences"
          subtitle="How Retune should write for you."
          icon={MessageSquare}
          pendingPoints={!FIELD_POINTS.writingPrefs?.check(form) ? FIELD_POINTS.writingPrefs?.points : undefined}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tone signals</Label>
              <SkillPills skills={form.toneSignals.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ toneSignals: ss.map((x) => x.name) })} placeholder="e.g. direct, metric-led, understated" />
            </div>
            <div className="space-y-1.5">
              <Label>Style constraints</Label>
              <SkillPills skills={form.styleConstraints.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ styleConstraints: ss.map((x) => x.name) })} placeholder="e.g. no buzzwords, no passive voice" />
            </div>
            <div className="space-y-1.5">
              <Label>Emphasis areas</Label>
              <SkillPills skills={form.emphasisAreas.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ emphasisAreas: ss.map((x) => x.name) })} placeholder="e.g. leadership, system design, impact" />
            </div>
            <div className="space-y-1.5">
              <Label>De-emphasis areas</Label>
              <SkillPills skills={form.deEmphasisAreas.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ deEmphasisAreas: ss.map((x) => x.name) })} placeholder="e.g. early career roles, unrelated experience" />
            </div>
            <div className="space-y-1.5">
              <Label>Voice notes (free-form)</Label>
              <Textarea
                value={form.voiceNotes}
                onChange={(e) => updateForm({ voiceNotes: e.target.value })}
                rows={3}
                placeholder="e.g. I prefer direct, concise language. I avoid buzzwords…"
              />
            </div>
          </div>
        </Section>

        <Section
          title="Extras"
          subtitle="Languages, awards, publications, volunteering."
          icon={Sparkles}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Languages</Label>
              <SkillPills skills={form.languages.map((s) => ({ name: s }))} onChange={(ss) => updateForm({ languages: ss.map((x) => x.name) })} placeholder="e.g. English (native), Spanish (fluent)" />
            </div>
            <div className="space-y-1.5">
              <Label>Awards</Label>
              <BulletPills bullets={form.awards} onChange={(b) => updateForm({ awards: b })} placeholder="e.g. Employee of the Year 2023" />
            </div>
            <div className="space-y-1.5">
              <Label>Publications</Label>
              <BulletPills bullets={form.publications} onChange={(b) => updateForm({ publications: b })} placeholder="e.g. 'Scaling ML Pipelines' — ICML 2024" />
            </div>
            <div className="space-y-1.5">
              <Label>Volunteering</Label>
              <BulletPills bullets={form.volunteering} onChange={(b) => updateForm({ volunteering: b })} placeholder="e.g. Code mentor at local bootcamp" />
            </div>
          </div>
        </Section>

      </div>
    </ConditionalShell>
  );
}

function ConditionalShell({
  hideOuterShell,
  children,
}: {
  hideOuterShell?: boolean;
  children: React.ReactNode;
}) {
  if (hideOuterShell) return <div className="space-y-2">{children}</div>;
  return <PageShell width="wide">{children}</PageShell>;
}
