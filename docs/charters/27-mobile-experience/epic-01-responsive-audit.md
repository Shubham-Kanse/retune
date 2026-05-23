# Charter 27 Epic 01 — Mobile Responsiveness Audit

**Charter:** 27 — Mobile Experience
**Status:** Audit kicks off in B6/B11
**Owner:** Frontend lead

## Goal

Walk every user-facing page on iPhone 14 + Pixel 7 + iPad and identify
layout breaks, touch-target violations, and content overflow. Land
the tactical fixes in the SAME UI style — no redesign.

## Definition of Done

- Audit document at `docs/mobile/audit-2026-Q2.md` listing every
  page, screen size tested, and identified issues.
- All issues filed as Linear/Jira tickets with priority + estimated effort.
- P0 issues (broken pages) fixed.
- Lighthouse Mobile Performance ≥ 80 on every active page.
- Lighthouse Mobile Accessibility ≥ 90 on every active page.

## Screens tested per page

- iPhone 14 (375×667 logical, 1170×2532 native)
- Pixel 7 (360×800 logical)
- iPad (768×1024 portrait, 1024×768 landscape)

## Pages in scope

| Path | Critical |
|---|---|
| `/` (landing) | yes |
| `/login` | yes |
| `/signup` | yes |
| `/forgot-password` | no |
| `/reset-password` | no |
| `/verify-email` | no |
| `/onboarding-v2` | yes |
| `/dashboard` | yes |
| `/applications` | yes |
| `/applications/[id]/pipeline` | yes |
| `/applications/[id]/results` | yes |
| `/profile` | yes |
| `/settings` | no |
| `/pricing` | yes |
| `/terms`, `/privacy` | no |

## Common breakage patterns to check

- Horizontal scroll on the body (sign of un-wrapped content).
- Touch targets < 44×44 logical px.
- Modal / dialog content cut off below the fold.
- Form labels stacking poorly above inputs.
- Navigation menu inaccessible (no hamburger fallback).
- Tabular data in `<table>` instead of card layout < 768px.
- Side-by-side panels (results page, retune-lens) collapsing into
  unusable single column.
- Image overflowing container.
- Sticky bottom CTA covering content.

## Stories

### Story 1.1 — Manual walkthrough
2 hours per device. Screen-record the entire flow. Take screenshots
of every break.

**Acceptance:** Audit document with screenshots + fix proposals.

### Story 1.2 — Lighthouse mobile baseline
Run Lighthouse Mobile on every critical page. Capture current scores.

**Acceptance:** Baseline scores in `docs/mobile/lighthouse-baseline.json`.

### Story 1.3 — Fix P0 issues
Anything that breaks the page (not just looks bad). Fixes in the
SAME UI style: same components, same colour tokens, same spacing scale.

**Acceptance:** Audit revisited; all P0 issues resolved.

### Story 1.4 — Re-run Lighthouse + lock thresholds
Confirm scores improved. Update `lighthouserc.json` thresholds to
the new floor (e.g. perf 0.85 if we shipped from 0.78).

**Acceptance:** CI Lighthouse check passes with the higher floor.

## Tasks

- [ ] 1.1.1 Provision test devices (or BrowserStack).
- [ ] 1.1.2 Run walkthroughs.
- [ ] 1.1.3 Author audit document.
- [ ] 1.2.1 Run Lighthouse Mobile on every page.
- [ ] 1.3.1 File + fix P0 tickets.
- [ ] 1.4.1 Re-run Lighthouse.
- [ ] 1.4.2 Update `lighthouserc.json`.

## Dependencies

- Charter 10 (Design System) — components in same UI style.
- Charter 14 (Accessibility) — touch-target rules align.

## Estimated effort

~3 working days (1 day audit, 2 days fixes).
