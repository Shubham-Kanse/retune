# TS-DASHBOARD — Dashboard

---

### TS-DASH-001 · P0 · [COVERED]
**Dashboard loads for authenticated user**
- User navigates to `/dashboard`
- Expected: page loads, "Welcome back, {name}." heading shown
- "Tune now" section with JD input visible

### TS-DASH-002 · P1 · [MISSING]
**Dashboard shows correct metrics**
- User with 3 completed tunings and 1 refused
- Expected: "Shipped" = 3, "Total tunings" = 4, "Profile readiness" = X%

### TS-DASH-003 · P1 · [MISSING]
**Profile readiness < 60% shows "Build your profile" status**
- New user with incomplete profile
- Expected: Status card shows "Build your profile"

### TS-DASH-004 · P1 · [MISSING]
**Profile readiness ≥ 60% shows "Ready to tune" status**
- User with complete profile
- Expected: Status card shows "Ready to tune"

### TS-DASH-005 · P1 · [MISSING]
**Migration card shown for v1-only users**
- User has v1 profile, no v2 profile
- Expected: "Your profile just got smarter" card visible

### TS-DASH-006 · P1 · [MISSING]
**Migration card dismissed persists**
- User clicks "Maybe later" on migration card
- Expected: card hidden, stays hidden on reload (localStorage)

### TS-DASH-007 · P1 · [MISSING]
**Migration card not shown for v2 users**
- User has completed v2 onboarding
- Expected: migration card not shown

### TS-DASH-008 · P2 · [MISSING]
**Dashboard with no tunings — empty metrics**
- New user with no tunings
- Expected: "Shipped" = "—", "Total tunings" = "—"
- No errors, no blank screen

### TS-DASH-009 · P2 · [MISSING]
**Anonymous user name — no first name**
- User signed up without providing a name
- Expected: "Welcome back." (no name interpolation), no crash
