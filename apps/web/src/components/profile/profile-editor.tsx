"use client";
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
import { type KeyboardEvent, useState, memo } from "react";
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

function PointsBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center ml-1.5 text-[10px] font-semibold text-brand animate-[pulse-glow_2s_ease-in-out_infinite]">
      +{points}
    </span>
  );
}

function splitIntoBullets(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[\s•\-*]+/, "").trim())
    .filter((s) => s.length > 5);
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
    const trimmed = input.trim();
    if (!trimmed) return;
    onChange([...bullets, trimmed]);
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
          className="flex items-start gap-2 bg-[#f0ede8] border border-border px-3 py-2 text-xs text-foreground rounded-lg leading-relaxed group"
        >
          <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
          <span className="flex-1">{bullet}</span>
          <button
            type="button"
            onClick={() => onChange(bullets.filter((_, idx) => idx !== i))}
            className="text-muted-foreground hover:text-[#dc2626] transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
            aria-label="Remove bullet"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="rt-input flex-1 text-sm"
          placeholder={placeholder}
        />
        <button type="button" onClick={add} className="rt-btn-ghost shrink-0 px-3 py-2">
          <Plus className="h-3.5 w-3.5" />
        </button>
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
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...skills, { name: trimmed }]);
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
      <div className="flex flex-wrap gap-2">
        {skills.map((skill, i) => (
          <span
            key={`${skill.name}-${i}`}
            className="inline-flex items-center gap-1.5 bg-[#f0ede8] border border-border px-2.5 py-1 text-xs text-foreground rounded-lg"
          >
            {skill.name}
            <button
              type="button"
              onClick={() => onChange(skills.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Remove ${skill.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="rt-input flex-1 text-sm"
          placeholder={placeholder}
        />
        <button type="button" onClick={add} className="rt-btn-ghost shrink-0 px-3 py-2">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  actions,
  icon,
  iconColor,
  pendingPoints,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  iconColor?: string;
  pendingPoints?: number;
}) {
  return (
    <section>
      <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {icon && (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={iconColor ? { backgroundColor: `${iconColor}18`, color: iconColor } : { backgroundColor: "#f0ede8" }}
              >
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {title}
                {pendingPoints ? <PointsBadge points={pendingPoints} /> : null}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        <div className="p-6">{children}</div>
      </div>
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

  return (
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between mb-12">
        <div>
          <p className="rt-label mb-3">Your details</p>
          <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
            Profile
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isDirty && !window.confirm("You have unsaved changes. Leave anyway?")) return;
            router.back();
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sticky progress bar */}
      <div className="sticky top-4 z-40 mb-6 rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex-1 h-1.5 bg-[#f0ede8] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-700"
              style={{ width: `${completeness}%` }}
            />
          </div>
          <span
            className={cn(
              "text-xs font-mono tabular-nums shrink-0",
              completeness >= 80
                ? "text-brand"
                : completeness >= 60
                  ? "text-amber-600"
                  : "text-[#dc2626]",
            )}
          >
            {completeness}%
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && <span className="text-[10px] text-amber-600 font-medium">Unsaved</span>}
          <label className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            {importing ? "Importing…" : "Upload resume"}
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={handleImportResume}
              disabled={importing}
            />
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rt-btn text-xs px-4 py-1.5 min-h-0"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {/* Personal info */}
        <Section
          title="Personal info"
          subtitle="Your basic details and contact information."
          icon={<User className="w-4 h-4" />}
          iconColor="#ff5555"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { id: "fullName", label: "Full name", placeholder: "Jane Smith" },
              { id: "currentTitle", label: "Current title", placeholder: "Senior Engineer" },
              { id: "email", label: "Email", type: "email" },
              { id: "phone", label: "Phone", type: "tel" },
              { id: "location", label: "Location", placeholder: "San Francisco, CA" },
              { id: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/..." },
              { id: "visaStatus", label: "Work authorization", placeholder: "e.g. Work Visa, Citizen" },
              { id: "experienceLevel", label: "Experience level", placeholder: "e.g. senior, mid, entry" },
            ].map((field) => {
              const fp = FIELD_POINTS[field.id];
              const showPoints = fp && !fp.check(form);
              return (
              <div key={field.id}>
                <label className="rt-label block mb-1.5" htmlFor={`f-${field.id}`}>
                  {field.label}
                  {showPoints && <PointsBadge points={fp.points} />}
                </label>
                <input
                  id={`f-${field.id}`}
                  type={field.type || "text"}
                  value={(form as unknown as Record<string, string>)[field.id]}
                  onChange={(e) => updateForm({ [field.id]: e.target.value })}
                  className="rt-input w-full text-sm"
                  placeholder={field.placeholder}
                />
              </div>
              );
            })}
          </div>
          {/* Relocation preferences */}
          <div className="mt-4">
            <label className="rt-label block mb-1.5">Relocation preferences</label>
            <SkillPills
              skills={(Array.isArray(form.relocationPreferences) ? form.relocationPreferences : [form.relocationPreferences].filter(Boolean)).map((r) => ({ name: r }))}
              onChange={(s) => updateForm({ relocationPreferences: s.map((x) => x.name) })}
              placeholder="e.g. Remote, Open to relocation"
            />
          </div>
        </Section>

        {/* Target roles */}
        <Section
          title="Target roles"
          subtitle="Job titles you're applying for."
          icon={<Target className="w-4 h-4" />}
          iconColor="#2d8a5e"
          pendingPoints={!FIELD_POINTS.targetRoles!.check(form) ? FIELD_POINTS.targetRoles!.points : undefined}
        >
          <SkillPills
            skills={form.targetRoles.map((r) => ({ name: r }))}
            onChange={(s) => updateForm({ targetRoles: s.map((x) => x.name) })}
            placeholder="e.g. Senior Product Manager"
          />
        </Section>

        {/* Skills */}
        <Section
          title="Skills"
          subtitle="Core strengths and proficiencies."
          icon={<Sparkles className="w-4 h-4" />}
          iconColor="#00d4d4"
          pendingPoints={!FIELD_POINTS.skillsTier1!.check(form) ? FIELD_POINTS.skillsTier1!.points : undefined}
        >
          <div className="space-y-6">
            <div>
              <label className="rt-label block mb-3">Tier 1 — Battle-tested, daily use</label>
              <SkillPills
                skills={form.skillsTier1}
                onChange={(skills) => updateForm({ skillsTier1: skills })}
                placeholder="e.g. TypeScript, React, Node.js"
              />
            </div>
            <div>
              <label className="rt-label block mb-3">Tier 2 — Proficient, used in real work</label>
              <SkillPills
                skills={form.skillsTier2}
                onChange={(skills) => updateForm({ skillsTier2: skills })}
                placeholder="e.g. Docker, GraphQL"
              />
            </div>
            <div>
              <label className="rt-label block mb-3">Tier 3 — Exposure, can ramp quickly</label>
              <SkillPills
                skills={form.skillsTier3}
                onChange={(skills) => updateForm({ skillsTier3: skills })}
                placeholder="e.g. Rust, Terraform"
              />
            </div>
          </div>
        </Section>

        {/* Certifications */}
        <Section
          title="Certifications"
          subtitle="Professional certifications and licenses."
          icon={<Check className="w-4 h-4" />}
          iconColor="#2d8a5e"
        >
          <SkillPills
            skills={(Array.isArray(form.certifications) ? form.certifications : []).map((c) => ({ name: c }))}
            onChange={(s) => updateForm({ certifications: s.map((x) => x.name) })}
            placeholder="e.g. AWS Solutions Architect, PMP"
          />
        </Section>

        {/* Voice / tone */}
        <Section
          title="Voice notes"
          subtitle="Describe your style — used to keep your resume sounding like you."
          icon={<MessageSquare className="w-4 h-4" />}
          iconColor="#5fc3ff"
          pendingPoints={!FIELD_POINTS.voiceNotes!.check(form) ? FIELD_POINTS.voiceNotes!.points : undefined}
        >
          <textarea
            value={form.voiceNotes}
            onChange={(e) => updateForm({ voiceNotes: e.target.value })}
            className="rt-textarea w-full text-sm leading-relaxed"
            rows={5}
            placeholder="e.g. I prefer direct, concise language. I avoid buzzwords. I like to lead with impact…"
          />
        </Section>

        {/* Experience */}
        <Section
          title="Work experience"
          subtitle="Your work history. More detail = better bullets."
          icon={<Briefcase className="w-4 h-4" />}
          iconColor="#f59e0b"
          pendingPoints={!FIELD_POINTS.experience!.check(form) ? FIELD_POINTS.experience!.points : undefined}
          actions={
            <button
              type="button"
              onClick={() =>
                updateForm({
                  experience: [...form.experience, { title: "", company: "", description: "" }],
                })
              }
              className="flex items-center gap-1.5 text-xs text-brand hover:opacity-75 transition-opacity font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Add role
            </button>
          }
        >
          <div className="space-y-4">
            {form.experience.length === 0 && (
              <button
                type="button"
                onClick={() =>
                  updateForm({ experience: [{ title: "", company: "", description: "" }] })
                }
                className="w-full py-8 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-brand hover:text-brand transition-colors"
              >
                + Add your first role
              </button>
            )}
            {form.experience.map((exp, idx) => (
              <div
                key={idx}
                className="border border-border rounded-xl p-4 space-y-3 group relative"
              >
                <button
                  type="button"
                  onClick={() =>
                    updateForm({ experience: form.experience.filter((_, i) => i !== idx) })
                  }
                  className="absolute top-3 right-3 text-muted-foreground hover:text-[#dc2626] transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="grid gap-3 md:grid-cols-2 pr-6">
                  <div>
                    <label className="rt-label block mb-1.5">Title</label>
                    <input
                      value={exp.title}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, title: e.target.value } : ex,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="e.g. Senior Engineer"
                    />
                  </div>
                  <div>
                    <label className="rt-label block mb-1.5">Company</label>
                    <input
                      value={exp.company}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, company: e.target.value } : ex,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  <div>
                    <label className="rt-label block mb-1.5">Start date</label>
                    <input
                      value={exp.startDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, startDate: e.target.value } : ex,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="YYYY-MM"
                    />
                  </div>
                  <div>
                    <label className="rt-label block mb-1.5">End date</label>
                    <input
                      value={exp.endDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          experience: form.experience.map((ex, i) =>
                            i === idx ? { ...ex, endDate: e.target.value } : ex,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="YYYY-MM or present"
                    />
                  </div>
                </div>
                <div>
                  <label className="rt-label block mb-1.5">What you did & impact</label>
                  <BulletPills
                    bullets={exp.bullets ?? splitIntoBullets(exp.description)}
                    onChange={(bullets) =>
                      updateForm({
                        experience: form.experience.map((ex, i) =>
                          i === idx ? { ...ex, bullets, description: bullets.join(". ") } : ex,
                        ),
                      })
                    }
                    placeholder="Add a bullet point, e.g. Led migration to OAuth, reducing login errors by 40%"
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Education */}
        <Section
          title="Education"
          subtitle="Degrees and qualifications."
          icon={<GraduationCap className="w-4 h-4" />}
          iconColor="#16a34a"
          pendingPoints={!FIELD_POINTS.education!.check(form) ? FIELD_POINTS.education!.points : undefined}
          actions={
            <button
              type="button"
              onClick={() =>
                updateForm({ education: [...form.education, { degree: "", institution: "" }] })
              }
              className="flex items-center gap-1.5 text-xs text-brand hover:opacity-75 transition-opacity font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          }
        >
          <div className="space-y-3">
            {form.education.length === 0 && (
              <button
                type="button"
                onClick={() => updateForm({ education: [{ degree: "", institution: "" }] })}
                className="w-full py-8 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-brand hover:text-brand transition-colors"
              >
                + Add education
              </button>
            )}
            {form.education.map((edu, idx) => (
              <div key={idx} className="border border-border rounded-xl p-4 group relative">
                <button
                  type="button"
                  onClick={() =>
                    updateForm({ education: form.education.filter((_, i) => i !== idx) })
                  }
                  className="absolute top-3 right-3 text-muted-foreground hover:text-[#dc2626] transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="grid gap-3 md:grid-cols-2 pr-6">
                  <div>
                    <label className="rt-label block mb-1.5">Degree</label>
                    <input
                      value={edu.degree}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, degree: e.target.value } : ed,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="e.g. BSc Computer Science"
                    />
                  </div>
                  <div>
                    <label className="rt-label block mb-1.5">Institution</label>
                    <input
                      value={edu.institution}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, institution: e.target.value } : ed,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="e.g. University of Edinburgh"
                    />
                  </div>
                  <div>
                    <label className="rt-label block mb-1.5">Start year</label>
                    <input
                      value={edu.startDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, startDate: e.target.value } : ed,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="YYYY"
                    />
                  </div>
                  <div>
                    <label className="rt-label block mb-1.5">End year</label>
                    <input
                      value={edu.endDate ?? ""}
                      onChange={(e) =>
                        updateForm({
                          education: form.education.map((ed, i) =>
                            i === idx ? { ...ed, endDate: e.target.value } : ed,
                          ),
                        })
                      }
                      className="rt-input w-full text-sm"
                      placeholder="YYYY or present"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

    </div>
  );
}
