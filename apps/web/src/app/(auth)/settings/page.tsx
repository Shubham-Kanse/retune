import { SettingsClient } from "@/components/settings/settings-client";
import { getCachedUser } from "@/lib/cached-queries";
import { getSession } from "@/lib/session";
import { getSubscription } from "@retune/billing";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  // Parallel execution
  const [sub, userRows] = await Promise.all([
    getSubscription(session.userId).catch(() => ({
      plan: "free" as const,
      status: "active",
      generationsUsed: 0,
      generationsLimit: 0,
      creditsUsed: 0,
      creditsLimit: 0,
      creditsRemaining: 0,
      creditsUsedUsd: 0,
      creditsLimitUsd: 0,
      creditsRemainingUsd: 0,
    })),
    getCachedUser(session.userId),
  ]);

  const user = userRows[0];
  
  // Format date on server to avoid hydration mismatch
  const formattedDate = user?.createdAt
    ? user.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <SettingsClient
      subscription={sub}
      email={session.email}
      fullName={user?.fullName ?? session.fullName ?? ""}
      memberSince={formattedDate}
    />
  );
}
