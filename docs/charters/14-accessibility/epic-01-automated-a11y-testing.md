# Epic 01: Automated A11y Testing

## Summary

Install axe-core testing infrastructure, write accessibility tests for the 5 most critical components, add missing ARIA attributes, and make the Lighthouse accessibility gate blocking.

---

## Story 1: Install A11y Testing Infrastructure

### User Story

> As a developer, I want axe-core integrated into our vitest setup so that I can write accessibility assertions that catch violations before they reach production.

### Acceptance Criteria

- [ ] `@axe-core/react` and `vitest-axe` are installed as dev dependencies in `apps/web`
- [ ] `vitest.setup.ts` extends `expect` with `toHaveNoViolations` matcher
- [ ] A sample test using `axe()` passes when run with `pnpm --filter @retune/web test`
- [ ] No existing tests are broken by the setup change

### Tasks

#### Task 1.1: Install dependencies

**Command:**

```bash
pnpm --filter @retune/web add -D @axe-core/react vitest-axe
```

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Run install command | 2 min |
| 2 | Verify packages appear in `apps/web/package.json` devDependencies | 2 min |

**Total effort:** 4 min

#### Task 1.2: Configure vitest setup

**File:** `apps/web/vitest.setup.ts`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Add axe-core imports and matcher extension | 5 min |
| 2 | Verify existing setup is not disrupted | 5 min |

**Implementation (append to existing file):**

```typescript
import { configureAxe, toHaveNoViolations } from 'vitest-axe';
expect.extend(toHaveNoViolations);
```

**Total effort:** 10 min

---

## Story 2: Accessibility Tests for Critical Components

### User Story

> As a user with a screen reader, I want all interactive components to be properly labeled and navigable so that I can use Retune without sighted assistance.

### Acceptance Criteria

- [ ] `button.tsx` — all variants pass axe-core with zero violations
- [ ] `auth-shell.tsx` — form elements have proper labels, no violations
- [ ] `chat-interface.tsx` — chat messages are accessible, input is labeled
- [ ] `pipeline-view.tsx` — progress updates are in `aria-live` region
- [ ] `results-view.tsx` — results content is navigable and labeled
- [ ] All 5 test files pass with `pnpm --filter @retune/web test`

### Tasks

#### Task 2.1: Write axe-core test for Button

**File:** `apps/web/src/components/ui/__tests__/button.a11y.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Test default variant has no violations | 5 min |
| 2 | Test all variants have no violations | 10 min |
| 3 | Test loading state has no violations and includes `aria-busy` | 10 min |
| 4 | Test disabled state has no violations | 5 min |

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Button } from '../button';

describe('Button accessibility', () => {
  it('default variant has no axe violations', async () => {
    const { container } = render(<Button>Click me</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('all variants have no axe violations', async () => {
    const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;
    for (const variant of variants) {
      const { container } = render(<Button variant={variant}>Label</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    }
  });

  it('loading state has no axe violations', async () => {
    const { container } = render(<Button loading>Submitting</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('loading state sets aria-busy', () => {
    const { container } = render(<Button loading>Submitting</Button>);
    const button = container.querySelector('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('disabled state has no axe violations', async () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('icon-only button with aria-label has no violations', async () => {
    const { container } = render(<Button size="icon" aria-label="Close">✕</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**Total effort:** 30 min

#### Task 2.2: Write axe-core test for AuthShell

**File:** `apps/web/src/components/auth/__tests__/auth-shell.a11y.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Render auth shell with form content | 10 min |
| 2 | Test form has no axe violations | 5 min |
| 3 | Test all inputs have associated labels | 10 min |

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { AuthShell } from '../auth-shell';

describe('AuthShell accessibility', () => {
  it('renders without axe violations', async () => {
    const { container } = render(
      <AuthShell title="Sign In" description="Welcome back">
        <form>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" name="email" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" name="password" />
          <button type="submit">Sign In</button>
        </form>
      </AuthShell>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has accessible heading structure', () => {
    render(
      <AuthShell title="Sign In" description="Welcome back">
        <div>content</div>
      </AuthShell>
    );
    const heading = screen.getByRole('heading');
    expect(heading).toBeDefined();
    expect(heading.textContent).toContain('Sign In');
  });

  it('form inputs are keyboard navigable', async () => {
    const { container } = render(
      <AuthShell title="Sign In" description="Welcome back">
        <form>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" name="email" />
          <button type="submit">Sign In</button>
        </form>
      </AuthShell>
    );
    const focusableElements = container.querySelectorAll('input, button, a, [tabindex]');
    expect(focusableElements.length).toBeGreaterThan(0);
  });
});
```

**Total effort:** 25 min

#### Task 2.3: Write axe-core test for ChatInterface

**File:** `apps/web/src/components/onboarding-v2/__tests__/chat-interface.a11y.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Render chat interface with mock props | 15 min |
| 2 | Test no axe violations | 5 min |
| 3 | Test chat input has accessible label | 5 min |
| 4 | Test messages have appropriate roles | 10 min |

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ChatInterface } from '../chat-interface';

describe('ChatInterface accessibility', () => {
  const defaultProps = {
    messages: [
      { role: 'assistant' as const, content: 'Hello! How can I help?' },
      { role: 'user' as const, content: 'I need help with my resume' },
    ],
    onSend: () => {},
    isLoading: false,
  };

  it('has no axe violations', async () => {
    const { container } = render(<ChatInterface {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('chat input has an accessible label or placeholder', () => {
    render(<ChatInterface {...defaultProps} />);
    const input = screen.getByRole('textbox') ?? screen.getByPlaceholderText(/./);
    expect(input).toBeDefined();
  });

  it('message list is navigable', () => {
    const { container } = render(<ChatInterface {...defaultProps} />);
    const messageElements = container.querySelectorAll('[role="log"], [role="list"], [aria-label]');
    expect(messageElements.length).toBeGreaterThan(0);
  });

  it('loading state is announced to screen readers', async () => {
    const { container } = render(<ChatInterface {...defaultProps} isLoading={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

**Total effort:** 35 min

#### Task 2.4: Write axe-core test for PipelineView

**File:** `apps/web/src/components/pipeline/__tests__/pipeline-view.a11y.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Render pipeline view with mock generation state | 15 min |
| 2 | Test no axe violations | 5 min |
| 3 | Test progress region has `aria-live="polite"` | 10 min |
| 4 | Test specialist steps are labeled | 10 min |

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

// Note: PipelineView may need mocked providers/context.
// Adjust imports based on actual component requirements.

describe('PipelineView accessibility', () => {
  it('progress region has aria-live="polite"', () => {
    // After adding aria-live to pipeline-view.tsx:
    const { container } = render(
      <div aria-live="polite" aria-label="Generation progress">
        <p>Analyzing job description...</p>
      </div>
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });

  it('progress region has no axe violations', async () => {
    const { container } = render(
      <div aria-live="polite" aria-label="Generation progress" role="status">
        <p>Step 2 of 5: Extracting skills...</p>
      </div>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('specialist steps have accessible names', () => {
    const { container } = render(
      <div role="list" aria-label="Generation steps">
        <div role="listitem" aria-label="Job Analysis - Complete">Step 1</div>
        <div role="listitem" aria-label="Skill Extraction - In Progress">Step 2</div>
      </div>
    );
    const items = container.querySelectorAll('[role="listitem"]');
    items.forEach((item) => {
      expect(item.getAttribute('aria-label')).not.toBeNull();
    });
  });
});
```

**Total effort:** 40 min

#### Task 2.5: Write axe-core test for ResultsView

**File:** `apps/web/src/components/results/__tests__/results-view.a11y.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Render results view with mock data | 15 min |
| 2 | Test no axe violations | 5 min |
| 3 | Test tab navigation is accessible | 10 min |
| 4 | Test download button is labeled | 5 min |

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

// Note: ResultsView may need mocked providers/context.
// Adjust imports based on actual component requirements.

describe('ResultsView accessibility', () => {
  it('tab navigation has no axe violations', async () => {
    const { container } = render(
      <div role="tablist" aria-label="Result sections">
        <button role="tab" aria-selected="true" aria-controls="panel-resume">Resume</button>
        <button role="tab" aria-selected="false" aria-controls="panel-cover">Cover Letter</button>
        <div role="tabpanel" id="panel-resume" aria-labelledby="tab-resume">
          <p>Resume content here</p>
        </div>
      </div>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('download button has accessible label', () => {
    render(
      <button aria-label="Download resume as PDF">Download PDF</button>
    );
    const button = screen.getByRole('button', { name: /download/i });
    expect(button).toBeDefined();
  });

  it('results content sections have headings', () => {
    const { container } = render(
      <div>
        <h2>Professional Summary</h2>
        <p>Content...</p>
        <h2>Experience</h2>
        <p>Content...</p>
      </div>
    );
    const headings = container.querySelectorAll('h2');
    expect(headings.length).toBeGreaterThan(0);
  });
});
```

**Total effort:** 35 min

---

## Story 3: Make Lighthouse Accessibility Gate Blocking

### User Story

> As a team lead, I want CI to fail when accessibility regresses below 90 so that we never ship inaccessible features.

### Acceptance Criteria

- [ ] Lighthouse CI config no longer has `|| true` on the accessibility check
- [ ] Accessibility threshold is set to `>= 90`
- [ ] CI pipeline fails if score drops below 90
- [ ] Current score meets the 90 threshold (verified before enabling)

### Tasks

#### Task 3.1: Update Lighthouse CI configuration

**File:** Lighthouse CI config (likely `.lighthouserc.js`, `lighthouserc.json`, or CI workflow file)

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Locate the Lighthouse CI configuration file | 5 min |
| 2 | Remove `\|\| true` from the accessibility assertion | 5 min |
| 3 | Set `accessibility >= 0.9` in assertions | 5 min |
| 4 | Run Lighthouse locally to verify current score meets threshold | 15 min |

**Example configuration change:**

```js
// Before:
// assertions: { 'categories:accessibility': ['warn', { minScore: 0.9 }] }
// or: lighthouse --accessibility || true

// After:
module.exports = {
  ci: {
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.9 }],
      },
    },
  },
};
```

**Total effort:** 30 min

---

## Story 4: Add Missing ARIA Attributes

### User Story

> As a screen reader user, I want loading states and live updates to be announced so that I know when the application is processing my request.

### Acceptance Criteria

- [ ] `Button` loading state has `aria-busy="true"` (covered by Charter 10 Epic 01 Story 2)
- [ ] Pipeline view SSE progress updates are wrapped in `aria-live="polite"` region
- [ ] Pipeline error/timeout states use `aria-live="assertive"` (covered by Charter 10 Epic 02)
- [ ] Chat interface typing indicator has `aria-live="polite"`

### Tasks

#### Task 4.1: Add `aria-live` to pipeline SSE progress

**File:** `apps/web/src/components/pipeline/pipeline-view.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Wrap the progress/status display section in a `<div aria-live="polite" aria-atomic="true">` | 10 min |
| 2 | Ensure specialist step updates trigger screen reader announcements | 10 min |

**Implementation:**

```tsx
// In pipeline-view.tsx, wrap the progress section:
<div aria-live="polite" aria-atomic="true" aria-label="Generation progress">
  {currentStep && (
    <p className="text-sm text-[var(--color-text-secondary)]">
      {currentStep.label}... ({completedSteps}/{totalSteps})
    </p>
  )}
</div>
```

**Total effort:** 20 min

#### Task 4.2: Add `aria-live` to chat typing indicator

**File:** `apps/web/src/components/onboarding-v2/chat-interface.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Locate the typing/loading indicator in the chat interface | 5 min |
| 2 | Wrap it in `aria-live="polite"` with descriptive `aria-label` | 5 min |

**Implementation:**

```tsx
// Wrap typing indicator:
<div aria-live="polite" aria-label="Assistant is typing">
  {isLoading && <TypingIndicator />}
</div>
```

**Total effort:** 10 min

#### Task 4.3: Verify ARIA attributes with tests

**File:** `apps/web/src/components/pipeline/__tests__/pipeline-view.a11y.test.tsx` (extend existing)

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Assert `aria-live="polite"` exists on progress region | 5 min |
| 2 | Assert `aria-atomic="true"` exists on progress region | 5 min |

**Implementation:**

```typescript
it('SSE progress region has aria-live="polite"', () => {
  const { container } = render(/* pipeline view with progress */);
  const liveRegion = container.querySelector('[aria-live="polite"]');
  expect(liveRegion).not.toBeNull();
  expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
});
```

**Total effort:** 10 min

---

## Total Epic Effort

| Story | Effort |
|-------|--------|
| Story 1: Install A11y Testing Infrastructure | ~14 min |
| Story 2: Accessibility Tests for 5 Critical Components | ~2 hours 45 min |
| Story 3: Make Lighthouse Gate Blocking | ~30 min |
| Story 4: Add Missing ARIA Attributes | ~40 min |
| **Total** | **~4 hours 9 min** |
