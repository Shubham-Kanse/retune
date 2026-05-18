import { createClient } from "@/lib/supabase/server";
import { db, subscriptions, users } from "@retune/db";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_missing_params", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  // Check if a public.users row already exists for this Supabase auth UUID
  const existing = await db
    .select({ onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (existing[0]) {
    // Known user — go to the right place
    const done = existing[0].onboardingCompleted ?? false;
    return NextResponse.redirect(new URL(done ? "/dashboard" : "/onboarding-v2", origin));
  }

  // No row for this UUID. Check if email exists under a different UUID (account merge case).
  // If so, update that row's id to the new Supabase UUID so all FKs resolve correctly.
  const byEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user.email!))
    .limit(1);

  if (byEmail[0]) {
    // Update provider fields only — never change the PK (no ON UPDATE CASCADE on child FKs)
    await db.execute(sql`UPDATE public.users SET auth_provider = 'google', email_verified = true, updated_at = now() WHERE email = ${user.email!}`);
    await db.insert(subscriptions).values({ userId: byEmail[0].id, plan: "free", status: "active" }).onConflictDoNothing();
    
    // Check onboarding status before redirecting
    const merged = await db
      .select({ onboardingCompleted: users.onboardingCompleted })
      .from(users)
      .where(eq(users.email, user.email!))
      .limit(1);
    const done = merged[0]?.onboardingCompleted ?? false;
    return NextResponse.redirect(new URL(done ? "/dashboard" : "/onboarding-v2", origin));
  }

  // Brand new user
  await db.insert(users).values({
    id: user.id,
    email: user.email!,
    fullName: user.user_metadata?.full_name ?? null,
    avatarUrl: user.user_metadata?.avatar_url ?? null,
    authProvider: "google",
    emailVerified: true,
    onboardingCompleted: false,
  });

  // Ensure subscription exists for this user id
  await db
    .insert(subscriptions)
    .values({ userId: user.id, plan: "free", status: "active" })
    .onConflictDoNothing();

  return NextResponse.redirect(new URL("/onboarding-v2", origin));
}
