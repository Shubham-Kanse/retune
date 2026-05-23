# Epic 01 — PostHog Integration

## Overview

Replace the console.log analytics stub with real PostHog event capture on both client and server, define a canonical event taxonomy, and wire events into all key user flows.

---

## Story 1: Install PostHog SDKs and Create Client Instances

### User Story

As a developer, I want PostHog client and server instances configured so that I can capture events from both browser and server contexts.

### Acceptance Criteria

- `posthog-js` and `posthog-node` are listed in `apps/web/package.json` dependencies
- `apps/web/src/lib/posthog.ts` exports a singleton client-side PostHog instance
- `apps/web/src/lib/posthog-server.ts` exports a singleton server-side PostHog client
- Both modules read `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` from environment
- Importing either module in a test environment does not throw

### Tasks

#### Task 1.1: Install packages

**Effort:** 5 min

```bash
pnpm --filter @retune/web add posthog-js posthog-node
```

#### Task 1.2: Create `apps/web/src/lib/posthog.ts`

**Effort:** 15 min

```typescript
import posthog from 'posthog-js';

let initialized = false;

export function getPostHog() {
  if (typeof window === 'undefined') return null;
  if (!initialized) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
    if (key) {
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        capture_pageleave: true,
      });
      initialized = true;
    }
  }
  return posthog;
}
```

#### Task 1.3: Create `apps/web/src/lib/posthog-server.ts`

**Effort:** 15 min

```typescript
import { PostHog } from 'posthog-node';

let client: PostHog | null = null;

export function getPostHogServer(): PostHog {
  if (!client) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) throw new Error('NEXT_PUBLIC_POSTHOG_KEY is not set');
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    });
  }
  return client;
}
```

#### Task 1.4: Add env vars to `.env.example`

**Effort:** 5 min

Add to `/Users/shubhamkanse/retune/.env.example`:

```env
# ─── Analytics (OPTIONAL) ────────────────────────────────────────────────────
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### Tests

**File:** `apps/web/src/lib/__tests__/posthog.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('posthog client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
  });

  it('returns null on server (no window)', async () => {
    const originalWindow = global.window;
    // @ts-expect-error — simulate server
    delete (global as any).window;
    const { getPostHog } = await import('../posthog');
    expect(getPostHog()).toBeNull();
    global.window = originalWindow;
  });
});
```

---

## Story 2: Define Event Taxonomy

### User Story

As a product manager, I want a single source of truth for all tracked events so that naming is consistent and discoverable.

### Acceptance Criteria

- `apps/web/src/lib/analytics-events.ts` exports typed event name constants
- Events cover: auth, onboarding, generation, billing, results
- Each event has a typed properties interface

### Tasks

#### Task 2.1: Create `apps/web/src/lib/analytics-events.ts`

**Effort:** 30 min

```typescript
export const AnalyticsEvents = {
  // Auth
  USER_SIGNED_UP: 'user_signed_up',
  USER_SIGNED_IN: 'user_signed_in',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Generation
  GENERATION_STARTED: 'generation_started',
  GENERATION_COMPLETED: 'generation_completed',
  GENERATION_FAILED: 'generation_failed',

  // Billing
  UPGRADE_MODAL_OPENED: 'upgrade_modal_opened',
  UPGRADE_CLICKED: 'upgrade_clicked',
  SUBSCRIPTION_CREATED: 'subscription_created',

  // Results
  RESULT_DOWNLOADED: 'result_downloaded',
  RESULT_REFINED: 'result_refined',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export interface EventProperties {
  user_signed_up: { method: 'email' | 'google' | 'github' };
  user_signed_in: { method: 'email' | 'google' | 'github' };
  onboarding_started: { version: string };
  onboarding_completed: { version: string; duration_ms: number };
  generation_started: { job_type: string; source: string };
  generation_completed: { job_type: string; duration_ms: number };
  generation_failed: { job_type: string; error: string };
  upgrade_modal_opened: { trigger: string };
  upgrade_clicked: { plan: string };
  subscription_created: { plan: string; amount_cents: number };
  result_downloaded: { format: string };
  result_refined: { refinement_type: string };
}
```

### Tests

**File:** `apps/web/src/lib/__tests__/analytics-events.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { AnalyticsEvents } from '../analytics-events';

describe('AnalyticsEvents', () => {
  it('has snake_case event names', () => {
    for (const value of Object.values(AnalyticsEvents)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('contains all required events', () => {
    const required = [
      'user_signed_up', 'user_signed_in',
      'onboarding_started', 'onboarding_completed',
      'generation_started', 'generation_completed', 'generation_failed',
      'upgrade_modal_opened', 'upgrade_clicked', 'subscription_created',
      'result_downloaded', 'result_refined',
    ];
    const values = Object.values(AnalyticsEvents);
    for (const event of required) {
      expect(values).toContain(event);
    }
  });
});
```

---

## Story 3: Replace Analytics Stub with PostHog Calls

### User Story

As a developer, I want `trackEvent` to send real events to PostHog so that product usage is measurable.

### Acceptance Criteria

- `apps/web/src/lib/analytics.ts` calls `posthog.capture()` instead of `console.log`
- The function is type-safe using the event taxonomy
- In environments without a PostHog key, calls are no-ops (no errors)
- Existing call sites continue to work without changes

### Tasks

#### Task 3.1: Rewrite `apps/web/src/lib/analytics.ts`

**Effort:** 20 min

```typescript
import { getPostHog } from './posthog';
import type { AnalyticsEvent, EventProperties } from './analytics-events';

export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  properties?: E extends keyof EventProperties ? EventProperties[E] : Record<string, unknown>
) {
  const ph = getPostHog();
  if (ph) {
    ph.capture(event, properties);
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  const ph = getPostHog();
  if (ph) {
    ph.identify(userId, traits);
  }
}

export function resetAnalytics() {
  const ph = getPostHog();
  if (ph) {
    ph.reset();
  }
}
```

### Tests

**File:** `apps/web/src/lib/__tests__/analytics.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../posthog', () => ({
  getPostHog: vi.fn(),
}));

describe('trackEvent', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls posthog.capture with event name and properties', async () => {
    const mockCapture = vi.fn();
    const { getPostHog } = await import('../posthog');
    (getPostHog as any).mockReturnValue({ capture: mockCapture });

    const { trackEvent } = await import('../analytics');
    trackEvent('generation_started', { job_type: 'resume', source: 'web' });

    expect(mockCapture).toHaveBeenCalledWith('generation_started', {
      job_type: 'resume',
      source: 'web',
    });
  });

  it('does not throw when PostHog is null', async () => {
    const { getPostHog } = await import('../posthog');
    (getPostHog as any).mockReturnValue(null);

    const { trackEvent } = await import('../analytics');
    expect(() => trackEvent('generation_started', { job_type: 'resume', source: 'web' })).not.toThrow();
  });
});
```

---

## Story 4: Wire Events into Key User Flows

### User Story

As a product manager, I want analytics events fired at each critical user action so that I can measure funnel conversion.

### Acceptance Criteria

- `user_signed_up` fires on successful signup in `apps/web/src/app/(auth)/signup/page.tsx`
- `user_signed_in` fires on successful login in `apps/web/src/app/(auth)/login/page.tsx`
- `onboarding_started` fires on mount of `apps/web/src/app/(app)/onboarding-v2/page.tsx`
- `onboarding_completed` fires on final step completion in the same page
- `generation_started` fires when user submits in `apps/web/src/app/(app)/generate/new/page.tsx`
- `generation_completed` fires in the results view component
- `result_downloaded` fires on download click in results view

### Tasks

#### Task 4.1: Wire signup event

**Effort:** 10 min  
**File:** `apps/web/src/app/(auth)/signup/page.tsx`

Add after successful signup response:

```typescript
import { trackEvent } from '@/lib/analytics';
import { AnalyticsEvents } from '@/lib/analytics-events';

// After successful signup:
trackEvent(AnalyticsEvents.USER_SIGNED_UP, { method: 'email' });
```

#### Task 4.2: Wire login event

**Effort:** 10 min  
**File:** `apps/web/src/app/(auth)/login/page.tsx`

```typescript
import { trackEvent } from '@/lib/analytics';
import { AnalyticsEvents } from '@/lib/analytics-events';

// After successful login:
trackEvent(AnalyticsEvents.USER_SIGNED_IN, { method: 'email' });
```

#### Task 4.3: Wire onboarding events

**Effort:** 15 min  
**File:** `apps/web/src/app/(app)/onboarding-v2/page.tsx`

```typescript
import { trackEvent } from '@/lib/analytics';
import { AnalyticsEvents } from '@/lib/analytics-events';

// On mount:
trackEvent(AnalyticsEvents.ONBOARDING_STARTED, { version: 'v2' });

// On final step completion:
trackEvent(AnalyticsEvents.ONBOARDING_COMPLETED, { version: 'v2', duration_ms });
```

#### Task 4.4: Wire generation events

**Effort:** 15 min  
**File:** `apps/web/src/app/(app)/generate/new/page.tsx`

```typescript
import { trackEvent } from '@/lib/analytics';
import { AnalyticsEvents } from '@/lib/analytics-events';

// On submit:
trackEvent(AnalyticsEvents.GENERATION_STARTED, { job_type: 'resume', source: 'generate_page' });
```

#### Task 4.5: Wire results events

**Effort:** 15 min  
**File:** `apps/web/src/components/results-view.tsx` (or equivalent results component)

```typescript
import { trackEvent } from '@/lib/analytics';
import { AnalyticsEvents } from '@/lib/analytics-events';

// On generation complete callback:
trackEvent(AnalyticsEvents.GENERATION_COMPLETED, { job_type: 'resume', duration_ms });

// On download click:
trackEvent(AnalyticsEvents.RESULT_DOWNLOADED, { format: 'pdf' });
```

### Tests

**File:** `apps/web/src/lib/__tests__/analytics-wiring.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../posthog', () => ({
  getPostHog: vi.fn(),
}));

describe('generation_started event wiring', () => {
  it('captures generation_started with correct properties', async () => {
    const mockCapture = vi.fn();
    const { getPostHog } = await import('../posthog');
    (getPostHog as any).mockReturnValue({ capture: mockCapture });

    const { trackEvent } = await import('../analytics');
    trackEvent('generation_started', { job_type: 'resume', source: 'generate_page' });

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith('generation_started', {
      job_type: 'resume',
      source: 'generate_page',
    });
  });
});
```

---

## Story 5: PostHog Provider Component

### User Story

As a developer, I want PostHog initialized once at the app root so that page views and session recording work automatically.

### Acceptance Criteria

- `apps/web/src/components/posthog-provider.tsx` wraps the app with PostHog context
- Provider is added to `apps/web/src/app/layout.tsx`
- Page views are captured on route change

### Tasks

#### Task 5.1: Create `apps/web/src/components/posthog-provider.tsx`

**Effort:** 20 min

```typescript
'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getPostHog } from '@/lib/posthog';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ph = getPostHog();
    if (ph) {
      ph.capture('$pageview', {
        $current_url: `${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`,
      });
    }
  }, [pathname, searchParams]);

  return <>{children}</>;
}
```

#### Task 5.2: Add provider to `apps/web/src/app/layout.tsx`

**Effort:** 5 min

```typescript
import { PostHogProvider } from '@/components/posthog-provider';

// Wrap children:
<PostHogProvider>{children}</PostHogProvider>
```

### Tests

**File:** `apps/web/src/components/__tests__/posthog-provider.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/posthog', () => ({
  getPostHog: () => ({ capture: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useSearchParams: () => ({ toString: () => '' }),
}));

describe('PostHogProvider', () => {
  it('renders children', async () => {
    const { PostHogProvider } = await import('../posthog-provider');
    const { getByText } = render(
      <PostHogProvider><span>child</span></PostHogProvider>
    );
    expect(getByText('child')).toBeDefined();
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 1 — Install & Create Instances | 40 min |
| 2 — Event Taxonomy | 30 min |
| 3 — Replace Stub | 20 min |
| 4 — Wire Events | 65 min |
| 5 — Provider Component | 25 min |
| **Total** | **~3 hours** |
