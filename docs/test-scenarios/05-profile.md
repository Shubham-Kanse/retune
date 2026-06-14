# TS-PROFILE — Career Profile

---

## Happy Path

### TS-PRO-001 · P0 · [MISSING]
**Save profile changes**
- User edits name, adds experience entry, clicks Save
- Expected: toast "Profile saved", changes persisted on reload

### TS-PRO-002 · P1 · [MISSING]
**Skill tier labels display correctly**
- User views skills section
- Expected: three sections labelled "Core skills", "Supporting skills", "Familiar with"
- Not "Tier 1", "Tier 2", "Tier 3"

### TS-PRO-003 · P1 · [MISSING]
**Voice fingerprint page — active state**
- User with completed tunings views `/settings/voice`
- Expected: fingerprint radar chart shown, "Documents analyzed" count > 0, status "Active"

### TS-PRO-004 · P1 · [MISSING]
**Voice fingerprint page — empty state**
- New user with no tunings views `/settings/voice`
- Expected: "No voice fingerprint yet. It builds automatically during your first tuning."
- CTA: "Start a tuning"

### TS-PRO-005 · P1 · [MISSING]
**Re-read evidence — shows diff**
- User clicks "Re-read evidence" button
- Expected: diff dialog opens showing added/changed/removed fields
- User can apply or cancel

### TS-PRO-006 · P2 · [MISSING]
**Profile empty state**
- New user with no profile data visits `/profile`
- Expected: empty state shown, not a blank page
- CTA to start onboarding

## Negative Tests

### TS-PRO-007 · P1 · [MISSING]
**Save profile with required field empty**
- User clears the "Full name" field and saves
- Expected: validation error, save blocked

### TS-PRO-008 · P2 · [MISSING]
**Save profile with XSS in text field**
- User enters `<img src=x onerror=alert(1)>` in a text field
- Expected: stored as escaped text, no script execution on display

### TS-PRO-009 · P2 · [MISSING]
**Concurrent profile saves from two tabs**
- User edits profile in tab A and tab B simultaneously, saves both
- Expected: last-write-wins, no data corruption, no 500 error
