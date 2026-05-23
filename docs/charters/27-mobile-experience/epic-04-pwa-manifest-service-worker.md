# Charter 27 Epic 04 — PWA Manifest + Service Worker

**Charter:** 27 — Mobile Experience
**Status:** Skeleton lands in B6/B11
**Owner:** Frontend lead

## Goal

Make Retune installable as a Progressive Web App so iOS + Android
users can add it to their home screen. Service worker provides an
offline-tolerant page shell so a flaky connection doesn't show a
white screen.

## Definition of Done

- `apps/web/public/manifest.webmanifest` declared and linked from
  `<head>`.
- Icon set: 192×192, 512×512 (regular + maskable).
- Service worker registered on first visit; cached app shell + fonts
  + critical CSS.
- iOS-specific tags (`apple-touch-icon`, `apple-mobile-web-app-capable`)
  set.
- "Install Retune" button on `/dashboard` for repeat visitors that
  meet PWA install criteria.
- Lighthouse PWA category score ≥ 90.

## Stories

### Story 4.1 — Manifest authoring
Author `manifest.webmanifest`:

```json
{
  "name": "Retune — AI-tailored job applications",
  "short_name": "Retune",
  "description": "Upload your resume, paste a job, ship a tailored application — with evidence.",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#d4f5e0",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "New application", "url": "/applications/new" },
    { "name": "Dashboard", "url": "/dashboard" }
  ],
  "categories": ["productivity", "business"]
}
```

**Acceptance:** File lands; valid per https://manifest-validator.appspot.com.

### Story 4.2 — Icon set
Generate from existing logo. Use a tool like `pwa-asset-generator`
once the logo system (Charter 24) is finalised. For now, derive from
the existing wordmark.

**Acceptance:** All 4 icon sizes present in `public/icons/`.

### Story 4.3 — Link from `<head>`
Update `apps/web/src/app/layout.tsx` to link the manifest + iOS tags.

**Acceptance:** Lighthouse PWA category increases.

### Story 4.4 — Service worker
Use `next-pwa` (or write a minimal sw.js) to:
- Cache the app shell + fonts + CSS for offline page-render.
- Network-first for API calls + dynamic content.
- Show a "you're offline" banner when the user is disconnected.

**Acceptance:** Manual offline test renders the shell with the banner.

### Story 4.5 — Install prompt
Detect repeat visits (via cookie or localStorage) and show a dismissible
"Install Retune" banner on `/dashboard`. Use `beforeinstallprompt` event.

**Acceptance:** Banner appears for repeat visitors; dismissible per session.

## Tasks

- [ ] 4.1.1 Author `manifest.webmanifest`.
- [ ] 4.1.2 Validate.
- [ ] 4.2.1 Generate icon set.
- [ ] 4.3.1 Update `<head>`.
- [ ] 4.3.2 Add iOS-specific meta tags.
- [ ] 4.4.1 Decide: `next-pwa` vs hand-rolled SW.
- [ ] 4.4.2 Implement.
- [ ] 4.4.3 Test offline + slow-3G.
- [ ] 4.5.1 Implement install prompt.

## Dependencies

- Charter 24 (Brand & Design) — for the final icon set; this epic
  ships with derived-from-wordmark icons in the meantime.

## Estimated effort

~2 working days.
