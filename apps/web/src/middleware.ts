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

/**
 * Generate a cryptographically-strong nonce for inline scripts/styles.
 * Edge runtime: uses Web Crypto.
 *
 * Charter 01 Epic 04 — nonce-based CSP. The nonce is added to
 * `script-src 'nonce-${nonce}' 'strict-dynamic'` so only scripts
 * carrying the nonce attribute can execute. Next.js automatically
 * propagates the nonce to its own framework scripts when we set the
 * `x-nonce` request header (read by `app/layout.tsx` and used by
 * `unstable_after` / `headers()` based components).
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Supabase email verification redirects to /?code=... — forward to callback handler
  if (pathname === "/" && searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    return NextResponse.redirect(url);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";

  // One nonce per request — used in CSP header and propagated via
  // `x-nonce` header so server components can apply it to inline tags.
  const nonce = generateNonce();

  // Security headers
  const allowSelfFrame = pathname === "/terms" || pathname === "/privacy";
  const devSources = isDevelopment ? " http://localhost:* ws://localhost:*" : "";

  const applySecurityHeaders = (response: NextResponse) => {
    response.headers.set("X-Frame-Options", allowSelfFrame ? "SAMEORIGIN" : "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    // Charter 01 Epic 04: HSTS. Two-year max-age with preload eligibility.
    // Only set in production — local dev runs HTTP and would lock browsers
    // to HTTPS-only for the dev domain otherwise.
    if (isProduction) {
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }

    // Charter 01 Epic 04: nonce-based CSP.
    //
    // Production:
    //   - script-src uses nonce + strict-dynamic. Any script that lacks
    //     the nonce will not execute. `strict-dynamic` lets nonced
    //     scripts dynamically load further scripts without each needing
    //     its own nonce (required by Next.js framework chunks).
    //   - NO 'unsafe-eval', NO 'unsafe-inline' in script-src.
    //   - style-src keeps 'unsafe-inline' until Tailwind / styled-jsx
    //     are migrated to nonce mode (tracked separately; their inline
    //     CSS injection is structurally hard to nonce without a build
    //     pipeline change).
    //
    // Development:
    //   - Next.js dev server uses eval for Fast Refresh and inline
    //     scripts for HMR. We keep 'unsafe-eval' and 'unsafe-inline'
    //     in dev only so the dev experience isn't broken.
    const scriptSrc = isDevelopment
      ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-${nonce}'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline'",
        "style-src-elem 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https:",
        `connect-src 'self' https:${devSources}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${allowSelfFrame ? "'self'" : "'none'"}`,
        // upgrade-insecure-requests is a no-op in dev; harmless to ship.
        "upgrade-insecure-requests",
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
    const response = NextResponse.next({
      request: { headers: withNonce(request.headers, nonce) },
    });
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
    requestHeaders.set("x-nonce", nonce);
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
  response.headers.set("x-nonce", nonce);

  applySecurityHeaders(response);
  return response;
}

function withNonce(headers: Headers, nonce: string): Headers {
  const out = new Headers(headers);
  out.set("x-nonce", nonce);
  return out;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
