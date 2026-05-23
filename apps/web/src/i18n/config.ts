/**
 * i18n configuration (Charter 16).
 *
 * Retune supports a small set of locales. We use `next-intl` in
 * **provider-only mode** (no locale-prefixed URLs) so the routing
 * surface is unchanged. The active locale is detected from a
 * `retune_locale` cookie, falling back to `accept-language`, falling
 * back to `defaultLocale`.
 *
 * Adding a locale:
 *   1. Add the BCP-47 tag to LOCALES below.
 *   2. Create `apps/web/messages/<tag>.json` with the same keys as `en.json`.
 *   3. Add a label to LOCALE_LABELS for the lang switcher UI.
 *
 * Note: en-US and en-GB share most copy. The diffs are spelling
 * (organise vs organize) + the few places we surface market-specific
 * phrasing. The runtime resolver falls back to the closest base locale
 * if a specific tag's file isn't present (en-XX → en).
 */

export const LOCALES = ["en", "en-GB", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "en-GB": "English (UK)",
  "en-US": "English (US)",
};

export const LOCALE_COOKIE = "retune_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return value !== undefined && value !== null && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve the best-fit locale from an accept-language header. Returns
 * the default locale if no acceptable match is found.
 */
export function resolveAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter((s): s is string => Boolean(s));
  for (const tag of candidates) {
    if (isLocale(tag)) return tag;
    // 'en-CA' matches 'en' base.
    const base = tag.split("-")[0];
    if (base && isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
