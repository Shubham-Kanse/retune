# Charter 14: Accessibility

## Vision

Make Retune WCAG 2.1 AA compliant with automated testing gates that prevent accessibility regressions, ensuring all users — including those using screen readers, keyboard navigation, and assistive technologies — can fully use the platform.

## Current State

| Area | Status |
|------|--------|
| Lighthouse CI a11y gate | Non-blocking (`\|\| true`) — failures are ignored |
| axe-core testing | None — no automated accessibility unit tests |
| ARIA audit | No systematic audit performed |
| `button.tsx` | No `aria-busy` for loading state |
| `chat-interface.tsx` | Chat interface (9543 bytes) with no screen reader testing |
| Pipeline SSE updates | No `aria-live` regions for progress announcements |

## Goals

1. Install and configure axe-core testing infrastructure
2. Write accessibility tests for the 5 most critical components
3. Make Lighthouse accessibility gate blocking at ≥ 90
4. Add missing ARIA attributes to interactive components
5. Prevent future regressions via CI enforcement

## Epics

| Epic | Title | File |
|------|-------|------|
| 01 | Automated A11y Testing | [epic-01-automated-a11y-testing.md](./epic-01-automated-a11y-testing.md) |

## Success Metrics

- Lighthouse accessibility score ≥ 90 (blocking in CI)
- Zero axe-core violations in the 5 critical components
- All loading states have `aria-busy="true"`
- All live-updating regions have appropriate `aria-live` attributes
- CI fails on accessibility regression

## Dependencies

- Charter 10 (UX/UI & Design System) — Button loading state must exist before `aria-busy` can be added
- `vitest` — already configured in `apps/web`
- `next-themes` — color contrast must pass in both light and dark modes

## Timeline

| Phase | Duration | Scope |
|-------|----------|-------|
| Phase 1 | 3 days | Epic 01: Install tooling, write tests, enforce gate |


## Architect addenda (2026-05-22)

- **Lighthouse a11y is non-blocking** — verified `.github/workflows/cognitive-cycle.yml` `lighthouse` job has `|| true` on the `lhci autorun` line. The thresholds in `lighthouserc.json` (a11y 0.9 enforce) are correctly set; the workflow line silences them. Single-line fix: remove the `|| true`.
- **Real AT testing is necessary, not sufficient** — Lighthouse a11y >= 90 catches WCAG mechanical violations but cannot catch screen-reader experience defects. Add an explicit AT test pass on the 5 critical components (`pipeline-view.tsx`, `chat-interface.tsx`, `profile-editor.tsx`, `results-view.tsx`, login form) using NVDA on Windows + VoiceOver on macOS+iOS + TalkBack on Android. Quarterly cadence.
- **`aria-busy` for SSE-driven UIs** — the pipeline live-narrative panel must announce updates via `aria-live="polite"` regions; today there is none. Charter 10 (Design System) Epic 02 (component states) must require `aria-busy` on every loading state — coordinate.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 14.
