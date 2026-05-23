# Charter 22 — SOC 2 Readiness

**Priority:** P0 for enterprise customers, P1 otherwise
**Owner:** Security lead + Engineering Manager
**Status:** Scoped (2026-05-23). Operational charter — most work is policy + process, not code.

## Mission

Achieve SOC 2 Type I within 6 months and Type II within 12 months,
unlocking enterprise customers (B2B sales blockers) and providing the
security posture credibility that B2C customers expect for handling
their resume data.

## Why now

- Enterprise sales conversations stall at "do you have SOC 2?"
- GDPR compliance (Charter 08) covers the data-protection side; SOC 2
  covers the *operational* side: change management, access reviews,
  incident response, vendor management, business continuity.
- Several Charter 01 / 05 / 08 epics are SOC 2 prerequisites that
  already landed — this charter is *coordination*, not greenfield work.

## Current state

| Trust Service Criteria | Coverage |
|---|---|
| **Security** | Charter 01 (security headers, CSP, audit logging, rate limiting, gitleaks). ~80% mechanical; ~20% policy gap. |
| **Availability** | Charter 04 (resilience: Temporal hard-require, circuit breakers, SSE Last-Event-ID). Need: documented SLO + uptime measurement (Charter 23). |
| **Processing Integrity** | Charter 09 (eval) + Charter 21 (eval leadership). Need: documented data-integrity controls + reconciliation runbook. |
| **Confidentiality** | Charter 08 (RLS + GDPR). |
| **Privacy** | Charter 08/E2 GDPR + processor consents. Need: DPA template for enterprise customers. |

## Epics

| # | Title | Description |
|---|-------|-------------|
| 01 | Trust posture assessment | Engage SOC 2 auditor (Vanta / Drata / SecureFrame). Run their gap analysis. Output: prioritised remediation plan. |
| 02 | Policies + procedures | Information security policy, access control policy, change mgmt policy, incident response, business continuity, vendor mgmt, data classification. ~12 docs. Use auditor templates. |
| 03 | Access reviews automation | Quarterly review: who has prod DB / Vercel / Stripe / Anthropic console access? Auto-generate the report from cloud IAM. |
| 04 | Vendor risk register | Anthropic, OpenAI, Supabase, Vercel, Stripe, Sentry, PostHog, Jina, Temporal — each gets a row with: SOC 2 / ISO 27001 status, DPA on file, data scope, criticality. |
| 05 | Background-check process | All employees + contractors get background-checked before access provisioning. Document the SLA and the vendor (Checkr, Veremark, etc.). |
| 06 | Annual security training | All employees take the auditor-provided training. Evidence captured in HR system. |
| 07 | Type I audit | 6-month milestone. Auditor confirms controls are designed correctly. |
| 08 | Type II audit | 12-month milestone. Auditor confirms controls operated correctly over 6+ months. |

## Success metrics

- SOC 2 Type I achieved within 6 months of charter kickoff.
- SOC 2 Type II achieved within 12 months.
- Zero high-severity findings in either audit.
- Enterprise customer pipeline conversion rate measurably improved
  post-Type I (track in PostHog via Charter 15).

## Dependencies

- All P0 charters substantially complete (security, observability,
  resilience, data integrity).
- Budget approval for auditor engagement (~$15-30k/year).
- Engineering Manager bandwidth for policy authorship.

## Out of scope

- ISO 27001 (separate, longer cycle — defer to year 2).
- HIPAA (only if we onboard healthcare-vertical customers — separate
  charter then).
- PCI-DSS (Stripe is the cardholder-data environment; we're SAQ-A —
  out of scope here).

## Owner

Security lead + EM. Monthly status update to leadership.
