# Internationalisation (i18n)

This doc captures Charter 16 — the i18n architecture for Retune.

## Status

**Scaffolded — not yet activated.** All UI copy is currently hard-coded
English. The architectural decision is documented here; flipping the
switch requires a coordinated push across every page (estimated 3–5
days, tracked under Charter 16 Epic 01).

## Decision

Use **`next-intl`** with App Router. Three reasons:

1. **App-Router native.** `next-intl` 4.x ships first-class App Router
   support with server components getting translations at request time
   without client roundtrips.
2. **Type-safe message keys.** The generated `Messages` type makes
   forgotten keys a TypeScript error at build time.
3. **Minimal runtime overhead.** Messages are tree-shaken per route
   via Next's RSC streaming. Locale switching uses an HTTP-only cookie
   so no client-side state.

Alternative `next-i18next` was rejected because its App Router support
lags and it duplicates state across server + client.

## Locale strategy

| Decision | Value |
|---|---|
| Default locale | `en-GB` (Retune's primary market) |
| Initial locales | `en-GB` only — additional locales added per-PR |
| URL strategy | **Subpath** routing: `/en-GB/dashboard`, `/de-DE/dashboard`, etc. |
| Locale detection | Prefer cookie → fallback to `Accept-Language` → fallback to default |
| Server vs client | Translations resolved server-side via `getTranslations()` for RSC; client components use the `useTranslations()` hook |

## Message file layout

```
apps/web/src/messages/
  en-GB.json    ← canonical / source of truth
  de-DE.json    ← reviewed translations
  fr-FR.json
  ...
```

Each file is a flat key-value map with dot-namespaced keys:

```json
{
  "common.save": "Save",
  "common.cancel": "Cancel",
  "auth.login.title": "Log in to Retune",
  "auth.login.email_label": "Email address",
  "auth.signup.password_requirements": "Must be at least 8 characters and include uppercase, lowercase, and a digit.",
  "billing.manage_button": "Manage billing"
}
```

## Activation steps

When Charter 16 Epic 01 is scheduled:

1. **Install** — `pnpm --filter @retune/web add next-intl`
2. **Add `next-intl/plugin`** to `next.config.ts`:
   ```ts
   import createNextIntlPlugin from "next-intl/plugin";
   const withNextIntl = createNextIntlPlugin();
   export default withNextIntl(nextConfig);
   ```
3. **Restructure routes** — move `app/` into `app/[locale]/` so the
   locale lands in the URL.
4. **Add `i18n.ts`** at the project root that exports the
   `getRequestConfig` helper next-intl needs. Wire it to read the
   locale cookie + fall back to Accept-Language.
5. **Extract strings** — every hard-coded English string in
   `components/`, `app/`, and `lib/` becomes a key in `en-GB.json`.
   Use `pnpm --filter @retune/web extract-intl` (script TBD) to
   automate a first pass; manual review for context.
6. **Add `<NextIntlClientProvider>`** in the root client layout so
   `useTranslations()` works inside client components.
7. **Add a locale switcher** in the top nav (typically the user menu)
   that posts to `/api/locale` to set the cookie + reloads.

## Pluralisation + interpolation

Use ICU MessageFormat syntax:

```json
{
  "credits.remaining": "{count, plural, =0 {No credits left} =1 {1 credit left} other {# credits left}}"
}
```

```tsx
const t = useTranslations();
return <p>{t("credits.remaining", { count: 3 })}</p>;
```

## Date / number / currency formatting

Use `next-intl`'s `useFormatter()` hook which wraps `Intl.NumberFormat`
+ `Intl.DateTimeFormat` with the active locale:

```tsx
const format = useFormatter();
const price = format.number(amount, { style: "currency", currency: "USD" });
const when = format.dateTime(createdAt, { dateStyle: "medium" });
```

Never hand-roll currency or date formatting. Locale-aware output is
why we're paying the i18n tax.

## What lands now (this PR)

This doc + a charter handoff checklist. Code does NOT change yet
because:

- Activating without a translation pass leaves the app in mixed
  English (literal strings remain alongside missing-key placeholders),
  which is worse than the current state.
- Activation is a single-shot delivery. Half-translated apps ship in
  embarrassing states (untranslated buttons next to translated nav).

## Charter 16 Epic 01 — readiness checklist

- [ ] Pick the second locale (de-DE proposed).
- [ ] Allocate a translator + reviewer for the chosen locale.
- [ ] Confirm Stripe Tax + Stripe Checkout localisation are enabled
      (they are, but verify the locale parameter is plumbed through).
- [ ] Update `getMetadata()` in every page to read the locale.
- [ ] Update the legal pages (`/terms`, `/privacy`) — they reference
      English law explicitly; multi-locale legal text needs a lawyer pass.
- [ ] Audit the AI-generated content path: resume generation outputs
      text in the locale of the JD, not the user's UI locale. Document
      this divergence so users aren't surprised.

## References

- next-intl docs: https://next-intl.dev
- `docs/charters/16-i18n/README.md`
- ADR-005 (monorepo) — locale-routing architecture changes the
  `apps/web` directory shape, which interacts with Turbo's caching.
