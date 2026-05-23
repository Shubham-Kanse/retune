# Design system

This doc captures Retune's design-token architecture and the canonical
component inventory. Charter 10 Epics 01 and 02.

## Token architecture

Retune uses **Tailwind v4** with semantic CSS custom properties as the
single source of truth. Three layers:

1. **Primitive tokens** (CSS vars in `apps/web/src/styles/globals.css`)
   — raw colour, radius, font values. Defined per theme (light/dark).
2. **Semantic tokens** (`@theme` block) — named for their role
   (`background`, `foreground`, `primary`, `destructive`, `muted`,
   `accent`, `card`, `popover`, `border`, `input`, `ring`, `sidebar-*`).
3. **Component utilities** — Tailwind classes generated from semantic
   tokens (`bg-primary`, `text-foreground`, `border-border`, etc.).

### What this means in practice

- New components MUST reference semantic tokens, never primitives. If
  you're typing a hex code or an HSL triplet inside a TSX file, stop —
  that colour belongs in `globals.css` first, then the component pulls
  the semantic name.
- Dark mode flips primitive values; semantic tokens stay the same name.
  No component needs `dark:` variants for colour — only for
  edge-case shadows or overlays where the value can't be expressed
  semantically.
- Adding a new semantic token requires a PR comment in the `@theme`
  block explaining the role + when to use it (see existing comments
  for the format).

### Available tokens

| Token | Purpose |
|---|---|
| `background` / `foreground` | Page surface + main text |
| `card` / `card-foreground` | Card surfaces |
| `popover` / `popover-foreground` | Floating menus, tooltips, dialogs |
| `primary` / `primary-foreground` | Primary action colour (Retune brand `#d4f5e0` accent) |
| `secondary` / `secondary-foreground` | Secondary surface |
| `muted` / `muted-foreground` | De-emphasised surfaces and text |
| `accent` / `accent-foreground` | Hover / focus accent |
| `destructive` / `destructive-foreground` | Errors, danger |
| `border` / `input` / `ring` | Borders, form inputs, focus rings |
| `sidebar-*` | Sidebar-specific palette (own tokens because the sidebar runs against a tinted background) |

### Type tokens

- `--font-sans` → Inter (loaded by `next/font`)
- `--font-mono` → Geist Mono

Use `font-sans` (default) and `font-mono` (for code, hashes, IDs) Tailwind
utilities. Heading sizes use Tailwind's defaults; the landing copy uses
`font-serif` from a custom Tailwind utility (defined in `globals.css`).

### Radius tokens

`--radius` is the base; `radius-sm/md/lg/xl` derive from it. Use
`rounded-md` for buttons + inputs, `rounded-xl` for cards, `rounded-full`
for pill-shaped buttons.

### Spacing + sizing

Tailwind's default 4-pt grid. Stick to multiples of 4 (1 = 4px, 2 = 8px,
…). Reach for 1.5/2.5 only when necessary; never reach for arbitrary
values like `[7px]` outside of one-off layout fixes.

## Component inventory

40 components live in `apps/web/src/components/ui/`. The shadcn/ui core
(Button, Input, Textarea, Card, Tabs, Dialog/Sheet, DropdownMenu,
Tooltip, Avatar, Accordion, Breadcrumb, Label, ScrollArea, Separator,
HoverCard, Collapsible, Skeleton) plus Retune-specific:

- **`error-boundary.tsx`** — top-level React error boundary that ships
  errors to Sentry (Charter 05 Epic 03).
- **`empty-state.tsx`** — paired CTA + illustration for empty lists.
- **`loading-skeleton.tsx`**, **`skeletons.tsx`**, **`skeleton.tsx`** —
  loading placeholders. Mandatory for any list or detail page that
  fetches data.
- **`top-nav.tsx`**, **`sidebar.tsx`** — chrome.
- **`section-title.tsx`**, **`shining-text.tsx`** — typography helpers.
- **`color-orb`** (in `retune-lens/`) — branded circular orb used in
  the AI-tune surfaces.
- **`brain-icon.tsx`**, **`logo.tsx`** — Retune-specific marks.

## Mandatory states (Charter 10 Epic 02)

Every interactive component MUST handle three states explicitly:

1. **Loading.** Use the `loading` prop on `<Button>` (added with this
   charter) which sets `aria-busy="true"` + shows a spinner. For
   non-button surfaces, wrap in `<Skeleton>` while data is fetching.
2. **Empty.** Use `<EmptyState>` with a primary CTA. Never render an
   empty container — the user can't tell if it's loading, broken, or
   genuinely empty.
3. **Error.** Use `<ErrorBoundary>` at route level + `<Alert
   variant="destructive">` for inline errors. Errors include a retry
   button when the operation is idempotent.

A11y rules (Charter 14):

- Every loading button has `aria-busy="true"`.
- Every live-updating region (SSE-driven panel, toasts) has
  `aria-live="polite"` (or `"assertive"` for errors).
- Every interactive element is keyboard-reachable (no
  `pointer-events-only` controls).
- Every form control has a `<Label>` or `aria-label`.

## Accepting new components

Before adding to `components/ui/`:

1. Does shadcn/ui already ship one? If yes, install via the canonical
   `pnpm dlx shadcn@latest add` command — don't fork.
2. Does it use semantic tokens (no inline hex/hsl)?
3. Does it handle loading + empty + error?
4. Is it keyboard-navigable?
5. Does it have a Storybook story or component test? (See
   `src/components/retune-lens/__tests__/retune-lens-panel.test.tsx`
   for the pattern.)

If you can't answer yes to all five, either fix the gap or open an
issue; don't merge.

## Storybook (deferred)

Storybook is referenced in Charter 10 Epic 01 but not installed. The
component test files (`__tests__/*.test.tsx`) currently serve as both
behaviour tests and visual contracts. Adding Storybook is a follow-up
that will wrap the existing test fixtures into stories without
re-implementing them.

To add Storybook:

```bash
pnpm --filter @retune/web dlx storybook@latest init
# Then move the test fixture renderPanel() helpers into stories.
```

## References

- `apps/web/src/styles/globals.css`
- `apps/web/src/components/ui/`
- ADR-005 (monorepo + Biome + tooling): `docs/adr/ADR-005-monorepo.md`
- `docs/charters/10-ux-design-system/README.md`
- `docs/charters/14-accessibility/README.md`
