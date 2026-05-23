# Epic 02 — Frontend Bundle

## Overview

Reduce the initial JavaScript bundle size below 200KB gzipped by dynamically importing heavy 3D/shader libraries, optimising images, and enforcing bundle budgets and Lighthouse gates in CI.

---

## Story 1: Dynamic Import Three.js and Shader Libraries

### User Story

As a visitor on a mobile connection, I want the landing page to load without downloading 500KB+ of 3D libraries upfront so that I see meaningful content within 2 seconds.

### Acceptance Criteria

- [ ] `three`, `@react-three/fiber`, `@react-three/drei` are NOT in the initial JS bundle
- [ ] The Three.js orb component in `apps/web/src/components/landing/` is loaded via `next/dynamic` with `ssr: false`
- [ ] A skeleton placeholder renders while the 3D component loads
- [ ] `@paper-design/shaders-react` is loaded via `next/dynamic` with `ssr: false`
- [ ] No static imports of these libraries exist in any non-dynamic code path
- [ ] Landing page renders without JavaScript errors when the dynamic chunks load

### Tasks

#### Task 1.1: Convert Three.js orb component to dynamic import

**File:** `apps/web/src/components/landing/` (the file that imports Three.js — likely `orb-animation.tsx` or similar)

Find the parent component that renders the orb and replace the static import:

**Before:**
```typescript
import { OrbAnimation } from './orb-animation';
```

**After:**
```typescript
import dynamic from 'next/dynamic';

const OrbAnimation = dynamic(() => import('./orb-animation'), {
  ssr: false,
  loading: () => <div className="w-full h-64 bg-muted animate-pulse rounded-xl" />,
});
```

**Subtasks:**
- Identify which file in `apps/web/src/components/landing/` imports Three.js — **10 min**
- Identify the parent component that renders the Three.js component — **5 min**
- Replace static import with `next/dynamic` wrapper — **10 min**
- Add skeleton placeholder with matching dimensions — **10 min**
- Verify the page renders correctly in dev mode — **10 min**

**Effort:** 45 minutes

#### Task 1.2: Convert `@paper-design/shaders-react` to dynamic import

**File:** `apps/web/src/components/landing/` (the file that imports shaders)

Same pattern:

**Before:**
```typescript
import { ShaderComponent } from '@paper-design/shaders-react';
```

**After:**
```typescript
import dynamic from 'next/dynamic';

const ShaderComponent = dynamic(
  () => import('@paper-design/shaders-react').then(mod => ({ default: mod.ShaderComponent })),
  {
    ssr: false,
    loading: () => <div className="w-full h-64 bg-muted animate-pulse rounded-xl" />,
  }
);
```

Or if the shader usage is within the orb component itself, ensure the orb component file (already dynamically imported) contains the shader import — no further action needed since the entire chunk is deferred.

**Subtasks:**
- Locate all `@paper-design/shaders-react` imports — **10 min**
- Determine if they're already inside the dynamically-imported orb component — **5 min**
- If not, wrap with `next/dynamic` — **10 min**
- Verify no static references remain — **5 min**

**Effort:** 30 minutes

#### Task 1.3: Write test — Three.js is not statically imported

**File:** `apps/web/src/__tests__/landing-bundle.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LANDING_DIR = join(process.cwd(), 'apps/web/src/components/landing');

function getParentFiles(): string[] {
  // Get all .tsx/.ts files that are NOT the orb-animation component itself
  return readdirSync(LANDING_DIR, { recursive: true })
    .filter((f): f is string => typeof f === 'string')
    .filter(f => /\.(tsx?|jsx?)$/.test(f))
    .map(f => join(LANDING_DIR, f));
}

describe('Landing page bundle — no static Three.js imports', () => {
  it('does not statically import three in parent components', () => {
    const parentFiles = getParentFiles();
    const staticThreeImports: string[] = [];

    for (const file of parentFiles) {
      const content = readFileSync(file, 'utf-8');
      // Match static imports (not inside dynamic(() => import(...)))
      const lines = content.split('\n');
      for (const line of lines) {
        if (
          /^import\s+.*from\s+['"]three['"]/.test(line) ||
          /^import\s+.*from\s+['"]@react-three\//.test(line) ||
          /^import\s+.*from\s+['"]@paper-design\/shaders-react['"]/.test(line)
        ) {
          staticThreeImports.push(`${file}: ${line.trim()}`);
        }
      }
    }

    assert.deepStrictEqual(
      staticThreeImports,
      [],
      `Found static imports of heavy 3D libraries in landing components:\n${staticThreeImports.join('\n')}`
    );
  });

  it('uses next/dynamic for the orb animation component', () => {
    const parentFiles = getParentFiles();
    let foundDynamic = false;

    for (const file of parentFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('next/dynamic') && content.includes('orb')) {
        foundDynamic = true;
        break;
      }
    }

    assert.strictEqual(foundDynamic, true, 'Expected next/dynamic import for orb animation component');
  });

  it('dynamic import has ssr: false', () => {
    const parentFiles = getParentFiles();
    let hasSsrFalse = false;

    for (const file of parentFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('next/dynamic') && content.includes('ssr: false')) {
        hasSsrFalse = true;
        break;
      }
    }

    assert.strictEqual(hasSsrFalse, true, 'Expected ssr: false in dynamic import options');
  });
});
```

**Subtasks:**
- Create test file — **15 min**
- Add static import detection assertions — **10 min**
- Add dynamic import verification — **10 min**
- Run and verify pass — **5 min**

**Effort:** 40 minutes

---

## Story 2: Optimise Landing Page Image

### User Story

As a visitor, I want the landing page hero image to load quickly so that the Largest Contentful Paint occurs within 2.5 seconds.

### Acceptance Criteria

- [ ] `apps/web/public/images/orb.png` (907KB) is converted to `orb.webp` at quality 80
- [ ] The WebP file is < 200KB
- [ ] All references to `orb.png` are updated to `orb.webp`
- [ ] `<link rel="preload" as="image" href="/images/orb.webp" />` is added to the root layout
- [ ] The original `orb.png` is removed from the repository

### Tasks

#### Task 2.1: Convert PNG to WebP

**Command:**
```bash
npx sharp-cli --input apps/web/public/images/orb.png --output apps/web/public/images/orb.webp --format webp --quality 80
```

**Subtasks:**
- Run sharp-cli conversion — **5 min**
- Verify output file size is < 200KB — **2 min**
- Remove original `orb.png` — **2 min**

**Effort:** 9 minutes

#### Task 2.2: Update all references from `orb.png` to `orb.webp`

**Files to check:**
- `apps/web/src/components/landing/*.tsx`
- `apps/web/src/app/(marketing)/*.tsx`
- Any CSS files referencing the image

Search and replace:
```bash
grep -r "orb.png" apps/web/src/
```

Replace all occurrences:
```
orb.png → orb.webp
```

**Subtasks:**
- Find all references — **5 min**
- Update each reference — **10 min**
- Verify no remaining `orb.png` references — **5 min**

**Effort:** 20 minutes

#### Task 2.3: Add preload link to root layout

**File:** `apps/web/src/app/layout.tsx`

Inside the `<head>` section (or via Next.js metadata):

```typescript
// In the <head> or via next/head:
<link rel="preload" as="image" href="/images/orb.webp" />
```

If using Next.js App Router metadata API, add to the layout's metadata or use a `<Head>` component:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/images/orb.webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**Subtasks:**
- Add preload link to `apps/web/src/app/layout.tsx` — **10 min**
- Verify in browser devtools that the preload fires — **5 min**

**Effort:** 15 minutes

---

## Story 3: Add Bundle Size Budget to CI

### User Story

As a developer, I want CI to fail when the initial JS bundle exceeds 200KB gzipped so that bundle size regressions are caught before merge.

### Acceptance Criteria

- [ ] `@next/bundle-analyzer` is installed as a dev dependency in `apps/web`
- [ ] `apps/web/next.config.ts` wraps the config with `withBundleAnalyzer` when `ANALYZE=true`
- [ ] CI runs `ANALYZE=true pnpm --filter @retune/web build`
- [ ] CI step fails if initial JS bundle > 200KB gzipped
- [ ] Bundle analysis report is uploaded as a CI artifact

### Tasks

#### Task 3.1: Install `@next/bundle-analyzer`

**Command:**
```bash
pnpm --filter @retune/web add -D @next/bundle-analyzer
```

**Subtasks:**
- Install the package — **2 min**
- Verify it appears in `apps/web/package.json` devDependencies — **2 min**

**Effort:** 4 minutes

#### Task 3.2: Update `next.config.ts` to support bundle analysis

**File:** `apps/web/next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ... existing config
};

// Wrap with bundle analyzer when ANALYZE=true
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config: NextConfig) => config;

export default withBundleAnalyzer(nextConfig);
```

**Subtasks:**
- Add conditional bundle analyzer wrapper — **10 min**
- Test locally with `ANALYZE=true pnpm --filter @retune/web build` — **5 min**
- Verify `.next/analyze/` output is generated — **5 min**

**Effort:** 20 minutes

#### Task 3.3: Add CI step for bundle size check

**File:** `.github/workflows/cognitive-cycle.yml`

Add a new step after the build step:

```yaml
- name: Bundle size check
  working-directory: apps/web
  run: |
    ANALYZE=true pnpm --filter @retune/web build
    
    # Check initial bundle size (First Load JS)
    # next build outputs size info; parse .next/build-manifest.json
    node -e "
      const fs = require('fs');
      const path = require('path');
      const buildDir = path.join('.next');
      
      // Get all JS files in the initial chunks
      const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, 'build-manifest.json'), 'utf-8'));
      const pages = manifest.pages || {};
      const rootChunks = pages['/_app'] || [];
      
      let totalSize = 0;
      for (const chunk of rootChunks) {
        const filePath = path.join(buildDir, chunk);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          totalSize += stat.size;
        }
      }
      
      const gzippedEstimate = Math.round(totalSize * 0.3); // ~30% of raw = gzipped
      const budgetBytes = 200 * 1024; // 200KB
      
      console.log('Initial bundle (estimated gzipped):', Math.round(gzippedEstimate / 1024), 'KB');
      console.log('Budget:', 200, 'KB');
      
      if (gzippedEstimate > budgetBytes) {
        console.error('FAIL: Bundle size exceeds 200KB gzipped budget');
        process.exit(1);
      }
      console.log('PASS: Bundle within budget');
    "

- name: Upload bundle analysis
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: bundle-analysis
    path: apps/web/.next/analyze/
    retention-days: 7
```

**Subtasks:**
- Add bundle size check step to CI workflow — **15 min**
- Add artifact upload step — **5 min**
- Test by pushing a branch and verifying CI output — **10 min**

**Effort:** 30 minutes

---

## Story 4: Make Lighthouse CI Blocking

### User Story

As a team lead, I want Lighthouse CI to block merges when performance drops below thresholds so that we maintain a consistently fast user experience.

### Acceptance Criteria

- [ ] The `|| true` suffix is removed from the Lighthouse step in `.github/workflows/cognitive-cycle.yml`
- [ ] `lighthouserc.json` (or `.lighthouserc.js`) sets: `performance >= 85`, `accessibility >= 90`, `best-practices >= 90`
- [ ] CI fails when any threshold is not met
- [ ] The Lighthouse step runs against the production build (not dev server)

### Tasks

#### Task 4.1: Remove `|| true` from Lighthouse CI step

**File:** `.github/workflows/cognitive-cycle.yml`

Find the Lighthouse step and remove the non-blocking suffix:

**Before:**
```yaml
- name: Lighthouse CI
  run: lhci autorun || true
```

**After:**
```yaml
- name: Lighthouse CI
  run: lhci autorun
```

**Subtasks:**
- Locate the Lighthouse step in the workflow — **5 min**
- Remove `|| true` — **2 min**

**Effort:** 7 minutes

#### Task 4.2: Update Lighthouse configuration with thresholds

**File:** `lighthouserc.json` (or `.lighthouserc.js` — whichever exists in the repo root or `apps/web/`)

```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.90 }],
        "categories:best-practices": ["error", { "minScore": 0.90 }]
      }
    },
    "collect": {
      "startServerCommand": "pnpm --filter @retune/web start",
      "startServerReadyPattern": "ready on",
      "url": ["http://localhost:3000"],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop"
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**Subtasks:**
- Locate existing Lighthouse config file — **5 min**
- Update/create with performance, accessibility, and best-practices thresholds — **10 min**
- Set `numberOfRuns: 3` for stability — **2 min**
- Verify config is valid by running `lhci autorun --config=lighthouserc.json` locally — **10 min**

**Effort:** 27 minutes

---

## Story 5: Add Cache-Control Headers via Vercel Config

### User Story

As a returning visitor, I want static assets to be served from browser cache so that subsequent page loads are near-instant.

### Acceptance Criteria

- [ ] `apps/web/vercel.json` includes cache-control headers for static assets
- [ ] Images, fonts, and JS/CSS files get `public, max-age=31536000, immutable`
- [ ] HTML pages get `public, max-age=0, must-revalidate`

### Tasks

#### Task 5.1: Update `vercel.json` with cache headers

**File:** `apps/web/vercel.json`

```json
{
  "headers": [
    {
      "source": "/images/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/fonts/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/_next/static/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ]
}
```

**Subtasks:**
- Read existing `apps/web/vercel.json` content — **5 min**
- Add headers configuration preserving existing settings — **10 min**
- Verify JSON is valid — **2 min**

**Effort:** 17 minutes

---

## Total Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Dynamic Imports | 1 hr 55 min |
| Story 2: Image Optimisation | 44 min |
| Story 3: Bundle Size Budget | 54 min |
| Story 4: Lighthouse CI Blocking | 34 min |
| Story 5: Cache-Control Headers | 17 min |
| **Total** | **~4 hours 24 min** |

## Definition of Done

- All acceptance criteria checked off
- `pnpm --filter @retune/web build` succeeds with no errors
- Initial JS bundle < 200KB gzipped (verified by CI step)
- Lighthouse CI passes with: performance ≥ 85, accessibility ≥ 90, best-practices ≥ 90
- No static imports of `three`, `@react-three/*`, or `@paper-design/shaders-react` in non-dynamic code paths
- `orb.webp` < 200KB and preloaded in root layout
- PR description includes before/after Lighthouse scores and bundle size comparison
