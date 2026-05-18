import { createClient } from "@/lib/supabase/server";
import { db, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "signup" | "email" | "recovery" | "invite" | "magiclink" | null;
  const callback = searchParams.get("callback") ?? "/login?verified=true";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      // Mark email as verified in public.users
      const userId = data.user?.id;
      if (userId) {
        await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
      }
      // Sign out so user is redirected to login with success message
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(callback, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
}
