import { createServerClient } from "@supabase/ssr";
import { db, subscriptions, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ConflictError, ValidationError } from "./errors";
import type { Session } from "./session";
import { createClient } from "./supabase/server";

export interface SignUpInput {
  email: string;
  password: string;
  fullName?: string;
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
        options: { data: { full_name: input.fullName ?? null } },
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

        await db
          .insert(subscriptions)
          .values({
            userId,
            plan: "free",
            status: "active",
          })
          .onConflictDoNothing();
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
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) return null;
      return {
        userId: user.id,
        email: user.email ?? "",
        fullName: (user.user_metadata?.full_name as string | null) ?? null,
        expiresAt: 0,
      };
    },
  };
}

