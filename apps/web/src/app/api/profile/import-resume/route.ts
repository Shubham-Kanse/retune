import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withAuth } from "@/lib/api-handler";
import { getModels, getProvider } from "@retune/agent/web";
import { db, profiles, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

function asJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function computeCompleteness(profile: Record<string, any>): number {
  let score = 0;
  if (profile.fullName) score += 10;
  if (profile.email) score += 10;
  if (profile.phone) score += 5;
  if (profile.linkedin) score += 5;
  if (profile.location) score += 10;
  if (profile.currentTitle) score += 5;
  if ((profile.targetRoles ?? []).length > 0) score += 10;
  if ((profile.experience ?? []).length > 0) score += 20;
  if ((profile.education ?? []).length > 0) score += 10;
  if ((profile.skillsTier1 ?? []).length > 0) score += 10;
  if (profile.voiceNotes || profile.profileMarkdown) score += 5;
  return Math.min(score, 100);
}

function splitBullets(text: string): string {
  if (!text) return "";
  // Already has newlines — keep as-is
  if (text.includes("\n")) return text.trim();
  // Split on sentence endings followed by capital letter (bullet run-on)
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

function dedupeTextList(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeMergedProfile(extracted: Record<string, any>): Record<string, any> {
  const normalized = { ...extracted };

  const mergedExperience = new Map<string, any>();
  for (const raw of Array.isArray(extracted.experience) ? extracted.experience : []) {
    const item = raw && typeof raw === "object" ? { ...raw } : {};
    const company = typeof item.company === "string" ? item.company.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const key = `${company.toLowerCase()}::${title.toLowerCase()}`;
    if (!company && !title) continue;

    const descriptionLines = dedupeTextList(
      splitBullets(typeof item.description === "string" ? item.description : "").split("\n"),
    );

    if (!mergedExperience.has(key)) {
      mergedExperience.set(key, {
        ...item,
        company,
        title,
        description: descriptionLines.join("\n"),
      });
      continue;
    }

    const existing = mergedExperience.get(key);
    const mergedLines = dedupeTextList([
      ...(typeof existing.description === "string" ? existing.description.split("\n") : []),
      ...descriptionLines,
    ]);
    mergedExperience.set(key, { ...existing, description: mergedLines.join("\n") });
  }
  normalized.experience = Array.from(mergedExperience.values());

  const dedupeSkillTier = (tier: unknown) => {
    const seen = new Set<string>();
    const out: Array<{ name: string }> = [];
    for (const raw of Array.isArray(tier) ? tier : []) {
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name });
    }
    return out;
  };
  normalized.skillsTier1 = dedupeSkillTier(extracted.skillsTier1);
  normalized.skillsTier2 = dedupeSkillTier(extracted.skillsTier2);
  normalized.skillsTier3 = dedupeSkillTier(extracted.skillsTier3);

  const dedupeEducation = new Map<string, any>();
  for (const raw of Array.isArray(extracted.education) ? extracted.education : []) {
    const item = raw && typeof raw === "object" ? { ...raw } : {};
    const degree = typeof item.degree === "string" ? item.degree.trim() : "";
    const institution = typeof item.institution === "string" ? item.institution.trim() : "";
    if (!degree && !institution) continue;
    const key = `${degree.toLowerCase()}::${institution.toLowerCase()}`;
    if (!dedupeEducation.has(key)) dedupeEducation.set(key, { ...item, degree, institution });
  }
  normalized.education = Array.from(dedupeEducation.values());

  normalized.certifications = dedupeTextList(
    Array.isArray(extracted.certifications) ? extracted.certifications : [],
  );

  return normalized;
}

function profileMarkdown(profile: Record<string, any>): string {
  const skills = [
    ...(profile.skillsTier1 ?? []).map((s: any) => s.name),
    ...(profile.skillsTier2 ?? []).map((s: any) => s.name),
    ...(profile.skillsTier3 ?? []).map((s: any) => s.name),
  ].filter(Boolean);

  return [
    `# ${profile.fullName ?? "Candidate"}`,
    profile.currentTitle ? `\n${profile.currentTitle}` : "",
    profile.summary ? `\n## Summary\n${profile.summary}` : "",
    skills.length ? `\n## Skills\n${skills.join(", ")}` : "",
    (profile.experience ?? []).length
      ? `\n## Experience\n${profile.experience.map((e: any) => `### ${e.title ?? "Role"} — ${e.company ?? "Company"}\n${e.description ?? ""}`).join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const POST = withAuth(async (request, session) => {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 10 * 1024 * 1024 + 4096) {
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".docx")) {
    return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const isPdf =
    buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isDocx = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (lowerName.endsWith(".pdf") && !isPdf) {
    return NextResponse.json({ error: "File does not appear to be a valid PDF." }, { status: 400 });
  }
  if (lowerName.endsWith(".docx") && !isDocx) {
    return NextResponse.json(
      { error: "File does not appear to be a valid DOCX." },
      { status: 400 },
    );
  }

  const uploadDir = resolve(process.cwd(), "data", "uploads", session.userId);
  mkdirSync(uploadDir, { recursive: true });
  const filePath = resolve(
    uploadDir,
    `profile_import_${Date.now()}${lowerName.endsWith(".pdf") ? ".pdf" : ".docx"}`,
  );
  writeFileSync(filePath, buffer);

  let resumeText = "";
  try {
    resumeText = await extractText(filePath);
  } catch {
    resumeText = `[Could not parse file. The user uploaded ${file.name} (${(file.size / 1024).toFixed(0)}KB)]`;
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      /* non-fatal */
    }
  }
  const existingRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.userId))
    .limit(1);
  const existing = existingRows[0];

  const extracted = await getProvider().createMessageWithTool<Record<string, any>>(
    "import-resume",
    {
      model: getModels().fast,
      maxTokens: 4096,
      system: `You are merging a new resume upload into an existing candidate profile.

Rules:
- Experience: if company + title already exists in the existing profile, append any NEW bullet points from the new resume to that role's description (do not duplicate existing bullets). Only add as a new role if company+title is genuinely different.
- Skills: merge all tiers, remove exact duplicates. Re-tier if evidence from new resume changes confidence.
- Education, certifications: deduplicate by institution/name.
- Personal details (name, email, phone, location): prefer non-empty values; new resume wins if existing is blank.
- Summary: rewrite to reflect the merged profile.
- For experience description, write each bullet on its own line separated by \\n.`,
      messages: [
        {
          role: "user",
          content: `EXISTING PROFILE:\n${JSON.stringify(
            {
              experience: existing ? JSON.parse(existing.experience) : [],
              skillsTier1: existing?.skillsTier1 ? JSON.parse(existing.skillsTier1) : [],
              skillsTier2: existing?.skillsTier2 ? JSON.parse(existing.skillsTier2) : [],
              skillsTier3: existing?.skillsTier3 ? JSON.parse(existing.skillsTier3) : [],
              education: existing ? JSON.parse(existing.education) : [],
              certifications: existing?.certifications ? JSON.parse(existing.certifications) : [],
            },
            null,
            2,
          )}\n\nNEW RESUME TEXT:\n${resumeText.slice(0, 20000)}`,
        },
      ],
      tools: [
        {
          name: "save_profile",
          description: "Save the extracted candidate profile",
          inputSchema: {
            type: "object" as const,
            properties: {
              fullName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            linkedin: { type: "string" },
            location: { type: "string" },
            visaStatus: { type: "string" },
            summary: { type: "string" },
            currentTitle: { type: "string" },
            experienceLevel: { type: "string", enum: ["entry", "mid", "senior"] },
            targetRoles: { type: "array", items: { type: "string" } },
            relocationPreferences: { type: "array", items: { type: "string" } },
            experience: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  company: { type: "string" },
                  title: { type: "string" },
                  startDate: { type: "string" },
                  endDate: { type: "string" },
                  description: {
                    type: "string",
                    description: "Each bullet on its own line, separated by \\n",
                  },
                  tools: { type: "array", items: { type: "string" } },
                },
              },
            },
            education: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  degree: { type: "string" },
                  institution: { type: "string" },
                  startDate: { type: "string" },
                  endDate: { type: "string" },
                  status: { type: "string", enum: ["completed", "in_progress"] },
                },
              },
            },
            certifications: { type: "array", items: { type: "string" } },
            skillsTier1: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" } } },
            },
            skillsTier2: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" } } },
            },
            skillsTier3: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" } } },
            },
            projects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  context: { type: "string" },
                  description: { type: "string" },
                  tools: { type: "array", items: { type: "string" } },
                  outcome: { type: "string" },
                },
              },
            },
            voiceNotes: {
              type: "string",
              description:
                "Free-form notes about the candidate's career goals, strengths, or context not captured elsewhere",
            },
          },
            required: ["fullName"],
          },
        },
      ],
      forceTool: "save_profile",
    },
    "save_profile",
  );

  const now = new Date();
  const completenessScore = computeCompleteness(extracted);
  const markdown = profileMarkdown(extracted);

  const values = {
    fullName: extracted.fullName || existing?.fullName || session.fullName || "",
    email: extracted.email || existing?.email || session.email,
    phone: extracted.phone || existing?.phone || null,
    linkedin: extracted.linkedin || existing?.linkedin || null,
    location: extracted.location || existing?.location || "",
    visaStatus: extracted.visaStatus || existing?.visaStatus || null,
    relocationPreferences: asJson(extracted.relocationPreferences),
    targetRoles: asJson(extracted.targetRoles),
    experienceLevel: extracted.experienceLevel || existing?.experienceLevel || "mid",
    currentTitle: extracted.currentTitle || existing?.currentTitle || null,
    experience: asJson(
      (extracted.experience ?? []).map((e: any) => ({
        ...e,
        description: splitBullets(e.description ?? ""),
      })),
    ),
    education: asJson(extracted.education),
    certifications: asJson(extracted.certifications),
    projects: asJson(extracted.projects),
    skillsTier1: asJson(extracted.skillsTier1),
    skillsTier2: asJson(extracted.skillsTier2),
    skillsTier3: asJson(extracted.skillsTier3),
    voiceNotes: extracted.voiceNotes || extracted.summary || existing?.voiceNotes || null,
    profileMarkdown: markdown,
    completenessScore,
    updatedAt: now,
  };

  await db
    .insert(profiles)
    .values({ userId: session.userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });

  await db
    .update(users)
    .set({
      onboardingCompleted: true,
      fullName: values.fullName || session.fullName,
      updatedAt: now,
    })
    .where(eq(users.id, session.userId));

  revalidatePath("/dashboard");
  revalidatePath("/profile");

  const normalized = normalizeMergedProfile(extracted);

  return NextResponse.json({
    profile: normalized,
    completenessScore,
    missingQuestions: extracted.missingQuestions ?? [],
  });
});

function extractText(filePath: string): Promise<string> {
  return new Promise((resolveText, rejectText) => {
    const script = `
import sys
path = sys.argv[1]
if path.endswith('.pdf'):
    try:
        import fitz
        doc = fitz.open(path)
        print('\\n'.join(page.get_text() for page in doc))
    except ImportError:
        with open(path, 'rb') as f:
            print(f.read().decode('utf-8', errors='ignore')[:8000])
elif path.endswith('.docx'):
    try:
        from docx import Document
        doc = Document(path)
        print('\\n'.join(p.text for p in doc.paragraphs))
    except ImportError:
        print('[DOCX parsing requires python-docx]')
`;
    const proc = spawn("python3", ["-c", script, filePath], { timeout: 15000 });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => {
      stdout += data;
    });
    proc.stderr.on("data", (data) => {
      stderr += data;
    });
    proc.on("close", (code) =>
      code === 0 ? resolveText(stdout) : rejectText(new Error(stderr || "Extraction failed")),
    );
    proc.on("error", rejectText);
  });
}
