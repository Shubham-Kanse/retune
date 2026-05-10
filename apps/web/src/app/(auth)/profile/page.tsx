import { ProfileEditor } from "@/components/profile/profile-editor";
import { getSession } from "@/lib/session";
import { db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeArrayParse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string" && parsed) return [parsed];
    return [];
  } catch {
    return [];
  }
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) return null;

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.userId))
    .limit(1);
  const profile = profileRows[0];

  const profileData = profile
    ? {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone ?? "",
        linkedin: profile.linkedin ?? "",
        location: profile.location,
        visaStatus: profile.visaStatus ?? "",
        relocationPreferences: safeArrayParse(profile.relocationPreferences),
        targetRoles: safeArrayParse(profile.targetRoles),
        currentTitle: profile.currentTitle ?? "",
        experienceLevel: profile.experienceLevel ?? "mid",
        experience: safeJsonParse<any[]>(profile.experience, []),
        education: safeJsonParse<any[]>(profile.education, []),
        certifications: safeJsonParse<string[]>(profile.certifications, []),
        projects: safeJsonParse<any[]>(profile.projects, []),
        skillsTier1: safeJsonParse<any[]>(profile.skillsTier1, []),
        skillsTier2: safeJsonParse<any[]>(profile.skillsTier2, []),
        skillsTier3: safeJsonParse<any[]>(profile.skillsTier3, []),
        tools: [],
        voiceNotes: profile.voiceNotes ?? "",
        profileMarkdown: profile.profileMarkdown,
        completenessScore: profile.completenessScore,
      }
    : {
        fullName: session.fullName ?? "",
        email: session.email,
        phone: "",
        linkedin: "",
        location: "",
        visaStatus: "",
        relocationPreferences: [],
        targetRoles: [],
        currentTitle: "",
        experienceLevel: "mid" as const,
        experience: [],
        education: [],
        certifications: [],
        projects: [],
        skillsTier1: [],
        skillsTier2: [],
        skillsTier3: [],
        tools: [],
        voiceNotes: "",
        profileMarkdown: "",
        completenessScore: 0,
      };

  return <ProfileEditor profile={profileData} />;
}
