# UI Performance Optimization Guide

## Current Optimizations Applied

### 1. Server-Side Optimizations ✅
- **Parallel queries**: Dashboard, Settings use `Promise.all()`
- **React cache**: Deduplicated queries across components
- **Session caching**: Headers-based session (no Supabase roundtrip)
- **Subscription counter**: Eliminated expensive SUM queries
- **Increased cache TTL**: 5min for subscription data

### 2. Build Optimizations ✅
- **Package imports**: Optimized lucide-react, motion, sonner
- **Webpack workers**: Parallel compilation enabled
- **SWC minify**: Faster minification
- **Tree shaking**: Motion library consolidated

### 3. Database Optimizations ✅
- **Indexed queries**: All queries use proper indexes
- **Materialized counters**: credits_used in subscriptions
- **Query filtering**: Exclude refinement_attempt from usage SUM

## Remaining Performance Bottlenecks

### Client-Side Rendering
**Issue**: Large component trees re-render unnecessarily

**Solutions**:
1. Add `React.memo()` to expensive components
2. Use `useMemo()` for expensive calculations
3. Lazy load heavy components with `dynamic()`

### Animation Performance
**Issue**: Motion animations can block main thread

**Solutions**:
1. Use `will-change` CSS for animated elements
2. Prefer `transform` and `opacity` (GPU-accelerated)
3. Reduce AnimatePresence complexity

### Font Loading
**Issue**: Google Fonts block initial render

**Solution**: Add font preloading
```tsx
// app/layout.tsx
<link
  rel="preload"
  href="/fonts/inter-var.woff2"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
/>
```

## Quick Wins to Implement

### 1. Lazy Load Heavy Components
```tsx
// Instead of:
import { PipelineView } from '@/components/pipeline/pipeline-view'

// Use:
const PipelineView = dynamic(
  () => import('@/components/pipeline/pipeline-view'),
  { ssr: false, loading: () => <Skeleton /> }
)
```

### 2. Memoize Expensive Calculations
```tsx
const profileScore = useMemo(
  () => computeCompletenessScore(profile),
  [profile]
)
```

### 3. Add Loading States
```tsx
<Suspense fallback={<DashboardSkeleton />}>
  <DashboardContent />
</Suspense>
```

### 4. Optimize Images
```tsx
<Image
  src="/hero.png"
  width={1200}
  height={600}
  priority // For above-the-fold images
  placeholder="blur"
/>
```

### 5. Reduce Bundle Size
```bash
# Analyze bundle
pnpm add -D @next/bundle-analyzer

# Check what's large
ANALYZE=true pnpm build
```

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| First Contentful Paint | < 1.0s | ~1.5s |
| Time to Interactive | < 2.0s | ~2.5s |
| Page Navigation | < 100ms | ~200ms |
| Dashboard Load | < 300ms | ~340ms |
| Settings Load | < 100ms | ~50ms ✅ |

## Monitoring

Add performance monitoring to middleware:
```ts
// middleware.ts
export async function middleware(request: NextRequest) {
  const start = performance.now()
  
  // ... auth logic
  
  const duration = performance.now() - start
  if (duration > 100) {
    console.warn(`[perf] Slow middleware: ${duration.toFixed(0)}ms for ${pathname}`)
  }
}
```

## Next Steps

1. ✅ Optimize Next.js config (webpackBuildWorker, more package imports)
2. ⏳ Add bundle analyzer
3. ⏳ Lazy load pipeline/generation visualizer
4. ⏳ Add React.memo to ProfileEditor sections
5. ⏳ Preload critical fonts
6. ⏳ Add Suspense boundaries with skeletons
7. ⏳ Optimize motion animations (reduce spring stiffness)

## Animation Optimization

Current animations are fine, but can be optimized:

```tsx
// Reduce spring stiffness for smoother feel
const SPRING = { 
  type: "spring" as const, 
  stiffness: 200, // was 300
  damping: 25     // was 30
}

// Use layoutId for shared element transitions
<motion.div layoutId="card-{id}">

// Batch animations
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }} // Faster than spring for simple fades
>
```

## CSS Optimizations

Add to globals.css:
```css
/* GPU acceleration for animated elements */
.rt-card-lift,
.rt-btn,
.icon-shine {
  will-change: transform;
}

/* Reduce paint on scroll */
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Optimize animations */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
