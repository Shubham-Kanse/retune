import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE = "csrf-token";

export function generateCSRFToken(): string {
  return randomBytes(32).toString("hex");
}

export function validateCSRFToken(request: NextRequest): boolean {
  // Skip CSRF for GET requests
  if (request.method === "GET") return true;

  const headerToken = request.headers.get(CSRF_HEADER);
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;

  return Boolean(headerToken && cookieToken && headerToken === cookieToken);
}
