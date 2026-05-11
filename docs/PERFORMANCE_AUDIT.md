# Performance Audit & Optimizations

## Issues Found & Fixed

### 1. ✅ Double Auth Check (FIXED)
**Problem**: Every page navigation called Supabase twice:
- Middleware: `supabase.auth.getUser()`
- Page component: `getSession()` → `supabase.auth.getUser()` again

**Fix**: Cache session in request headers from middleware
- Middleware sets `x-user-id`, `x-user-email`, `x-user-name`
- `getSession()` reads from headers first, only falls back to Supabase for API routes

**Impact**: Eliminates 1 network roundtrip per page load (~200-500ms saved)

### 2. ✅ Self HTTP Fetch (FIXED)
**Problem**: Dashboard made HTTP fetch to its own API
```ts
await fetch("http://localhost:3000/api/brain/generations")
```

**Fix**: Query database directly
```ts
await db.select().from(applications).where(eq(applications.userId, session.userId))
```

**Impact**: Eliminates localhost HTTP overhead (~100-200ms saved)

### 3. ⚠️ Heavy Animation Library
**Problem**: Using both `framer-motion` (12.4.7) and `motion` (12.38.0)
- 10 components import motion
- Onboarding page has heavy AnimatePresence usage
- Bundle size impact: ~50-80KB gzipped

**Recommendation**: 
- Remove `framer-motion` (duplicate of `motion`)
- Lazy load motion for non-critical pages
- Use CSS animations for simple transitions

### 4. ⚠️ Font Loading
**Problem**: Loading 2 Google Fonts synchronously in layout
- Inter (5 weights)
- EB Garamond (4 weights + italic)

**Current**: `display: "swap"` is good
**Recommendation**: Preload critical font weights

### 5. ⚠️ No Static Generation
**Problem**: All pages are dynamic (SSR on every request)

**Recommendation**: 
- Make landing page static: `export const dynamic = 'force-static'`
- Use ISR for pricing/terms pages
- Keep dashboard/auth pages dynamic

## Remaining Bottlenecks

### Database Connection
**Current**: postgres-js with `max: 10` connections
**Status**: ✅ Good for dev, may need tuning for production

### No Query Caching
**Issue**: Every dashboard load queries profiles + applications
**Recommendation**: Add React cache() for server components
```ts
import { cache } from 'react'
export const getProfile = cache(async (userId: string) => {
  return db.select().from(profiles).where(eq(profiles.userId, userId))
})
```

### No Bundle Analysis
**Issue**: Can't see what's bloating the bundle
**Recommendation**: Add `@next/bundle-analyzer`

## Quick Wins

### 1. Remove Duplicate Motion Library
```bash
pnpm remove framer-motion
```

### 2. Add Bundle Analyzer
```bash
pnpm add -D @next/bundle-analyzer
```

### 3. Lazy Load Heavy Components
```ts
const PipelineView = dynamic(() => import('@/components/pipeline/pipeline-view'), {
  loading: () => <Skeleton />,
  ssr: false
})
```

### 4. Add React Cache for Queries
```ts
// lib/cached-queries.ts
import { cache } from 'react'
import { db, profiles, applications } from '@retune/db'
import { eq } from 'drizzle-orm'

export const getProfile = cache(async (userId: string) => {
  return db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
})

export const getApplications = cache(async (userId: string) => {
  return db.select().from(applications).where(eq(applications.userId, userId)).limit(50)
})
```

### 5. Optimize Next.js Config
```ts
experimental: {
  optimizePackageImports: [
    'lucide-react',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    'motion', // Add this
  ],
  serverComponentsExternalPackages: ['postgres', '@electric-sql/pglite'],
}
```

## Performance Targets

- **First Load**: < 1s
- **Page Navigation**: < 300ms
- **Dashboard Load**: < 500ms
- **Lighthouse Score**: > 90

## Monitoring

Add performance monitoring:
```ts
// middleware.ts
const start = Date.now()
// ... auth logic
const duration = Date.now() - start
if (duration > 500) {
  console.warn(`Slow middleware: ${duration}ms for ${pathname}`)
}
```

## Next Steps

1. ✅ Remove `framer-motion` duplicate
2. ✅ Add React cache for queries
3. ⏳ Add bundle analyzer
4. ⏳ Lazy load heavy components
5. ⏳ Add performance monitoring
