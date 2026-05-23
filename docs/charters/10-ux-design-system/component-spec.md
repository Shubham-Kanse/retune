# Component Spec Catalogue

> Charter 10 — UX Design System.
> One row per UI primitive. Anyone shipping a new surface should pick from this list before
> introducing a new component. New entries land here _with_ the implementation in the same PR.

## How to read this catalogue

- **Component**: import path from `@/components/ui/<name>`.
- **Props (canonical)**: the props you should usually set; the full TS type stays in the file.
- **States**: visual states the component must support and we test against.
- **A11y**: axe rule families covered, keyboard model, ARIA notes.
- **Status**: `stable` (lock the API), `evolving` (open to changes), `deprecated` (do not use in new work).

If a component below behaves differently from what you need, prefer extending it (variant, size,
slot) over forking. If the change is generic, update this catalogue in the same PR.

---

## Form & input primitives

### Button — `@/components/ui/button`
- **Props**: `variant` (`default | destructive | outline | secondary | ghost | link`), `size`
  (`default | sm | lg | icon`), `asChild`, `loading`, `disabled`.
- **States**: idle, hover, focus-visible (2px ring, ring-offset-2), active, disabled, loading
  (spinner prefix in the native-button branch only — `asChild` slots NEVER receive the spinner).
- **A11y**: `aria-busy` mirrors `loading`; `aria-disabled` mirrors `disabled || loading`. Native
  button is `<button>` so Enter/Space already work; `asChild` forwards to the wrapped element.
  Tap target ≥ 36px (`size=default` is `h-10`).
- **Status**: stable. Charter-09-Epic-01 audited 2026-05-23: `asChild` + Slot now passes a single
  child element. Do not put `{loading ? <Spinner/> : null}{children}` inside any new variant.

### Input — `@/components/ui/input`
- **Props**: standard `<input>` props + `className`. No size variant — height is uniform.
- **States**: idle, focus-visible (ring), invalid (`aria-invalid="true"` adds destructive ring),
  disabled.
- **A11y**: every input MUST be paired with a `<Label>` referencing it via `htmlFor`/`id`. Required
  fields use `aria-required="true"`, not the `required` attribute alone.
- **Status**: stable.

### Label — `@/components/ui/label`
- **Props**: standard label props.
- **A11y**: clicking the label focuses the associated control. Hidden labels use the `sr-only`
  utility, not `aria-label` — screen readers read the label text in its DOM order, which usually
  matches what sighted users would expect.
- **Status**: stable.

### Textarea — `@/components/ui/textarea`
- **Props**: standard `<textarea>` props + `className`.
- **States**: same as Input.
- **A11y**: pair with `<Label>` like Input. Use `aria-describedby` for inline help text.
- **Status**: stable.

---

## Layout & containers

### Card — `@/components/ui/card`
- **Anatomy**: `Card` (root) + `CardHeader` + `CardTitle` + `CardDescription` + `CardContent` +
  `CardFooter`. Compose them; do not render bare `<div className="rounded-2xl…">` patterns.
- **States**: default. Hover/focus only when the card is interactive — wrap in a `<Link>` or
  `<button>` rather than putting click handlers on the card itself.
- **A11y**: if interactive, the wrapping element supplies the role + keyboard model; do not put
  click handlers on a `<div>`.
- **Status**: stable.

### Sheet — `@/components/ui/sheet` (Radix Dialog subclass)
- **Props**: `open`, `onOpenChange`, `side` (`top | right | bottom | left`).
- **States**: closed (no DOM), open + animating-in, open + idle, animating-out.
- **A11y**: traps focus while open, restores focus to the trigger on close, Esc closes. Title is
  `<SheetTitle>` (or `aria-label` on `<SheetContent>` when there's no visible title).
- **Status**: stable. Used by Sidebar mobile collapse + the public mobile-nav.

### ScrollArea — `@/components/ui/scroll-area`
- **Use when**: you need a fixed-height region with custom scrollbar styling.
- **A11y**: keyboard scrolling (PgUp/PgDn) works because the underlying element is still scrollable;
  the custom thumb is decorative.
- **Status**: stable.

### PageShell + PageHeader — `@/components/app/page-shell`
- **Use when**: any standalone page in the auth area.
- **Props**: `width` (`narrow | default | wide`).
- **Status**: stable. Match this width across siblings; mixing widths breaks the dense-page rhythm.

---

## Disclosure & navigation

### Tooltip — `@/components/ui/tooltip` (Radix)
- **Trigger**: any focusable element. Hover + focus both open it.
- **A11y**: 200ms `delayDuration` baseline; pointer + keyboard parity is guaranteed by Radix.
- **Status**: stable.

### HoverCard — `@/components/ui/hover-card`
- **Trigger**: any element. Hover only — keyboard users get nothing, so HoverCard must NEVER carry
  information that isn't already available elsewhere.
- **Status**: stable but `evolving` at the use-site level; if you need keyboard parity, use Tooltip
  or a Popover instead.

### DropdownMenu — `@/components/ui/dropdown-menu`
- **A11y**: arrow keys, Enter, Esc all wired by Radix. Trigger needs a real `<Button>` (not a div)
  for screen reader role announcement.
- **Status**: stable.

### Tabs — `@/components/ui/tabs`
- **A11y**: arrow-key navigation between tabs, automatic activation. Don't use Tabs as a router —
  that breaks deep links.
- **Status**: stable.

### Accordion — `@/components/ui/accordion`
- **Status**: stable.

### Collapsible — `@/components/ui/collapsible`
- **Status**: stable. Prefer Accordion when the collapsing region carries semantic content the user
  might want to find via in-page search.

### Breadcrumb — `@/components/ui/breadcrumb`
- **A11y**: wraps in `<nav aria-label="Breadcrumb">` automatically. Current page is the last item
  with `aria-current="page"`.
- **Status**: stable.

---

## Feedback

### EmptyState — `@/components/ui/empty-state`
- **Anatomy**: icon (optional) + title + description + primary action (optional) + secondary action
  (optional).
- **Voice**: short, warm, instructive. The state describes what's missing AND what the user can do
  about it. Match the brand voice in `docs/policies/ai-safety-policy.md`.
- **Status**: stable.

### Skeleton + LoadingSkeleton + DashboardSkeleton — `@/components/ui/skeleton(s)`
- **Use when**: any await > 200ms on a fresh nav. Skeleton shape mirrors the final shape so layout
  doesn't shift.
- **A11y**: skeletons set `aria-busy="true"` on their container.
- **Status**: stable.

### Toaster — `sonner`
- **Mounted in**: root layout, not inside ErrorBoundary (would otherwise throw `React.Children.only`).
- **Voice**: `toast.success`, `toast.error`, `toast.message` — keep messages under 80 chars. The
  refusal-card tone is the reference.
- **Status**: stable.

### ErrorBoundary — `@/components/ui/error-boundary`
- **Use when**: every client subtree that owns long-lived state. The fallback is a single page-level
  reload prompt.
- **A11y**: fallback uses an `<h2>` for the error title so AT users can find it.
- **Status**: stable.

---

## Identity & decoration

### Avatar — `@/components/ui/avatar`
- **Status**: stable.

### Logo + BrainIcon — `@/components/ui/{logo,brain-icon}`
- **Status**: stable. The logo respects the active theme; do not hard-code the colour.

### Separator — `@/components/ui/separator`
- **A11y**: decorative by default (`role="none"`); set `decorative={false}` only when the separator
  carries semantic meaning.
- **Status**: stable.

### TopNav + Sidebar — `@/components/ui/{top-nav,sidebar}`
- **Sidebar** uses Radix-style `SidebarProvider` so mobile collapses to a Sheet automatically.
- **Status**: stable.

---

## Decorative / motion (use sparingly)

These exist for the public landing surfaces. Do NOT use them inside the auth product — they
introduce motion that competes with the content.

- `ShiningText`, `ShineBorder`, `GlowingShadow`, `GradientBar`, `MagneticCursor`,
  `ParallaxFloating`, `TestimonialsColumn`, `TextMorph`, `AnimatedCircularProgressBar`,
  `AnimatedThemeToggler`. Status: stable but `restricted` to landing.

---

## App-specific composites

These live outside `components/ui/` because they're product-specific. Listed here so the catalogue
is exhaustive.

- `OrganizationsCard` — `@/components/settings/organizations-card`. Charter 19 Epic 01.
- `LanguageCard` — `@/components/settings/language-card`. Charter 16.
- `SettingsClient` — `@/components/settings/settings-client`. Composes the cards above with the
  subscription summary and account info block.
- `RetuneLensTrigger` + `RetuneLensPanel` — `@/components/retune-lens/*`. The trace UI;
  Charter 05 Epic 02.
- `JdPrompt` — `@/components/dashboard/jd-prompt`. The new-application primary action.

---

## Rules for adding a new component

1. **Prefer a variant over a fork.** New visual treatment usually fits as a `variant=` on an
   existing component.
2. **No new tokens.** Use the semantic colours (`bg-card`, `text-foreground`, `border-border`,
   `text-muted-foreground`) and the existing radius / spacing scale. New tokens require a Charter 10
   amendment + landing in `docs/charters/10-ux-design-system/design-system.md`.
3. **A11y is part of the spec, not a follow-up.** Every new entry above ships with axe-core
   coverage in `apps/web/src/test-utils/axe.ts`-driven component tests.
4. **One file per primitive.** Avoid the megafile pattern; if a component grows past 300 lines,
   split it.
5. **Document the brand voice.** When a component owns user-facing copy (EmptyState, ErrorBoundary
   fallback, refusal card), the entry above lists the tone reference. Match it.
