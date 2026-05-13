# Implementation Plan: Frontend UI/UX Hardening

**Branch**: `001-frontend-ui-ux-hardening` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-frontend-ui-ux-hardening/spec.md`

## Summary

Implement the highest-impact UI/UX audit fixes by removing mobile clipping on public auth pages, adding a real mobile authenticated navigation shell, and fixing the landing header CTA visibility regression caused by utility class interaction.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Next.js App Router  
**Primary Dependencies**: Next.js, Tailwind CSS v4, Lucide React  
**Storage**: N/A  
**Testing**: Playwright (existing E2E), Vitest/unit tests where applicable  
**Target Platform**: Responsive web (mobile + desktop browsers)  
**Project Type**: Web application  
**Performance Goals**: No additional blocking JavaScript; keep navigation and layout changes lightweight  
**Constraints**: Preserve existing brand styling while improving responsiveness/accessibility  
**Scale/Scope**: `apps/web` layouts/components only

## Constitution Check

### Retune Gates

- **Cognitive trust**: Pass (no generation/scoring changes).
- **Boundary discipline**: Pass (changes restricted to web app layout/components).
- **Provider parity and tests**: Pass (no provider integration impact).
- **Privacy and data**: Pass (no data model or auth policy changes).
- **Production UX/ops**: Pass (explicitly improving mobile and accessibility behavior).

## Project Structure

### Documentation (this feature)

```text
specs/001-frontend-ui-ux-hardening/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/src/app/layout.tsx
apps/web/src/app/(auth)/layout.tsx
apps/web/src/components/landing/header.tsx
apps/web/src/components/layout/auth-sidebar.tsx
apps/web/src/components/layout/mobile-nav.tsx
apps/web/src/components/layout/auth-nav-items.ts (new)
```

**Structure Decision**: Keep all changes within existing web layout/components. Introduce one shared nav-definition module to remove desktop/mobile nav divergence.

## Boundary Impact

**Touched apps/packages**: `apps/web` only  
**Runtime edges changed**: None (UI-only)  
**Database/migration impact**: None  
**Provider impact**: None  
**Privacy/audit impact**: None  
**Rollback/diagnostics**: Revert touched files; no schema/data migration rollback needed

## Complexity Tracking

No constitution violations introduced.
