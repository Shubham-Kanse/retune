import { createClient } from "@/lib/supabase/server";
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

  // Supabase sets the session cookie automatically via the SSR client.
  // Check if this is a new user by looking at created_at vs last_sign_in_at.
  const { data: { user } } = await supabase.auth.getUser();
  const isNewUser = user?.created_at === user?.last_sign_in_at;

  return NextResponse.redirect(new URL(isNewUser ? "/onboarding" : "/dashboard", origin));
}
