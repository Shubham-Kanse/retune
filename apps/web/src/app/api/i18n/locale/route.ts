/**
 * POST /api/i18n/locale — set the active locale cookie (Charter 16).
 *
 * Body: `{ locale: "en" | "en-GB" | "en-US" }`. Validated against the
 * canonical LOCALES list. Cookie TTL is 1 year, HttpOnly+SameSite=Lax.
 */

import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { locale?: unknown };
  const candidate = typeof body.locale === "string" ? body.locale : null;
  if (!isLocale(candidate)) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
  }
  const response = NextResponse.json({ locale: candidate });
  response.cookies.set(LOCALE_COOKIE, candidate, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
