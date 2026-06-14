# TS-STRESS — Stress Tests & Performance

---

### TS-STR-001 · P2 · [MISSING]
**Landing page loads under 2.5s LCP**
- Lighthouse CI gate: LCP < 2.5s
- Expected: passes on every PR (already gated in CI)

### TS-STR-002 · P2 · [MISSING]
**Dashboard loads under 1s for user with 50 tunings**
- User with 50 completed tunings navigates to `/dashboard`
- Expected: page interactive within 1s, no layout shift

### TS-STR-003 · P2 · [MISSING]
**Profile page loads under 1s for user with 50 experience entries**
- User with maximum profile size navigates to `/profile`
- Expected: page interactive within 1s

### TS-STR-004 · P2 · [MISSING]
**SSE stream handles 500 trace events without memory leak**
- Tuning that produces 500+ trace events
- Expected: browser memory stable, no dropped events, stream closes cleanly

### TS-STR-005 · P3 · [MISSING]
**50 concurrent users on dashboard simultaneously**
- Load test: 50 authenticated users hit `/dashboard` simultaneously
- Expected: P95 response < 500ms, no 500 errors

### TS-STR-006 · P3 · [MISSING]
**20 concurrent tunings**
- 20 users start tunings simultaneously
- Expected: all complete within SLA, no cross-contamination

### TS-STR-007 · P3 · [MISSING]
**Database connection pool exhaustion**
- Simulate 200 concurrent DB queries
- Expected: connection pool queues requests, no 500 errors, graceful degradation

### TS-STR-008 · P3 · [MISSING]
**AI provider slow response (30s latency)**
- Provider responds in 30s per call
- Expected: pipeline completes (within extended timeout), SSE heartbeat keeps connection alive

### TS-STR-009 · P3 · [MISSING]
**Redis unavailable (trace bus fallback)**
- Redis connection drops during active tuning
- Expected: in-memory fallback activates, tuning completes, no data loss

### TS-STR-010 · P3 · [MISSING]
**Temporal worker unavailable**
- Temporal worker is down when tuning starts
- Expected: falls back to in-memory path, tuning completes

---

# TS-A11Y — Accessibility

---

### TS-A11Y-001 · P1 · [COVERED]
**Zero critical/serious axe violations on settings pages**
- Voice, Honesty, Culture, Data, Language, Workspaces settings pages
- Expected: axe-core reports 0 critical/serious violations

### TS-A11Y-002 · P1 · [COVERED]
**Zero critical/serious axe violations on dashboard cards**
- DashboardClient, OnboardingV2MigrationCard
- Expected: axe-core reports 0 critical/serious violations

### TS-A11Y-003 · P1 · [MISSING]
**Keyboard navigation through main nav**
- User tabs through public header nav
- Expected: all links reachable by keyboard, focus visible

### TS-A11Y-004 · P1 · [MISSING]
**Keyboard navigation through generate flow**
- User tabs through JD input, market toggle, submit button
- Expected: all controls reachable, correct tab order

### TS-A11Y-005 · P1 · [MISSING]
**Screen reader announces live trace events**
- During streaming, trace events update
- Expected: `aria-live` region announces updates to screen readers

### TS-A11Y-006 · P1 · [MISSING]
**All form inputs have associated labels**
- Every `<input>` and `<textarea>` in the product
- Expected: each has a visible label or `aria-label`

### TS-A11Y-007 · P2 · [MISSING]
**Colour contrast meets WCAG AA**
- All text/background combinations
- Expected: contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text

### TS-A11Y-008 · P2 · [MISSING]
**Reduced motion preference respected**
- User has `prefers-reduced-motion: reduce` set
- Expected: all animations disabled (CSS `@media (prefers-reduced-motion: reduce)` applied)

### TS-A11Y-009 · P2 · [MISSING]
**Focus trap in modals**
- User opens a modal (e.g. delete account confirm, re-read evidence)
- Expected: focus trapped within modal, Tab cycles within, Escape closes

---

# TS-I18N — Internationalisation

---

### TS-I18N-001 · P1 · [COVERED]
**Language switcher changes locale**
- User switches to en-GB
- Expected: page reloads with en-GB strings

### TS-I18N-002 · P1 · [MISSING]
**en-GB uses "CV" not "resume"**
- User with en-GB locale views onboarding intro
- Expected: "Upload your CV to get started." (not "resume")

### TS-I18N-003 · P1 · [MISSING]
**en-GB uses "Cancel any time" not "Cancel anytime"**
- User with en-GB locale views signup page
- Expected: "2 free tunings, no card required. Cancel any time."

### TS-I18N-004 · P1 · [MISSING]
**en-GB uses "Documents analysed" not "analyzed"**
- User with en-GB locale views voice settings
- Expected: "Documents analysed" (British spelling)

### TS-I18N-005 · P1 · [MISSING]
**No hardcoded English strings visible in en-GB locale**
- User switches to en-GB, navigates all pages
- Expected: no English-only strings visible that should be locale-specific

### TS-I18N-006 · P2 · [MISSING]
**Long translated strings don't break layout**
- If a future locale has strings 2x longer than English
- Expected: UI adapts (truncation, wrapping) without overflow or broken layout

### TS-I18N-007 · P2 · [MISSING]
**Locale cookie persists across sessions**
- User sets en-GB, logs out, logs back in
- Expected: en-GB still active
