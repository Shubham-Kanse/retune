# 001 — Onboarding & Career Profile Enhancements
## Implementation Plan

**Status**: Draft  
**Last revised**: 2026-05-16  
**Scope**: Career profile page UI redesign + AI widget replacement + profile editor fixes

---

## 0. One-line goal

Rebuild the `/profile` page to match the exact wireframe spec: Retune's Understanding → Best Angles → Evidence → Resume Fuel → Re-read trigger → Profile Details — with the MorphPanel AI widget on every tunable section, and the profile editor showing clean extracted fields (not pills for descriptions).

---

## 1. Current state (verified by code read)

### 1.1 File inventory

```
apps/web/src/
  app/(auth)/profile/page.tsx                          — server component, queries DB, passes to CareerProfilePage
  app/api/profile/route.ts                             — GET/PATCH profile
  app/api/profile/understanding/route.ts               — GET understanding
  app/api/profile/understanding/preview/route.ts       — POST preview (AI call)
  app/api/profile/understanding/apply/route.ts         — POST apply preview
  app/api/profile/understanding/feedback/route.ts      — POST feedback (no AI)
  components/profile/
    career-profile-page.tsx                            — client root, holds all state
    retune-understanding-section.tsx                   — section 1
    positioning-cards-section.tsx                      — section 2
    evidence-map-section.tsx                           — section 3
    resume-fuel-section.tsx                            — section 4
    profile-editor.tsx                                 — section 5 (full form)
  components/retune-lens/
    color-orb.tsx                                      — animated CSS orb
    retune-lens-trigger.tsx                            — MorphPanel widget (trigger + textarea)
    retune-lens-panel.tsx                              — wraps trigger, manages preview lifecycle
    retune-lens-preview.tsx                            — before/after preview UI
    retune-lens-scope-picker.tsx                       — scope chip row (exists, NOT used in panel)
    retune-lens-intent-chips.tsx                       — intent chip row (exists, NOT used in panel)
    index.ts                                           — re-exports all
  hooks/use-retune-lens.ts                             — wires preview/apply API calls
  lib/career-understanding/
    types.ts, schema.ts, service.ts, context.ts,
    prompt.ts, guardrails.ts, fingerprint.ts,
    patch.ts, preview-token.ts, repository.ts
  styles/globals.css                                   — has @property --orb-angle + .color-orb CSS
```

### 1.2 Current page render order

1. Header ("Career profile" / "This is what Retune knows.")
2. `RetuneUnderstandingSection` — AI summary card
3. `PositioningCardsSection` — positioning grid
4. `EvidenceMapSection` — 4-quadrant signals (read-only, no tune widget)
5. `ResumeFuelSection` — 4-quadrant readiness (read-only, no tune widget)
6. `ProfileStaleBanner` — conditional amber banner
7. `ProfileEditor` — full form (hideOuterShell=true)

### 1.3 Current AI widget behavior

`RetuneLensTrigger` is already a MorphPanel-style component:
- Resting: pill with ColorOrb + label text (height 44px, borderRadius 22)
- Expanded: morphs to 360×200px panel with textarea + ⌘+Enter hint
- If `defaultInstruction` is set: clicking immediately calls `onSubmit()` without expanding
- Uses `motion/react` spring animation (stiffness 550, damping 45, mass 0.7)
- `RetuneLensPanel` wraps it and manages the preview/apply lifecycle

**Current label**: "I want a different angle", "Tune this", "Re-read edited fields"  
**Required label**: "Tune with AI" (per spec)

### 1.4 Current ColorOrb

- CSS-only, uses `@property --orb-angle` in globals.css
- Component sets CSS custom properties inline (`--orb-base`, `--orb-accent1`, etc.)
- The 21st.dev version uses `--base`, `--accent1` etc. — our implementation already uses the same approach but with `--orb-` prefix to avoid collisions
- No change needed to ColorOrb itself

### 1.5 Known gaps vs spec

| Gap | Location | Severity |
|-----|----------|----------|
| Widget label is not "Tune with AI" | RetuneLensTrigger label prop callers | Low — prop change |
| Intent chips and scope picker not shown in expanded panel | RetuneLensTrigger expanded state | Medium |
| Evidence section has no Tune widget | evidence-map-section.tsx | Medium |
| Resume Fuel section has no Tune widget | resume-fuel-section.tsx | Medium |
| No "Re-read evidence" button above Profile Details | career-profile-page.tsx | Medium |
| No "Retune Suggestion" block in Resume Fuel | resume-fuel-section.tsx | Low |
| Experience description renders as textarea (fixed), but spec shows clean extracted fields | profile-editor.tsx | Low — already fixed |
| Positioning cards show "Use as default" / "Not me" — spec only shows "Tune with AI" | positioning-cards-section.tsx | Low |
| Preview panel opens as absolute-positioned dropdown — can overflow | retune-lens-panel.tsx | Low |
| "Try again" in preview just closes — doesn't re-open the trigger | retune-lens-panel.tsx | Low |

---

## 2. Target UX (exact wireframe)

```
Career Profile                              [Upload resume]
──────────────────────────────────────────────────────────

Retune's Understanding
[orb] "You come across as a product-minded full-stack builder..."
[Accurate] [I want a different angle] [Show why]

──────────────────────────────────────────────────────────

Your Best Angles

[Primary]
AI Product Engineer
Best for: AI SaaS, automation, workflow/product roles.
[orb] [Tune with AI]  ← opens MorphPanel with prefilled intent chips

[Alternative]
Full-stack SaaS Engineer
Best for: platform/product engineering roles.
[orb] [Tune with AI]

[Stretch]
Founding Engineer / Builder
Best for: early-stage startup roles.
[orb] [Tune with AI]

──────────────────────────────────────────────────────────

Evidence Retune Is Using

Strong signals:
• Built production systems
• Worked across frontend/backend/product
• AI workflow experience
• Shipped complex onboarding/generation flows
[orb] [Tune with AI]

Weak or missing signals:
• Need more quantified achievements
• Seniority level needs confirmation
• Some skills need stronger evidence
[orb] [Tune with AI]

──────────────────────────────────────────────────────────

Resume Fuel

Ready:
• Roles  • Skills  • Education  • Projects  • Target roles
[orb] [Tune with AI]

Needs sharpening:
• Metrics  • Career direction  • De-emphasis areas  • Writing tone
[orb] [Tune with AI]

[Retune Suggestion] — AI-generated nudge based on profile gaps

──────────────────────────────────────────────────────────

[orb] Re-read evidence  ← regenerates all sections above

──────────────────────────────────────────────────────────

Profile Details

Personal info | Experience | Education | Skills |
Projects | Career preferences | Writing preferences
```

### 2.1 MorphPanel widget spec (per section)

When "Tune with AI" is clicked:
1. Pill morphs to 360×200 panel (spring animation, existing behavior)
2. Inside the expanded panel:
   - ColorOrb in top-left
   - Section title (e.g. "Tune positioning")
   - **Prefilled intent chips** (2-4 chips relevant to the section)
   - Textarea: "or type your own instruction…"
   - ⌘+Enter to submit
3. On submit → calls preview API → shows before/after diff
4. User clicks Apply → persists → panel closes
5. "Try again" → re-opens the textarea (not just closes)

### 2.2 Intent chips per section

| Section | Chips |
|---------|-------|
| Summary | More technical · More product-focused · More senior · Less exaggerated |
| Positioning (per card) | Emphasize AI work · Emphasize leadership · Broaden scope · Narrow focus |
| Evidence | Add more signals · Reweight signals · Focus on recent work |
| Resume Fuel | Prioritize metrics · Focus on seniority · Highlight projects |

---

## 3. Implementation phases

---

### Phase 1 — AI widget: intent chips + "Tune with AI" label

**Goal**: The expanded MorphPanel shows intent chips above the textarea. All trigger labels read "Tune with AI".

#### 1.1 Update `RetuneLensTrigger` to show intent chips when expanded

**File**: `apps/web/src/components/retune-lens/retune-lens-trigger.tsx`

Current expanded state (lines ~80-130) shows only:
- Header row (label + ⌘+Enter hint)
- Textarea

Add between header and textarea:
```tsx
{intents && intents.length > 0 && (
  <div className="flex flex-wrap gap-1.5 px-2 pb-1">
    {intents.map((intent) => (
      <button
        key={intent}
        type="button"
        onClick={() => { setValue(intentToLabel(intent)); textareaRef.current?.focus(); }}
        className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-accent transition-colors"
      >
        {intentToLabel(intent)}
      </button>
    ))}
  </div>
)}
```

Add `intents?: UnderstandingIntentPreset[]` to `RetuneLensTriggerProps`.

Add `intentToLabel` helper (same mapping as the old `intentToInstruction` but human-readable):
```ts
function intentToLabel(intent: UnderstandingIntentPreset): string {
  const map: Record<UnderstandingIntentPreset, string> = {
    accurate: "Mark accurate",
    different_angle: "Different angle",
    more_technical: "More technical",
    more_product_focused: "More product-focused",
    more_senior: "More senior",
    less_exaggerated: "Less exaggerated",
    re_read_profile: "Re-read profile",
  };
  return map[intent] ?? intent;
}
```

When a chip is clicked, it pre-fills the textarea value. The user can then edit or submit directly.

#### 1.2 Pass `intents` through `RetuneLensPanelProps` → `RetuneLensTrigger`

**File**: `apps/web/src/components/retune-lens/retune-lens-panel.tsx`

`RetuneLensPanel` already has `intents?: UnderstandingIntentPreset[]`. Pass it to `RetuneLensTrigger`:
```tsx
<RetuneLensTrigger
  label={label}
  stale={stale}
  loading={state.kind === "applying"}
  defaultInstruction={defaultInstruction}
  intents={intents}   // ADD THIS
  onSubmit={...}
/>
```

#### 1.3 Rename all "Tune this" / "I want a different angle" labels to "Tune with AI"

**Files to update**:

`retune-understanding-section.tsx`:
- Line with `label="I want a different angle"` → `label="Tune with AI"`

`positioning-cards-section.tsx`:
- Line with `label="Tune this"` → `label="Tune with AI"`

`career-profile-page.tsx` (ProfileStaleBanner):
- Line with `label="Re-read edited fields"` → keep as-is (this is a specific action, not a generic tune)

`retune-understanding-section.tsx` (empty state):
- `label="Generate first read"` → keep as-is (specific action)

#### 1.4 Fix "Try again" to re-open the textarea

**File**: `apps/web/src/components/retune-lens/retune-lens-panel.tsx`

Current `handleTryAgain` sets state to `closed`. Change to re-open the trigger:

The trigger is a separate component — the panel can't directly re-open it. Instead, add a `onTryAgain` callback that the panel exposes, and have the trigger track an `open` state that the panel can reset.

Simplest approach: add a `retryCount` state to `RetuneLensPanel`. When `handleTryAgain` is called, increment `retryCount`. Pass `retryCount` to `RetuneLensTrigger` as a `forceOpen` prop. When `forceOpen` changes, the trigger opens.

```tsx
// In RetuneLensPanel:
const [retryCount, setRetryCount] = React.useState(0);
function handleTryAgain() {
  setState({ kind: "closed" });
  setRetryCount(c => c + 1);
}

// In RetuneLensTrigger:
React.useEffect(() => {
  if (forceOpen > 0) triggerOpen();
}, [forceOpen]);
```

---

### Phase 2 — Evidence and Resume Fuel: add Tune widgets

**Goal**: Both sections get a "Tune with AI" RetuneLensPanel at the bottom.

#### 2.1 Add Tune widget to `EvidenceMapSection`

**File**: `apps/web/src/components/profile/evidence-map-section.tsx`

Add props:
```ts
onPreview: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
onApply: (previewId: string, previewToken: string) => Promise<void>;
stale: boolean;
```

Add at the bottom of the section (after the 4-quadrant grid):
```tsx
<div className="pt-2">
  <RetuneLensPanel
    label="Tune with AI"
    section="evidence"
    defaultScope="evidence_map"
    availableScopes={["evidence_map", "everything_affected"]}
    intents={["re_read_profile", "more_technical", "more_product_focused"]}
    stale={stale}
    onPreview={onPreview}
    onApply={onApply}
  />
</div>
```

#### 2.2 Add Tune widget to `ResumeFuelSection`

**File**: `apps/web/src/components/profile/resume-fuel-section.tsx`

Same pattern as evidence. Add props and panel:
```tsx
<RetuneLensPanel
  label="Tune with AI"
  section="resume_fuel"
  defaultScope="resume_fuel"
  availableScopes={["resume_fuel", "everything_affected"]}
  intents={["re_read_profile", "more_senior", "more_technical"]}
  stale={stale}
  onPreview={onPreview}
  onApply={onApply}
/>
```

#### 2.3 Add "Retune Suggestion" block to ResumeFuelSection

The spec shows a `[Retune Suggestion]` block — an AI-generated nudge based on profile gaps.

This is sourced from `understanding.resumeFuel.suggestedNextEdits[0]` (the first suggested edit item).

Add after the 4-quadrant grid, before the Tune widget:
```tsx
{fuel.suggestedNextEdits.length > 0 && (
  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
      Retune suggestion
    </p>
    <p className="mt-1 text-sm text-foreground">
      {fuel.suggestedNextEdits[0].label}
    </p>
    <p className="mt-0.5 text-xs text-muted-foreground">
      {fuel.suggestedNextEdits[0].whyItMatters}
    </p>
  </div>
)}
```

#### 2.4 Wire new props in `CareerProfilePage`

**File**: `apps/web/src/components/profile/career-profile-page.tsx`

Pass `onPreview`, `onApply`, `stale` to `EvidenceMapSection` and `ResumeFuelSection`:
```tsx
<EvidenceMapSection
  understanding={understanding}
  understandingPersisted={understandingPersisted}
  stale={showStaleBanner}          // ADD
  onPreview={lens.onPreview}       // ADD
  onApply={lens.onApply}           // ADD
/>
<ResumeFuelSection
  understanding={understanding}
  understandingPersisted={understandingPersisted}
  stale={showStaleBanner}          // ADD
  onPreview={lens.onPreview}       // ADD
  onApply={lens.onApply}           // ADD
/>
```

---

### Phase 3 — "Re-read evidence" button above Profile Details

**Goal**: A standalone "Re-read evidence" trigger sits between Resume Fuel and Profile Details. Clicking it regenerates all sections using the current profile facts.

#### 3.1 Add `RereadEvidenceBar` component inline in `career-profile-page.tsx`

This is a simple component — no need for a separate file.

```tsx
function RereadEvidenceBar({
  onPreview,
  onApply,
  stale,
}: {
  onPreview: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply: (id: string, token: string) => Promise<void>;
  stale: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <RetuneLensPanel
        label="Re-read evidence"
        section="summary"
        defaultScope="everything_affected"
        availableScopes={["summary", "all_positioning", "evidence_map", "resume_fuel", "everything_affected"]}
        defaultInstruction="Re-read my profile and update all sections."
        intents={["re_read_profile", "more_technical", "more_product_focused", "more_senior"]}
        stale={stale}
        onPreview={onPreview}
        onApply={onApply}
      />
      <p className="text-xs text-muted-foreground">
        Updates understanding based on your latest profile details.
      </p>
    </div>
  );
}
```

Place it in the main column between `ResumeFuelSection` and the Profile Details section:
```tsx
<RereadEvidenceBar
  onPreview={lens.onPreview}
  onApply={lens.onApply}
  stale={showStaleBanner}
/>
```

---

### Phase 4 — Positioning cards layout

**Goal**: Match the spec wireframe — each card shows kind badge, title, best-for, and a single "Tune with AI" button. Remove "Use as default" and "Not me" from the card face (move to a secondary action or keep as icon buttons).

#### 4.1 Redesign `PositioningCard` in `positioning-cards-section.tsx`

Current card has: kind badge, title, description, best-for, evidence count, risk warning, "Use as default" button, "Tune this" RetuneLensPanel, "Not me" button.

Target card:
```
[Primary]
AI Product Engineer
Best for: AI SaaS, automation, workflow/product roles.
[orb] [Tune with AI]
```

Changes:
- Remove `description` from card face (move to "Show why" expand or tooltip)
- Remove evidence count from card face
- Remove risk warning from card face (move to tooltip on hover)
- Keep "Use as default" as a small icon button (✓) in the top-right corner
- Keep "Not me" as a small icon button (✗) in the top-right corner
- Replace `label="Tune this"` with `label="Tune with AI"`
- Update intents to be positioning-specific: `["different_angle", "more_technical", "more_product_focused", "more_senior"]`

New card layout:
```tsx
<article className="rounded-lg border border-border bg-background p-4">
  <div className="flex items-start justify-between gap-2">
    <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
      {option.kind}
    </span>
    <div className="flex gap-1">
      {/* Use as default icon button */}
      <button onClick={() => onSelectDefault(option.id)} aria-label="Use as default" ...>
        <Check className="size-3.5" />
      </button>
      {/* Not me icon button */}
      <button onClick={() => onReject(option.id)} aria-label="Not me" ...>
        <X className="size-3.5" />
      </button>
    </div>
  </div>
  <h3 className="mt-1 text-sm font-semibold text-foreground">{option.title}</h3>
  {option.bestFor.length > 0 && (
    <p className="mt-1.5 text-xs text-muted-foreground">
      Best for: {option.bestFor.join(", ")}.
    </p>
  )}
  <div className="mt-3">
    <RetuneLensPanel
      label="Tune with AI"
      section="positioning"
      defaultScope="selected_positioning"
      availableScopes={["selected_positioning", "all_positioning"]}
      intents={["different_angle", "more_technical", "more_product_focused", "more_senior"]}
      stale={stale}
      contextId={`positioning-${option.id}`}
      onPreview={onPreview}
      onApply={onApply}
    />
  </div>
</article>
```

#### 4.2 Layout: stack cards vertically (not grid)

The spec shows cards stacked vertically, not in a 2-3 column grid. Change:
```tsx
// FROM:
<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
// TO:
<div className="space-y-3">
```

---

### Phase 5 — Profile Details section

**Goal**: The profile editor renders clean extracted fields. Experience descriptions show as textarea (not pills). Add Projects, Career preferences, Writing preferences sections.

#### 5.1 Experience description — already fixed

The fix from the previous session is already in place:
- If `exp.bullets` exists and has items → `BulletPills`
- Otherwise → `<Textarea>` for free-form description

No further change needed here.

#### 5.2 Add Projects section to ProfileEditor

**File**: `apps/web/src/components/profile/profile-editor.tsx`

`ProfileEditorData` already has `projects: ProjectEntry[]`. The editor currently renders projects but let's verify it's present. Check line ~700+ for a Projects section. If missing, add:

```tsx
<Section title="Projects" subtitle="Side projects, open source, notable work." icon={Sparkles}>
  {form.projects.length === 0 ? (
    <button type="button" onClick={() => updateForm({ projects: [...form.projects, { name: "", description: "" }] })} ...>
      + Add a project
    </button>
  ) : null}
  {form.projects.map((proj, idx) => (
    <div key={idx} className="space-y-3 border-b border-border/40 pb-4 last:border-b-0">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Project name</Label>
          <Input value={proj.name ?? ""} onChange={...} placeholder="e.g. ResumeAI" />
        </div>
        <div className="space-y-1.5">
          <Label>Context</Label>
          <Input value={proj.context ?? ""} onChange={...} placeholder="e.g. Side project, Open source" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={proj.description ?? ""} onChange={...} rows={2} placeholder="What you built and why it matters." />
      </div>
    </div>
  ))}
</Section>
```

#### 5.3 Add Career preferences section

Add a new section after Education:
```tsx
<Section title="Career preferences" subtitle="What you're looking for." icon={Target}>
  <div className="grid gap-3 md:grid-cols-2">
    <div className="space-y-1.5">
      <Label>Target roles</Label>
      <SkillPills skills={form.targetRoles.map(r => ({ name: r }))} onChange={...} placeholder="e.g. Senior Engineer" />
    </div>
    <div className="space-y-1.5">
      <Label>Experience level</Label>
      <select value={form.experienceLevel} onChange={...} className="...">
        <option value="junior">Junior</option>
        <option value="mid">Mid</option>
        <option value="senior">Senior</option>
        <option value="staff">Staff / Principal</option>
        <option value="manager">Manager</option>
      </select>
    </div>
    <div className="space-y-1.5">
      <Label>Relocation preferences</Label>
      <SkillPills skills={form.relocationPreferences.map(r => ({ name: r }))} onChange={...} placeholder="e.g. Remote, London" />
    </div>
    <div className="space-y-1.5">
      <Label>Visa status</Label>
      <Input value={form.visaStatus} onChange={...} placeholder="e.g. UK citizen, US work auth" />
    </div>
  </div>
</Section>
```

#### 5.4 Add Writing preferences section

Add after Career preferences:
```tsx
<Section title="Writing preferences" subtitle="How Retune should write your resume." icon={MessageSquare}>
  <div className="space-y-1.5">
    <Label>Voice notes</Label>
    <Textarea
      value={form.voiceNotes}
      onChange={(e) => updateForm({ voiceNotes: e.target.value })}
      rows={3}
      placeholder="e.g. I prefer concise bullets. Avoid buzzwords. Use first-person active voice."
    />
  </div>
</Section>
```

Note: `voiceNotes` is currently rendered in the middle of the form. Move it here and remove the old placement.

---

### Phase 6 — Section header redesign

**Goal**: Match the spec's clean section dividers with consistent heading style.

#### 6.1 Consistent section heading pattern

Each major section should follow:
```tsx
<section>
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
    {/* optional action */}
  </div>
  {/* content */}
</section>
```

Current sections use inconsistent heading sizes and spacing. Standardize:
- `RetuneUnderstandingSection`: keep the large heading ("This is how Retune currently understands your career.") — this is the hero
- All other sections: `text-base font-semibold` heading + `text-xs text-muted-foreground` subtitle

#### 6.2 Section dividers

Add `<hr className="border-border/30" />` between major sections in `career-profile-page.tsx` to match the wireframe's visual separation.

---

### Phase 7 — Upload resume button in header

**Goal**: The page header shows "Career Profile" on the left and "Upload resume" on the right.

#### 7.1 Add upload button to `CareerProfilePage` header

**File**: `apps/web/src/components/profile/career-profile-page.tsx`

The current header (lines ~72-82):
```tsx
<header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
  <div>
    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
      Career profile
    </p>
    <h1 className="mt-2 text-2xl font-medium tracking-tight text-foreground md:text-3xl">
      This is what Retune knows.
    </h1>
    ...
  </div>
</header>
```

Add upload button to the right side of the header. The upload logic already exists in `ProfileEditor` — extract it into a shared `useResumeUpload` hook or just duplicate the handler in the page header.

The simplest approach: add a button that scrolls to the ProfileEditor's upload section, or triggers the hidden file input that ProfileEditor already has.

```tsx
<header className="mb-10 flex items-start justify-between gap-4">
  <div>
    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
      Career profile
    </p>
    <h1 className="mt-2 text-2xl font-medium tracking-tight text-foreground md:text-3xl">
      This is what Retune knows.
    </h1>
  </div>
  <Button variant="outline" size="sm" onClick={() => {
    // scroll to profile editor upload section
    document.getElementById("profile-upload-trigger")?.click();
  }}>
    <Upload className="mr-1.5 size-3.5" />
    Upload resume
  </Button>
</header>
```

The `ProfileEditor` upload button should get `id="profile-upload-trigger"` so the header button can trigger it.

---

## 4. Data flow — no changes needed

The API routes, `useRetuneLens` hook, and server component are all correct. No backend changes required for this plan. All changes are UI-only.

The data flow remains:
```
Server component (page.tsx)
  → queries profiles table
  → passes CareerProfileV1, CareerUnderstandingV1, ProfileReadiness to CareerProfilePage

CareerProfilePage (client)
  → holds understanding, stale, localStale in state
  → useRetuneLens(initial=false) → lens.onPreview / lens.onApply
  → useRetuneLens(initial=true) → initialLens.onPreview / initialLens.onApply
  → passes callbacks down to all sections

Sections → RetuneLensPanel → RetuneLensTrigger
  → user types instruction (or clicks chip)
  → onSubmit(instruction) → panel calls onPreview API
  → preview shown → user clicks Apply → onApply API
  → onApplied callback → CareerProfilePage updates state
```

---

## 5. Exact file changes per phase

| Phase | File | Change type |
|-------|------|-------------|
| 1 | `retune-lens-trigger.tsx` | Add `intents` prop, render chips in expanded state, add `forceOpen` prop |
| 1 | `retune-lens-panel.tsx` | Pass `intents` to trigger, fix "Try again" to re-open |
| 1 | `retune-understanding-section.tsx` | Rename label to "Tune with AI" |
| 1 | `positioning-cards-section.tsx` | Rename label to "Tune with AI" |
| 2 | `evidence-map-section.tsx` | Add `onPreview`, `onApply`, `stale` props + RetuneLensPanel |
| 2 | `resume-fuel-section.tsx` | Add `onPreview`, `onApply`, `stale` props + RetuneLensPanel + Retune Suggestion block |
| 2 | `career-profile-page.tsx` | Pass new props to evidence + fuel sections |
| 3 | `career-profile-page.tsx` | Add `RereadEvidenceBar` component + render between fuel and details |
| 4 | `positioning-cards-section.tsx` | Redesign card layout, stack vertically |
| 5 | `profile-editor.tsx` | Add Projects section, add Career preferences section, move voiceNotes to Writing preferences section |
| 6 | `career-profile-page.tsx` | Add `<hr>` dividers between sections |
| 7 | `career-profile-page.tsx` | Add Upload resume button to header |
| 7 | `profile-editor.tsx` | Add `id="profile-upload-trigger"` to upload file input |

---

## 6. Acceptance criteria

### Must pass before done

- [ ] `/profile` page renders all 5 sections even with no understanding data (empty states)
- [ ] "Generate first read" button fires AI call on click (no typing required)
- [ ] All "Tune with AI" buttons open the MorphPanel widget
- [ ] Expanded MorphPanel shows intent chips above textarea
- [ ] Clicking an intent chip pre-fills the textarea
- [ ] Submitting (⌘+Enter or chip click + submit) calls preview API
- [ ] Preview shows before/after diff
- [ ] Apply persists the understanding and updates the UI
- [ ] "Try again" re-opens the textarea (not just closes)
- [ ] Evidence section has "Tune with AI" at the bottom
- [ ] Resume Fuel section has "Tune with AI" + Retune Suggestion block
- [ ] "Re-read evidence" bar sits between Resume Fuel and Profile Details
- [ ] Positioning cards are stacked vertically, each with "Tune with AI"
- [ ] Profile Details shows Projects, Career preferences, Writing preferences sections
- [ ] Experience entries show textarea for description (not pills) when no explicit bullets
- [ ] Upload resume button in page header works
- [ ] Page uses `PageShell width="wide"` (max-w-4xl, centered)
- [ ] No TypeScript errors in changed files
- [ ] `pnpm --filter @retune/web exec tsc --noEmit` exits 0

### Nice to have (not blocking)

- [ ] Section dividers between major sections
- [ ] Positioning card description visible on hover/expand
- [ ] Mobile: MorphPanel becomes full-width inline panel

---

## 7. Implementation order

Execute phases in this order. Each phase is independently testable.

1. **Phase 1** — Intent chips in widget + label rename (pure UI, no API changes)
2. **Phase 4** — Positioning cards layout (pure UI)
3. **Phase 2** — Evidence + Resume Fuel tune widgets (adds props to existing components)
4. **Phase 3** — Re-read evidence bar (new inline component)
5. **Phase 7** — Upload resume in header (small addition)
6. **Phase 5** — Profile editor sections (largest change, isolated to profile-editor.tsx)
7. **Phase 6** — Section dividers (cosmetic, last)

---

## 8. What NOT to change

- `ColorOrb` — already correct, CSS-based, no changes needed
- `RetuneLensPreview` — before/after diff UI is correct
- `useRetuneLens` hook — API wiring is correct
- All API routes — no backend changes
- `CareerUnderstandingV1` types — no schema changes
- `profile/page.tsx` server component — no changes
- `globals.css` color-orb CSS — already correct
