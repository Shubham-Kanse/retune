import { headers } from "next/headers";
import { createIdentityModule } from "@/lib/identity";

export interface Session {
  userId: string;
  email: string;
  fullName: string | null;
  expiresAt: number;
}

/**
 * For page/server-component use only. Trusts middleware-injected headers.
 * Never use this in API routes — headers can be spoofed by clients.
 */
export async function getPageSessionFromTrustedMiddlewareHeaders(): Promise<Session | null> {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  const email = headersList.get("x-user-email");
  if (userId && email) {
    return { userId, email, fullName: headersList.get("x-user-name"), expiresAt: 0 };
  }
  return null;
}

/**
 * For API routes. Always verifies the session with Supabase.
 * Never trusts x-user-id or x-user-email headers.
 */
export async function getApiSession(): Promise<Session | null> {
  const identity = createIdentityModule();
  return identity.resolveSessionState();
}

/**
 * @deprecated Use getPageSessionFromTrustedMiddlewareHeaders() for pages
 * or getApiSession() for API routes.
 */
export async function getSession(): Promise<Session | null> {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  const email = headersList.get("x-user-email");
  if (userId && email) {
    return { userId, email, fullName: headersList.get("x-user-name"), expiresAt: 0 };
  }
  const identity = createIdentityModule();
  return identity.resolveSessionState();
}
