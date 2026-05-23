# Charter 24 — Brand & Design Language

**Priority:** P1 (post-PMF, pre-scale)
**Owner:** Design lead
**Status:** Scoped (2026-05-23). Mostly content + design assets, modest code.

## Mission

Move Retune from "shadcn-default" to a distinctive brand expression
across product, marketing, and external communication. Visual,
verbal, and motion identity that reinforces the cognitive-substrate
positioning ("we don't auto-fill — we understand").

## Why this is its own charter

Charter 10 (UX/Design System) owns the *system* — semantic tokens,
component states, accessibility. This charter owns the *expression* —
voice, illustration style, motion grammar, photography direction,
mark usage. Both are necessary; neither is sufficient alone.

## Current state

| Surface | State |
|---|---|
| Logo | `apps/web/src/components/ui/logo.tsx` — wordmark-only. No icon companion. No usage guidelines. |
| Colour | Tailwind v4 semantic tokens (Charter 10). One brand accent (`#d4f5e0`); no full palette. |
| Typography | Inter (sans) + Geist Mono. No editorial / display pairing for marketing. |
| Iconography | Lucide-default. No bespoke icons for cognitive concepts (specialists, blackboard, refuse-or-ship). |
| Illustration | One asset: `orb.png`. Style: organic gradient. No second illustration; no system. |
| Motion | Framer Motion in retune-lens. Ad-hoc — no shared easings / durations grammar. |
| Voice | Hand-tuned per-page. No documented tone guide. Charters reference architect addenda for some products (refusal copy especially). |
| Photography | None. |

## Epics

| # | Title | Description |
|---|-------|-------------|
| 01 | Logo system | Wordmark + monogram + favicon variations. Clear-space rules. Light + dark + reduced-contrast variants. |
| 02 | Colour palette | Full primary/secondary/tertiary swatches with usage rules. Accessibility verified pairs. Dark-mode variants. |
| 03 | Typography pairing | Editorial display pairing for marketing pages. Documented heading scale. |
| 04 | Iconography | 30-50 bespoke icons for cognitive concepts: specialist, blackboard, refuse-or-ship, evidence span, narrative arc, voice fingerprint, etc. |
| 05 | Illustration system | 5-10 named illustration types (hero, empty-state, error, success, onboarding stage, etc.). Style: continuation of `orb.png` organic-gradient lineage. |
| 06 | Motion grammar | Documented easings, durations, choreography rules. Re-implement framer-motion uses against the grammar. |
| 07 | Voice + tone guide | When to be warm vs precise vs blunt. Per-surface (refusal copy is precise + actionable; onboarding is warm + curious; pricing is direct + honest). |
| 08 | Photography direction | Style guide if we ever ship photography (probably not for the first 18 months — illustrations preferred). |
| 09 | Brand expression in UI | Apply the full system to the live product: relandings of landing page, dashboard, pipeline, results, settings. |

## Success metrics

- 90% of new components ship with brand-system tokens (no
  hex-in-tsx).
- Brand-recognition test (anonymous user survey) shows distinctive
  recall vs competitor screenshots.
- Marketing-page conversion rate measurable improvement post-relanding.

## Dependencies

- Charter 10 (Design System) — token architecture in place.
- Design lead hire (currently designing-by-engineer; quality ceiling).

## Out of scope

- Print collateral (no physical product).
- Complete rewrite of all illustrations (one-shot delivery would tank
  quality — phase the system in).
- Brand strategy / positioning (assumed already settled per the
  cognitive-substrate framing).

## Owner

Design lead, co-owned with marketing once that role exists.
