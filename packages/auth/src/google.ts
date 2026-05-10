import { SignJWT } from "jose";

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string | null;
  picture: string | null;
}

export interface GoogleUserResult {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

const JWT_EXPIRY = "7d";

export class GoogleAuthProvider {
  constructor(private config: GoogleAuthConfig) {}

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<GoogleUserResult> {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text().catch(() => "unknown error");
      throw new Error(`Google token exchange failed: ${err}`);
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse;

    // Fetch user info
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      const err = await userRes.text().catch(() => "unknown error");
      throw new Error(`Google userinfo fetch failed: ${err}`);
    }

    const userInfo = (await userRes.json()) as GoogleUserInfo;

    return {
      googleId: userInfo.id,
      email: userInfo.email.toLowerCase().trim(),
      name: userInfo.name ?? null,
      avatarUrl: userInfo.picture ?? null,
    };
  }

  async createSessionToken(
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

export function createGoogleProvider(): GoogleAuthProvider | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) return null;

  return new GoogleAuthProvider({ clientId, clientSecret, redirectUri });
}
