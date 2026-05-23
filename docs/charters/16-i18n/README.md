# Charter 16 — Internationalisation (i18n)

## Vision

Make Retune's UI accessible to non-English speakers by extracting all user-facing strings into locale-aware message catalogues, supporting locale detection from user preferences and browser headers, and enabling community-contributed translations.

## Current State

| Area | Status |
|------|--------|
| UI strings | All hardcoded in English in component files |
| i18n library | None (no next-intl, react-i18next, or equivalent) |
| User locale | `users.locale` column exists (default `'en-US'`) but unused for UI |
| Market field | `market` in generation request (US/UK) affects resume formatting, not UI language |

## Target State

- `next-intl` integrated with locale-aware routing
- Supported locales: `en`, `fr`, `de`, `es` (extensible)
- Locale resolved from: user's `locale` column → Accept-Language header → default `'en'`
- All user-facing strings extracted to JSON message catalogues
- Login page fully localised as reference implementation
- Test coverage proving locale switching works

## Epics

| # | Epic | Status |
|---|------|--------|
| 01 | [i18n Architecture](./epic-01-i18n-architecture.md) | planned |
| 02 | Extract Dashboard Strings | planned |
| 03 | Extract Generation Flow Strings | planned |
| 04 | Add French Translation | planned |
| 05 | Add German Translation | planned |
| 06 | Add Spanish Translation | planned |
| 07 | Locale Switcher UI | planned |

## Dependencies

- None (self-contained within `apps/web`)

## Success Metrics

- 100% of user-facing strings extracted from components into message catalogues
- Login page renders correctly in all 4 supported locales
- No English strings visible when locale is set to `fr`, `de`, or `es`
- Bundle size increase < 5KB per locale


## Architect addenda (2026-05-22)

- **`users.locale` already in schema** (verified `packages/db/src/pg/schema.ts`) but never read for UI. Epic 01 wires the locale resolver to read it.
- **Generation pipeline market vs UI locale** — `market` (`US`/`UK`) in `apps/api/src/routes/generate.ts` `GenerateRequestSchema` affects resume formatting and ontology lookup, NOT UI language. Document the distinction in the architecture decision so the team doesn't conflate them.
- **Email templates are HTML-fixed** — `apps/web/src/lib/email-templates/*.html` (6 files: confirm-signup, reset-password, change-email, magic-link, invite-user, reauthentication) are English-only. Locale-aware email templates are out of scope for Epic 01 but must be tracked as a follow-up epic before targeting non-English markets.
- **Bundle-size guard** — Epic 01 must include a per-locale bundle budget in the Lighthouse gate (Charter 11 Epic 03). 4 locales × 5 KB cap = 20 KB total i18n payload. Beyond that, lazy-load.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 16.
