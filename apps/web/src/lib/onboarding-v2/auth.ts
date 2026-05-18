import { createClient } from "@/lib/supabase/server";
import { db, users } from "@retune/db";

export function isE2EAuthBypassEnabled(): boolean {
  return process.env.E2E_AUTH_BYPASS === "1" && process.env.NODE_ENV !== "production";
}

export function getE2EUserId(): string {
  return process.env.E2E_AUTH_USER_ID ?? "00000000-0000-0000-0000-000000000001";
}

export async function ensureE2EUser(): Promise<string> {
  const userId = getE2EUserId();
  const now = new Date();

  await db
    .insert(users)
    .values({
      id: userId,
      email: process.env.E2E_AUTH_EMAIL ?? "e2e@retune.local",
      fullName: process.env.E2E_AUTH_NAME ?? "E2E User",
      authProvider: "e2e",
      emailVerified: true,
      onboardingCompleted: false,
      personaType: "experienced_ic",
      market: "US",
      locale: "en-US",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: process.env.E2E_AUTH_EMAIL ?? "e2e@retune.local",
        fullName: process.env.E2E_AUTH_NAME ?? "E2E User",
        emailVerified: true,
        onboardingCompleted: false,
        updatedAt: now,
      },
    });

  return userId;
}

export async function getOnboardingV2UserId(): Promise<string | null> {
  if (isE2EAuthBypassEnabled()) return ensureE2EUser();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
