import { headers } from "next/headers";
import { createIdentityModule } from "@/lib/identity";

export interface Session {
  userId: string;
  email: string;
  fullName: string | null;
  expiresAt: number;
}

export async function getSession(): Promise<Session | null> {
  // Try to use cached session from middleware first
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  const email = headersList.get("x-user-email");
  
  if (userId && email) {
    return {
      userId,
      email,
      fullName: headersList.get("x-user-name"),
      expiresAt: 0,
    };
  }

  // Fallback to Supabase check (for API routes)
  const identity = createIdentityModule();
  return identity.resolveSessionState();
}
