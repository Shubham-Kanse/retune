# Charter 22 Epic 02 — Policies and Procedures

**Charter:** 22 — SOC 2 Readiness
**Status:** Not started
**Owner:** Security lead + EM

## Goal

Author + adopt the 12 security policies SOC 2 auditors expect, using
our chosen platform's templates. Policies are versioned, reviewed
annually, and acknowledged by every employee + contractor before
provisioning.

## Definition of Done

- All 12 policies live in `docs/policies/` (or the SOC 2 platform's
  policy library):
  1. Information Security Policy
  2. Access Control Policy
  3. Change Management Policy
  4. Incident Response Plan
  5. Business Continuity / Disaster Recovery Plan
  6. Vendor Management Policy
  7. Data Classification Policy
  8. Acceptable Use Policy
  9. Risk Assessment Policy
  10. Asset Management Policy
  11. Cryptography Policy
  12. Backup Policy
- Each policy has: owner, last-review date, next-review date,
  acknowledgement requirement.
- Every current employee/contractor has signed acknowledgement.
- New-hire onboarding includes signing all 12.
- Annual review cadence scheduled in the SOC 2 platform.

## Stories

### Story 2.1 — Use vendor templates
Most SOC 2 platforms ship pre-built policy templates that match
auditor expectations. Don't write from scratch.

**Acceptance:** All 12 policies imported from vendor templates; each
edited to reflect our actual stack + practices (not boilerplate).

### Story 2.2 — Founder + first-employee review
Founders read every policy. Strike anything that doesn't reflect
reality. Add anything we genuinely do that's missing. Get sign-off.

**Acceptance:** Each policy has a "reviewed-by" stamp.

### Story 2.3 — Acknowledgement workflow
SOC 2 platforms typically auto-prompt employees to acknowledge.
Configure the workflow + reminder cadence.

**Acceptance:** All current users acknowledged. New hires triggered on
first login.

### Story 2.4 — Public excerpt for customers
Some policies (Privacy, Acceptable Use) need a public-facing excerpt
or full publication. Add to `apps/web/src/app/(public)/legal/`.

**Acceptance:** Public legal pages updated with the relevant policies.

## Tasks

- [ ] 2.1.1 Import all 12 templates.
- [ ] 2.1.2 Edit each to reflect stack: replace generic mentions of
      "cloud provider" with "Vercel + Supabase + Anthropic + OpenAI",
      etc.
- [ ] 2.1.3 Reference Charter 01 (security), Charter 04 (resilience),
      Charter 08 (data integrity) in the policies that overlap.
- [ ] 2.2.1 Schedule founder review session.
- [ ] 2.2.2 Capture sign-off per policy.
- [ ] 2.3.1 Configure acknowledgement workflow.
- [ ] 2.3.2 Test with a fresh-account user.
- [ ] 2.4.1 Update `apps/web/src/app/(public)/privacy/page.tsx` with
      Privacy Policy content.
- [ ] 2.4.2 Update `apps/web/src/app/(public)/terms/page.tsx` with
      Acceptable Use excerpt.

## Dependencies

- Epic 01 (vendor selected so we have templates).

## Estimated effort

~3 working days for the founder + 1 day per policy for owner reviews.
