# Charter 22 Epic 01 — Trust Posture Assessment

**Charter:** 22 — SOC 2 Readiness
**Status:** Not started
**Owner:** Security lead

## Goal

Engage a SOC 2 readiness platform (Vanta / Drata / SecureFrame),
complete its automated control assessment, and produce a prioritised
remediation plan with owners + ETAs.

## Definition of Done

- One vendor selected and contracted (~$15-30k/year).
- All 5 Trust Service Criteria (Security, Availability, Processing
  Integrity, Confidentiality, Privacy) scoped.
- Automated controls connected: GitHub, AWS/GCP/Vercel, Supabase,
  Google Workspace, Slack, payroll/HR system.
- Gap analysis report shows current control coverage % per TSC.
- Remediation plan in a tracked board (Linear / Jira / GitHub Projects)
  with each gap as a ticket and a named owner.
- Charter readiness score recorded in the platform's dashboard (most
  vendors give a 0-100 SOC 2 readiness number).

## Stories

### Story 1.1 — Vendor selection
Compare Vanta vs Drata vs SecureFrame on:
- Pricing (typically per-employee or flat, $15-30k/yr range).
- Integration coverage with our stack.
- Audit-firm partnerships (we want a smooth handoff).
- Customer references (talk to 2 founders who completed Type II in
  the same vendor).

**Acceptance:** decision document with comparison + recommendation;
contract signed.

### Story 1.2 — Initial integration sprint
Connect every supported automated control. Most are OAuth-based and
take < 1 hour each:
- GitHub (code, branch protection, commit signing)
- Cloud provider (instance config, IAM, encryption)
- Vercel (deployment, env var management)
- Supabase (RLS, audit log, backup status)
- Google Workspace / Slack (user provisioning, MFA enforcement)
- Stripe (PCI compliance evidence)

**Acceptance:** Vendor dashboard shows ≥ 70% of available controls
auto-monitored.

### Story 1.3 — Gap analysis review
Walk through every flagged gap with security lead + EM. Categorise:
- **Quick wins** (< 1 day): config tweaks, missing settings.
- **Engineering tasks** (1-5 days): code changes, new monitoring.
- **Policy gaps** (Epic 02): documentation we don't have yet.
- **Out of scope** (we accept the risk + document why).

**Acceptance:** 100% of gaps are categorised + assigned to a remediation epic.

## Tasks

- [ ] 1.1.1 Email 3 vendors for demos.
- [ ] 1.1.2 Run trial integrations (most allow 30-day trials).
- [ ] 1.1.3 Sign annual contract.
- [ ] 1.2.1 OAuth-connect every supported tool.
- [ ] 1.2.2 Resolve any OAuth scope warnings.
- [ ] 1.3.1 Schedule gap-review meeting.
- [ ] 1.3.2 Create Linear/Jira board for remediation tickets.
- [ ] 1.3.3 Update `_VALIDATION-MATRIX.md` with current readiness score.

## Dependencies

- Budget approval from leadership.
- Engineering Manager bandwidth for gap-review meeting.

## Estimated effort

~5 working days (most is vendor evaluation + procurement).
