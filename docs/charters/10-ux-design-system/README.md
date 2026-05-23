# Charter 10: UX/UI & Design System

## Vision

Establish a systematic, documented design token architecture and robust component state handling across the Retune frontend, replacing ad-hoc Tailwind color classes and missing UI states with a maintainable, scalable design system.

## Current State

| Area | Status |
|------|--------|
| `apps/web/src/styles/globals.css` | **12 KB** (intern said 16 KB — verified actual is 12,221 B) monolithic file with no documented token system; light/dark CSS variables exist but no contract |
| `apps/web/src/components/ui/` | 43 components, zero design token documentation |
| `button.tsx` | No loading state variant (1837 bytes) |
| `pipeline-view.tsx` | No error state for SSE disconnect (36KB) |
| `results-view.tsx` | Very large single component with no loading skeleton (74KB) |
| `landing-page-client.tsx` | Very large single component (54KB) |
| `profile-editor.tsx` | **MISSED by intern: 46 KB single component** at `apps/web/src/components/profile/profile-editor.tsx` — primary decomposition target |
| `career-profile-page.tsx` | **MISSED: 34 KB** at `apps/web/src/components/profile/career-profile-page.tsx` |
| `use-onboarding-v2.ts` | **MISSED: 35 KB** client hook at `apps/web/src/hooks/use-onboarding-v2.ts` |
| Theme support | Dark/light mode via next-themes; warm near-black dark theme `hsl(50 2% 9%)` (deliberate brand choice, not a bug) |

## Goals

1. Extract all design values into a three-layer token system (primitive → semantic → component)
2. Add missing component states (loading, error, empty, timeout, skeleton)
3. Ensure every interactive component has documented variants with tests
4. Reduce coupling between components and raw color/spacing values

## Epics

| Epic | Title | File |
|------|-------|------|
| 01 | Design Tokens | [epic-01-design-tokens.md](./epic-01-design-tokens.md) |
| 02 | Component States | [epic-02-component-states.md](./epic-02-component-states.md) |

## Success Metrics

- Zero hardcoded color values in `components/ui/` — all reference semantic tokens
- 100% of interactive components have loading/disabled states
- Pipeline view handles all failure modes gracefully
- Results view shows skeleton during load
- All new variants have vitest snapshot or unit tests

## Dependencies

- Charter 14 (Accessibility) — loading states must include `aria-busy`, error states must be announced to screen readers
- `next-themes` — token system must integrate with existing dark/light mode toggle

## Timeline

| Phase | Duration | Scope |
|-------|----------|-------|
| Phase 1 | 1 week | Epic 01: Token audit, extraction, Button migration |
| Phase 2 | 1 week | Epic 02: Pipeline error states, Results skeleton |
