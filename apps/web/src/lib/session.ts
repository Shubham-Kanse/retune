import { createClient } from "@/lib/supabase/server";

export interface Session {
  userId: string;
  email: string;
  fullName: string | null;
  expiresAt: number;
}

export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.full_name as string | null) ?? null,
    expiresAt: 0, // Supabase manages token expiry
  };
}
