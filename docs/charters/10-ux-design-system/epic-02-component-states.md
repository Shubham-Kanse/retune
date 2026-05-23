# Epic 02: Component States

## Summary

Add missing error, timeout, empty, and loading skeleton states to the pipeline and results views, ensuring graceful degradation when SSE streams fail or generation produces no output.

---

## Story 1: Pipeline Error States

### User Story

> As a user, I want to see a clear error message when my resume generation fails due to a network issue so that I know what happened and can retry.

### Acceptance Criteria

- [ ] When SSE stream disconnects after 5 reconnection attempts, `<PipelineError onRetry={() => window.location.reload()} />` is rendered
- [ ] When generation exceeds 3 minutes without completing, `<PipelineTimeout />` is rendered
- [ ] When generation completes but produces no output sections, `<PipelineEmpty />` is rendered
- [ ] Each error component has a distinct visual treatment and actionable message
- [ ] Error states are announced to screen readers via `aria-live="assertive"`
- [ ] Vitest tests verify each state renders correctly

### Tasks

#### Task 1.1: Create `PipelineError` component

**File:** `apps/web/src/components/pipeline/pipeline-error.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Create component with error icon, message, and retry button | 20 min |
| 2 | Accept `onRetry` callback prop | 5 min |
| 3 | Add `role="alert"` and `aria-live="assertive"` | 5 min |

**Implementation:**

```tsx
'use client';

interface PipelineErrorProps {
  onRetry: () => void;
}

export function PipelineError({ onRetry }: PipelineErrorProps) {
  return (
    <div role="alert" aria-live="assertive" className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
        <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Connection Lost</h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        We lost connection to the generation service after multiple retry attempts. Your progress has been saved.
      </p>
      <button
        onClick={onRetry}
        className="rounded-md bg-[var(--color-interactive-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-brand)] hover:bg-[var(--color-interactive-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive-focus-ring)]"
      >
        Retry
      </button>
    </div>
  );
}
```

**Total effort:** 30 min

#### Task 1.2: Create `PipelineTimeout` component

**File:** `apps/web/src/components/pipeline/pipeline-timeout.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Create component with clock icon and timeout message | 15 min |
| 2 | Add `role="alert"` and `aria-live="assertive"` | 5 min |
| 3 | Include a reload action | 5 min |

**Implementation:**

```tsx
'use client';

export function PipelineTimeout() {
  return (
    <div role="alert" aria-live="assertive" className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/20">
        <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Generation Timed Out</h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        The generation is taking longer than expected (over 3 minutes). This may be due to high demand.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-[var(--color-interactive-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-on-brand)] hover:bg-[var(--color-interactive-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-interactive-focus-ring)]"
      >
        Try Again
      </button>
    </div>
  );
}
```

**Total effort:** 25 min

#### Task 1.3: Create `PipelineEmpty` component

**File:** `apps/web/src/components/pipeline/pipeline-empty.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Create component with empty state icon and message | 15 min |
| 2 | Add `role="status"` and `aria-live="polite"` | 5 min |

**Implementation:**

```tsx
'use client';

export function PipelineEmpty() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-neutral-100 p-3 dark:bg-neutral-800">
        <svg className="h-6 w-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">No Output Generated</h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        The generation completed but produced no output. This usually means the input data was insufficient. Try updating your profile with more details.
      </p>
    </div>
  );
}
```

**Total effort:** 20 min

#### Task 1.4: Integrate error states into `pipeline-view.tsx`

**File:** `apps/web/src/components/pipeline/pipeline-view.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Add `reconnectAttempts` counter state, increment on SSE `onerror` | 15 min |
| 2 | Add `startTime` ref, set on mount/stream start | 5 min |
| 3 | Add `useEffect` with interval checking elapsed time > 180000ms | 10 min |
| 4 | Add state enum: `'streaming' | 'error' | 'timeout' | 'empty' | 'complete'` | 10 min |
| 5 | Render `<PipelineError>` when `reconnectAttempts >= 5` | 5 min |
| 6 | Render `<PipelineTimeout>` when elapsed > 3 min without completion | 5 min |
| 7 | Render `<PipelineEmpty>` when stream completes with zero output sections | 5 min |

**Integration pattern:**

```tsx
// Inside pipeline-view.tsx

import { PipelineError } from './pipeline-error';
import { PipelineTimeout } from './pipeline-timeout';
import { PipelineEmpty } from './pipeline-empty';

// Add to component state:
const [pipelineStatus, setPipelineStatus] = useState<'streaming' | 'error' | 'timeout' | 'empty' | 'complete'>('streaming');
const reconnectAttemptsRef = useRef(0);
const startTimeRef = useRef(Date.now());

// In SSE error handler:
reconnectAttemptsRef.current += 1;
if (reconnectAttemptsRef.current >= 5) {
  setPipelineStatus('error');
}

// Timeout check effect:
useEffect(() => {
  const interval = setInterval(() => {
    if (pipelineStatus === 'streaming' && Date.now() - startTimeRef.current > 180_000) {
      setPipelineStatus('timeout');
    }
  }, 5000);
  return () => clearInterval(interval);
}, [pipelineStatus]);

// In render:
if (pipelineStatus === 'error') return <PipelineError onRetry={() => window.location.reload()} />;
if (pipelineStatus === 'timeout') return <PipelineTimeout />;
if (pipelineStatus === 'empty') return <PipelineEmpty />;
```

**Total effort:** 55 min

#### Task 1.5: Write vitest tests for pipeline error states

**File:** `apps/web/src/components/pipeline/__tests__/pipeline-states.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Test `PipelineError` renders with retry button | 10 min |
| 2 | Test `PipelineError` calls `onRetry` when button clicked | 10 min |
| 3 | Test `PipelineTimeout` renders with timeout message | 10 min |
| 4 | Test `PipelineEmpty` renders with empty message | 10 min |
| 5 | Test ARIA attributes on all components | 10 min |

**Implementation:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PipelineError } from '../pipeline-error';
import { PipelineTimeout } from '../pipeline-timeout';
import { PipelineEmpty } from '../pipeline-empty';

describe('PipelineError', () => {
  it('renders error message', () => {
    render(<PipelineError onRetry={() => {}} />);
    expect(screen.getByText('Connection Lost')).toBeDefined();
  });

  it('renders retry button', () => {
    render(<PipelineError onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<PipelineError onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('has role="alert" for screen reader announcement', () => {
    render(<PipelineError onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('has aria-live="assertive"', () => {
    render(<PipelineError onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });
});

describe('PipelineTimeout', () => {
  it('renders timeout message', () => {
    render(<PipelineTimeout />);
    expect(screen.getByText('Generation Timed Out')).toBeDefined();
  });

  it('mentions 3 minutes in description', () => {
    render(<PipelineTimeout />);
    expect(screen.getByText(/over 3 minutes/)).toBeDefined();
  });

  it('has role="alert"', () => {
    render(<PipelineTimeout />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders try again button', () => {
    render(<PipelineTimeout />);
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeDefined();
  });
});

describe('PipelineEmpty', () => {
  it('renders empty state message', () => {
    render(<PipelineEmpty />);
    expect(screen.getByText('No Output Generated')).toBeDefined();
  });

  it('has role="status"', () => {
    render(<PipelineEmpty />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('has aria-live="polite"', () => {
    render(<PipelineEmpty />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('provides guidance to the user', () => {
    render(<PipelineEmpty />);
    expect(screen.getByText(/updating your profile/)).toBeDefined();
  });
});
```

**Assertions:**
- `PipelineError` renders "Connection Lost" heading
- `PipelineError` retry button calls the `onRetry` callback
- `PipelineError` has `role="alert"` and `aria-live="assertive"`
- `PipelineTimeout` renders "Generation Timed Out" heading
- `PipelineTimeout` mentions the 3-minute threshold
- `PipelineTimeout` has `role="alert"`
- `PipelineEmpty` renders "No Output Generated" heading
- `PipelineEmpty` has `role="status"` and `aria-live="polite"`

**Total effort:** 50 min

---

## Story 2: Results View Loading Skeleton

### User Story

> As a user, I want to see a skeleton placeholder while my results are loading so that I know content is coming and the page doesn't feel broken.

### Acceptance Criteria

- [ ] A `<ResultsSkeleton />` component exists that mimics the layout of the results view
- [ ] The skeleton is shown when results data is `undefined` or loading
- [ ] Skeleton uses `animate-pulse` for shimmer effect
- [ ] Skeleton is accessible: `aria-busy="true"` on the container, `aria-label="Loading results"`
- [ ] Vitest test verifies skeleton renders and has correct ARIA attributes

### Tasks

#### Task 2.1: Create `ResultsSkeleton` component

**File:** `apps/web/src/components/results/results-skeleton.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Create skeleton layout matching results-view structure (header, sections, download button) | 30 min |
| 2 | Use `animate-pulse` on placeholder blocks | 5 min |
| 3 | Add `aria-busy="true"` and `aria-label="Loading results"` | 5 min |

**Implementation:**

```tsx
'use client';

export function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading results" className="flex flex-col gap-6 p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-10 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        ))}
      </div>

      {/* Content sections skeleton */}
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="h-5 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Total effort:** 40 min

#### Task 2.2: Integrate skeleton into `results-view.tsx`

**File:** `apps/web/src/components/results/results-view.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Import `ResultsSkeleton` | 2 min |
| 2 | Add early return rendering skeleton when data is loading/undefined | 10 min |

**Integration:**

```tsx
import { ResultsSkeleton } from './results-skeleton';

// Early in the component render:
if (!results || isLoading) {
  return <ResultsSkeleton />;
}
```

**Total effort:** 12 min

#### Task 2.3: Write vitest tests for ResultsSkeleton

**File:** `apps/web/src/components/results/__tests__/results-skeleton.test.tsx`

**Subtasks:**

| # | Description | Effort |
|---|-------------|--------|
| 1 | Test skeleton renders without error | 5 min |
| 2 | Test `aria-busy` attribute | 5 min |
| 3 | Test `aria-label` attribute | 5 min |
| 4 | Test animate-pulse elements exist | 5 min |

**Implementation:**

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ResultsSkeleton } from '../results-skeleton';

describe('ResultsSkeleton', () => {
  it('renders without error', () => {
    const { container } = render(<ResultsSkeleton />);
    expect(container.firstChild).not.toBeNull();
  });

  it('has aria-busy="true"', () => {
    const { container } = render(<ResultsSkeleton />);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });

  it('has aria-label="Loading results"', () => {
    const { container } = render(<ResultsSkeleton />);
    expect(container.firstChild).toHaveAttribute('aria-label', 'Loading results');
  });

  it('contains animated pulse elements', () => {
    const { container } = render(<ResultsSkeleton />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('matches snapshot', () => {
    const { container } = render(<ResultsSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
```

**Assertions:**
- Component renders without throwing
- Root element has `aria-busy="true"`
- Root element has `aria-label="Loading results"`
- Multiple `.animate-pulse` elements exist
- Snapshot matches expected structure

**Total effort:** 20 min

---

## Total Epic Effort

| Story | Effort |
|-------|--------|
| Story 1: Pipeline Error States | ~3 hours |
| Story 2: Results View Loading Skeleton | ~1 hour 12 min |
| **Total** | **~4 hours 12 min** |
