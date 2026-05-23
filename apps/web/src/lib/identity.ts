import { db, processorConsents, subscriptions, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { ConflictError, ValidationError } from "./errors";
import type { Session } from "./session";
import { createClient } from "./supabase/server";

export type ProcessorKey = "anthropic" | "openai" | "retune";

export interface SignUpInput {
  email: string;
  password: string;
  fullName?: string;
  processorConsents?: Partial<Record<ProcessorKey, boolean>>;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface IdentityModule {
  signUp(input: SignUpInput): Promise<{ userId?: string; emailVerificationSent: true }>;
  signIn(input: SignInInput): Promise<{ userId: string; onboardingCompleted: boolean }>;
  signOut(): Promise<{ ok: true }>;
  resolveSessionState(): Promise<Session | null>;
}

export function createIdentityModule(): IdentityModule {
  return {
    async signUp(input) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: { full_name: input.fullName ?? null },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes("already")) {
          throw new ConflictError("An account with this email already exists");
        }
        throw new ValidationError(error.message);
      }

      const userId = data.user?.id;
      if (userId) {
        await db
          .insert(users)
          .values({
            id: userId,
            email: input.email,
            fullName: input.fullName ?? null,
            authProvider: "email",
            emailVerified: false,
            onboardingCompleted: false,
          })
          .onConflictDoNothing();

        // Only insert subscription if user row exists (handles conflict case
        // where a different UUID owns this email)
        const userRow = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (userRow[0]) {
          await db
            .insert(subscriptions)
            .values({
              userId,
              plan: "free",
              status: "active",
            })
            .onConflictDoNothing();
        }

        // Persist GDPR-relevant processor consents alongside the user row.
        // Without this the signup form's checkboxes are legally meaningless.
        const consents = input.processorConsents ?? {};
        const now = new Date();
        const rows = (Object.keys(consents) as ProcessorKey[])
          .filter((k) => consents[k] === true)
          .map((processor) => ({
            userId,
            processor,
            granted: true,
            grantedAt: now,
          }));
        if (rows.length > 0) {
          await db.insert(processorConsents).values(rows);
        }
      }

      return { userId, emailVerificationSent: true };
    },

    async signIn(input) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword(input);
      if (error || !data.user?.id) {
        throw new ValidationError("Invalid email or password");
      }

      const rows = await db
        .select({ onboardingCompleted: users.onboardingCompleted })
        .from(users)
        .where(eq(users.id, data.user.id))
        .limit(1);

      return {
        userId: data.user.id,
        onboardingCompleted: rows[0]?.onboardingCompleted ?? false,
      };
    },

    async signOut() {
      const supabase = await createClient();
      const { error } = await supabase.auth.signOut();
      if (error && !error.message.toLowerCase().includes("session")) {
        throw new ValidationError(error.message);
      }
      return { ok: true };
    },

    async resolveSessionState() {
      const supabase = await createClient();
      // Supabase's auth client logs "Invalid Refresh Token" via
      // console.error from inside getUser() when the auth cookie is
      // stale (common after sign-out, expired sessions, or local dev
      // server restarts). The message can't be silenced via the SDK,
      // so we filter it at the console boundary while we run getUser.
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        const first = args[0];
        const text =
          typeof first === "string" ? first : first instanceof Error ? first.message : "";
        if (/AuthApiError|refresh.?token|Refresh Token/i.test(text)) return;
        originalError(...args);
      };
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          // Stale refresh token — clear the cookies so subsequent
          // requests don't re-trigger the same error log every render.
          if (/refresh.*token/i.test(error.message)) {
            try {
              const store = await cookies();
              for (const c of store.getAll()) {
                if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
                  store.delete(c.name);
                }
              }
            } catch {
              // best-effort: server components can't always mutate
              // cookies. Middleware will tidy up on next request.
            }
          }
          return null;
        }
        if (!user) return null;
        return {
          userId: user.id,
          email: user.email ?? "",
          fullName: (user.user_metadata?.full_name as string | null) ?? null,
          expiresAt: 0,
        };
      } catch {
        return null;
      } finally {
        console.error = originalError;
      }
    },
  };
}
