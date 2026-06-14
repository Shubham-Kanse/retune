# TS-SETTINGS — Settings Pages

---

## Main Settings

### TS-SET-001 · P0 · [MISSING]
**Settings nav links all route correctly**
- User clicks each nav item on `/settings`
- Expected: Career profile → `/profile`, Voice & style → `/settings/voice`, Honesty calibration → `/settings/honesty`, Culture & values → `/settings/culture`, Privacy & data → `/settings/data`

### TS-SET-002 · P1 · [MISSING]
**"Back to settings" link on all sub-pages**
- User visits each settings sub-page
- Expected: "Back to settings" link routes to `/settings`

### TS-SET-003 · P1 · [MISSING]
**Sign out from settings**
- User clicks "Sign out" on settings page
- Expected: session cleared, redirected to `/`

### TS-SET-004 · P0 · [MISSING]
**Delete account — happy path**
- User clicks "Delete account", types "DELETE" in confirm field, submits
- Expected: account deleted, toast "Account deleted.", redirected to `/`
- Subsequent login attempt fails

### TS-SET-005 · P0 · [MISSING]
**Delete account — wrong confirmation word**
- User types "delete" (lowercase) in confirm field
- Expected: submit button disabled, account not deleted

### TS-SET-006 · P1 · [MISSING]
**Delete account — cancel**
- User clicks "Delete account", then clicks "Cancel"
- Expected: danger zone collapses, account not deleted

---

## Language Switcher

### TS-SET-007 · P1 · [COVERED]
**Switch language to en-GB**
- User on `/settings` changes language to "English (UK)"
- Expected: POST to `/api/i18n/locale`, page reloads, copy updates (e.g. "CV" instead of "resume")

### TS-SET-008 · P1 · [COVERED]
**Switch language to en-US**
- User changes language to "English (US)"
- Expected: "Cancel anytime" (not "Cancel any time"), "resume" (not "CV")

### TS-SET-009 · P2 · [MISSING]
**Language preference persists across sessions**
- User sets language to en-GB, logs out, logs back in
- Expected: en-GB still active

---

## Culture Settings

### TS-SET-010 · P1 · [COVERED]
**Culture sliders save on change**
- User moves a slider
- Expected: auto-save fires after 500ms debounce, "Saved" indicator appears
- On reload, slider position preserved

### TS-SET-011 · P1 · [MISSING]
**All 8 culture axes render with correct labels**
- User visits `/settings/culture`
- Expected: 8 sliders, each with left/right labels from i18n
- No "Tier" labels, no internal key names visible

---

## Honesty Calibration

### TS-SET-012 · P1 · [COVERED]
**Empty state shown for new user**
- New user visits `/settings/honesty`
- Expected: "No calibration data yet. It builds as you complete tunings and log outcomes."

### TS-SET-013 · P2 · [MISSING]
**Populated state shows claim types with trust bars**
- User with logged outcomes visits `/settings/honesty`
- Expected: table with Claim type, Trust bar, Samples count, Trend arrow

---

## Data & Privacy

### TS-SET-014 · P1 · [MISSING]
**Export data — happy path**
- User clicks "Export data"
- Expected: JSON file downloaded containing profile, tunings, evidence
- Toast: "Data exported successfully"

### TS-SET-015 · P1 · [MISSING]
**Export data — server error**
- Export API returns 500
- Expected: toast "Couldn't export your data — try again."

### TS-SET-016 · P1 · [MISSING]
**Privacy policy link opens /privacy**
- User clicks "Read privacy policy →"
- Expected: navigates to `/privacy`

---

## Workspaces

### TS-SET-017 · P2 · [COVERED]
**Create workspace**
- User enters workspace name, clicks Create
- Expected: workspace created, appears in list, toast "Workspace created."

### TS-SET-018 · P2 · [COVERED]
**Switch active workspace**
- User clicks "Switch to" on a non-active workspace
- Expected: workspace becomes active, toast "Active workspace switched."

### TS-SET-019 · P2 · [MISSING]
**Invite member to workspace**
- Owner enters email, selects role, clicks Send
- Expected: invitation sent, toast "Member added." or pending link shown

### TS-SET-020 · P2 · [MISSING]
**Create workspace with duplicate name**
- User creates two workspaces with the same name
- Expected: allowed (names are not unique) or clear error if enforced
