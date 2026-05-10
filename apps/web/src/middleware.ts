import { createServerClient } from "@supabase/ssr";
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

  // Build a response we can mutate (Supabase SSR needs to set cookies on it)
  let response = NextResponse.next({ request });

  // Security headers
  const allowSelfFrame = pathname === "/terms" || pathname === "/privacy";
  response.headers.set("X-Frame-Options", allowSelfFrame ? "SAMEORIGIN" : "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const devSources = process.env.NODE_ENV === "development" ? " http://localhost:* ws://localhost:*" : "";
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

  // Skip auth check for public paths, API routes, and static files
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    /\.(ico|svg|txt|xml|json|mjs|webmanifest)$/.test(pathname)
  ) {
    return response;
  }

  // Refresh Supabase session (rotates tokens if needed) and check auth
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(toSet) {
          for (const { name, value, options } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
