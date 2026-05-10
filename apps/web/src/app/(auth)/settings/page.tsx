import { SettingsClient } from "@/components/settings/settings-client";
import { getSession } from "@/lib/session";
import { getSubscription } from "@retune/billing";
import { db, users } from "@retune/db";
import { eq } from "drizzle-orm";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const [sub, userRows] = await Promise.all([
    getSubscription(session.userId),
    db
      .select({ createdAt: users.createdAt, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1),
  ]);
  const user = userRows[0];

  return (
    <SettingsClient
      subscription={sub}
      email={session.email}
      fullName={user?.fullName ?? session.fullName ?? ""}
      createdAt={user?.createdAt ?? null}
    />
  );
}
