import { createClient } from "@/lib/supabase/server";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import type { ProfileNormalized } from "../contracts";
import { parseJsonSafe, stringifyJson } from "../utils/json";
import { buildProfileMarkdown } from "../services/markdown";

export interface PersistProfileOptions {
  userId: string;
  sessionEmail: string;
  sessionFullName?: string | null;
  profile: ProfileNormalized;
  markOnboardingCompleted: boolean;
  profileMarkdownOverride?: string;
}

export async function getProfileByUserId(userId: string): Promise<Record<string, unknown> | null> {
  const rows = await dbModule.db
    .select()
    .from(dbModule.profiles)
    .where(eq(dbModule.profiles.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    linkedin: row.linkedin,
    location: row.location,
    visaStatus: row.visaStatus,
    currentTitle: row.currentTitle,
    relocationPreferences: parseJsonSafe<string[]>(row.relocationPreferences, []),
    targetRoles: parseJsonSafe<string[]>(row.targetRoles, []),
    experienceLevel: row.experienceLevel,
    experience: parseJsonSafe<unknown[]>(row.experience, []),
    education: parseJsonSafe<unknown[]>(row.education, []),
    certifications: parseJsonSafe<string[]>(row.certifications, []),
    projects: parseJsonSafe<unknown[]>(row.projects, []),
    skillsTier1: parseJsonSafe<unknown[]>(row.skillsTier1, []),
    skillsTier2: parseJsonSafe<unknown[]>(row.skillsTier2, []),
    skillsTier3: parseJsonSafe<unknown[]>(row.skillsTier3, []),
    voiceNotes: row.voiceNotes,
  };
}

export async function persistProfile(opts: PersistProfileOptions): Promise<{ completenessScore: number }> {
  const profileMarkdown = opts.profileMarkdownOverride || buildProfileMarkdown(opts.profile);
  const completenessScore = dbModule.computeCompletenessScore({ ...opts.profile, profileMarkdown });

  const supabase = await createClient();

  // Use Supabase JS client so TEXT[] columns (target_roles, skills, etc.)
  // are serialized correctly by PostgREST instead of being JSON-stringified
  // by postgres-js (which the Drizzle schema incorrectly types as text).
  const row = {
    user_id: opts.userId,
    full_name: opts.profile.fullName || opts.sessionFullName || "",
    email: opts.profile.email || opts.sessionEmail,
    phone: opts.profile.phone ?? null,
    linkedin: opts.profile.linkedin ?? null,
    location: opts.profile.location ?? "",
    visa_status: opts.profile.visaStatus ?? null,
    relocation_preferences: stringifyJson(opts.profile.relocationPreferences),
    target_roles: Array.isArray(opts.profile.targetRoles) ? opts.profile.targetRoles : [],
    experience_level: opts.profile.experienceLevel ?? null,
    current_title: opts.profile.currentTitle ?? null,
    experience: stringifyJson(opts.profile.experience),
    education: stringifyJson(opts.profile.education),
    certifications: stringifyJson(opts.profile.certifications),
    projects: stringifyJson(opts.profile.projects),
    skills_tier1: stringifyJson(opts.profile.skillsTier1),
    skills_tier2: stringifyJson(opts.profile.skillsTier2),
    skills_tier3: stringifyJson(opts.profile.skillsTier3),
    voice_notes: opts.profile.voiceNotes ?? null,
    profile_markdown: profileMarkdown,
    completeness_score: completenessScore,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" });

  if (opts.markOnboardingCompleted) {
    await supabase
      .from("users")
      .update({
        onboarding_completed: true,
        full_name: row.full_name || opts.sessionFullName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.userId);
  }

  return { completenessScore };
}
