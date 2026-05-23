# Epic 04: Web Security Headers & CSP Hardening

**Charter:** Security  
**Priority:** P0 — Week 1  
**Complexity:** M  
**Owner:** Frontend Engineer

---

## Goal

Replace the current `unsafe-eval` + `unsafe-inline` CSP with a nonce-based strict CSP. Add missing security headers to `apps/api`.

## Definition of Done

- [ ] `apps/web` CSP contains no `unsafe-eval` and no `unsafe-inline` in production
- [ ] `apps/web` CSP uses nonces for inline scripts required by Next.js
- [ ] `apps/api` returns `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on all responses
- [ ] Lighthouse CSP audit passes with no high-severity findings
- [ ] `OWASP ZAP` baseline scan shows no CSP-related findings

---

## Context: Current State

**File: `apps/web/src/middleware.ts` lines 38–48**

Current CSP (applied to all routes including production):
```typescript
"Content-Security-Policy",
[
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",  // ← PROBLEM
  "style-src 'self' 'unsafe-inline'",                  // ← acceptable for Tailwind
  "style-src-elem 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https:",
  `connect-src 'self' https:${devSources}`,
  `frame-ancestors ${allowSelfFrame ? "'self'" : "'none'"}`,
].join("; "),
```

`unsafe-eval` is required by Next.js dev mode (hot reload) but must not be in production. `unsafe-inline` for scripts can be replaced with nonces.

---

## Story 4.1: Implement Nonce-Based CSP for Production

**As a** security engineer,  
**I want** the production CSP to use nonces instead of `unsafe-inline` and to remove `unsafe-eval`,  
**so that** XSS attacks cannot execute injected scripts even if an injection vulnerability exists.

**Acceptance Criteria:**
- [ ] In production (`NODE_ENV=production`), `script-src` contains `'nonce-<random>'` and does NOT contain `unsafe-eval` or `unsafe-inline`
- [ ] In development, `script-src` may contain `unsafe-eval` (required for Next.js HMR) — this is acceptable
- [ ] The nonce is a cryptographically random 128-bit value, base64-encoded, generated per request
- [ ] The nonce is passed to Next.js via the `x-nonce` request header so `<Script>` components can use it
- [ ] All inline `<script>` tags in `apps/web/src/app/layout.tsx` use the nonce attribute
- [ ] Lighthouse CSP audit: no `unsafe-eval` in production build

### Task 4.1.1: Generate per-request nonce in middleware
**Owner:** Frontend Engineer  
**Deliverable:** Nonce generated and set in request headers  
**Dependencies:** None

##### Subtask: Add nonce generation to middleware
Open `apps/web/src/middleware.ts`. Add nonce generation at the top of the `middleware` function:

```typescript
import { randomBytes } from "node:crypto";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Generate a per-request CSP nonce
  const nonce = randomBytes(16).toString("base64");

  // ... existing code ...

  const applySecurityHeaders = (response: NextResponse) => {
    const isProduction = process.env.NODE_ENV === "production";

    // Build script-src based on environment
    const scriptSrc = isProduction
      ? `'self' 'nonce-${nonce}'`
      : `'self' 'unsafe-eval' 'unsafe-inline'`;

    response.headers.set("X-Frame-Options", allowSelfFrame ? "SAMEORIGIN" : "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "style-src-elem 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https:",
        `connect-src 'self' https:${devSources}`,
        `frame-ancestors ${allowSelfFrame ? "'self'" : "'none'"}`,
      ].join("; "),
    );
  };

  // Pass nonce to Next.js via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // ... rest of middleware, pass requestHeaders to NextResponse.next() ...
}
```
**Output:** Nonce generated per request, set in `x-nonce` header and CSP  
**Effort:** full day

##### Subtask: Read nonce in layout.tsx and pass to Script components
Open `apps/web/src/app/layout.tsx`. Read the nonce from headers:

```typescript
import { headers } from "next/headers";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? "";

  return (
    <html lang="en">
      <head>
        {/* Any inline scripts must use the nonce */}
      </head>
      <body>
        {/* Pass nonce to providers that need it */}
        {children}
      </body>
    </html>
  );
}
```
**Output:** `layout.tsx` reads nonce from headers  
**Effort:** half day

##### Subtask: Write middleware CSP test
Create `apps/web/src/middleware.test.ts` (file already exists at 2079 bytes — add to it):

```typescript
describe("CSP headers", () => {
  it("production CSP does not contain unsafe-eval", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const req = new NextRequest("http://localhost/dashboard");
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy") ?? "";

    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]{20,}/);

    process.env.NODE_ENV = originalEnv;
  });

  it("development CSP may contain unsafe-eval", async () => {
    process.env.NODE_ENV = "development";
    const req = new NextRequest("http://localhost/dashboard");
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("unsafe-eval");
  });

  it("nonce is different on each request", async () => {
    process.env.NODE_ENV = "production";
    const req1 = new NextRequest("http://localhost/dashboard");
    const req2 = new NextRequest("http://localhost/dashboard");
    const [res1, res2] = await Promise.all([middleware(req1), middleware(req2)]);
    const csp1 = res1.headers.get("Content-Security-Policy") ?? "";
    const csp2 = res2.headers.get("Content-Security-Policy") ?? "";
    const nonce1 = csp1.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];
    const nonce2 = csp2.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];
    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });
});
```
**Output:** 3 passing CSP tests in `middleware.test.ts`  
**Effort:** half day

---

## Story 4.2: Add Security Headers to apps/api

**As a** security engineer,  
**I want** `apps/api` to return standard security headers on all responses,  
**so that** browsers and security scanners do not flag the API as missing basic protections.

**Acceptance Criteria:**
- [ ] Every response from `apps/api` includes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] The existing CORS middleware is not broken
- [ ] Integration test verifies headers are present on `/health`, `/generate`, and error responses

### Task 4.2.1: Add security headers middleware to apps/api
**Owner:** Backend Engineer  
**Deliverable:** Security headers on all `apps/api` responses  
**Dependencies:** None

##### Subtask: Add security headers middleware to main.ts
Open `apps/api/src/main.ts`. After the CORS middleware registration, add:

```typescript
// Security headers — applied after CORS so they don't interfere with preflight
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Permitted-Cross-Domain-Policies", "none");
});
```
**Output:** Security headers on all `apps/api` responses  
**Effort:** < 2 hours

##### Subtask: Write test for security headers
Add to `apps/api/tests/api-smoke.test.ts`:
```typescript
describe("Security headers", () => {
  it("GET /health returns required security headers", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
```
**Output:** 1 passing test  
**Effort:** < 2 hours


---

## Architect addendum (2026-05-22)

The intern's draft is on the right track but ships looser CSP than necessary. Three corrections.

### Add Strict-Transport-Security — currently absent

`apps/web/src/middleware.ts:32-49` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP — but **not HSTS**. Add:

```typescript
response.headers.set(
  "Strict-Transport-Security",
  "max-age=63072000; includeSubDomains; preload",
);
```

Two-year max-age with `preload`. Submit `retuned.cv` to the Chrome HSTS preload list once verified in production.

### Replace `'unsafe-inline'` and `'unsafe-eval'` with nonce-based CSP

Verified in `middleware.ts:42-49`: current CSP allows `'unsafe-eval' 'unsafe-inline'` for `script-src` and `'unsafe-inline'` for `style-src` / `style-src-elem`. Both are required workarounds for vanilla Next.js — but Next.js 13+ supports nonce-based CSP via the App Router.

Spec:

1. Generate a per-request nonce in middleware: `const nonce = crypto.randomBytes(16).toString("base64")`.
2. Inject nonce into the response header: `Content-Security-Policy: script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`.
3. Pass nonce to the layout via request header: `requestHeaders.set("x-nonce", nonce)`.
4. Layout reads nonce from `headers()` and passes to all `<Script>` tags as `nonce={nonce}`.
5. Use `'strict-dynamic'` so dynamically-loaded scripts inherit trust from the nonce.

`'unsafe-inline'` for styles is a tougher case — Tailwind injects inline `<style>`. Either accept that on `style-src` only, or migrate to extracted-CSS mode (Next.js Tailwind v4 supports this via `@tailwindcss/postcss`).

### Lock down `connect-src`

Current `connect-src 'self' https:` is too permissive. Tighten to:

```
connect-src 'self' https://*.supabase.co https://api.openai.com https://api.anthropic.com https://r.jina.ai https://eu.posthog.com
```

(PostHog domain only after Charter 15 Epic 01 lands.) Block everything else so a successful XSS can't exfiltrate to attacker-controlled domains.

### Verification

- `securityheaders.com` scan of `https://retuned.cv` returns A+ grade.
- Lighthouse Best Practices audit shows no `unsafe-inline` or `unsafe-eval` warnings on production.
- `curl -I https://retuned.cv | grep -i strict-transport-security` shows the HSTS header.
