import type { Session } from "@/lib/session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError, ForbiddenError, RateLimitError, toErrorResponse } from "./errors";
import { rateLimit } from "./rate-limit";
import { getSession } from "./session";

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

type SimpleHandler = (request: Request, session: Session) => Promise<NextResponse | Response>;

type ParamsHandler = (
  request: Request,
  session: Session,
  params: Record<string, string>,
) => Promise<NextResponse | Response>;

/**
 * Auth + error handling for routes WITHOUT dynamic params (e.g. /api/applications).
 */
export function withAuth(handler: SimpleHandler) {
  return async (request: Request) => {
    try {
      checkOrigin(request);
      // Rate limiting
      const { success } = rateLimit(request as NextRequest, 60);
      if (!success) throw new RateLimitError();

      const session = await getSession();
      if (!session) throw new AuthError();
      return await handler(request, session);
    } catch (err) {
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}

/**
 * Auth + error handling for routes WITH dynamic params (e.g. /api/generate/[id]/[filename]).
 */
export function withAuthParams(handler: ParamsHandler) {
  return async (request: Request, { params }: { params: Promise<Record<string, string>> }) => {
    try {
      checkOrigin(request);
      // Rate limiting
      const { success } = rateLimit(request as NextRequest, 60);
      if (!success) throw new RateLimitError();

      const session = await getSession();
      if (!session) throw new AuthError();
      const resolved = await params;
      return await handler(request, session, resolved);
    } catch (err) {
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}

/**
 * Error handling only (no auth) for public routes.
 */
export function withErrorHandling(handler: (request: Request) => Promise<NextResponse | Response>) {
  return async (request: Request) => {
    try {
      // Rate limiting for public routes
      const { success } = rateLimit(request as NextRequest, 100);
      if (!success) throw new RateLimitError();

      return await handler(request);
    } catch (err) {
      const { error, code, status } = toErrorResponse(err);
      return NextResponse.json({ error, code }, { status });
    }
  };
}
