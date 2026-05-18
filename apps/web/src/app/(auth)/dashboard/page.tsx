import { PageHeader, PageShell } from "@/components/app/page-shell";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { OnboardingV2MigrationCard } from "@/components/dashboard/onboarding-v2-migration-card";
import { safeQuery } from "@/lib/errors";
import { loadV2Profile } from "@/lib/onboarding-v2/repository";
import { getSession } from "@/lib/session";
import { computeCompletenessScore, db } from "@retune/db";
import { applications, profiles } from "@retune/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const profileRows = await safeQuery(
    () =>
      db
        .select({
          fullName: profiles.fullName,
          targetRoles: profiles.targetRoles,
          experience: profiles.experience,
          education: profiles.education,
          skillsTier1: profiles.skillsTier1,
        })
        .from(profiles)
        .where(eq(profiles.userId, session.userId))
        .limit(1),
    [] as Array<{ fullName: string; targetRoles: string; experience: string; education: string; skillsTier1: string | null }>,
  );
  const profile = profileRows[0];

  const v2Profile = await loadV2Profile(session.userId);
  const showMigrationCard = !!profile?.fullName && !v2Profile;

  const safeJson = (v: string | null | undefined) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };

  const generations = await safeQuery(
    () => db.select({ id: applications.id, status: applications.status }).from(applications).where(eq(applications.userId, session.userId)).limit(50),
    [],
  );

  const profileScore = profile
    ? computeCompletenessScore({
        ...profile,
        targetRoles: safeJson(profile.targetRoles),
        experience: safeJson(profile.experience),
        education: safeJson(profile.education),
        skillsTier1: safeJson(profile.skillsTier1),
      })
    : 0;

  const shipped = generations.filter((i) => i.status === "completed" || i.status === "submitted").length;
  const firstName = profile?.fullName?.split(" ")[0] ?? "";

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Dashboard"
        title={firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
        subtitle="Paste a role below to start a new tuning."
      />
      {showMigrationCard && (
        <section className="mb-12">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Notifications
          </p>
          <OnboardingV2MigrationCard show={showMigrationCard} />
        </section>
      )}
      <DashboardClient
        firstName={firstName}
        profileScore={profileScore}
        shipped={shipped}
        total={generations.length}
      />
    </PageShell>
  );
}
