# Feature Specification: Frontend UI/UX Hardening

**Feature Branch**: `001-frontend-ui-ux-hardening`  
**Created**: 2026-05-12  
**Status**: Draft  
**Input**: User description: "Implement frontend UI/UX audit fixes from docs/frontend-ui-ux-audit-2026-05-12.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Signup On Mobile (Priority: P1)

As a first-time user on a small phone, I can always scroll to and reach the signup submit action.

**Why this priority**: Signup conversion is directly blocked when submit controls are clipped.

**Independent Test**: Open `/signup` at `375x667` and `375x812`; verify the full form and final submit action remain reachable without layout clipping.

**Acceptance Scenarios**:

1. **Given** a mobile viewport, **When** the user opens `/signup`, **Then** the page can scroll naturally to the bottom action area.
2. **Given** public auth routes, **When** content exceeds viewport height, **Then** no parent shell forcibly clips vertical overflow.

---

### User Story 2 - Use Authenticated App On Mobile (Priority: P1)

As an authenticated user on mobile, I can navigate core routes from a usable mobile shell without a fixed desktop sidebar consuming width.

**Why this priority**: Core product usage is degraded on mobile by desktop-first navigation layout.

**Independent Test**: Log in on a `375px` viewport and verify a dedicated mobile navigation surface exists and core routes are reachable.

**Acceptance Scenarios**:

1. **Given** an authenticated mobile viewport, **When** a page loads, **Then** the desktop sidebar is hidden and mobile navigation is visible.
2. **Given** mobile navigation, **When** a route is active, **Then** active state is clearly indicated and includes Overview, Generate, Applications, Profile, and Settings.

---

### User Story 3 - Hide Desktop-Only Landing CTA On Mobile (Priority: P1)

As a mobile visitor on the landing page, I only see mobile-intended controls and do not see desktop-only CTA elements.

**Why this priority**: The bug is already reproducible and creates contradictory header controls.

**Independent Test**: Open `/` at `375x812` and verify the desktop "Join" CTA is hidden while mobile menu remains visible.

**Acceptance Scenarios**:

1. **Given** mobile landing header, **When** CSS classes are applied, **Then** desktop CTA elements marked as hidden remain hidden.
2. **Given** desktop landing header, **When** viewport is `md+`, **Then** the CTA remains visible and functional.

### Edge Cases

- Auth route content longer than one viewport still remains reachable when keyboard/browser chrome reduces available height.
- Mobile navigation remains usable on deep routes like `/generate/new` and `/applications/[id]`.
- Skip-link target remains valid after authenticated shell changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Public shell MUST not enforce a fixed viewport-height container that clips signup/login content on mobile.
- **FR-002**: Authenticated layout MUST provide a mobile-first navigation pattern below desktop breakpoints and hide the fixed desktop sidebar below those breakpoints.
- **FR-003**: Authenticated mobile navigation MUST expose exactly these primary destinations: Overview (`/dashboard`), Generate (`/generate/new`), Applications (`/applications`), Profile (`/profile`), Settings (`/settings`).
- **FR-004**: Landing header MUST keep desktop-only CTA controls hidden on mobile regardless of global utility class styling.
- **FR-005**: Authenticated main content MUST expose `id="main-content"` for skip-link targeting.

### Quality, Privacy, and Operations Requirements

- **QR-001**: Updated layouts MUST be keyboard and screen-reader operable (semantic nav, active state, labels).
- **QR-002**: Changes MUST not alter data handling, auth logic, or backend contracts.
- **QR-003**: Visual regressions on desktop routes `/`, `/signup`, `/dashboard`, `/generate/new` MUST be avoided.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On mobile emulation (`375x667` and `375x812`), `/signup` shows reachable submit controls with no vertical clipping.
- **SC-002**: On mobile authenticated views, sidebar width no longer constrains content and core navigation is reachable within one tap.
- **SC-003**: On mobile landing view, desktop "Join" CTA in header is not visible while hamburger remains visible.
- **SC-004**: Skip-link successfully moves focus to authenticated main content container.

## Assumptions

- Existing visual language (orb, soft glass surfaces, serif typography) should remain intact.
- This phase focuses on P0 findings and does not attempt full design-system tokenization.
- Existing route structure is stable and should be reused for mobile navigation.

## Constitution Alignment

- **Cognitive trust**: No generation claims or scoring behavior changes.
- **Boundary discipline**: Scope limited to `apps/web` layout/navigation styling and accessibility surface fixes.
- **Provider parity/tests**: No OpenAI/Anthropic runtime impact.
- **Privacy/auditability**: No personal data model or retention behavior changes.
- **Production UX/ops**: Improves mobile usability and accessibility of high-traffic flows.
