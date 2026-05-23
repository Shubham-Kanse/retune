# Epic 01: Design Tokens

## Summary

Audit `globals.css`, extract all color, spacing, and typography values into a structured CSS custom property system with primitive and semantic layers, then migrate the Button component as the first consumer.

---

## Story 1: Audit and Extract Design Tokens

### User Story

> As a frontend developer, I want all design values documented in a single token file so that I can reference consistent values without guessing hex codes or spacing values from `globals.css`.

### Acceptance Criteria

- [ ] All color values in `apps/web/src/styles/globals.css` are catalogued
- [ ] All spacing values (margins, paddings, gaps) are catalogued
- [ ] All typography values (font sizes, weights, line heights) are catalogued
- [ ] A new file `apps/web/src/styles/tokens.css` exists with primitive and semantic layers
- [ ] `tokens.css` is imported in `globals.css` before any other declarations
- [ ] Dark mode tokens are defined under `.dark` selector matching existing next-themes setup
- [ ] No visual regression — the app looks identical before and after

### Tasks

#### Task 1.1: Audit `globals.css` for all design values

**File:** `apps/web/src/styles/globals.css`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Grep all hex color values (`#xxx`, `#xxxxxx`, `#xxxxxxxx`) | 15 min |
| 2 | Grep all HSL/RGB/OKLCH color values | 15 min |
| 3 | Grep all spacing values (rem, px used in padding/margin/gap) | 15 min |
| 4 | Grep all font-size, font-weight, line-height declarations | 15 min |
| 5 | Document findings in a temporary audit file `docs/charters/10-ux-design-system/token-audit.md` | 30 min |

**Total effort:** 1.5 hours

#### Task 1.2: Create `tokens.css` with primitive tokens

**File:** `apps/web/src/styles/tokens.css`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Create file with `:root` block containing all primitive color tokens | 30 min |
| 2 | Add primitive spacing scale tokens | 20 min |
| 3 | Add primitive typography tokens | 20 min |

**Structure:**

```css
/* apps/web/src/styles/tokens.css */

/* ═══════════════════════════════════════════
   PRIMITIVE TOKENS — Raw values only
   ═══════════════════════════════════════════ */

:root {
  /* Colors — Green palette */
  --color-green-50: #f0fdf4;
  --color-green-100: #dcfce7;
  --color-green-200: #bbf7d0;
  --color-green-300: #86efac;
  --color-green-400: #4ade80;
  --color-green-500: #22c55e;
  --color-green-600: #2d8a5e;
  --color-green-700: #15803d;
  --color-green-800: #166534;
  --color-green-900: #14532d;

  /* Colors — Neutral palette */
  --color-neutral-0: #ffffff;
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-200: #e5e5e5;
  --color-neutral-300: #d4d4d4;
  --color-neutral-400: #a3a3a3;
  --color-neutral-500: #737373;
  --color-neutral-600: #525252;
  --color-neutral-700: #404040;
  --color-neutral-800: #262626;
  --color-neutral-900: #171717;
  --color-neutral-950: #0a0a0a;

  /* Colors — Red (destructive) */
  --color-red-500: #ef4444;
  --color-red-600: #dc2626;
  --color-red-700: #b91c1c;

  /* Spacing scale */
  --space-0: 0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Typography — Font sizes */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;

  /* Typography — Font weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Typography — Line heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;
}
```

**Total effort:** 1 hour 10 min

#### Task 1.3: Create semantic token layer

**File:** `apps/web/src/styles/tokens.css` (append after primitives)

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Define semantic color tokens for brand, interactive, surface, text, border, destructive | 30 min |
| 2 | Define semantic spacing tokens for component padding, gaps | 15 min |
| 3 | Define dark mode overrides under `.dark` selector | 30 min |

**Structure:**

```css
/* ═══════════════════════════════════════════
   SEMANTIC TOKENS — Purpose-based
   ═══════════════════════════════════════════ */

:root {
  /* Brand */
  --color-brand-primary: var(--color-green-600);
  --color-brand-primary-hover: var(--color-green-700);
  --color-brand-primary-light: var(--color-green-100);

  /* Interactive */
  --color-interactive-default: var(--color-brand-primary);
  --color-interactive-hover: var(--color-brand-primary-hover);
  --color-interactive-disabled: var(--color-neutral-300);
  --color-interactive-focus-ring: var(--color-green-400);

  /* Surface */
  --color-surface-primary: var(--color-neutral-0);
  --color-surface-secondary: var(--color-neutral-50);
  --color-surface-elevated: var(--color-neutral-0);

  /* Text */
  --color-text-primary: var(--color-neutral-900);
  --color-text-secondary: var(--color-neutral-600);
  --color-text-muted: var(--color-neutral-400);
  --color-text-on-brand: var(--color-neutral-0);
  --color-text-destructive: var(--color-red-600);

  /* Border */
  --color-border-default: var(--color-neutral-200);
  --color-border-strong: var(--color-neutral-300);

  /* Destructive */
  --color-destructive-default: var(--color-red-600);
  --color-destructive-hover: var(--color-red-700);

  /* Component spacing */
  --spacing-button-x: var(--space-4);
  --spacing-button-y: var(--space-2);
  --spacing-card-padding: var(--space-6);
  --spacing-input-x: var(--space-3);
  --spacing-input-y: var(--space-2);
}

/* Dark mode overrides */
.dark {
  --color-brand-primary: var(--color-green-500);
  --color-brand-primary-hover: var(--color-green-400);
  --color-brand-primary-light: var(--color-green-900);

  --color-interactive-default: var(--color-green-500);
  --color-interactive-hover: var(--color-green-400);
  --color-interactive-disabled: var(--color-neutral-700);
  --color-interactive-focus-ring: var(--color-green-600);

  --color-surface-primary: var(--color-neutral-950);
  --color-surface-secondary: var(--color-neutral-900);
  --color-surface-elevated: var(--color-neutral-800);

  --color-text-primary: var(--color-neutral-50);
  --color-text-secondary: var(--color-neutral-400);
  --color-text-muted: var(--color-neutral-600);
  --color-text-on-brand: var(--color-neutral-950);
  --color-text-destructive: var(--color-red-500);

  --color-border-default: var(--color-neutral-800);
  --color-border-strong: var(--color-neutral-700);

  --color-destructive-default: var(--color-red-500);
  --color-destructive-hover: var(--color-red-600);
}
```

**Total effort:** 1 hour 15 min

#### Task 1.4: Import `tokens.css` in `globals.css`

**File:** `apps/web/src/styles/globals.css`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Add `@import './tokens.css';` as the first line of `globals.css` | 5 min |
| 2 | Verify the app renders identically (manual check + screenshot comparison) | 15 min |

**Total effort:** 20 min

### Tests

**File:** `apps/web/src/styles/__tests__/tokens.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('tokens.css', () => {
  const tokensPath = resolve(__dirname, '../tokens.css');
  const content = readFileSync(tokensPath, 'utf-8');

  it('defines primitive color tokens', () => {
    expect(content).toContain('--color-green-600:');
    expect(content).toContain('--color-neutral-900:');
    expect(content).toContain('--color-red-600:');
  });

  it('defines semantic tokens referencing primitives', () => {
    expect(content).toContain('--color-brand-primary: var(--color-green-600)');
    expect(content).toContain('--color-interactive-default: var(--color-brand-primary)');
  });

  it('defines dark mode overrides', () => {
    expect(content).toContain('.dark {');
    expect(content).toContain('--color-surface-primary: var(--color-neutral-950)');
  });

  it('defines spacing scale', () => {
    expect(content).toContain('--space-1:');
    expect(content).toContain('--space-4:');
    expect(content).toContain('--space-16:');
  });

  it('defines typography tokens', () => {
    expect(content).toContain('--text-base:');
    expect(content).toContain('--font-medium:');
    expect(content).toContain('--leading-normal:');
  });
});
```

**Assertions:**
- `tokens.css` contains all primitive color tokens
- Semantic tokens reference primitives via `var()`
- Dark mode block exists with overrides
- Spacing scale is complete
- Typography tokens are defined

---

## Story 2: Migrate Button to Semantic Tokens + Add Loading State

### User Story

> As a user, I want buttons to show a loading spinner when an action is in progress so that I know the system is working and I don't click again.

### Acceptance Criteria

- [ ] `Button` component accepts a `loading` prop (boolean, default `false`)
- [ ] When `loading={true}`, the button displays a spinner icon before the children text
- [ ] When `loading={true}`, the button is disabled (cannot be clicked)
- [ ] When `loading={true}`, the button has `aria-busy="true"` attribute
- [ ] Button uses semantic token CSS variables instead of hardcoded Tailwind color classes for its primary variant
- [ ] All existing Button variants continue to work unchanged
- [ ] Vitest snapshot tests cover all variant × loading combinations

### Tasks

#### Task 2.1: Add `loading` prop and spinner to Button

**File:** `apps/web/src/components/ui/button.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Add `loading?: boolean` to `ButtonProps` interface | 5 min |
| 2 | Import or create a `Spinner` SVG component (animated `<svg>` with `animate-spin`) | 15 min |
| 3 | Render spinner before `children` when `loading={true}` | 10 min |
| 4 | Set `disabled={true}` and `aria-busy="true"` when loading | 10 min |
| 5 | Add `opacity-70 cursor-not-allowed` styles when loading | 5 min |

**Implementation:**

```tsx
// In button.tsx — additions to existing component

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          loading && "opacity-70 cursor-not-allowed"
        )}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </Comp>
    );
  }
);
```

**Total effort:** 45 min

#### Task 2.2: Update Button primary variant to use semantic tokens

**File:** `apps/web/src/components/ui/button.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Replace hardcoded green/brand Tailwind classes in `default` variant with CSS variable references | 20 min |
| 2 | Add corresponding Tailwind arbitrary value classes or inline style references | 10 min |
| 3 | Verify all variants render correctly | 15 min |

**Example change:**

```tsx
// Before:
// "bg-green-600 text-white hover:bg-green-700"

// After:
// "bg-[var(--color-interactive-default)] text-[var(--color-text-on-brand)] hover:bg-[var(--color-interactive-hover)]"
```

**Total effort:** 45 min

#### Task 2.3: Write vitest tests for Button variants

**File:** `apps/web/src/components/ui/__tests__/button.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Set up test file with render utilities | 10 min |
| 2 | Write tests for each variant (default, destructive, outline, secondary, ghost, link) | 30 min |
| 3 | Write tests for loading state behavior | 20 min |
| 4 | Write snapshot tests for all combinations | 15 min |

**Implementation:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

describe('Button', () => {
  describe('variants', () => {
    it('renders default variant', () => {
      const { container } = render(<Button>Click me</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders destructive variant', () => {
      const { container } = render(<Button variant="destructive">Delete</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders outline variant', () => {
      const { container } = render(<Button variant="outline">Outline</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders secondary variant', () => {
      const { container } = render(<Button variant="secondary">Secondary</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders ghost variant', () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders link variant', () => {
      const { container } = render(<Button variant="link">Link</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('sizes', () => {
    it('renders sm size', () => {
      const { container } = render(<Button size="sm">Small</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders lg size', () => {
      const { container } = render(<Button size="lg">Large</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders icon size', () => {
      const { container } = render(<Button size="icon">🔍</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('loading state', () => {
    it('shows spinner when loading', () => {
      render(<Button loading>Submit</Button>);
      const button = screen.getByRole('button');
      const spinner = button.querySelector('svg.animate-spin');
      expect(spinner).not.toBeNull();
    });

    it('disables button when loading', () => {
      render(<Button loading>Submit</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('sets aria-busy when loading', () => {
      render(<Button loading>Submit</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('does not set aria-busy when not loading', () => {
      render(<Button>Submit</Button>);
      const button = screen.getByRole('button');
      expect(button).not.toHaveAttribute('aria-busy');
    });

    it('prevents click when loading', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Button loading onClick={onClick}>Submit</Button>);
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('applies loading styles', () => {
      render(<Button loading>Submit</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('opacity-70');
      expect(button.className).toContain('cursor-not-allowed');
    });

    it('still renders children alongside spinner', () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByText('Submit')).toBeDefined();
    });

    it('renders loading state for each variant', () => {
      const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;
      variants.forEach((variant) => {
        const { container } = render(<Button variant={variant} loading>Loading</Button>);
        expect(container.firstChild).toMatchSnapshot();
      });
    });
  });
});
```

**Assertions:**
- Each variant renders without error and matches snapshot
- Loading state shows an SVG with `animate-spin` class
- Loading state sets `disabled` attribute on the button element
- Loading state sets `aria-busy="true"`
- Non-loading state does NOT have `aria-busy`
- Click handler is not called when loading
- Loading state applies `opacity-70` and `cursor-not-allowed` classes
- Children text is still visible when loading

**Total effort:** 1 hour 15 min

---

## Story 3: Full Matrix Snapshot Tests

### User Story

> As a developer, I want visual documentation of all Button states so that I can verify appearance without running the full app.

### Acceptance Criteria

- [ ] Vitest snapshot tests exist for every variant × size × loading combination
- [ ] Snapshots are committed and reviewable in PRs
- [ ] Running `pnpm --filter @retune/web test` passes all Button snapshot tests

### Tasks

#### Task 3.1: Add matrix snapshot coverage

**File:** `apps/web/src/components/ui/__tests__/button.test.tsx` (append to same file)

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Add matrix test that iterates all variant × size × loading combinations | 20 min |
| 2 | Run tests and commit initial snapshots | 10 min |

**Implementation:**

```typescript
describe('Button — full matrix snapshots', () => {
  const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;
  const sizes = ['default', 'sm', 'lg', 'icon'] as const;
  const loadingStates = [false, true] as const;

  variants.forEach((variant) => {
    sizes.forEach((size) => {
      loadingStates.forEach((loading) => {
        it(`variant=${variant} size=${size} loading=${loading}`, () => {
          const { container } = render(
            <Button variant={variant} size={size} loading={loading}>
              Label
            </Button>
          );
          expect(container.firstChild).toMatchSnapshot();
        });
      });
    });
  });
});
```

**Total effort:** 30 min

---

## Total Epic Effort

| Story | Effort |
|-------|--------|
| Story 1: Audit and Extract Design Tokens | ~4 hours |
| Story 2: Migrate Button + Loading State | ~2 hours 45 min |
| Story 3: Full Matrix Snapshot Tests | ~30 min |
| **Total** | **~7 hours 15 min** |
