import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { computeCompletenessScore, db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

export const GET = withAuth(async (_request, session) => {
  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.userId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) {
    return NextResponse.json(null, { status: 404 });
  }

  const safeJsonParse = (raw: string | null | undefined, fallback: any) => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  return NextResponse.json({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    linkedin: profile.linkedin,
    location: profile.location,
    visaStatus: profile.visaStatus,
    currentTitle: profile.currentTitle,
    experienceLevel: profile.experienceLevel,
    relocationPreferences: safeJsonParse(profile.relocationPreferences, []),
    targetRoles: safeJsonParse(profile.targetRoles, []),
    experience: safeJsonParse(profile.experience, []),
    education: safeJsonParse(profile.education, []),
    certifications: safeJsonParse(profile.certifications, []),
    projects: safeJsonParse(profile.projects, []),
    skillsTier1: safeJsonParse(profile.skillsTier1, []),
    skillsTier2: safeJsonParse(profile.skillsTier2, []),
    skillsTier3: safeJsonParse(profile.skillsTier3, []),
    voiceNotes: profile.voiceNotes,
    profileMarkdown: profile.profileMarkdown,
    completenessScore: profile.completenessScore,
  });
});

const profileSchema = z.object({
  fullName: z.string().max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  linkedin: z.string().max(200).nullable().optional(),
  location: z.string().max(200).optional(),
  visaStatus: z.string().max(100).nullable().optional(),
  currentTitle: z.string().max(100).nullable().optional(),
  relocationPreferences: z.array(z.string().max(100)).max(20).optional(),
  targetRoles: z.array(z.string().max(100)).max(20).optional(),
  experienceLevel: z.enum(["entry", "early", "mid", "senior", "staff"]).optional(),
  experience: z
    .array(
      z.object({
        company: z.string().max(200),
        title: z.string().max(200),
        startDate: z.string().max(20).optional(),
        endDate: z.string().max(20).optional(),
        description: z.string().max(5000).optional(),
        metrics: z.array(z.any()).max(20).optional(),
        tools: z.array(z.string().max(100)).max(50).optional(),
      }),
    )
    .max(30)
    .optional(),
  education: z
    .array(
      z.object({
        degree: z.string().max(200),
        institution: z.string().max(200),
        startDate: z.string().max(20).optional(),
        endDate: z.string().max(20).optional(),
        status: z.string().max(50).optional(),
      }),
    )
    .max(10)
    .optional(),
  certifications: z.array(z.any()).max(20).optional(),
  projects: z.array(z.any()).max(20).optional(),
  skillsTier1: z.array(z.any()).max(50).optional(),
  skillsTier2: z.array(z.any()).max(50).optional(),
  skillsTier3: z.array(z.any()).max(50).optional(),
  voiceNotes: z.string().max(5000).nullable().optional(),
  profileMarkdown: z.string().max(20000).optional(),
  tools: z.array(z.string().max(200)).max(50).optional(),
});

function buildProfileMarkdown(profile: Record<string, any>): string {
  const skills = [
    ...(profile.skillsTier1 ?? []).map((s: any) => s.name),
    ...(profile.skillsTier2 ?? []).map((s: any) => s.name),
    ...(profile.skillsTier3 ?? []).map((s: any) => s.name),
  ].filter(Boolean);

  const targetRoles = (profile.targetRoles ?? []).filter(Boolean);
  const relocationPreferences = (profile.relocationPreferences ?? []).filter(Boolean);
  const tools = (profile.tools ?? []).filter(Boolean);

  return [
    `# ${profile.fullName || "Candidate"}`,
    profile.currentTitle ? `\n${profile.currentTitle}` : "",
    targetRoles.length ? `\n## Target Roles\n${targetRoles.join(", ")}` : "",
    profile.visaStatus ? `\n## Work Authorization\n${profile.visaStatus}` : "",
    relocationPreferences.length
      ? `\n## Relocation Preferences\n${relocationPreferences.join(", ")}`
      : "",
    profile.voiceNotes ? `\n## Summary\n${profile.voiceNotes}` : "",
    skills.length ? `\n## Skills\n${skills.join(", ")}` : "",
    tools.length ? `\n## Tools & Technologies\n${tools.join(", ")}` : "",
    (profile.experience ?? []).length
      ? `\n## Experience\n${profile.experience
          .map((e: any) => {
            const metricLines = (e.metrics ?? [])
              .map((m: any) =>
                [m.direction, m.metric, m.value, m.context].filter(Boolean).join(" | "),
              )
              .filter(Boolean);
            const toolLine = (e.tools ?? []).filter(Boolean).join(", ");
            return [
              `### ${e.title || "Role"} - ${e.company || "Company"}`,
              [e.startDate, e.endDate].filter(Boolean).join(" – "),
              e.description || "",
              metricLines.length
                ? `Metrics:\n${metricLines.map((line: string) => `- ${line}`).join("\n")}`
                : "",
              toolLine ? `Tools: ${toolLine}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n")}`
      : "",
    (profile.projects ?? []).length
      ? `\n## Projects\n${profile.projects
          .map((p: any) => {
            const pTools = (p.tools ?? []).filter(Boolean).join(", ");
            return [
              `### ${p.name || "Project"}`,
              p.context || "",
              p.description || "",
              p.outcome ? `Outcome: ${p.outcome}` : "",
              pTools ? `Tools: ${pTools}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const PATCH = withAuth(async (request, session) => {
  const rawBody = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const parsed = profileSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const body = parsed.data;

  const now = new Date();
  const profileMarkdown = body.profileMarkdown || buildProfileMarkdown(body);
  const bodyWithMarkdown = { ...body, profileMarkdown };
  const values = {
    fullName: body.fullName || session.fullName || "",
    email: session.email,
    phone: body.phone || null,
    linkedin: body.linkedin || null,
    location: body.location || "",
    visaStatus: body.visaStatus || null,
    relocationPreferences: JSON.stringify(body.relocationPreferences ?? []),
    targetRoles: JSON.stringify(body.targetRoles ?? []),
    experienceLevel: body.experienceLevel || "mid",
    currentTitle: body.currentTitle || null,
    experience: JSON.stringify(body.experience ?? []),
    education: JSON.stringify(body.education ?? []),
    certifications: JSON.stringify(body.certifications ?? []),
    projects: JSON.stringify(body.projects ?? []),
    skillsTier1: JSON.stringify(body.skillsTier1 ?? []),
    skillsTier2: JSON.stringify(body.skillsTier2 ?? []),
    skillsTier3: JSON.stringify(body.skillsTier3 ?? []),
    voiceNotes: body.voiceNotes || null,
    profileMarkdown,
    completenessScore: computeCompletenessScore(bodyWithMarkdown),
    updatedAt: now,
  };

  await db
    .insert(profiles)
    .values({
      userId: session.userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: values,
    });

  revalidatePath("/dashboard");
  revalidatePath("/profile");

  return NextResponse.json({ ok: true });
});
