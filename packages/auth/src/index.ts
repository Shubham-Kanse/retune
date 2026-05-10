export interface Session {
  userId: string;
  email: string;
  fullName: string | null;
  expiresAt: number;
}

export interface AuthResult {
  session: Session;
  token: string;
}

export interface AuthProvider {
  signUp(email: string, password: string, fullName?: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  verifyToken(token: string): Promise<Session | null>;
}

export { LocalAuthProvider } from "./local";
export { GoogleAuthProvider, createGoogleProvider } from "./google";
export type { GoogleAuthConfig, GoogleUserResult } from "./google";
