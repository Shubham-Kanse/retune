import { DashboardClient } from "@/components/dashboard/dashboard-shell";
import { safeQuery } from "@/lib/errors";
import { getSession } from "@/lib/session";
import { computeCompletenessScore, db } from "@retune/db";
import { applications, profiles } from "@retune/db/schema";
import { desc, eq } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const safeJson = (v: string | null | undefined) => {
    try {
      return v ? JSON.parse(v) : [];
    } catch {
      return [];
    }
  };

  const [profileRows, recent] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({
            fullName: profiles.fullName,
            targetRoles: profiles.targetRoles,
            experience: profiles.experience,
            education: profiles.education,
            skillsTier1: profiles.skillsTier1,
            voiceNotes: profiles.voiceNotes,
            profileMarkdown: profiles.profileMarkdown,
            currentTitle: profiles.currentTitle,
            email: profiles.email,
            phone: profiles.phone,
            linkedin: profiles.linkedin,
            location: profiles.location,
          })
          .from(profiles)
          .where(eq(profiles.userId, session.userId))
          .limit(1),
      [],
    ),
    safeQuery(
      () =>
        db
          .select({
            id: applications.id,
            status: applications.status,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .where(eq(applications.userId, session.userId))
          .orderBy(desc(applications.createdAt))
          .limit(20),
      [] as Array<{ id: string; status: string; createdAt: Date | string | null }>,
    ),
  ]);

  const profile = profileRows[0];
  const profileScore = profile
    ? computeCompletenessScore({
        ...profile,
        targetRoles: safeJson(profile.targetRoles),
        experience: safeJson(profile.experience),
        education: safeJson(profile.education),
        skillsTier1: safeJson(profile.skillsTier1),
      })
    : 0;

  const firstName =
    (session.fullName ?? profile?.fullName ?? "").trim().split(/\s+/)[0] || "";
  const shipped = recent.filter(
    (g) => g.status === "completed" || g.status === "submitted",
  ).length;

  return (
    <DashboardClient
      firstName={firstName}
      profileScore={profileScore}
      totalGenerations={recent.length}
      shippedCount={shipped}
    />
  );
}
