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
  Upload,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
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
  skillsTier1: SkillEntry[];
  skillsTier2: SkillEntry[];
  skillsTier3: SkillEntry[];
  tools: string[];
  voiceNotes: string;
  profileMarkdown: string;
  completenessScore: number;
}

const FIELD_POINTS: Record<string, { check: (form: ProfileData) => boolean; points: number }> = {
  fullName: { check: (f) => !!f.fullName, points: 10 },
  email: { check: (f) => !!f.email, points: 10 },
  phone: { check: (f) => !!f.phone, points: 5 },
  linkedin: { check: (f) => !!f.linkedin, points: 5 },
  location: { check: (f) => !!f.location, points: 10 },
  currentTitle: { check: (f) => !!f.currentTitle, points: 5 },
  targetRoles: { check: (f) => f.targetRoles.length > 0, points: 10 },
  experience: { check: (f) => f.experience.length > 0, points: 20 },
  education: { check: (f) => f.education.length > 0, points: 10 },
  skillsTier1: { check: (f) => f.skillsTier1.length > 0, points: 10 },
  voiceNotes: { check: (f) => !!(f.voiceNotes || f.profileMarkdown), points: 5 },
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
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <h2 className="flex items-center text-sm font-semibold tracking-tight">
            {title}
            {pendingPoints ? <PointsBadge points={pendingPoints} /> : null}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function ProfileEditor({ profile }: { profile: ProfileData }) {
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const router = useRouter();

  function updateForm(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
    setIsDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { ...form, completenessScore: calculateCompleteness(form) };
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setIsDirty(false);
      toast.success("Profile saved");
      router.refresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/profile/import-resume", { method: "POST", body: data });
      if (!res.ok) throw new Error();
      toast.success("Resume imported");
      window.location.reload();
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

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
    <PageShell width="wide">
      <header className="mb-8 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your details
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Career profile</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The career brain Retuned tunes from. The more evidence in here, the sharper every tuning.
        </p>
      </header>

      <div className="sticky top-2 z-30 mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-700"
              style={{ width: `${completeness}%` }}
            />
          </div>
          <span
            className={cn(
              "shrink-0 font-mono text-xs tabular-nums",
              completenessTone,
            )}
          >
            {completeness}%
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDirty ? (
            <span className="text-[11px] font-medium text-amber-500">Unsaved</span>
          ) : null}
          <Button asChild variant="outline" size="sm" disabled={importing}>
            <label className="cursor-pointer">
              <Upload className="mr-1.5 size-3.5" />
              {importing ? "Importing…" : "Upload resume"}
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={handleImportResume}
                disabled={importing}
              />
            </label>
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-10 divide-y divide-border/50 [&>*:not(:first-child)]:pt-10">
        <Section
          title="Personal info"
          subtitle="Basic details and contact information."
          icon={User}
        >
          <div className="grid gap-4 md:grid-cols-2">
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
            !FIELD_POINTS.targetRoles!.check(form)
              ? FIELD_POINTS.targetRoles!.points
              : undefined
          }
        >
          <SkillPills
            skills={form.targetRoles.map((r) => ({ name: r }))}
            onChange={(s) => updateForm({ targetRoles: s.map((x) => x.name) })}
            placeholder="e.g. Senior Product Manager"
          />
        </Section>

        <Section
          title="Skills"
          subtitle="Tiered by depth — tier 1 is daily, tier 3 is exposure."
          icon={Sparkles}
          pendingPoints={
            !FIELD_POINTS.skillsTier1!.check(form)
              ? FIELD_POINTS.skillsTier1!.points
              : undefined
          }
        >
          <div className="space-y-5">
            {[
              {
                key: "skillsTier1" as const,
                label: "Tier 1 · Battle-tested, daily use",
                ph: "e.g. TypeScript, React, Node.js",
              },
              {
                key: "skillsTier2" as const,
                label: "Tier 2 · Proficient, used in real work",
                ph: "e.g. Docker, GraphQL",
              },
              {
                key: "skillsTier3" as const,
                label: "Tier 3 · Exposure, can ramp quickly",
                ph: "e.g. Rust, Terraform",
              },
            ].map((tier) => (
              <div key={tier.key} className="space-y-2">
                <Label>{tier.label}</Label>
                <SkillPills
                  skills={form[tier.key]}
                  onChange={(skills) => updateForm({ [tier.key]: skills } as Partial<ProfileData>)}
                  placeholder={tier.ph}
                />
              </div>
            ))}
          </div>
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
          title="Voice notes"
          subtitle="How you sound — keeps tunings written in your voice."
          icon={MessageSquare}
          pendingPoints={
            !FIELD_POINTS.voiceNotes!.check(form)
              ? FIELD_POINTS.voiceNotes!.points
              : undefined
          }
        >
          <Textarea
            value={form.voiceNotes}
            onChange={(e) => updateForm({ voiceNotes: e.target.value })}
            rows={5}
            placeholder="e.g. I prefer direct, concise language. I avoid buzzwords. I like to lead with impact…"
          />
        </Section>

        <Section
          title="Work experience"
          subtitle="Your work history. More detail means sharper bullets."
          icon={Briefcase}
          pendingPoints={
            !FIELD_POINTS.experience!.check(form)
              ? FIELD_POINTS.experience!.points
              : undefined
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateForm({
                  experience: [
                    ...form.experience,
                    { title: "", company: "", description: "" },
                  ],
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
                  <BulletPills
                    bullets={exp.bullets ?? splitIntoBullets(exp.description)}
                    onChange={(bullets) =>
                      updateForm({
                        experience: form.experience.map((ex, i) =>
                          i === idx
                            ? { ...ex, bullets, description: bullets.join(". ") }
                            : ex,
                        ),
                      })
                    }
                    placeholder="Add a bullet, e.g. Led migration to OAuth, reducing login errors by 40%"
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
            !FIELD_POINTS.education!.check(form)
              ? FIELD_POINTS.education!.points
              : undefined
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
              <div key={idx} className="group relative border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
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
      </div>
    </PageShell>
  );
}
