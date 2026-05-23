# Epic 02 — Feature Flags

## Overview

Replace the hardcoded env-var feature flag system with PostHog remote feature flags, providing a local fallback for offline/test environments and a declarative `FeatureGate` React component.

---

## Story 1: Replace Feature Flags Module with PostHog Flags

### User Story

As a developer, I want feature flags evaluated remotely via PostHog so that I can toggle features without redeploying.

### Acceptance Criteria

- `apps/web/src/lib/feature-flags.ts` is rewritten to use PostHog server-side flag evaluation
- In test environments, flags return `false` by default
- When PostHog is unavailable, falls back to env-var values
- Existing call sites (`isFeatureEnabled('ONBOARDING_V2')`) continue to work

### Tasks

#### Task 1.1: Rewrite `apps/web/src/lib/feature-flags.ts`

**Effort:** 30 min  
**File:** `apps/web/src/lib/feature-flags.ts`

```typescript
import { getPostHogServer } from './posthog-server';

const ENV_FALLBACKS: Record<string, string | undefined> = {
  ONBOARDING_V2: process.env.NEXT_PUBLIC_ONBOARDING_V2,
  ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING,
  FREE_GENERATION_LIMIT: process.env.NEXT_PUBLIC_FREE_GENERATION_LIMIT,
};

export async function isFeatureEnabled(flag: string, userId?: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') return false;

  try {
    const client = getPostHogServer();
    const result = await client.isFeatureEnabled(flag, userId ?? 'anonymous');
    return result ?? false;
  } catch {
    // Fallback to env var
    const envValue = ENV_FALLBACKS[flag];
    return envValue === 'true' || envValue === '1';
  }
}

export async function getFeatureFlagPayload(flag: string, userId?: string): Promise<unknown> {
  if (process.env.NODE_ENV === 'test') return null;

  try {
    const client = getPostHogServer();
    return await client.getFeatureFlagPayload(flag, userId ?? 'anonymous');
  } catch {
    return null;
  }
}
```

#### Task 1.2: Create client-side hook `apps/web/src/lib/use-feature-flag.ts`

**Effort:** 20 min

```typescript
'use client';

import { useEffect, useState } from 'react';
import { getPostHog } from './posthog';

export function useFeatureFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const ph = getPostHog();
    if (ph) {
      const value = ph.isFeatureEnabled(flag);
      setEnabled(!!value);

      ph.onFeatureFlags(() => {
        setEnabled(!!ph.isFeatureEnabled(flag));
      });
    }
  }, [flag]);

  return enabled;
}
```

### Tests

**File:** `apps/web/src/lib/__tests__/feature-flags.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./posthog-server', () => ({
  getPostHogServer: vi.fn(),
}));

describe('isFeatureEnabled', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv });
    vi.resetModules();
  });

  it('returns false in test environment', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test' });
    const { isFeatureEnabled } = await import('../feature-flags');
    const result = await isFeatureEnabled('ONBOARDING_V2', 'user-123');
    expect(result).toBe(false);
  });

  it('returns PostHog value when available', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' });
    const mockIsFeatureEnabled = vi.fn().mockResolvedValue(true);
    const { getPostHogServer } = await import('../posthog-server');
    (getPostHogServer as any).mockReturnValue({ isFeatureEnabled: mockIsFeatureEnabled });

    const { isFeatureEnabled } = await import('../feature-flags');
    const result = await isFeatureEnabled('ONBOARDING_V2', 'user-123');

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('ONBOARDING_V2', 'user-123');
    expect(result).toBe(true);
  });

  it('falls back to env var when PostHog throws', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' });
    process.env.NEXT_PUBLIC_ONBOARDING_V2 = 'true';
    const { getPostHogServer } = await import('../posthog-server');
    (getPostHogServer as any).mockImplementation(() => { throw new Error('unavailable'); });

    const { isFeatureEnabled } = await import('../feature-flags');
    const result = await isFeatureEnabled('ONBOARDING_V2');
    expect(result).toBe(true);
  });
});
```

---

## Story 2: Migrate Existing Flags to PostHog

### User Story

As a product manager, I want existing feature flags managed in PostHog so that I can toggle them from the PostHog dashboard without code changes.

### Acceptance Criteria

- The following flags are created in PostHog: `ONBOARDING_V2`, `ENABLE_BILLING`, `FREE_GENERATION_LIMIT`
- Documentation exists for how to create/manage flags in PostHog
- Env-var fallbacks remain for local development without PostHog

### Tasks

#### Task 2.1: Create flag setup documentation

**Effort:** 20 min  
**File:** `docs/charters/15-growth-analytics/posthog-flags-setup.md`

Document the following PostHog flag configurations:

| Flag Name | Type | Default | Description |
|-----------|------|---------|-------------|
| `ONBOARDING_V2` | Boolean | `true` | Enables the v2 onboarding flow |
| `ENABLE_BILLING` | Boolean | `true` | Enables billing/subscription features |
| `FREE_GENERATION_LIMIT` | Multivariate | `30` | Number of free generations allowed |

#### Task 2.2: Update existing flag call sites

**Effort:** 15 min

Verify all existing usages of `isFeatureEnabled` pass the user ID where available:

```typescript
// Before:
const enabled = isFeatureEnabled('ONBOARDING_V2');

// After (where user context is available):
const enabled = await isFeatureEnabled('ONBOARDING_V2', user.id);
```

Search files:
- `apps/web/src/app/(app)/onboarding-v2/page.tsx`
- `apps/web/src/components/billing/`
- `apps/web/src/app/(app)/generate/`

### Tests

**File:** `apps/web/src/lib/__tests__/feature-flags-migration.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('./posthog-server', () => ({
  getPostHogServer: vi.fn(() => ({
    isFeatureEnabled: vi.fn().mockResolvedValue(true),
  })),
}));

describe('migrated flags', () => {
  it('ONBOARDING_V2 resolves via PostHog', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' });
    const { isFeatureEnabled } = await import('../feature-flags');
    const result = await isFeatureEnabled('ONBOARDING_V2', 'user-456');
    expect(result).toBe(true);
  });

  it('ENABLE_BILLING resolves via PostHog', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' });
    const { isFeatureEnabled } = await import('../feature-flags');
    const result = await isFeatureEnabled('ENABLE_BILLING', 'user-456');
    expect(result).toBe(true);
  });
});
```

---

## Story 3: Create FeatureGate Component

### User Story

As a developer, I want a declarative `FeatureGate` component so that I can conditionally render UI based on feature flags without imperative checks.

### Acceptance Criteria

- `apps/web/src/components/feature-gate.tsx` exports `FeatureGate`
- Component accepts `flag`, `children`, and optional `fallback` props
- When flag is disabled, renders `fallback` (or nothing)
- When flag is enabled, renders `children`

### Tasks

#### Task 3.1: Create `apps/web/src/components/feature-gate.tsx`

**Effort:** 15 min

```typescript
'use client';

import type { ReactNode } from 'react';
import { useFeatureFlag } from '@/lib/use-feature-flag';

interface FeatureGateProps {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ flag, children, fallback }: FeatureGateProps) {
  const enabled = useFeatureFlag(flag);
  return <>{enabled ? children : (fallback ?? null)}</>;
}
```

#### Task 3.2: Export from component index

**Effort:** 5 min

Ensure `FeatureGate` is importable from `@/components/feature-gate`.

### Tests

**File:** `apps/web/src/components/__tests__/feature-gate.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

describe('FeatureGate', () => {
  it('renders children when flag is enabled', async () => {
    vi.doMock('@/lib/use-feature-flag', () => ({
      useFeatureFlag: () => true,
    }));

    const { FeatureGate } = await import('../feature-gate');
    const { getByText } = render(
      <FeatureGate flag="TEST_FLAG">
        <span>enabled content</span>
      </FeatureGate>
    );
    expect(getByText('enabled content')).toBeDefined();
  });

  it('renders fallback when flag is disabled', async () => {
    vi.doMock('@/lib/use-feature-flag', () => ({
      useFeatureFlag: () => false,
    }));

    const { FeatureGate } = await import('../feature-gate');
    const { getByText } = render(
      <FeatureGate flag="TEST_FLAG" fallback={<span>fallback content</span>}>
        <span>enabled content</span>
      </FeatureGate>
    );
    expect(getByText('fallback content')).toBeDefined();
  });

  it('renders nothing when flag is disabled and no fallback provided', async () => {
    vi.doMock('@/lib/use-feature-flag', () => ({
      useFeatureFlag: () => false,
    }));

    const { FeatureGate } = await import('../feature-gate');
    const { container } = render(
      <FeatureGate flag="TEST_FLAG">
        <span>enabled content</span>
      </FeatureGate>
    );
    expect(container.innerHTML).toBe('');
  });
});
```

---

## Story 4: Server-Side Feature Gate for Pages

### User Story

As a developer, I want to gate entire pages or server components behind feature flags so that unreleased pages are inaccessible.

### Acceptance Criteria

- `apps/web/src/lib/server-feature-gate.ts` exports a helper for server components
- Returns a redirect or 404 when flag is disabled
- Works in Next.js App Router server components

### Tasks

#### Task 4.1: Create `apps/web/src/lib/server-feature-gate.ts`

**Effort:** 15 min

```typescript
import { redirect } from 'next/navigation';
import { isFeatureEnabled } from './feature-flags';

export async function requireFeatureFlag(flag: string, userId?: string): Promise<void> {
  const enabled = await isFeatureEnabled(flag, userId);
  if (!enabled) {
    redirect('/');
  }
}
```

#### Task 4.2: Use in onboarding-v2 page

**Effort:** 10 min  
**File:** `apps/web/src/app/(app)/onboarding-v2/page.tsx`

```typescript
import { requireFeatureFlag } from '@/lib/server-feature-gate';

export default async function OnboardingV2Page() {
  await requireFeatureFlag('ONBOARDING_V2', /* userId from session */);
  // ... rest of page
}
```

### Tests

**File:** `apps/web/src/lib/__tests__/server-feature-gate.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('./feature-flags', () => ({
  isFeatureEnabled: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('requireFeatureFlag', () => {
  it('redirects when flag is disabled', async () => {
    const { isFeatureEnabled } = await import('./feature-flags');
    (isFeatureEnabled as any).mockResolvedValue(false);
    const { redirect } = await import('next/navigation');

    const { requireFeatureFlag } = await import('./server-feature-gate');
    await requireFeatureFlag('DISABLED_FLAG', 'user-1');

    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('does not redirect when flag is enabled', async () => {
    const { isFeatureEnabled } = await import('./feature-flags');
    (isFeatureEnabled as any).mockResolvedValue(true);
    const { redirect } = await import('next/navigation');

    const { requireFeatureFlag } = await import('./server-feature-gate');
    await requireFeatureFlag('ENABLED_FLAG', 'user-1');

    expect(redirect).not.toHaveBeenCalled();
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 1 — Replace Flags Module | 50 min |
| 2 — Migrate Existing Flags | 35 min |
| 3 — FeatureGate Component | 20 min |
| 4 — Server-Side Gate | 25 min |
| **Total** | **~2.5 hours** |
