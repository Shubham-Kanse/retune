// POST /api/profile-v2/re-read
//
// Re-runs Stage 2 (pure extraction) against the user's stored raw_text and
// returns a structured diff against the current committed v2 profile.
//
// Action `apply` then commits the diffed changes to the v2 tables.

import { loadSession, updateSession } from "@/lib/onboarding-v2/session";
import { runDualExtraction } from "@/lib/onboarding-v2/stages/stage-2-extraction";
import type {
  ExtractionEducation,
  ExtractionExperience,
  ExtractionSchema,
} from "@/lib/onboarding-v2/types";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
  kind: "added" | "removed" | "changed";
}

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as "preview" | "apply" | undefined;

  // Load the existing session — we need the stored raw_text
  const session = await loadSession(userId);
  if (!session?.extraction.raw_text) {
    return NextResponse.json(
      {
        error: "no_raw_text",
        message:
          "No previously-extracted resume text on file. Upload a resume to seed the extractor.",
      },
      { status: 400 },
    );
  }

  // Run Stage 2 again on the same raw text
  const fresh = await runDualExtraction(session);
  if (!fresh.pureExtraction) {
    return NextResponse.json(
      { error: "extraction_failed", message: "Re-extraction did not produce a usable profile." },
      { status: 500 },
    );
  }

  // Load the current committed v2 snapshot
  const supabase = await createClient();
  const { data: currentProfile } = await supabase
    .from("user_profiles_v2")
    .select("full_name, email, phone, location, linkedin_url, github_url, portfolio_url")
    .eq("user_id", userId)
    .single();
  const { data: currentExp } = await supabase
    .from("user_experience_v2")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  const { data: currentEdu } = await supabase
    .from("user_education_v2")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  const { data: currentSkills } = await supabase
    .from("user_skills_v2")
    .select("raw_list")
    .eq("user_id", userId)
    .single();

  const diff = computeDiff(fresh.pureExtraction, {
    identity: (currentProfile ?? {}) as Record<string, unknown>,
    experience: (currentExp as ExtractionExperience[]) ?? [],
    education: (currentEdu as ExtractionEducation[]) ?? [],
    skills: (currentSkills?.raw_list as string[]) ?? [],
  });

  if (action === "apply") {
    await applyDiff(userId, fresh.pureExtraction);
    return NextResponse.json({ success: true, applied: diff.length });
  }

  // Default: preview
  return NextResponse.json({ diff, fresh: fresh.pureExtraction });
}

function computeDiff(
  fresh: ExtractionSchema,
  current: {
    identity: Record<string, unknown>;
    experience: ExtractionExperience[];
    education: ExtractionEducation[];
    skills: string[];
  },
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  // Identity
  if (fresh.identity) {
    for (const key of Object.keys(fresh.identity) as Array<keyof typeof fresh.identity>) {
      const after = fresh.identity[key];
      const before =
        (current.identity[mapIdentityKey(key)] as string | null | undefined) ?? null;
      if ((after ?? null) !== (before ?? null)) {
        diffs.push({
          field: `identity.${key}`,
          before,
          after,
          kind: !before ? "added" : !after ? "removed" : "changed",
        });
      }
    }
  }

  // Experience: compare by company+title pairs
  const freshExpKeys = fresh.experience.map((e) => `${e.company ?? ""}|${e.title ?? ""}`);
  const currentExpKeys = current.experience.map((e) => `${e.company ?? ""}|${e.title ?? ""}`);
  for (const key of freshExpKeys) {
    if (!currentExpKeys.includes(key)) {
      diffs.push({ field: "experience", before: null, after: key, kind: "added" });
    }
  }
  for (const key of currentExpKeys) {
    if (!freshExpKeys.includes(key)) {
      diffs.push({ field: "experience", before: key, after: null, kind: "removed" });
    }
  }

  // Education
  const freshEduKeys = fresh.education.map((e) => `${e.institution ?? ""}|${e.degree ?? ""}`);
  const currentEduKeys = current.education.map((e) => `${e.institution ?? ""}|${e.degree ?? ""}`);
  for (const key of freshEduKeys) {
    if (!currentEduKeys.includes(key)) {
      diffs.push({ field: "education", before: null, after: key, kind: "added" });
    }
  }

  // Skills
  const freshSkills = new Set(fresh.skills?.raw_list ?? []);
  const currentSkillsSet = new Set(current.skills);
  for (const s of freshSkills) {
    if (!currentSkillsSet.has(s)) {
      diffs.push({ field: "skill", before: null, after: s, kind: "added" });
    }
  }
  for (const s of currentSkillsSet) {
    if (!freshSkills.has(s)) {
      diffs.push({ field: "skill", before: s, after: null, kind: "removed" });
    }
  }

  return diffs;
}

function mapIdentityKey(k: string): string {
  switch (k) {
    case "linkedin_url":
      return "linkedin_url";
    case "github_url":
      return "github_url";
    case "portfolio_url":
      return "portfolio_url";
    default:
      return k;
  }
}

async function applyDiff(userId: string, fresh: ExtractionSchema): Promise<void> {
  const supabase = await createClient();

  // Identity columns
  if (fresh.identity) {
    await supabase
      .from("user_profiles_v2")
      .update({
        full_name: fresh.identity.full_name,
        email: fresh.identity.email,
        phone: fresh.identity.phone,
        location: fresh.identity.location,
        linkedin_url: fresh.identity.linkedin_url,
        github_url: fresh.identity.github_url,
        portfolio_url: fresh.identity.portfolio_url,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  // Experience — full replace
  await supabase.from("user_experience_v2").delete().eq("user_id", userId);
  if (fresh.experience.length > 0) {
    await supabase.from("user_experience_v2").insert(
      fresh.experience.map((e, i) => ({
        user_id: userId,
        sort_order: i,
        title: e.title,
        company: e.company,
        location: e.location,
        start_date: e.start_date,
        end_date: e.end_date,
        is_current: e.is_current,
        bullets: e.bullets ?? [],
        source: "extracted",
      })),
    );
  }

  // Education — full replace
  await supabase.from("user_education_v2").delete().eq("user_id", userId);
  if (fresh.education.length > 0) {
    await supabase.from("user_education_v2").insert(
      fresh.education.map((e, i) => ({
        user_id: userId,
        sort_order: i,
        institution: e.institution,
        degree: e.degree,
        field: e.field,
        start_date: e.start_date,
        end_date: e.end_date,
        gpa: e.gpa,
        honours: e.honours,
        source: "extracted",
      })),
    );
  }

  // Skills
  if (fresh.skills) {
    await supabase
      .from("user_skills_v2")
      .upsert(
        {
          user_id: userId,
          raw_list: fresh.skills.raw_list,
          grouped: fresh.skills.grouped ?? {},
          source: "extracted",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
  }

  // Reset the session's dual_extraction so subsequent re-reads compare against the fresh state
  const session = await loadSession(userId);
  if (session) {
    await updateSession(userId, {
      dual_extraction: { ...session.dual_extraction, pure_extraction: fresh },
    });
  }
}
