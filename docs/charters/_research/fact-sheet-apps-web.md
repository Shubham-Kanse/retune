# apps/web — Pure-Code Fact Sheet

> Generated from code inspection only. No docs/markdown consulted.
> Base path: `apps/web/src/`

---

## 1. Next.js App Router Layout

### Route Groups

| Group | Path | Purpose |
|-------|------|---------|
| `(public)` | `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/terms`, `/privacy`, `/pricing` | Unauthenticated pages |
| `(auth)` | `/dashboard`, `/profile`, `/generate/new`, `/generate/[id]`, `/brain`, `/applications`, `/settings/*` | Authenticated app shell (sidebar + topbar) |
| `(onboarding)` | `/onboarding` (redirect stub), `/onboarding-v2` | Onboarding flow (full-screen, no sidebar) |

### Middleware (`src/middleware.ts`)

- **Lines 1–96.** Edge middleware using `@supabase/ssr` `createServerClient`.
- **PUBLIC_PATHS** (L4–14): exact set of unauthenticated paths.
- **Auth bypass** (L64–77): when `E2E_AUTH_BYPASS=1` + non-production, injects fake `x-user-id`/`x-user-email`/`x-user-name` headers.
- **Supabase code redirect** (L22–26): `/?code=...` → `/api/auth/callback`.
- **Security headers** (L28–50): CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy applied to every response.
- **Session resolution** (L79–82): calls `resolveSessionStateFromRequest()` from `lib/identity-edge.ts` — creates Supabase server client from cookies, calls `getUser()`.
- **Redirect on no session** (L84): → `/login`.
- **Session propagation** (L88–93): sets `x-user-id`, `x-user-email`, `x-user-name`, `x-pathname`, `x-url` headers for downstream pages.

### (auth) Layout (`src/app/(auth)/layout.tsx`)

- Calls `getOnboardingStatus()` — redirects to `/verify-email` if unverified, to `/onboarding-v2` if not onboarded.
- Renders `AppSidebar` + `AppTopbar` + `SidebarInset`.

### (onboarding) Layout (`src/app/(onboarding)/layout.tsx`)

- Redirects to `/login` if no session, `/verify-email` if unverified, `/dashboard` if already onboarded (unless `?enhance=1`).
- Redirects `/onboarding` → `/onboarding-v2`.

---

## 2. API Proxy Routes (`src/app/api/**`)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/auth/signup` | POST | Public (rate-limited) | Supabase signUp + DB user/subscription/consent insert |
| `/api/auth/login` | POST | Public | Supabase signInWithPassword, returns `onboardingCompleted` |
| `/api/auth/logout` | POST | — | Supabase signOut |
| `/api/auth/forgot-password` | POST | Public | Supabase resetPasswordForEmail |
| `/api/auth/reset-password` | POST | Public | Supabase updateUser (password) |
| `/api/auth/verify-email` | GET/POST | Public | GET redirects to login; POST resends signup confirmation |
| `/api/auth/callback` | GET | Public | Exchanges Supabase `code` for session |
| `/api/auth/confirm` | GET | Public | Verifies OTP token_hash, marks `emailVerified=true` in DB |
| `/api/auth/google` | GET | Public | Initiates Google OAuth |
| `/api/auth/google/callback` | GET | Public | Completes Google OAuth |
| `/api/generate` | POST | `withAuth` | Validates preflight token → proxies to `apps/api` cognitive backend |
| `/api/generate/preflight` | POST/PATCH | `withAuth` | Drift detection (POST=detect, PATCH=resolve) via LLM |
| `/api/generate/[id]` | GET/DELETE | `withAuth` | GET=status, DELETE=abort |
| `/api/generate/[id]/stream` | GET | `withAuth` | SSE proxy to `apps/api /generate/:id/stream` |
| `/api/generate/[id]/result` | GET | `withAuth` | Fetch final generation result |
| `/api/generate/[id]/[filename]` | GET | `withAuthParams` | Download generated file |
| `/api/profile` | GET/PATCH | `withAuth` | Legacy profile CRUD |
| `/api/profile/import-resume` | POST | `withAuth` | PDF/DOCX upload → extraction → profile patch |
| `/api/profile/enhance-section` | POST | `withAuth` | LLM-powered section enhancement |
| `/api/profile/voice-fingerprint` | GET | `withAuth` | Voice fingerprint data |
| `/api/profile/honesty-calibrations` | GET | `withAuth` | Honesty calibration data |
| `/api/profile/understanding` | GET/POST | `withAuth` | Career understanding CRUD |
| `/api/profile/understanding/preview` | POST | `withAuth` | Retune Lens preview (LLM call) |
| `/api/profile/understanding/apply` | POST | `withAuth` | Apply previewed understanding patch |
| `/api/profile/understanding/feedback` | POST | `withAuth` | User feedback on understanding |
| `/api/profile/understanding/status` | GET | `withAuth` | Understanding freshness status |
| `/api/profile-v2` | GET/PATCH | Supabase auth | V2 profile read/edit (Supabase direct) |
| `/api/profile-v2/tune` | POST | Supabase auth | Tune understanding with AI |
| `/api/profile-v2/re-read` | POST | Supabase auth | Re-read evidence from resume |
| `/api/onboarding-v2/session` | GET | Supabase auth | Load onboarding session |
| `/api/onboarding-v2/upload` | POST | Supabase auth | Resume upload + extraction |
| `/api/onboarding-v2/upload/stream` | POST | Supabase auth | Streaming extraction progress |
| `/api/onboarding-v2/message` | POST | Supabase auth | Chat message (correction/question) |
| `/api/onboarding-v2/confirm` | POST | Supabase auth | Confirm summary |
| `/api/onboarding-v2/commit` | POST | Supabase auth | Commit profile to v2 tables |
| `/api/onboarding-v2/restart` | POST | Supabase auth | Reset session |
| `/api/onboarding` (session/upload/chat) | GET/POST | — | **DEAD** — returns 410 "legacy_onboarding_removed" |
| `/api/account` | GET/PATCH/DELETE | `withAuth` | Account management |
| `/api/account/export` | GET | `withAuth` | GDPR data export |
| `/api/refine/selection` | POST | `withAuth` | In-place refinement of selected text |
| `/api/jd/fetch` | POST | `withAuth` | Fetch JD from URL |
| `/api/brain/generations` | GET | `withAuth` | List past generations |
| `/api/brain/generations/[id]` | GET | `withAuth` | Single generation detail |
| `/api/health` | GET | Public | Health check (DB, AI key presence) |
| `/api/monitoring/stats` | GET | `withAuth` | Usage stats |
| `/api/admin/metrics` | GET | Admin secret | Admin metrics |


## 3. Auth Wiring

### Supabase SSR Usage

| File | Context | Pattern |
|------|---------|---------|
| `lib/supabase/client.ts` | Browser | `createBrowserClient(URL, ANON_KEY)` |
| `lib/supabase/server.ts` | Server components/API routes | `createServerClient` with `cookies()` |
| `lib/identity-edge.ts` | Edge middleware | `createServerClient` with request cookies |

### Session Handling (`lib/session.ts`)

- `getPageSessionFromTrustedMiddlewareHeaders()` — reads `x-user-id`/`x-user-email` headers (pages only).
- `getApiSession()` — always calls Supabase `getUser()` (API routes).
- `getSession()` — **deprecated** hybrid that tries headers first, then Supabase.

### Identity Module (`lib/identity.ts`)

- `signUp()`: Supabase auth.signUp → inserts `users` + `subscriptions` + `processorConsents` rows.
- `signIn()`: Supabase signInWithPassword → reads `onboardingCompleted` from DB.
- `signOut()`: Supabase auth.signOut.
- `resolveSessionState()`: Supabase getUser → returns `Session` or null.

### Auth Flows

| Flow | Route | Implementation |
|------|-------|----------------|
| Signup | `/api/auth/signup` | Zod validation (email, password strength, processor consents required) → `identity.signUp()` |
| Login | `/api/auth/login` | Zod validation → `identity.signIn()` |
| Forgot password | `/api/auth/forgot-password` | `supabase.auth.resetPasswordForEmail()` — always returns ok (anti-enumeration) |
| Reset password | `/api/auth/reset-password` | `supabase.auth.updateUser({ password })` |
| Email verification | `/api/auth/confirm` | `supabase.auth.verifyOtp({ token_hash, type })` → marks `emailVerified=true` in DB |
| Resend verification | `/api/auth/verify-email` POST | `supabase.auth.resend({ type: "signup", email })` |
| Google OAuth | `/api/auth/google` + `/api/auth/google/callback` | Standard Supabase OAuth flow |

### Middleware Guards

- Non-public, non-API, non-static paths require valid Supabase session.
- `(auth)` layout: requires `emailVerified=true` AND `onboardingCompleted=true`.
- `(onboarding)` layout: requires `emailVerified=true`, redirects to `/dashboard` if already onboarded.

---

## 4. Generation Flow

### Entry Point: `src/app/(auth)/generate/new/page.tsx`

- Client component with phases: `form` → `captured` → `preflight` → `starting` → `streaming`.
- **JD input**: `JdPrompt` component (text paste or URL fetch via `/api/jd/fetch`).
- **Drift preflight**: `DriftCheckInline` component calls `/api/generate/preflight` (POST=detect, PATCH=resolve).
- **Generation start**: POST to `/api/generate` with `preflight_token` + `jd_text` + `jd_hash`.
- **Streaming**: subscribes to SSE via `useGenerationStream` store.

### Drift Preflight (`lib/drift-preflight.ts` + `/api/generate/preflight/route.ts`)

- **Detect** (POST): LLM parses JD → `StructuredJd` (must_have/good_to_have/inferred skills), compares against user profile skills, returns `DriftSummary` + `DriftQuestion[]`.
- **Resolve** (PATCH): user answers skill-level questions → profile updated → `preflight_token` issued (HMAC-signed, 15min TTL, stored in `generationPreflights` table).
- Token verified at generation start — prevents generation without preflight.

### Preflight Token (`lib/drift-preflight-token.ts`)

- HMAC-SHA256 signed with `JWT_SECRET`.
- Payload: `preflight_id`, `user_id`, `jd_hash`, `resolved_at`, `expires_at`.
- Timing-safe comparison on verify.

### Generation Stream Store (`stores/generation-stream.ts`)

- Zustand store. States: `idle` → `connecting` → `streaming` → `complete`/`error`.
- Tracks: steps, trace entries, brain traces, conflicts, narrative paragraphs, ATS score, completion data, emotional state, cost.
- `start()`: creates `StreamClient` → connects to `/api/generate/[id]/stream`.
- `retry()`: re-starts with `retryCount + 1`.
- `stop()`: sends DELETE to `/api/generate/[id]` then closes SSE.

### SSE Client (`lib/sse/stream-client.ts`)

- Custom `EventSource` wrapper with exponential backoff reconnection (max 5 attempts).
- Listens for 23 named event types (trace, completion, done, error, narrative_paragraph, specialist_picked, goal_emitted, etc.).
- Parses JSON data, normalizes to `PipelineEvent` shape, dispatches to store.
- Auto-closes on `completion`/`complete`/`done`/`error`/`external_abort`.

### SSE Events (`lib/sse/events.ts`)

- Defines `PipelineEvent` interface and `PipelineEventType` union.
- `EventRing` (`lib/sse/event-ring.ts`): fixed-size ring buffer for events.

### Generation API Proxy (`/api/generate/route.ts`)

- Validates preflight token (HMAC + DB row check: not used, not revoked, not expired).
- Loads `career_profile` + `career_understanding` server-side (authoritative, not client-supplied).
- Proxies to `apps/api` backend with `X-Retune-Internal-Key` header.
- Records application in `applications` table.

### Stream Proxy (`/api/generate/[id]/stream/route.ts`)

- Verifies user owns generation via `applications` table.
- Signs a short-lived `X-Retune-Generation-Access` token (HMAC).
- Proxies upstream SSE response body directly.

---

## 5. Onboarding V1 vs V2

### Onboarding V1 (`lib/onboarding/`)

**Status: LEGACY — API routes return 410, page redirects to v2.**

| File | Purpose |
|------|---------|
| `planner.ts` (29KB) | Builds question cards from extracted profile (identity, experience, skills, education, extras) |
| `session-store.ts` (16KB) | Full `UserCareerProfile` schema with field-level confidence/source/evidence tracking |
| `career-profile.schema.ts` (11KB) | Zod schema for v1 career profile |
| `text-router.ts` (13KB) | LLM-powered text classification/routing for chat messages |
| `apply-extracted-profile.ts` (13KB) | Maps extraction output to v1 profile fields |
| `apply-patch.ts` (14KB) | Applies user corrections to profile |
| `readiness.ts` (6KB) | Profile readiness scoring |
| `action-validation.ts` (6KB) | Validates planner actions |
| `cards.ts` (5KB) | Card builders for each profile section |
| `role-inference.ts` (3.5KB) | Infers roles from profile text |
| `pii.ts` (1.4KB) | PII detection |
| `guardrails.ts` (1.8KB) | Input guardrails |
| `events.ts` (2KB) | Analytics events |
| `transition.ts` (1.1KB) | Intro animation timing constants |
| `tools.ts`, `completeness.ts`, `normalization.ts`, `chat-ui.ts`, `sse.ts` | Small utilities |

**V1 API routes** (`/api/onboarding/session`, `/api/onboarding/upload`, `/api/onboarding/chat`): all return HTTP 410.

### Onboarding V2 (`lib/onboarding-v2/`)

**Status: ACTIVE — the only running onboarding flow.**

#### Architecture

- 9-stage pipeline: Upload → Extraction → Inference → Summary → Correction → Completeness → Questions → Voice → Audit.
- Session stored in Supabase `onboarding_v2_sessions` table (JSONB `session_state` + `version` for optimistic locking).
- LLM calls via OpenAI SDK (`gpt-4.1` for smart, `gpt-4.1-mini` for fast).
- Per-session limits: 30 calls max, $0.50 cost cap, 5 calls/minute.

#### Key Files

| File | Purpose |
|------|---------|
| `types.ts` (9KB) | Full `OnboardingV2Session` type, `ExtractionSchema`, `VoiceProfile`, `QuestionMap` |
| `constants.ts` (4KB) | Thresholds, valid vocabularies (industries, role families, seniorities), MIME types, error messages |
| `session.ts` (6KB) | CRUD with optimistic locking via Supabase |
| `repository.ts` (5KB) | Loads committed v2 profile from Supabase tables |
| `validation.ts` (3KB) | Input validation |
| `errors.ts` (2KB) | Custom error classes |
| `auth.ts` (1.4KB) | E2E bypass helpers |
| `upload-debouncer.ts` (1.7KB) | Debounces upload attempts |
| `analytics.ts` (3.5KB) | Typed funnel events (console-only, no real provider wired) |
| `llm/calls.ts` (5KB) | OpenAI wrapper with retry, cost tracking, rate limiting |
| `llm/prompts.ts` (19KB) | All system prompts for extraction, inference, summary, correction, voice |
| `llm/guardrails.ts` (4KB) | JSON parsing, PII stripping, hallucination detection, truncation |

#### Stages (`stages/`)

| Stage | File | What it does |
|-------|------|--------------|
| 1 | `stage-1-upload.ts` (4.5KB) | File validation, MIME/magic-byte check |
| 2 | `stage-2-extraction.ts` (14KB) | PDF/DOCX text extraction + LLM schema mapping |
| 3 | `stage-3-inference.ts` (4.7KB) | Industry/role/seniority inference |
| 4 | `stage-4-summary.ts` (10KB) | Dual extraction (pure + inferred summary) |
| 5 | `stage-5-correction.ts` (8KB) | User correction rounds |
| 6 | `stage-6-completeness.ts` (4KB) | Completeness scoring + path detection |
| 7 | `stage-7-questions.ts` (16KB) | Targeted questions based on gaps |
| 8 | `stage-8-voice.ts` (8.5KB) | Voice sample collection + tone extraction |
| 9 | `stage-9-audit.ts` (10KB) | Final quality audit + commit readiness |

#### UI (`hooks/use-onboarding-v2.ts` — 36KB, `components/onboarding-v2/` — 14 files)

- Massive client hook managing all 9 stages, chat interface, file upload, chip selectors.
- Components: `chat-interface`, `chip-selector`, `extraction-dropdown`, `audit-summary`, etc.

#### Current Default

`onboarding-gate.ts` L47: `onboardingPath()` returns `"/onboarding-v2"` — v2 is the sole active path.


---

## 6. Profile

### Profile Page (`src/app/(auth)/profile/page.tsx`)

- Server component. Loads both v1 (`profiles` table via Drizzle) and v2 (`loadV2Profile()` via Supabase) in parallel.
- V2 wins for new sections; v1 still drives legacy surfaces.
- Builds `ProfileEditorData` from v1 DB row (JSON-parsed fields).
- Builds `CareerUnderstandingV1` — tries v2 `buildUnderstandingFromV2()`, falls back to `buildPlaceholderUnderstanding()`.
- Computes `careerProfileFingerprint` for staleness detection.
- Renders `<CareerProfilePage>`.

### Career Profile Page (`components/profile/career-profile-page.tsx` — 34KB)

- Orchestrates all profile sections. **REAL, fully implemented.**

### Profile Sections (all under `components/profile/`)

| Component | File | Status |
|-----------|------|--------|
| `profile-editor.tsx` (46KB) | Full inline editor with all fields | **REAL** |
| `retune-understanding-section.tsx` (10KB) | Displays career understanding + Retune Lens trigger | **REAL** |
| `evidence-map-section.tsx` (5KB) | Evidence map visualization | **REAL** |
| `voice-section.tsx` (5KB) | Voice profile display + edit | **REAL** |
| `positioning-cards-section.tsx` (6KB) | Best angles / positioning cards | **REAL** |
| `resume-fuel-section.tsx` (6KB) | Resume fuel (achievements, evidence) | **REAL** |
| `profile-health-section.tsx` (4KB) | Profile completeness/health indicators | **REAL** |
| `skills-section.tsx` (3KB) | Tiered skills display | **REAL** |
| `experience-section.tsx` (4KB) | Experience timeline | **REAL** |
| `education-section.tsx` (3KB) | Education display | **REAL** |
| `extras-section.tsx` (3.4KB) | Certs, projects, languages, awards | **REAL** |
| `preferences-section.tsx` (4KB) | Target roles, relocation, visa | **REAL** |
| `tune-with-ai-widget.tsx` (8KB) | AI tune trigger (calls `/api/profile-v2/tune`) | **REAL** |
| `re-read-evidence-button.tsx` (6KB) | Re-read evidence (calls `/api/profile-v2/re-read`) | **REAL** |
| `profile-source-badge.tsx` (2KB) | Shows field source (extracted/inferred/user) | **REAL** |
| `resume-preview-modal.tsx` (7KB) | Resume PDF preview | **REAL** |
| `use-resume-upload.ts` (3.4KB) | Upload hook | **REAL** |
| `edit-modals/` (8 files) | Modal editors for each section | **REAL** |

### Career Understanding (`lib/career-understanding/` — 16 files)

- Full implementation: schema, types, context builder, prompt, guardrails, fingerprinting, patch system, preview tokens, rate limiting, auto-generate, repository, service.
- `build-from-v2.ts` (16KB): transforms v2 profile snapshot into `CareerUnderstandingV1`.
- `service.ts` (14KB): LLM-powered understanding generation.
- Uses `@retune/agent/web` for model/provider resolution.

---

## 7. Retune Lens (Preview)

### Components (`components/retune-lens/` — 8 files)

| File | Purpose |
|------|---------|
| `retune-lens-panel.tsx` | Main panel — accepts `onPreview`/`onApply` callbacks |
| `retune-lens-trigger.tsx` (15KB) | Trigger button with instruction input |
| `retune-lens-preview.tsx` (5KB) | Before/after diff display |
| `retune-lens-scope-picker.tsx` | Scope selection (section/full) |
| `retune-lens-intent-chips.tsx` | Preset intent chips |
| `color-orb.tsx` | Animated orb indicator |
| `index.ts` | Barrel exports |

### Hook (`hooks/use-retune-lens.ts`)

- Calls `/api/profile/understanding/preview` (POST) → gets before/after slices.
- Calls `/api/profile/understanding/apply` (POST) → applies patch.
- **Does NOT call ML service directly.** Calls the web app's own API routes which use LLM (OpenAI/Anthropic via `@retune/agent/web`).

### Backend (`/api/profile/understanding/preview/route.ts` — 10KB)

- Loads profile + understanding → builds context → calls LLM → returns diff.
- Rate-limited (per-user, via `career-understanding/rate-limit.ts`).
- Preview token (HMAC-signed, short TTL) for apply step.

**Verdict: Retune Lens is REAL and calls LLM. It does NOT call the ML service (apps/ml). It uses the same AI provider as the rest of the web app.**

---

## 8. Pipeline Visualization

### Components (`components/pipeline/`)

| File | Size | Purpose |
|------|------|---------|
| `pipeline-view.tsx` | 37KB | Full pipeline visualization with specialist traces, brain regions, conflicts, narrative |
| `generation-visualizer.tsx` | 15KB | Compact visualizer with smooth number animation, step progress |
| `pipeline-shimmer.tsx` | 2KB | Loading shimmer animation |

- All consume `useGenerationStream` store.
- `pipeline-view.tsx` maps specialists to brain regions (prefrontal_cortex, hippocampus, etc.).
- Shows real-time: current specialist, trace entries, cost, ATS score, conflicts, narrative paragraphs.

**Verdict: REAL, fully implemented, consumes live SSE data.**

---

## 9. Supporting Libraries

| File | Size | Status | Notes |
|------|------|--------|-------|
| `env.ts` | 903B | **STALE/WRONG** | Validates `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DATABASE_URL` (file:./data/retune.db), `TAVILY_API_KEY`, `FREE_GENERATION_LIMIT`. Uses `process.exit(1)` on failure. **Does NOT match actual env vars used by the app** (Supabase, OpenAI, SMTP, etc.). Likely legacy from pre-Supabase era. |
| `errors.ts` | 4.3KB | **REAL** | `ValidationError`, `AuthError`, `ForbiddenError`, `RateLimitError`, `ConflictError`, `AgentError`, `NotFoundError` + `toErrorResponse()` |
| `rate-limit.ts` | 1KB | **REAL** | IP-based in-memory rate limiter for API routes (used by `api-handler.ts`) |
| `rate-limiter.ts` | 1KB | **DUPLICATE** | User+endpoint rate limiter. Different interface from `rate-limit.ts`. Has `setInterval` cleanup. |
| `pipeline-error-codes.ts` | 6KB | **REAL** | Exhaustive error code enum + user-facing messages for pipeline failures |
| `feature-flags.ts` | 5.4KB | **STUB** | In-memory `FeatureFlagManager` with hardcoded flags. No external service. No persistence. Flags: `ai_suggestions`, `collaboration_mode`, `advanced_analytics`, `semantic_search`, `ml_ats_optimization`. **Not connected to any real feature-flag service.** |
| `ml-ats-optimizer.ts` | 8KB | **STUB** | Regex-based ATS scoring. No ML calls. Hardcoded patterns. |
| `smart-retry.ts` | 1.7KB | **REAL** | Generic retry with exponential backoff + jitter. Used minimally. |
| `health-monitor.ts` | 7KB | **HALF-IMPLEMENTED** | `SystemHealthMonitor` class with periodic checks. Registers DB + AI key checks. No external alerting. |
| `performance.ts` | 1.3KB | **STUB** | In-memory `PerformanceMonitor`. Logs slow ops to console. No export/reporting. |
| `analytics.ts` | 1.3KB | **STUB** | In-memory event buffer. Console logging in dev. No real analytics provider. |
| `ab-testing.ts` | 3.8KB | **HALF-IMPLEMENTED** | Uses real DB table (`abTestAssignments`). Has hardcoded experiments (`landing-cta`, `onboarding-flow`). No conversion tracking beyond DB insert. |
| `websocket.ts` | 985B | **STUB** | `WebSocketManager` class. Never instantiated by any route. No WebSocket server exists. |
| `collaboration.ts` | 2.9KB | **STUB** | `CollaborationEngine` with rooms/cursors. Never used. |
| `semantic-search.ts` | 6.5KB | **STUB** | In-memory TF-IDF search. No embeddings. No ML calls. |
| `ai-suggestions.ts` | 3.2KB | **STUB** | Simulated AI suggestions with keyword extraction. Comment says "in production, this would call Claude". |
| `api-handler.ts` | 3KB | **REAL** | `withAuth`, `withAuthParams`, `withErrorHandling` wrappers with rate limiting + origin check |
| `api-config.ts` | 846B | **REAL** | `apiUrl()` helper pointing to `NEXT_PUBLIC_API_URL` (default port 8787) |
| `api-client.ts` | 3.6KB | **REAL** | Typed fetch wrapper for cognitive API |
| `generation-access.ts` | 1.3KB | **REAL** | HMAC token for generation stream access |
| `generation-registry.ts` | 876B | **REAL** | In-memory generation tracking |
| `error-tracker.ts` | 1.5KB | **STUB** | In-memory error buffer. No Sentry/external reporting. |
| `logger.ts` | 1.6KB | **REAL** | Simple leveled logger (console-based) |
| `cache.ts` | 3.8KB | **REAL** | In-memory LRU cache |
| `csrf.ts` | 598B | **REAL** | CSRF token generation/validation |
| `color-interpolation.ts` | 929B | **REAL** | Color math utility |
| `motion.tsx` | 5.5KB | **REAL** | Motion/framer-motion wrapper components |
| `constants.ts` | 354B | **REAL** | App constants |
| `utils.ts` | 169B | **REAL** | `cn()` (clsx + tailwind-merge) |
| `startup-diagnostics.ts` | 929B | **REAL** | Logs env state on startup |
| `profile-completeness.ts` | 2.8KB | **REAL** | Profile completeness scoring |
| `profile-assembly.ts` | 6.7KB | **REAL** | Assembles profile for generation |
| `skill-ontology.ts` | 4KB | **REAL** | Skill canonicalization + matching |
| `preflight-table.ts` | 1.5KB | **REAL** | Ensures `generationPreflights` table exists |
| `optimized-results.ts` | 4.7KB | **REAL** | Optimized result loading |
| `cached-queries.ts` | 1.5KB | **REAL** | Cached DB queries |


---

## 10. Test Setup

### Vitest (`vitest.config.ts`)

- Environment: `jsdom`.
- Setup file: `vitest.setup.ts`.
- Excludes: `.next/`, `node_modules/`, `dist/`, `e2e/`.
- Aliases: `@` → `./src`, `@retune/db/*` → monorepo packages.

### Playwright (`playwright.config.ts`)

- Test dir: `./e2e`.
- Base URL: `http://127.0.0.1:3100`.
- Web server: `E2E_AUTH_BYPASS=1 pnpm --filter @retune/web dev --port 3100`.
- Single project: Chromium.
- Retries: 1.

### E2E Tests Present (12 files)

| File | Coverage |
|------|----------|
| `onboarding-v2.spec.ts` (13KB) | Full v2 onboarding flow |
| `onboarding-sota.spec.ts` (6.5KB) | State-of-the-art onboarding scenarios |
| `onboarding.spec.ts` (288B) | Minimal (likely redirect test) |
| `public-pages.spec.ts` (12KB) | All public pages |
| `public-auth.spec.ts` (1.3KB) | Public auth pages |
| `authenticated-flow.spec.ts` (3.5KB) | Auth flow |
| `auth-wiring.spec.ts` (2.3KB) | Auth wiring |
| `auth-smoke.spec.ts` (1.9KB) | Auth smoke tests |
| `middleware-guards.spec.ts` (365B) | Middleware guard tests |
| `results-download.spec.ts` (2.8KB) | Download flow |
| `pipeline-controls.spec.ts` (3.7KB) | Pipeline control tests |
| `navigation-guards.spec.ts` (396B) | Nav guard tests |

### Unit Tests

- `lib/__tests__/` (11 files), `lib/onboarding/__tests__/` (10 files), `lib/onboarding-v2/__tests__/` (21 files).
- `lib/career-understanding/__tests__/` (9 files).
- API route tests: auth (4), profile (5), generate (1), monitoring (1), admin (1), security-abuse (1).
- Component tests: `components/retune-lens/__tests__/`.

**Test state from context: web 107/136 passing.**

---

## 11. Dead/Unused/Duplicated Files

### .bak Files (16 total — should be deleted)

```
src/app/layout.tsx.bak
src/app/(auth)/layout.tsx.bak
src/app/(auth)/dashboard/page.tsx.bak
src/app/(auth)/applications/page.tsx.bak
src/app/(auth)/brain/page.tsx.bak
src/app/(auth)/generate/new/page.tsx.bak
src/app/(auth)/generate/new/loading.tsx.bak
src/app/(auth)/generate/[id]/page.tsx.bak
src/app/(public)/login/page.tsx.bak
src/app/(public)/signup/page.tsx.bak
src/app/(public)/forgot-password/page.tsx.bak
src/app/(public)/reset-password/page.tsx.bak
src/app/(public)/verify-email/page.tsx.bak
src/components/ui/skeletons.tsx.bak
src/components/settings/settings-client.tsx.bak
src/components/profile/profile-editor.tsx.bak
```

### .tmp Files (4 total — should be deleted)

```
.tmp-resume-batch-check.ts
.tmp-resume-batch-check.fresh.ts
.tmp-resume-batch-check.mjs
.tmp-resume-batch-check-output.json
```

### Legacy Onboarding V1 Code (still in tree)

- `lib/onboarding/` (25 files, ~130KB) — **DEAD CODE**. API routes return 410. Page redirects. But the library code is still imported by `profile/page.tsx` for `isCareerProfileV1()` and `CareerProfileV1` type. Partial dependency remains.

### Duplicate Rate Limiters

- `lib/rate-limit.ts` (IP-based, used by `api-handler.ts`)
- `lib/rate-limiter.ts` (user+endpoint-based, used by some routes directly)
- `lib/career-understanding/rate-limit.ts` (understanding-specific)
- `lib/onboarding-v2/llm/calls.ts` (session-level LLM rate limiting)

### Stub Libraries Never Wired

- `websocket.ts`, `collaboration.ts`, `semantic-search.ts`, `ai-suggestions.ts`, `performance.ts` — all in-memory stubs with no consumers.

---

## 12. PostHog / Sentry / i18n

| Integration | Status |
|-------------|--------|
| **PostHog** | **ABSENT.** Only mentioned in a comment in `onboarding-v2/analytics.ts` L74,82 as a future integration point. No SDK installed. |
| **Sentry** | **ABSENT.** No `@sentry/*` packages. `error-tracker.ts` is an in-memory stub. |
| **i18n** | **ABSENT.** No `next-intl`, `react-intl`, or `next-i18next`. All strings are hardcoded English. |

---

## 13. Design System / Tailwind / Tokens / Dark Mode

### Tailwind v4 (`tailwindcss ^4.1.0`)

- Config via `postcss.config.mjs` + `@tailwindcss/postcss`.
- Typography plugin: `@tailwindcss/typography`.
- Animation: `tw-animate-css`.

### Design Tokens (`src/styles/globals.css`)

- **CSS custom properties** for all colors (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, sidebar variants).
- **Light mode** (`:root`): neutral grays, dark primary.
- **Dark mode** (`.dark`): warm near-black (`hsl(50 2% 9%)`), light foreground.
- **Radius tokens**: `--radius` base with sm/md/lg/xl computed variants.
- **Font tokens**: `--font-inter` (sans), `--font-geist-mono` (mono).
- Custom keyframe animations: typing, loading-dots, wave, blink, shimmer, retune-orb-spin, etc.
- Legacy bridge classes: `.rt-btn`, `.rt-btn-ghost`, `.rt-btn-neutral`, `.rt-btn-dark`.

### Theme Provider

- `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
- Theme toggle components: `theme-cycle.tsx`, `theme-switch.tsx`.

### Component Library

- shadcn/ui pattern: `components/ui/` (43 files) — Radix primitives + CVA + tailwind-merge.
- `prompt-kit/` (18 files) — custom AI-specific components (chain-of-thought, text-shimmer, reasoning, etc.).

---

## 14. Environment Variables Read by Web App

### Required (runtime)

| Variable | Used in |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase/client.ts`, `supabase/server.ts`, `identity-edge.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as above |
| `NEXT_PUBLIC_APP_URL` | Auth redirects, sitemap, metadata |
| `NEXT_PUBLIC_API_URL` | `api-config.ts`, `api-client.ts` (default: `http://localhost:8787`) |
| `OPENAI_API_KEY` | `onboarding-v2/llm/calls.ts`, `profile-domain/extractors/` |
| `JWT_SECRET` | `drift-preflight-token.ts`, `env.ts` |
| `SMTP_HOST/PORT/USER/PASS/FROM` | `email.ts` |

### Optional / Feature

| Variable | Used in |
|----------|---------|
| `ANTHROPIC_API_KEY` | `env.ts`, `health/route.ts` (presence check only in web) |
| `RETUNE_INTERNAL_API_KEY` | `generate/route.ts` (header to backend) |
| `RETUNE_INTERNAL_GENERATION_ACCESS_SECRET` | `generation-access.ts` |
| `RETUNE_PREVIEW_SECRET` | `career-understanding/preview-token.ts` |
| `AGENT_MODEL` / `AGENT_MODEL_FAST` | `onboarding-v2/llm/calls.ts` (defaults: `gpt-4.1` / `gpt-4.1-mini`) |
| `ONBOARDING_EXTRACT_MODEL` / `ONBOARDING_ROUTER_MODEL` | `profile-domain/extractors/`, `onboarding/text-router.ts` |
| `ADMIN_SECRET` | `admin/metrics/route.ts` |
| `E2E_AUTH_BYPASS` | Middleware, onboarding auth |
| `E2E_AUTH_USER_ID` / `E2E_AUTH_EMAIL` / `E2E_AUTH_NAME` | Middleware |
| `NODE_ENV` | Various |

### Feature Flags (hardcoded in `feature-flags.ts`)

- `ai_suggestions` (50% rollout)
- `collaboration_mode` (10%, pro only, disabled)
- `advanced_analytics` (100%, admin only)
- `semantic_search` (75%)
- `ml_ats_optimization` (80%)

**None of these flags are actually checked by any UI component or route handler in the codebase.**

---

## 15. `apps/web/data/**` — Local Data

- `data/pglite/` — Full PGlite database directory (WAL, base, global, etc.)
- `data/uploads/` — 3 upload directories with user files
- `data/files/` — 12 generation output directories
- `data/retune.db` — 119KB SQLite file
- `data/.DS_Store`

**Status: gitignored (`data/` in root `.gitignore`), NOT tracked in git.** Present only on local dev machine. Not a committed hygiene issue.

---

## Red Flags for Charters

### 🔴 Critical

1. **`env.ts` is stale and dangerous** — validates `ANTHROPIC_API_KEY` + `JWT_SECRET` + `DATABASE_URL` (SQLite path) and calls `process.exit(1)` on failure. The app actually uses Supabase + OpenAI. If this file is ever imported at startup, it will crash the app in production. Currently it's imported by... nothing obvious in the hot path, but it exists and exports `env`.

2. **Onboarding V1 code is dead weight (130KB)** — API routes return 410, page redirects, but `lib/onboarding/` is still imported by `profile/page.tsx` for type checking. This creates confusion about which schema is authoritative.

3. **16 `.bak` files + 4 `.tmp` files committed** — clutters the repo, confuses tooling, and some contain full page implementations that could be mistakenly referenced.

4. **No error reporting service** — No Sentry, no PostHog, no real analytics. `error-tracker.ts` and `analytics.ts` are in-memory stubs that lose data on restart. Production errors are invisible.

5. **Feature flags are fake** — `feature-flags.ts` is a self-contained in-memory system with no persistence, no UI, and no actual consumers. The flags it defines are never checked anywhere.

### 🟠 High

6. **Duplicate rate limiting** — 4 different rate-limit implementations with different interfaces. No consistency about which is used where.

7. **`getSession()` is deprecated but still used** — Called in `(auth)/profile/page.tsx`, `(onboarding)/layout.tsx`, `(auth)/layout.tsx`. Should be migrated to the specific variants.

8. **Stub libraries pollute the codebase** — `websocket.ts`, `collaboration.ts`, `semantic-search.ts`, `ai-suggestions.ts`, `ml-ats-optimizer.ts` are all non-functional stubs that suggest features exist when they don't.

9. **`ab-testing.ts` has real DB integration but fake experiments** — The `landing-cta` and `onboarding-flow` experiments are hardcoded at module load time. No admin UI to manage them. Unclear if the DB table even has the right schema.

10. **Profile-v2 routes use raw Supabase auth** (`getAuthUserId()`) instead of the standard `withAuth` wrapper — inconsistent auth pattern, no rate limiting on those routes.

11. **SSE stream proxy has no timeout** — `/api/generate/[id]/stream` proxies upstream body indefinitely. If the backend hangs, the connection stays open forever.

### 🟡 Medium

12. **V1 onboarding lib still has LLM-calling code** (`text-router.ts` uses OpenAI) — if any code path accidentally imports and calls it, it will make real API calls.

13. **`pages/_document.tsx` exists** — Pages Router file in an App Router project. Likely dead but could cause confusion.

14. **29 web test failures** (107/136) — indicates active instability.

15. **`health-monitor.ts` runs `setInterval`** for periodic checks — in serverless/edge deployment this is meaningless and wastes resources.

16. **No CSRF protection on most routes** — `csrf.ts` exists but is not imported by `api-handler.ts`. Origin checking is the only protection.

17. **`rate-limiter.ts` has a bare `setInterval`** at module scope — runs cleanup every 5 minutes regardless of whether the module is used. Side-effect on import.

18. **Email templates** (`lib/email-templates.ts` + `lib/email-templates/`) — recently added (May 18), likely for the email integration commit. Needs charter coverage.

19. **`lib/onboarding-v2/analytics.ts`** emits typed events but the `emit()` function is a no-op (console.log in dev, nothing in prod). Funnel data is lost.

20. **Dark mode tokens use warm near-black** (`hsl(50 2% 9%)`) — intentional design choice but differs from standard shadcn defaults. Charters should note this is deliberate.
