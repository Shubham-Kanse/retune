import type { Session } from "@/lib/session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CSRF_COOKIE, generateCSRFToken, setCSRFCookie, validateCSRFToken } from "./csrf";
import { AuthError, ForbiddenError, RateLimitError, toErrorResponse } from "./errors";
import { rateLimit } from "./rate-limit";
import { extractRequestContext, recordSecurityEvent } from "./security-audit";
import { getApiSession } from "./session";

/**
 * Charter 01 Epic 07 — emit an audit event when a wrapper-level security
 * check rejects a request. Fired only for the security-relevant errors
 * (CSRF / rate-limit / auth failure / origin reject); validation
 * failures are routine and would just generate noise.
 */
function auditSecurityFailure(request: Request, err: unknown): void {
  let event_type: string | null = null;
  if (err instanceof RateLimitError) event_type = "api.rate_limit.exceeded";
  else if (err instanceof ForbiddenError) event_type = "api.csrf_or_origin.rejected";
  else if (err instanceof AuthError) event_type = "api.auth.unauthenticated";
  if (!event_type) return;

  // Defensive: tests sometimes pass a Request-like with missing url/headers.
  let pathname: string | null = null;
  try {
    if (typeof request.url === "string" && request.url.length > 0) {
      pathname = new URL(request.url).pathname;
    }
  } catch {
    /* leave null */
  }

  const ctx = extractRequestContext(request);
  void recordSecurityEvent({
    event_type,
    actor_kind: "anonymous",
    outcome: "denied",
    ...ctx,
    metadata: {
      method: request.method,
      url: pathname,
      reason: err instanceof Error ? err.message.slice(0, 240) : "unknown",
    },
  });
}

/**
 * Origin-check (lightweight, fast, no I/O).
 * `checkOrigin` is the first line of defence; CSRF token is the second.
 */
function checkOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin) return; // no Origin header — same-origin server request, allow
  const host = request.headers.get("host") ?? "";
  try {
    if (new URL(origin).host !== host) throw new ForbiddenError("Cross-origin request rejected");
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    throw new ForbiddenError("Invalid origin header");
  }
}

/**
 * CSRF token verification (Charter 01 Epic 05).
 *
 * Rollout plan:
 *   1. (Now) `csrf: "off"` is the default so existing routes don't
 *      break before client code starts sending the token. Origin-check
 *      + Supabase session cookie remain the active defence.
 *   2. Routes that POST forms add `csrf: "soft"` to start logging
 *      cases where the token would have been rejected.
 *   3. Once soft-mode is silent for the route, flip to `csrf: "strict"`.
 *   4. Eventually flip the default to "strict" globally.
 *
 * Routes that ISSUE the CSRF cookie itself (auth endpoints) stay at
 * `csrf: "off"` permanently — they precede the token's existence.
 */
type CsrfMode = "strict" | "soft" | "off";

function checkCsrf(request: Request, mode: CsrfMode): void {
  if (mode === "off") return;
  if (validateCSRFToken(request as NextRequest)) return;
  if (mode === "soft") {
    // eslint-disable-next-line no-console
    console.warn(
      "[csrf] soft-mode reject (would 403 in strict): %s %s",
      request.method,
      request.url,
    );
    return;
  }
  throw new ForbiddenError("CSRF token missing or invalid");
}

/**
 * Ensure the CSRF cookie is present on the response. We only mint a
 * cookie if the request didn't already have one — this lets the server
 * issue the token on the first GET of a session and have the client
 * reuse it for the next 24 hours.
 */
function ensureCsrfCookie(request: Request, response: NextResponse): NextResponse {
  const existing = (request as NextRequest).cookies?.get?.(CSRF_COOKIE)?.value;
  if (existing) return response;
  setCSRFCookie(response, generateCSRFToken());
  return response;
}

type SimpleHandler = (request: Request, session: Session) => Promise<NextResponse | Response>;

type ParamsHandler = (
  request: Request,
  session: Session,
  params: Record<string, string>,
) => Promise<NextResponse | Response>;

interface AuthOptions {
  csrf?: CsrfMode;
  /** Per-IP rate limit (default 60 / 60s). */
  rateLimitPerMinute?: number;
}

const DEFAULT_AUTH_OPTIONS: Required<AuthOptions> = {
  // Default OFF during rollout — see CsrfMode comment above for the
  // staged enforcement plan. Origin check + Supabase session remain
  // the always-on defences.
  csrf: "off",
  rateLimitPerMinute: 60,
};

/**
 * Auth + error handling for routes WITHOUT dynamic params (e.g. /api/applications).
 */
export function withAuth(handler: SimpleHandler, options: AuthOptions = {}) {
  const opts = { ...DEFAULT_AUTH_OPTIONS, ...options };
  return async (request: Request) => {
    try {
      checkOrigin(request);
      checkCsrf(request, opts.csrf);
      const { success } = rateLimit(request as NextRequest, opts.rateLimitPerMinute);
      if (!success) throw new RateLimitError();

      const session = await getApiSession();
      if (!session) throw new AuthError();
      const handlerResponse = await handler(request, session);
      // Mint CSRF cookie on first response if missing (so subsequent
      // POSTs from the same client work).
      if (handlerResponse instanceof NextResponse) {
        return ensureCsrfCookie(request, handlerResponse);
      }
      return handlerResponse;
    } catch (err) {
      auditSecurityFailure(request, err);
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}

/**
 * Auth + error handling for routes WITH dynamic params (e.g. /api/generate/[id]/[filename]).
 */
export function withAuthParams(handler: ParamsHandler, options: AuthOptions = {}) {
  const opts = { ...DEFAULT_AUTH_OPTIONS, ...options };
  return async (request: Request, { params }: { params: Promise<Record<string, string>> }) => {
    try {
      checkOrigin(request);
      checkCsrf(request, opts.csrf);
      const { success } = rateLimit(request as NextRequest, opts.rateLimitPerMinute);
      if (!success) throw new RateLimitError();

      const session = await getApiSession();
      if (!session) throw new AuthError();
      const resolved = await params;
      const handlerResponse = await handler(request, session, resolved);
      if (handlerResponse instanceof NextResponse) {
        return ensureCsrfCookie(request, handlerResponse);
      }
      return handlerResponse;
    } catch (err) {
      auditSecurityFailure(request, err);
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}

/**
 * Error handling only (no auth) for public routes. CSRF is OFF by default
 * on public routes; opt in for forms (e.g. login) via `csrf: "strict"`.
 */
export function withErrorHandling(
  handler: (request: Request) => Promise<NextResponse | Response>,
  options: AuthOptions = {},
) {
  const opts = { ...DEFAULT_AUTH_OPTIONS, ...options, csrf: options.csrf ?? "off" };
  return async (request: Request) => {
    try {
      checkOrigin(request);
      checkCsrf(request, opts.csrf);
      const { success } = rateLimit(request as NextRequest, opts.rateLimitPerMinute || 100);
      if (!success) throw new RateLimitError();

      const handlerResponse = await handler(request);
      if (handlerResponse instanceof NextResponse) {
        return ensureCsrfCookie(request, handlerResponse);
      }
      return handlerResponse;
    } catch (err) {
      auditSecurityFailure(request, err);
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}

/**
 * Charter 02-Core-Features Epic 03 — Supabase-direct auth wrapper.
 *
 * The `/api/profile-v2/*` and `/api/onboarding-v2/*` routes call
 * `supabase.auth.getUser()` themselves. They diverged from `withAuth`
 * because they need the Supabase user.id directly rather than the
 * abstract `Session` shape. This wrapper preserves that pattern while
 * adding the rate-limit + origin-check + standard-error layer they were
 * missing.
 *
 * Handler signature: `(req, userId) => ...`.
 */
type SupabaseAuthHandler = (request: Request, userId: string) => Promise<NextResponse | Response>;

type SupabaseAuthHandlerWithParams = (
  request: Request,
  userId: string,
  params: Record<string, string>,
) => Promise<NextResponse | Response>;

export function withSupabaseAuth(handler: SupabaseAuthHandler, options: AuthOptions = {}) {
  const opts = { ...DEFAULT_AUTH_OPTIONS, ...options };
  return async (request: Request) => {
    try {
      checkOrigin(request);
      checkCsrf(request, opts.csrf);
      const { success } = rateLimit(request as NextRequest, opts.rateLimitPerMinute);
      if (!success) throw new RateLimitError();

      // Lazy import so the wrapper can be used in edge-compatible contexts
      // where @supabase/ssr would otherwise be eagerly bundled.
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new AuthError();

      const handlerResponse = await handler(request, user.id);
      if (handlerResponse instanceof NextResponse) {
        return ensureCsrfCookie(request, handlerResponse);
      }
      return handlerResponse;
    } catch (err) {
      auditSecurityFailure(request, err);
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}

export function withSupabaseAuthParams(
  handler: SupabaseAuthHandlerWithParams,
  options: AuthOptions = {},
) {
  const opts = { ...DEFAULT_AUTH_OPTIONS, ...options };
  return async (request: Request, { params }: { params: Promise<Record<string, string>> }) => {
    try {
      checkOrigin(request);
      checkCsrf(request, opts.csrf);
      const { success } = rateLimit(request as NextRequest, opts.rateLimitPerMinute);
      if (!success) throw new RateLimitError();

      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new AuthError();

      const resolved = await params;
      const handlerResponse = await handler(request, user.id, resolved);
      if (handlerResponse instanceof NextResponse) {
        return ensureCsrfCookie(request, handlerResponse);
      }
      return handlerResponse;
    } catch (err) {
      auditSecurityFailure(request, err);
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}
