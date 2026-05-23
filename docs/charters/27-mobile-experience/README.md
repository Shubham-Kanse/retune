# Charter 27 — Mobile Experience

**Priority:** P1 (P0 once the data shows >40% mobile traffic)
**Owner:** Frontend lead + Design
**Status:** Scoped (2026-05-23). Mostly responsive UI work; no native shell yet.

## Mission

Make Retune fully usable on mobile (375-414px viewport, touch input,
flaky connectivity) without a native shell. Native is a follow-up
once mobile traffic + retention justify the engineering cost.

## Decision: PWA over native (for now)

A native iOS + Android app for v1 would be 4-6 months of engineering
that doesn't change the core product proposition. A well-built PWA
with installable manifest + offline-tolerant generation flow gets us
80% of the mobile experience for ~10% of the cost.

Revisit when:
- Mobile DAU ≥ 30% of total DAU (Charter 25 metrics).
- Push notifications become essential (job-match alerts, generation-complete).
- Apple / Google review-listed apps become a sales channel.

## Current state

| Surface | Mobile state |
|---|---|
| Landing page | Responsive — works at 375px. |
| Auth flow | Responsive. |
| Onboarding-v2 | Mostly responsive; the upload-stream view is dense on small screens. |
| Dashboard | Tabular; needs mobile card view. |
| Generation pipeline | Real-time SSE streams reasonably; the trace panel is wide. |
| Results page | Dense — multiple side-by-side panels collapse poorly < 768px. |
| Settings | Responsive. |
| Document downloads | Native browser download — fine on mobile. |
| Touch targets | Buttons mostly meet 44px minimum (Charter 10 Button). Some icon buttons in retune-lens are smaller. |
| PWA manifest | None. |
| Offline | Generation requires network (server-side) — acceptable, but a clear "connection lost" UI is missing. |
| Push notifications | None. |

## Epics

| # | Title | Description |
|---|-------|-------------|
| 01 | Mobile responsiveness audit | Lighthouse mobile run + manual audit on iPhone 14 + Pixel 7 + iPad. Identify every page that breaks below 768px. ~1 day. |
| 02 | Dashboard + results mobile views | Card-based dashboard list + tab-switched results panels for sub-768px. ~3 days. |
| 03 | Touch target consistency | All interactive elements ≥ 44px hit area. Use Charter 10 Button + new MobileIconButton component. |
| 04 | PWA manifest + install | `manifest.webmanifest` + service worker for offline-tolerant page shell. App-icon set. "Install Retune" prompt on dashboard for repeat visitors. |
| 05 | Connection-lost UX | When SSE drops, show a banner with retry. Wire the existing Last-Event-ID resume so reconnect resumes the stream. |
| 06 | Mobile-first onboarding-v2 polish | Single-column upload flow with native-feeling progress indicators. |
| 07 | Push notifications (deferred) | Web Push API for "your generation is complete" + "we found 3 new jobs matching your profile." Gate behind explicit user opt-in. |
| 08 | Native shell (deferred) | Capacitor / Tauri / native if Charter 25 metrics justify. |

## Success metrics

- Lighthouse Mobile Performance ≥ 80, Accessibility ≥ 90 on every
  active page.
- Mobile bounce rate ≤ 1.2× desktop bounce rate.
- Mobile signup conversion ≥ 0.8× desktop conversion.
- PWA install rate (where applicable) ≥ 5% of repeat-visit DAU.

## Dependencies

- Charter 10 (Design System) — Button + Skeleton + EmptyState.
- Charter 14 (Accessibility) — touch-target rules overlap.
- Charter 25 (PMF) — mobile traffic metrics drive prioritisation.

## Out of scope (this iteration)

- Push notifications (Epic 07 — deferred until D+30 retention is
  decent on mobile).
- Native iOS / Android (Epic 08 — deferred per the decision above).
- Mobile-specific features like camera-based resume capture.

## Owner

Frontend lead + Design. Quarterly responsive audit.
