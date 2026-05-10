import { db, subscriptions, users } from "@retune/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { AuthProvider, AuthResult, Session } from "./index";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = "7d";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export class LocalAuthProvider implements AuthProvider {
  async signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
    const normalised = email.toLowerCase().trim();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalised))
      .limit(1);
    if (existing[0]) {
      throw new Error("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const inserted = await db
      .insert(users)
      .values({
        email: normalised,
        passwordHash,
        fullName: fullName ?? null,
        authProvider: "email",
        emailVerified: true, // Auto-verify in local mode
        onboardingCompleted: false,
      })
      .returning();
    const userId = inserted[0]?.id;
    if (!userId) throw new Error("Failed to create user");

    // Create free subscription
    await db
      .insert(subscriptions)
      .values({
        userId,
        plan: "free",
        status: "active",
      });

    const token = await this.createToken(userId, normalised, fullName ?? null);
    return {
      session: {
        userId,
        email: normalised,
        fullName: fullName ?? null,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
      token,
    };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const normalised = email.toLowerCase().trim();

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalised))
      .limit(1);
    const user = rows[0];
    if (!user || !user.passwordHash) {
      throw new Error("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    const token = await this.createToken(user.id, user.email, user.fullName);
    return {
      session: {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
      token,
    };
  }

  async verifyToken(token: string): Promise<Session | null> {
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      const userId = payload.userId as string;

      // If the user changed their password after this token was issued, reject it
      const iat = (payload.iat ?? 0) * 1000; // convert to ms
      const rows = await db
        .select({ passwordChangedAt: users.passwordChangedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const passwordChangedAt = rows[0]?.passwordChangedAt;
      if (passwordChangedAt && passwordChangedAt.getTime() > iat) {
        return null;
      }

      return {
        userId,
        email: payload.email as string,
        fullName: (payload.fullName as string | null | undefined) ?? null,
        expiresAt: (payload.exp ?? 0) * 1000,
      };
    } catch {
      return null;
    }
  }

  private async createToken(
    userId: string,
    email: string,
    fullName: string | null,
  ): Promise<string> {
    return new SignJWT({ userId, email, fullName })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(JWT_EXPIRY)
      .sign(getJwtSecret());
  }
}
