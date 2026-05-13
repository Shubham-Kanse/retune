# Tasks: Frontend UI/UX Hardening

**Input**: Design documents from `/specs/001-frontend-ui-ux-hardening/`  
**Prerequisites**: plan.md, spec.md

## Phase 1: Setup

- [X] T001 Confirm feature scope and touched files from `specs/001-frontend-ui-ux-hardening/spec.md` and `plan.md`
- [X] T002 Create shared authenticated navigation definitions in `apps/web/src/components/layout/auth-nav-items.ts`

---

## Phase 2: Foundational

- [X] T003 Refactor `apps/web/src/components/layout/auth-sidebar.tsx` to consume shared navigation definitions
- [X] T004 Refactor `apps/web/src/components/layout/mobile-nav.tsx` into a mobile authenticated nav surface using shared definitions

---

## Phase 3: User Story 1 - Complete Signup On Mobile (Priority: P1)

**Goal**: Remove clipping from public/auth shell so signup remains fully reachable.

**Independent Test**: Mobile viewport can scroll to submit controls on `/signup`.

- [X] T005 [US1] Update root shell sizing/overflow behavior in `apps/web/src/app/layout.tsx` to avoid fixed-height clipping

---

## Phase 4: User Story 2 - Use Authenticated App On Mobile (Priority: P1)

**Goal**: Use mobile navigation while hiding desktop sidebar below `lg`.

**Independent Test**: Mobile authenticated routes expose core nav and non-cramped content.

- [X] T006 [US2] Update authenticated layout structure and skip-link target in `apps/web/src/app/(auth)/layout.tsx`

---

## Phase 5: User Story 3 - Hide Desktop CTA On Mobile (Priority: P1)

**Goal**: Ensure desktop-only landing CTA remains hidden on mobile.

**Independent Test**: Mobile landing header shows hamburger only, not desktop CTA.

- [X] T007 [US3] Fix landing header CTA visibility by adjusting structure in `apps/web/src/components/landing/header.tsx`

---

## Phase 6: Polish & Validation

- [X] T008 Run focused checks for touched files and summarize outcomes
- [X] T009 Mark completed tasks and report residual risks
