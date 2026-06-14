# Retune Test Scenarios

Exhaustive test coverage specification for the Retuned product. Every user journey, edge case, negative test, and stress scenario documented as executable user stories.

## Structure

| File | Coverage area |
|------|--------------|
| `01-auth.md` | Signup, login, logout, password reset, session management |
| `02-onboarding.md` | Profile builder — upload, extraction, questions, voice, audit, completion |
| `03-generate.md` | Core tuning flow — new, streaming, result, download |
| `04-refusal.md` | Refuse-or-ship gate — all refusal reasons, contest, appeal |
| `05-profile.md` | Career profile CRUD, evidence management, voice fingerprint |
| `06-settings.md` | All settings sub-pages, language switching, account deletion |
| `07-billing.md` | Free tier limits, upgrade, billing portal, credit exhaustion |
| `08-dashboard.md` | Dashboard state, metrics, migration card, empty states |
| `09-security.md` | Auth guards, injection attempts, CSRF, rate limiting |
| `10-stress.md` | Concurrent users, large inputs, slow networks, provider failures |
| `11-accessibility.md` | Keyboard navigation, screen reader, reduced motion |
| `12-i18n.md` | Locale switching, locale-specific copy, RTL readiness |

## Test ID Convention

`TS-<area>-<NNN>` — e.g. `TS-AUTH-001`, `TS-GEN-042`

## Priority Levels

- **P0** — blocks launch. Must pass before any release.
- **P1** — high impact. Must pass before public launch.
- **P2** — important but not blocking. Ship with known gap, fix in next sprint.
- **P3** — edge case / stress. Target for post-launch hardening.

## Status Tags

- `[COVERED]` — existing test covers this (e2e or unit)
- `[PARTIAL]` — partially covered, gap noted
- `[MISSING]` — no test exists yet
