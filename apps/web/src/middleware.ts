import { resolveSessionStateFromRequest } from "@/lib/identity-edge";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/terms",
  "/privacy",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security headers
  const allowSelfFrame = pathname === "/terms" || pathname === "/privacy";
  const devSources =
    process.env.NODE_ENV === "development" ? " http://localhost:* ws://localhost:*" : "";

  const applySecurityHeaders = (response: NextResponse) => {
    response.headers.set("X-Frame-Options", allowSelfFrame ? "SAMEORIGIN" : "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "style-src-elem 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https:",
        `connect-src 'self' https:${devSources}`,
        `frame-ancestors ${allowSelfFrame ? "'self'" : "'none'"}`,
      ].join("; "),
    );
  };

  // Skip auth check for public paths, API routes, and static files
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    /\.(ico|svg|txt|xml|json|mjs|webmanifest)$/.test(pathname)
  ) {
    const response = NextResponse.next();
    applySecurityHeaders(response);
    return response;
  }

  if (process.env.E2E_AUTH_BYPASS === "1" && process.env.NODE_ENV !== "production") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(
      "x-user-id",
      process.env.E2E_AUTH_USER_ID ?? "00000000-0000-0000-0000-000000000001",
    );
    requestHeaders.set("x-user-email", process.env.E2E_AUTH_EMAIL ?? "e2e@retune.local");
    requestHeaders.set("x-user-name", process.env.E2E_AUTH_NAME ?? "E2E User");
    requestHeaders.set("x-pathname", pathname);
    requestHeaders.set("x-url", request.nextUrl.toString());
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response);
    return response;
  }

  const { response, session } = await resolveSessionStateFromRequest(request);

  if (!session) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    applySecurityHeaders(redirect);
    return redirect;
  }

  // Pass session to page via header to avoid re-fetching
  response.headers.set("x-user-id", session.userId);
  response.headers.set("x-user-email", session.email);
  if (session.fullName) {
    response.headers.set("x-user-name", session.fullName);
  }
  // Pass pathname and full URL so layouts can read query params (e.g. enhance=1)
  response.headers.set("x-pathname", pathname);
  response.headers.set("x-url", request.nextUrl.toString());

  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
