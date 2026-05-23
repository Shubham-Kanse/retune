/**
 * Server-side message loader for next-intl (Charter 16).
 *
 * Resolves the active locale from the `retune_locale` cookie or the
 * `accept-language` header and loads the matching messages file. The
 * resolver falls back across the chain en-XX → en if a specific tag's
 * file isn't present, so the app stays renderable even if a translator
 * has only contributed half of a locale.
 */

import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  isLocale,
  resolveAcceptLanguage,
} from "./config";

export async function getActiveLocale(): Promise<Locale> {
  const store = await cookies();
  const cookieValue = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;
  const hdrs = await headers();
  return resolveAcceptLanguage(hdrs.get("accept-language"));
}

export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  // Try the specific locale first; fall back to the base ('en-GB' → 'en').
  const candidates: Locale[] = [locale];
  if (locale !== "en") candidates.push("en");
  for (const tag of candidates) {
    try {
      const mod = await import(`../../messages/${tag}.json`);
      return mod.default ?? mod;
    } catch {
      // try next candidate
    }
  }
  // Should never reach here — en.json is required.
  throw new Error(`i18n: no message bundle resolves for ${locale}`);
}

export async function getActiveMessages(): Promise<{
  locale: Locale;
  messages: Record<string, unknown>;
}> {
  const locale = await getActiveLocale();
  const messages = await loadMessages(locale);
  return { locale, messages };
}
export { DEFAULT_LOCALE };
