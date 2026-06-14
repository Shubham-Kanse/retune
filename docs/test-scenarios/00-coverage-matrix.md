# Test Coverage Matrix

Auto-generated summary. Update as tests are implemented.

## Coverage by Area

| Area | Total | P0 | P1 | P2 | P3 | Covered | Missing |
|------|-------|----|----|----|----|---------|---------|
| Auth | 25 | 6 | 12 | 5 | 2 | 7 | 18 |
| Onboarding | 22 | 4 | 10 | 6 | 2 | 2 | 20 |
| Generate | 30 | 7 | 10 | 8 | 5 | 3 | 27 |
| Refusal | 22 | 6 | 10 | 6 | 0 | 0 | 22 |
| Profile | 9 | 1 | 5 | 3 | 0 | 0 | 9 |
| Settings | 20 | 4 | 10 | 6 | 0 | 5 | 15 |
| Billing | 8 | 1 | 3 | 4 | 0 | 0 | 8 |
| Dashboard | 9 | 1 | 5 | 3 | 0 | 1 | 8 |
| Security | 16 | 5 | 7 | 4 | 0 | 3 | 13 |
| Stress | 10 | 0 | 2 | 4 | 4 | 0 | 10 |
| Accessibility | 9 | 0 | 6 | 3 | 0 | 2 | 7 |
| i18n | 7 | 0 | 4 | 3 | 0 | 1 | 6 |
| **Total** | **187** | **35** | **84** | **55** | **13** | **24** | **163** |

## P0 Gaps (launch blockers with no test)

These must be written and passing before any public release:

| ID | Description |
|----|-------------|
| TS-AUTH-008 | Signup with already-registered email |
| TS-AUTH-009 | Login with wrong password |
| TS-AUTH-010 | Login with non-existent email (no user enumeration) |
| TS-ONB-002 | Upload PDF resume — full extraction |
| TS-ONB-003 | Upload DOCX resume — full extraction |
| TS-ONB-011 | Upload non-PDF/DOCX file |
| TS-ONB-012 | Upload file exceeding size limit |
| TS-GEN-003 | Tuning completes — all three deliverables present |
| TS-GEN-004 | Download resume as DOCX |
| TS-GEN-005 | Download resume as PDF |
| TS-GEN-013 | Submit empty JD |
| TS-GEN-017 | Access result page for non-existent tuning ID |
| TS-GEN-018 | Access another user's tuning result |
| TS-REF-001 | Refusal: insufficient_evidence |
| TS-REF-006 | Refusal: prompt_injection_detected — JD override |
| TS-REF-007 | Refusal: prompt_injection_detected — profile injection |
| TS-REF-011 | Refusal page shows correct heading and body |
| TS-SET-004 | Delete account — happy path |
| TS-SET-005 | Delete account — wrong confirmation word |
| TS-BIL-001 | Free tier limit enforced |
| TS-SEC-003 | API routes return 401 without session |
| TS-SEC-004 | JD text injection attempt blocked |
| TS-SEC-005 | Profile text injection attempt blocked |
| TS-SEC-011 | User A cannot read User B's profile |
| TS-SEC-012 | User A cannot read User B's tuning result |
| TS-SEC-013 | User A cannot download User B's documents |

## Implementation Priority Order

1. All P0 gaps above — write e2e specs in `apps/web/e2e/`
2. P1 gaps in Auth, Generate, Refusal — highest user-facing impact
3. P1 Security gaps — data isolation is critical
4. P1 Billing — free tier enforcement
5. P2 Stress tests — load test harness needed
6. P3 Stress tests — post-launch hardening

## Test File Mapping

| Scenario file | Implementation target |
|--------------|----------------------|
| `01-auth.md` | `apps/web/e2e/auth-*.spec.ts` |
| `02-onboarding.md` | `apps/web/e2e/onboarding-v2.spec.ts` |
| `03-generate.md` | `apps/web/e2e/pipeline-controls.spec.ts`, `results-download.spec.ts` |
| `04-refusal.md` | `apps/web/e2e/refusal.spec.ts` (new) |
| `05-profile.md` | `apps/web/src/components/profile/__tests__/` |
| `06-settings.md` | `apps/web/src/app/(auth)/settings/**/__tests__/` |
| `07-billing.md` | `apps/web/src/app/api/billing/__tests__/` (new) |
| `08-dashboard.md` | `apps/web/src/components/dashboard/__tests__/` |
| `09-security.md` | `apps/web/src/app/api/__tests__/security-abuse.test.ts` + new e2e |
| `10-stress-a11y-i18n.md` | Load test harness (k6 or Artillery) + axe tests |
