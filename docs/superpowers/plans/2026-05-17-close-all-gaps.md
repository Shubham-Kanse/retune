# Close All Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 9 verified gaps in apps/web covering email verification, profile persistence, career understanding, JSONB validation, observability, polling, and minor schema niceties so that onboarding → understanding → /profile is correct end-to-end with no silent failures.

**Architecture:** All changes are confined to `apps/web/src`. No new packages, no schema migrations, no API route changes outside web. Each task is independently deployable and leaves the app in a working state.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Supabase Auth, Zod, Vitest, TypeScript.

---

## File Map

| Task | Files modified | Files deleted | Files created |
|------|---------------|---------------|---------------|
| 1 (email) | `api/auth/verify-email/route.ts`, `(public)/verify-email/page.tsx`, `(auth)/layout.tsx`, `(onboarding)/layout.tsx`, `(public)/signup/page.tsx` | `api/auth/confirm-email/route.ts` | `api/auth/verify-email/__tests__/route.test.ts` |
| 2 (profile persist) | `lib/profile-domain/repositories/profile-repository.ts`, `lib/profile-assembly.ts`, `api/account/route.ts`, `api/generate/preflight/route.ts` | — | `lib/profile-domain/repositories/__tests__/profile-repository.test.ts` |
| 3 (understanding client) | `lib/career-understanding/repository.ts` | — | `lib/career-understanding/__tests__/repository.test.ts` |
| 4 (JSONB validation) | `lib/profile-domain/repositories/profile-repository.ts`, `lib/onboarding/session-store.ts`, `app/(auth)/profile/page.tsx` | — | — |
| 5 (observability) | `lib/career-understanding/auto-generate.ts` | — | `lib/career-understanding/__tests__/auto-generate.test.ts` |
| 6 (polling) | `components/profile/career-profile-page.tsx` | — | `app/api/profile/understanding/status/route.ts`, `hooks/use-understanding-freshness.ts`, `app/api/profile/understanding/status/__tests__/route.test.ts` |
| 7 (schema niceties) | `lib/onboarding/session-store.ts`, `lib/career-understanding/service.ts` | — | — |

---

## Task 1: Fix email verification (Gap #3)

**Context:** `confirm-email/route.ts` is a no-op stub that returns 200 for any token, causing `verify-email/page.tsx` to falsely show "Email verified". The real Supabase verification flow runs at `/api/auth/callback`. The fix: delete the stub, rewrite `verify-email/route.ts` to call `supabase.auth.resend()`, rewrite the page as a "check your inbox / resend" UI, gate both layouts on `emailVerified`, and redirect signup to `/verify-email`.

**Files:**
- Delete: `apps/web/src/app/api/auth/confirm-email/route.ts`
- Modify: `apps/web/src/app/api/auth/verify-email/route.ts`
- Modify: `apps/web/src/app/(public)/verify-email/page.tsx`
- Modify: `apps/web/src/app/(auth)/layout.tsx`
- Modify: `apps/web/src/app/(onboarding)/layout.tsx`
- Modify: `apps/web/src/app/(public)/signup/page.tsx`
- Create: `apps/web/src/app/api/auth/verify-email/__tests__/route.test.ts`

- [ ] **Step 1.1: Delete the confirm-email stub**

```bash
rm apps/web/src/app/api/auth/confirm-email/route.ts
```

- [ ] **Step 1.2: Rewrite verify-email route to call supabase.auth.resend()**

Replace the entire contents of `apps/web/src/app/api/auth/verify-email/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET() {
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 1.3: Rewrite verify-email page as "check your inbox / resend" UI**

Replace the entire contents of `apps/web/src/app/(public)/verify-email/page.tsx`:

```tsx
"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function VerifyEmailContent() {
  const params = useSearchParams();
  const email = params?.get("email") ?? "";
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState("");

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    setResendError("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to resend.");
      }
      setResendDone(true);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell title="Check your email">
      <div className="space-y-4 text-center">
        <Mail className="mx-auto size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          {email ? <strong className="text-foreground">{email}</strong> : "your email address"}.
          Click the link to activate your account.
        </p>
        {!resendDone ? (
          <Button
            onClick={handleResend}
            disabled={resending || !email}
            variant="outline"
            className="w-full"
          >
            {resending ? "Sending…" : "Resend verification email"}
          </Button>
        ) : (
          <p className="text-sm text-emerald-500">New verification email sent. Check your inbox.</p>
        )}
        {resendError ? <p className="text-xs text-destructive">{resendError}</p> : null}
        <p className="text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Loading…"><div /></AuthShell>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
```

- [ ] **Step 1.4: Gate (auth)/layout.tsx on emailVerified**

In `apps/web/src/app/(auth)/layout.tsx`, after the `getOnboardingStatus` call, add the email gate before the onboarding gate:

```typescript
// Current code (keep):
const session = await getSession();
if (!session) redirect("/login");

const status = await getOnboardingStatus(session.userId);
if (!status.onboardingCompleted) redirect("/onboarding");
```

Change to:

```typescript
const session = await getSession();
if (!session) redirect("/login");

const status = await getOnboardingStatus(session.userId);
// Email must be verified before entering the main app.
if (!status.emailVerified) {
  redirect(`/verify-email?email=${encodeURIComponent(session.email)}`);
}
if (!status.onboardingCompleted) redirect("/onboarding");
```

- [ ] **Step 1.5: Gate (onboarding)/layout.tsx on emailVerified**

In `apps/web/src/app/(onboarding)/layout.tsx`, same pattern:

```typescript
const session = await getSession();
if (!session) redirect("/login");

const status = await getOnboardingStatus(session.userId);
// Email must be verified before onboarding.
if (!status.emailVerified) {
  redirect(`/verify-email?email=${encodeURIComponent(session.email)}`);
}
if (status.onboardingCompleted) redirect("/dashboard");
```

- [ ] **Step 1.6: Redirect signup to /verify-email instead of /onboarding**

In `apps/web/src/app/(public)/signup/page.tsx`, find the line:
```typescript
router.push("/onboarding");
```
Change to:
```typescript
router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`);
```

(The variable holding the email in the signup form is `formData.email` or similar — read the actual variable name from the file before editing. The pattern is: after a successful `fetch("/api/auth/signup", ...)` call that returns `{ emailVerificationSent: true }`, redirect to verify-email.)

- [ ] **Step 1.7: Write tests for the resend route**

Create `apps/web/src/app/api/auth/verify-email/__tests__/route.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const resendMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { resend: resendMock },
  }),
}));

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Email is required.");
  });

  it("returns 200 on successful resend", async () => {
    resendMock.mockResolvedValue({ error: null });
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(resendMock).toHaveBeenCalledWith({ type: "signup", email: "user@example.com" });
  });

  it("returns 400 when supabase resend fails", async () => {
    resendMock.mockResolvedValue({ error: { message: "Rate limit exceeded" } });
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Rate limit exceeded");
  });
});
```

- [ ] **Step 1.8: Run tests**

```bash
cd /Users/shubhamkanse/retune
pnpm --filter @retune/web test -- --reporter=verbose src/app/api/auth/verify-email
```

Expected: 3 tests pass.

- [ ] **Step 1.9: Commit**

```bash
git add apps/web/src/app/api/auth/verify-email/ \
        apps/web/src/app/(public)/verify-email/page.tsx \
        apps/web/src/app/(auth)/layout.tsx \
        apps/web/src/app/(onboarding)/layout.tsx \
        apps/web/src/app/(public)/signup/page.tsx
git rm apps/web/src/app/api/auth/confirm-email/route.ts
git commit -m "fix(auth): close Gap #3 — real email verification gate, delete confirm-email stub"
```

---

## Task 2: Consolidate profile persistence (Gaps #4 + #8)

**Context:** `persistProfile` in `profile-repository.ts` uses Supabase with three sequential round-trips and no transaction. `persistProfileAssembly` in `profile-assembly.ts` is dead code (zero callers). Two ad-hoc `db.update(profiles)` calls in `account/route.ts` and `preflight/route.ts` bypass the repository. Fix: migrate `persistProfile` to Drizzle with `db.transaction()`, delete `persistProfileAssembly`, add `updateProfile` chokepoint, route ad-hoc updates through it.

**Files:**
- Modify: `apps/web/src/lib/profile-domain/repositories/profile-repository.ts`
- Modify: `apps/web/src/lib/profile-assembly.ts`
- Modify: `apps/web/src/app/api/account/route.ts`
- Modify: `apps/web/src/app/api/generate/preflight/route.ts`
- Create: `apps/web/src/lib/profile-domain/repositories/__tests__/profile-repository.test.ts`

- [ ] **Step 2.1: Delete persistProfileAssembly from profile-assembly.ts**

In `apps/web/src/lib/profile-assembly.ts`, delete the `persistProfileAssembly` function (lines 197–232) and its `markOnboardingSkipped` function (lines 234–240) if `markOnboardingSkipped` has no callers outside this file.

First verify callers:
```bash
grep -r "markOnboardingSkipped\|persistProfileAssembly" apps/web/src --include="*.ts" --include="*.tsx" -l
```

If only `profile-assembly.ts` itself appears, delete both functions. Also remove the `db`, `profiles`, `users` imports from `@retune/db` if they are no longer used after deletion (keep `computeCompletenessScore` if still used by `assembleProfile`).

- [ ] **Step 2.2: Migrate persistProfile to Drizzle with db.transaction()**

Replace the entire `persistProfile` function in `apps/web/src/lib/profile-domain/repositories/profile-repository.ts`. The new implementation:

```typescript
import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import {
  CAREER_PROFILE_VERSION,
  careerProfileToNormalized,
  isCareerProfileV1,
} from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import type { ProfileNormalized } from "../../contracts";
import { buildProfileMarkdown } from "../../services/markdown";
import { parseJsonSafe, stringifyJson } from "../../utils/json";

// ... (keep getProfileByUserId as-is, keep PersistProfileOptions interface as-is)

export async function persistProfile(
  opts: PersistProfileOptions,
): Promise<{ completenessScore: number }> {
  const inputProfile = opts.profile;
  const careerProfile = isCareerProfileV1(inputProfile) ? inputProfile : null;
  const normalized: ProfileNormalized = careerProfile
    ? careerProfileToNormalized(careerProfile, opts.sessionEmail, opts.sessionFullName ?? "")
    : (inputProfile as ProfileNormalized);
  const readiness =
    opts.readiness ?? (careerProfile?.onboarding.readiness as ProfileReadiness | null) ?? null;
  const profileMarkdown = opts.profileMarkdownOverride || buildProfileMarkdown(normalized);
  const completenessScore =
    readiness?.score ?? dbModule.computeCompletenessScore({ ...normalized, profileMarkdown });
  const extra = normalized as ProfileNormalized & { deEmphasisAreas?: string[] };

  await dbModule.db.transaction(async (tx) => {
    // Pre-read for fingerprint comparison (stale understanding detection).
    let staleSinceOverride: string | undefined;
    if (careerProfile) {
      const existing = await tx
        .select({
          careerUnderstandingFingerprint: dbModule.profiles.careerUnderstandingFingerprint,
          careerUnderstanding: dbModule.profiles.careerUnderstanding,
          careerUnderstandingStaleSince: dbModule.profiles.careerUnderstandingStaleSince,
        })
        .from(dbModule.profiles)
        .where(eq(dbModule.profiles.userId, opts.userId))
        .limit(1);
      const row = existing[0] as Record<string, unknown> | undefined;
      if (row) {
        const hasNonEmptyUnderstanding =
          row.careerUnderstanding != null &&
          typeof row.careerUnderstanding === "object" &&
          Object.keys(row.careerUnderstanding as Record<string, unknown>).length > 0;
        if (hasNonEmptyUnderstanding && typeof row.careerUnderstandingFingerprint === "string") {
          const newFp = careerProfileFingerprint(careerProfile);
          if (row.careerUnderstandingFingerprint !== newFp) {
            staleSinceOverride =
              typeof row.careerUnderstandingStaleSince === "string"
                ? row.careerUnderstandingStaleSince
                : new Date().toISOString();
          }
        }
      }
    }

    const now = new Date();
    const values: Parameters<typeof dbModule.db.insert>[0] extends never
      ? never
      : Record<string, unknown> = {
      userId: opts.userId,
      fullName: normalized.fullName || opts.sessionFullName || "",
      email: normalized.email || opts.sessionEmail,
      phone: normalized.phone ?? null,
      linkedin: normalized.linkedin ?? null,
      location: normalized.location ?? "",
      visaStatus: normalized.visaStatus ?? null,
      relocationPreferences: stringifyJson(normalized.relocationPreferences),
      targetRoles: stringifyJson(normalized.targetRoles),
      experienceLevel: normalized.experienceLevel ?? null,
      currentTitle: normalized.currentTitle ?? null,
      experience: stringifyJson(normalized.experience),
      education: stringifyJson(normalized.education),
      certifications: stringifyJson(normalized.certifications),
      projects: stringifyJson(normalized.projects),
      skillsTier1: stringifyJson(normalized.skillsTier1),
      skillsTier2: stringifyJson(normalized.skillsTier2),
      skillsTier3: stringifyJson(normalized.skillsTier3),
      voiceNotes: normalized.voiceNotes ?? null,
      deEmphasisAreas: JSON.stringify(
        extra.deEmphasisAreas ?? careerProfile?.resumeWritingPreferences.deEmphasisAreas.value ?? [],
      ),
      careerProfile: careerProfile ?? {},
      careerProfileVersion: CAREER_PROFILE_VERSION,
      profileReadiness: readiness ?? {},
      profileMarkdown,
      completenessScore,
      ...(opts.markOnboardingCompleted ? { onboardingCompletedAt: now } : {}),
      ...(staleSinceOverride ? { careerUnderstandingStaleSince: new Date(staleSinceOverride) } : {}),
      updatedAt: now,
    };

    await tx
      .insert(dbModule.profiles)
      .values(values as typeof dbModule.profiles.$inferInsert)
      .onConflictDoUpdate({
        target: dbModule.profiles.userId,
        set: values as Partial<typeof dbModule.profiles.$inferInsert>,
      });

    if (opts.markOnboardingCompleted) {
      await tx
        .update(dbModule.users)
        .set({
          onboardingCompleted: true,
          onboardingCompletedAt: now,
          fullName: (normalized.fullName || opts.sessionFullName) ?? undefined,
          updatedAt: now,
        })
        .where(eq(dbModule.users.id, opts.userId));
    }
  });

  return { completenessScore };
}
```

**Important:** After writing this, check the Drizzle schema for `profiles` to confirm column names. Run:
```bash
grep -E "careerUnderstandingFingerprint|careerUnderstandingStaleSince|deEmphasisAreas|onboardingCompletedAt" packages/db/src/pg/schema.ts
```
Use the exact camelCase column names from the schema. If a column doesn't exist in the schema, omit it from the insert (don't add it — that's a separate migration task).

- [ ] **Step 2.3: Add updateProfile chokepoint to profile-repository.ts**

Add this function at the end of `profile-repository.ts`:

```typescript
/**
 * Partial update for ad-hoc profile column changes (e.g. fullName rename,
 * preflight skill tier updates). All callers must go through here so
 * staleness logic and audit trail stay consistent.
 */
export async function updateProfile(
  userId: string,
  patch: Partial<typeof dbModule.profiles.$inferInsert>,
): Promise<void> {
  await dbModule.db
    .update(dbModule.profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(dbModule.profiles.userId, userId));
}
```

- [ ] **Step 2.4: Route account/route.ts through updateProfile**

In `apps/web/src/app/api/account/route.ts`, replace the two separate `db.update` calls for `fullName`:

```typescript
// BEFORE:
await db.update(users).set({ fullName, updatedAt: now }).where(eq(users.id, session.userId));
await db.update(profiles).set({ fullName, updatedAt: now }).where(eq(profiles.userId, session.userId));

// AFTER:
import { updateProfile } from "@/lib/profile-domain/repositories/profile-repository";
// ...
await db.update(users).set({ fullName, updatedAt: now }).where(eq(users.id, session.userId));
await updateProfile(session.userId, { fullName });
```

Remove the `profiles` import from `@retune/db` in this file if it's no longer used elsewhere in the file.

- [ ] **Step 2.5: Route preflight/route.ts through updateProfile**

In `apps/web/src/app/api/generate/preflight/route.ts`, replace the ad-hoc `db.update(profiles)` call:

```typescript
// BEFORE:
await db.update(profiles).set({
  skillsTier2: JSON.stringify(nextTier2),
  profileMarkdown,
  updatedAt: new Date(),
}).where(eq(profiles.userId, session.userId));

// AFTER:
import { updateProfile } from "@/lib/profile-domain/repositories/profile-repository";
// ...
await updateProfile(session.userId, {
  skillsTier2: JSON.stringify(nextTier2),
  profileMarkdown,
});
```

Remove the `profiles` import from `@retune/db` in this file if it's no longer used elsewhere.

- [ ] **Step 2.6: Write tests for persistProfile transaction behavior**

Create `apps/web/src/lib/profile-domain/repositories/__tests__/profile-repository.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Drizzle db
const insertMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@retune/db", () => {
  const profiles = { userId: "userId" };
  const users = { id: "id" };
  return {
    db: {
      transaction: transactionMock,
      insert: insertMock,
      update: updateMock,
      select: selectMock,
    },
    profiles,
    users,
    computeCompletenessScore: () => 50,
  };
});

vi.mock("@/lib/career-understanding/fingerprint", () => ({
  careerProfileFingerprint: () => "fp-abc",
}));

vi.mock("@/lib/onboarding/career-profile.schema", () => ({
  CAREER_PROFILE_VERSION: "career-profile-v1",
  isCareerProfileV1: () => false,
  careerProfileToNormalized: () => ({}),
}));

describe("persistProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: transaction executes the callback
    transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
        update: () => ({ set: () => ({ where: async () => {} }) }),
      };
      await cb(tx);
    });
  });

  it("wraps upsert and users update in a single transaction", async () => {
    const { persistProfile } = await import("../profile-repository");
    await persistProfile({
      userId: "u1",
      sessionEmail: "u@example.com",
      profile: { fullName: "Jane", email: "u@example.com", location: "Dublin", experienceLevel: "mid", targetRoles: [], relocationPreferences: [], experience: [], education: [], certifications: [], projects: [], skillsTier1: [], skillsTier2: [], skillsTier3: [], voiceNotes: null, phone: null, linkedin: null, visaStatus: null, currentTitle: null, profileMarkdown: "" } as any,
      markOnboardingCompleted: true,
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("does not update users when markOnboardingCompleted is false", async () => {
    let usersUpdateCalled = false;
    transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
        update: () => ({
          set: (vals: Record<string, unknown>) => {
            if ("onboardingCompleted" in vals) usersUpdateCalled = true;
            return { where: async () => {} };
          },
        }),
      };
      await cb(tx);
    });
    const { persistProfile } = await import("../profile-repository");
    await persistProfile({
      userId: "u1",
      sessionEmail: "u@example.com",
      profile: { fullName: "Jane", email: "u@example.com", location: "Dublin", experienceLevel: "mid", targetRoles: [], relocationPreferences: [], experience: [], education: [], certifications: [], projects: [], skillsTier1: [], skillsTier2: [], skillsTier3: [], voiceNotes: null, phone: null, linkedin: null, visaStatus: null, currentTitle: null, profileMarkdown: "" } as any,
      markOnboardingCompleted: false,
    });
    expect(usersUpdateCalled).toBe(false);
  });
});
```

- [ ] **Step 2.7: Run tests**

```bash
pnpm --filter @retune/web test -- --reporter=verbose src/lib/profile-domain/repositories
```

Expected: 2 tests pass.

- [ ] **Step 2.8: Typecheck**

```bash
pnpm --filter @retune/web exec tsc --noEmit
```

Fix any type errors before committing.

- [ ] **Step 2.9: Commit**

```bash
git add apps/web/src/lib/profile-domain/ \
        apps/web/src/lib/profile-assembly.ts \
        apps/web/src/app/api/account/route.ts \
        apps/web/src/app/api/generate/preflight/route.ts
git commit -m "fix(profile): close Gaps #4+#8 — Drizzle transaction for persistProfile, delete dead persistProfileAssembly, add updateProfile chokepoint"
```

---

## Task 3: Single client for career understanding (Gap #5)

**Context:** `persistCareerUnderstanding` and `markCareerUnderstandingStale` in `repository.ts` use Supabase with snake_case keys. The read already uses Drizzle. Fix: migrate both writes to Drizzle, implement optimistic-revision check via `.returning()`, drop the Supabase import.

**Files:**
- Modify: `apps/web/src/lib/career-understanding/repository.ts`
- Create: `apps/web/src/lib/career-understanding/__tests__/repository.test.ts`

- [ ] **Step 3.1: Migrate persistCareerUnderstanding to Drizzle**

Replace the `persistCareerUnderstanding` function in `apps/web/src/lib/career-understanding/repository.ts`:

```typescript
export async function persistCareerUnderstanding(params: {
  userId: string;
  understanding: CareerUnderstandingV1;
  expectedRevision?: number;
}): Promise<{ revision: number }> {
  const now = new Date();
  const understanding: CareerUnderstandingV1 = {
    ...params.understanding,
    schemaVersion: CAREER_UNDERSTANDING_VERSION,
    userId: params.userId,
    updatedAt: now.toISOString(),
    revision: params.understanding.revision,
  };

  const conditions = [eq(dbModule.profiles.userId, params.userId)];
  if (typeof params.expectedRevision === "number") {
    conditions.push(
      eq(dbModule.profiles.careerUnderstandingRevision as any, params.expectedRevision),
    );
  }

  const updated = await dbModule.db
    .update(dbModule.profiles)
    .set({
      careerUnderstanding: understanding as unknown as typeof dbModule.profiles.$inferInsert["careerUnderstanding"],
      careerUnderstandingVersion: CAREER_UNDERSTANDING_VERSION,
      careerUnderstandingFingerprint: understanding.sourceProfileFingerprint,
      careerUnderstandingRevision: understanding.revision,
      careerUnderstandingStaleSince: understanding.staleSince ? new Date(understanding.staleSince) : null,
      careerUnderstandingUpdatedAt: now,
      updatedAt: now,
    })
    .where(and(...conditions))
    .returning({ rev: dbModule.profiles.careerUnderstandingRevision });

  if (!updated || updated.length === 0) {
    throw new StaleRevisionError();
  }
  return { revision: understanding.revision };
}
```

Add `and` to the drizzle-orm import at the top of the file.

- [ ] **Step 3.2: Migrate markCareerUnderstandingStale to Drizzle**

Replace `markCareerUnderstandingStale`:

```typescript
export async function markCareerUnderstandingStale(params: {
  userId: string;
  staleSince?: Date;
}): Promise<void> {
  const ts = params.staleSince ?? new Date();
  await dbModule.db
    .update(dbModule.profiles)
    .set({
      careerUnderstandingStaleSince: ts,
      updatedAt: ts,
    })
    .where(eq(dbModule.profiles.userId, params.userId));
}
```

- [ ] **Step 3.3: Remove Supabase import**

Delete the `import { createClient } from "@/lib/supabase/server";` line from `repository.ts`. Verify no other function in the file uses `createClient`.

Add `and` to the existing `import { eq } from "drizzle-orm"` line: `import { and, eq } from "drizzle-orm"`.

- [ ] **Step 3.4: Verify Drizzle schema has the required columns**

```bash
grep -E "careerUnderstandingRevision|careerUnderstandingFingerprint|careerUnderstandingStaleSince|careerUnderstandingUpdatedAt|careerUnderstandingVersion" packages/db/src/pg/schema.ts
```

If any column is missing, note it but do NOT add a migration in this task — use the column name that exists and skip the missing one.

- [ ] **Step 3.5: Write tests for stale-revision throw and success**

Create `apps/web/src/lib/career-understanding/__tests__/repository.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { StaleRevisionError } from "../repository";

const updateMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@retune/db", () => ({
  db: {
    update: updateMock,
    select: selectMock,
  },
  profiles: {
    userId: "userId",
    careerUnderstanding: "careerUnderstanding",
    careerUnderstandingVersion: "careerUnderstandingVersion",
    careerUnderstandingFingerprint: "careerUnderstandingFingerprint",
    careerUnderstandingRevision: "careerUnderstandingRevision",
    careerUnderstandingStaleSince: "careerUnderstandingStaleSince",
    careerUnderstandingUpdatedAt: "careerUnderstandingUpdatedAt",
    updatedAt: "updatedAt",
  },
}));

function makeUpdateChain(returnValue: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returnValue);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  updateMock.mockReturnValue({ set });
  return { set, where, returning };
}

describe("persistCareerUnderstanding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws StaleRevisionError when no rows updated", async () => {
    makeUpdateChain([]);
    const { persistCareerUnderstanding } = await import("../repository");
    await expect(
      persistCareerUnderstanding({
        userId: "u1",
        understanding: { revision: 2, sourceProfileFingerprint: "fp", staleSince: null, userId: "u1", schemaVersion: "career-understanding-v1" } as any,
        expectedRevision: 1,
      }),
    ).rejects.toThrow(StaleRevisionError);
  });

  it("returns revision on success", async () => {
    makeUpdateChain([{ rev: 2 }]);
    const { persistCareerUnderstanding } = await import("../repository");
    const result = await persistCareerUnderstanding({
      userId: "u1",
      understanding: { revision: 2, sourceProfileFingerprint: "fp", staleSince: null, userId: "u1", schemaVersion: "career-understanding-v1" } as any,
    });
    expect(result.revision).toBe(2);
  });
});

describe("markCareerUnderstandingStale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls db.update with staleSince", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });
    const { markCareerUnderstandingStale } = await import("../repository");
    const ts = new Date("2026-01-01");
    await markCareerUnderstandingStale({ userId: "u1", staleSince: ts });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ careerUnderstandingStaleSince: ts }));
  });
});
```

- [ ] **Step 3.6: Run tests**

```bash
pnpm --filter @retune/web test -- --reporter=verbose src/lib/career-understanding/__tests__/repository.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3.7: Commit**

```bash
git add apps/web/src/lib/career-understanding/repository.ts \
        apps/web/src/lib/career-understanding/__tests__/repository.test.ts
git commit -m "fix(understanding): close Gap #5 — migrate persistCareerUnderstanding + markStale to Drizzle, drop Supabase client"
```

---

## Task 4: Zod-validate JSONB reads (Gap #6)

**Context:** `careerProfile`, `careerUnderstanding`, `profileReadiness` are read from JSONB columns with raw `as` casts and no schema validation. `session-store.ts` `parseProfile` uses a duck-type check. Fix: wrap critical reads with `safeParse`, log mismatches as onboarding events, tighten `parseProfile`.

**Files:**
- Modify: `apps/web/src/lib/profile-domain/repositories/profile-repository.ts`
- Modify: `apps/web/src/lib/onboarding/session-store.ts`
- Modify: `apps/web/src/app/(auth)/profile/page.tsx`

- [ ] **Step 4.1: Add profileReadinessSchema to onboarding/types.ts or career-profile.schema.ts**

In `apps/web/src/lib/onboarding/career-profile.schema.ts`, add after the existing exports:

```typescript
import { z } from "zod";

export const profileReadinessSchema = z.object({
  canEnterDashboard: z.boolean(),
  score: z.number(),
  blockers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  completedCategories: z.record(z.string(), z.number()).default({}),
});
```

- [ ] **Step 4.2: Wrap JSONB reads in getProfileByUserId with safeParse**

In `apps/web/src/lib/profile-domain/repositories/profile-repository.ts`, update `getProfileByUserId` to validate the three JSONB columns:

```typescript
import { careerProfileSchema } from "@/lib/onboarding/career-profile.schema";
import { careerUnderstandingSchema } from "@/lib/career-understanding/schema";
import { profileReadinessSchema } from "@/lib/onboarding/career-profile.schema";

// Inside getProfileByUserId, replace the raw casts:
const rawCareerProfile = (row as { careerProfile?: unknown }).careerProfile ?? null;
const careerProfileParsed = careerProfileSchema.safeParse(rawCareerProfile);
const careerProfile = careerProfileParsed.success ? careerProfileParsed.data : null;
if (!careerProfileParsed.success && rawCareerProfile != null) {
  console.warn("[profile-repository] careerProfile schema mismatch", careerProfileParsed.error.issues[0]?.message);
}

const rawCareerUnderstanding = (row as { careerUnderstanding?: unknown }).careerUnderstanding ?? null;
const careerUnderstandingParsed = careerUnderstandingSchema.safeParse(rawCareerUnderstanding);
const careerUnderstanding = careerUnderstandingParsed.success ? careerUnderstandingParsed.data : null;
if (!careerUnderstandingParsed.success && rawCareerUnderstanding != null) {
  console.warn("[profile-repository] careerUnderstanding schema mismatch", careerUnderstandingParsed.error.issues[0]?.message);
}

const rawProfileReadiness = (row as { profileReadiness?: unknown }).profileReadiness ?? null;
const profileReadinessParsed = profileReadinessSchema.safeParse(rawProfileReadiness);
const profileReadiness = profileReadinessParsed.success ? profileReadinessParsed.data : null;
if (!profileReadinessParsed.success && rawProfileReadiness != null) {
  console.warn("[profile-repository] profileReadiness schema mismatch", profileReadinessParsed.error.issues[0]?.message);
}
```

Return `careerProfile`, `careerUnderstanding`, `profileReadiness` from the validated variables instead of the raw casts.

- [ ] **Step 4.3: Tighten session-store parseProfile to use careerProfileSchema.safeParse**

In `apps/web/src/lib/onboarding/session-store.ts`, replace the `parseProfile` function:

```typescript
// BEFORE:
function parseProfile(raw: unknown, userId: string): UserCareerProfile {
  if (!raw || typeof raw !== "object") return createEmptyProfile(userId);
  const obj = raw as Record<string, unknown>;
  if (obj.identity && typeof obj.identity === "object" && (obj.identity as any).fullName?.value !== undefined) {
    return upgradeProfile(obj, userId);
  }
  return createEmptyProfile(userId);
}

// AFTER:
import { careerProfileSchema } from "@/lib/onboarding/career-profile.schema";

function parseProfile(raw: unknown, userId: string): UserCareerProfile {
  if (!raw || typeof raw !== "object") return createEmptyProfile(userId);
  const parsed = careerProfileSchema.safeParse(raw);
  if (parsed.success) {
    return upgradeProfile(raw as Record<string, unknown>, userId);
  }
  // Legacy format or schema mismatch — return empty profile.
  // The mismatch is expected for old sessions; no need to warn here.
  return createEmptyProfile(userId);
}
```

- [ ] **Step 4.4: Validate careerProfile in profile/page.tsx**

In `apps/web/src/app/(auth)/profile/page.tsx`, the existing code already uses `isCareerProfileV1` which calls `careerProfileSchema.safeParse` internally. Verify this is the case:

```bash
grep -n "isCareerProfileV1\|safeParse" apps/web/src/app/(auth)/profile/page.tsx
```

If `isCareerProfileV1` is used (it is, confirmed), no change needed here — it already validates via Zod internally.

- [ ] **Step 4.5: Typecheck**

```bash
pnpm --filter @retune/web exec tsc --noEmit
```

Fix any type errors.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/src/lib/profile-domain/repositories/profile-repository.ts \
        apps/web/src/lib/onboarding/session-store.ts \
        apps/web/src/lib/onboarding/career-profile.schema.ts
git commit -m "fix(validation): close Gap #6 — Zod-validate JSONB reads for careerProfile, careerUnderstanding, profileReadiness"
```

---

## Task 5: Observability + retry for background understanding (Gap #7)

**Context:** `auto-generate.ts` has zero `logOnboardingEvent` calls, only `console.warn`. Failures are unobservable. Single-attempt with no retry on transient AI errors. Fix: emit events at every transition, add bounded retry (2 retries, doubling delay) for transient errors.

**Files:**
- Modify: `apps/web/src/lib/career-understanding/auto-generate.ts`
- Create: `apps/web/src/lib/career-understanding/__tests__/auto-generate.test.ts`

- [ ] **Step 5.1: Rewrite auto-generate.ts with events and retry**

Replace the entire contents of `apps/web/src/lib/career-understanding/auto-generate.ts`:

```typescript
/**
 * Background helper that generates and persists the initial career
 * understanding right after onboarding completes.
 *
 * Fire-and-forget. Emits onboarding_events at every transition so failures
 * are observable. Retries transient AI errors up to 2 times with doubling
 * delay (1s → 2s). Deterministic errors (profile_too_thin,
 * model_returned_disallowed_facts) are not retried.
 */

import { logOnboardingEvent } from "@/lib/onboarding/events";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { CareerUnderstandingAiError, generateInitialCareerUnderstanding } from "./service";
import { persistCareerUnderstanding } from "./repository";

const DETERMINISTIC_ERRORS = new Set(["profile_too_thin", "model_returned_disallowed_facts"]);
const MAX_RETRIES = 2;

interface AutoGenerateParams {
  userId: string;
  profile?: CareerProfileV1 | null;
  readiness?: ProfileReadiness | null;
}

export function triggerInitialUnderstandingGeneration(params: AutoGenerateParams): void {
  const traceId = randomUUID().slice(0, 8);
  void runInBackground(params, traceId).catch((err) => {
    console.warn("[understanding] background initial generation failed", err);
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInBackground(params: AutoGenerateParams, traceId: string): Promise<void> {
  let profile = params.profile;
  let readiness = params.readiness ?? null;

  if (!profile) {
    const rows = await dbModule.db
      .select()
      .from(dbModule.profiles)
      .where(eq(dbModule.profiles.userId, params.userId))
      .limit(1);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      await logOnboardingEvent({
        userId: params.userId,
        eventType: "understanding.bg.skipped_no_profile",
        payload: { traceId },
      });
      return;
    }
    if (!isCareerProfileV1(row.careerProfile)) {
      await logOnboardingEvent({
        userId: params.userId,
        eventType: "understanding.bg.skipped_not_v1",
        payload: { traceId },
      });
      return;
    }
    profile = row.careerProfile as CareerProfileV1;
    readiness = (row.profileReadiness as ProfileReadiness | null | undefined) ?? null;

    const existingRevision =
      typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0;
    if (existingRevision > 0) {
      await logOnboardingEvent({
        userId: params.userId,
        eventType: "understanding.bg.skipped_existing_revision",
        payload: { traceId, revision: existingRevision },
      });
      return;
    }
  }

  await logOnboardingEvent({
    userId: params.userId,
    eventType: "understanding.bg.started",
    payload: { traceId },
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt); // 1s, 2s
    }
    try {
      const startMs = Date.now();
      const result = await generateInitialCareerUnderstanding({
        userId: params.userId,
        profile,
        readiness,
      });
      const aiLatencyMs = Date.now() - startMs;
      const understanding = { ...result.understanding, revision: 1 };
      await persistCareerUnderstanding({
        userId: params.userId,
        understanding,
        expectedRevision: 0,
      });
      await logOnboardingEvent({
        userId: params.userId,
        eventType: "understanding.bg.succeeded",
        payload: { traceId, attempt },
        aiLatencyMs,
      });
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof CareerUnderstandingAiError) {
        if (err.reason === "profile_too_thin") {
          await logOnboardingEvent({
            userId: params.userId,
            eventType: "understanding.bg.skipped_thin_profile",
            payload: { traceId },
          });
          return;
        }
        if (DETERMINISTIC_ERRORS.has(err.reason)) {
          await logOnboardingEvent({
            userId: params.userId,
            eventType: "understanding.bg.failed",
            payload: { traceId, attempt },
            errorCode: err.reason,
          });
          return;
        }
      }
      // Transient error — will retry if attempts remain
    }
  }

  await logOnboardingEvent({
    userId: params.userId,
    eventType: "understanding.bg.failed",
    payload: { traceId, attempts: MAX_RETRIES + 1 },
    errorCode: lastError instanceof CareerUnderstandingAiError ? lastError.reason : "unknown",
  });
  throw lastError;
}
```

**Important:** Before writing this, check what `logOnboardingEvent` accepts:
```bash
grep -n "logOnboardingEvent\|eventType\|aiLatencyMs\|errorCode" apps/web/src/lib/onboarding/events.ts 2>/dev/null || grep -rn "logOnboardingEvent" apps/web/src/lib --include="*.ts" -l
```
Match the exact parameter shape. If `aiLatencyMs` or `errorCode` are not in the signature, omit them from the calls.

- [ ] **Step 5.2: Write tests for event sequence and retry**

Create `apps/web/src/lib/career-understanding/__tests__/auto-generate.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const logEventMock = vi.fn().mockResolvedValue(undefined);
const generateMock = vi.fn();
const persistMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@/lib/onboarding/events", () => ({ logOnboardingEvent: logEventMock }));
vi.mock("../service", () => ({
  generateInitialCareerUnderstanding: generateMock,
  CareerUnderstandingAiError: class CareerUnderstandingAiError extends Error {
    reason: string;
    constructor(reason: string, msg: string) { super(msg); this.reason = reason; }
  },
}));
vi.mock("../repository", () => ({ persistCareerUnderstanding: persistMock }));
vi.mock("@retune/db", () => ({
  db: { select: selectMock },
  profiles: {},
}));
vi.mock("@/lib/onboarding/career-profile.schema", () => ({
  isCareerProfileV1: (v: unknown) => v != null && typeof v === "object" && (v as any).schemaVersion === "career-profile-v1",
}));

function makeProfile() {
  return { schemaVersion: "career-profile-v1", id: "p1", userId: "u1" } as any;
}

describe("triggerInitialUnderstandingGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("emits started + succeeded on success", async () => {
    generateMock.mockResolvedValue({ understanding: { revision: 0, sourceProfileFingerprint: "fp", staleSince: null, userId: "u1", schemaVersion: "career-understanding-v1" } });
    persistMock.mockResolvedValue({ revision: 1 });

    const { triggerInitialUnderstandingGeneration } = await import("../auto-generate");
    triggerInitialUnderstandingGeneration({ userId: "u1", profile: makeProfile() });
    await vi.runAllTimersAsync();

    const eventTypes = logEventMock.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain("understanding.bg.started");
    expect(eventTypes).toContain("understanding.bg.succeeded");
  });

  it("emits skipped_thin_profile and does not retry on profile_too_thin", async () => {
    const { CareerUnderstandingAiError } = await import("../service");
    generateMock.mockRejectedValue(new CareerUnderstandingAiError("profile_too_thin", "thin"));

    const { triggerInitialUnderstandingGeneration } = await import("../auto-generate");
    triggerInitialUnderstandingGeneration({ userId: "u1", profile: makeProfile() });
    await vi.runAllTimersAsync();

    const eventTypes = logEventMock.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain("understanding.bg.skipped_thin_profile");
    expect(generateMock).toHaveBeenCalledTimes(1); // no retry
  });

  it("retries up to MAX_RETRIES on transient error then emits failed", async () => {
    const transientErr = new Error("network timeout");
    generateMock.mockRejectedValue(transientErr);

    const { triggerInitialUnderstandingGeneration } = await import("../auto-generate");
    triggerInitialUnderstandingGeneration({ userId: "u1", profile: makeProfile() });
    await vi.runAllTimersAsync();

    expect(generateMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
    const eventTypes = logEventMock.mock.calls.map((c) => c[0].eventType);
    expect(eventTypes).toContain("understanding.bg.failed");
  });
});
```

- [ ] **Step 5.3: Run tests**

```bash
pnpm --filter @retune/web test -- --reporter=verbose src/lib/career-understanding/__tests__/auto-generate.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add apps/web/src/lib/career-understanding/auto-generate.ts \
        apps/web/src/lib/career-understanding/__tests__/auto-generate.test.ts
git commit -m "fix(understanding): close Gap #7 — emit onboarding events at every transition, add bounded retry for transient AI errors"
```

---

## Task 6: Understanding polling on /profile (Gaps #9 + #10)

**Context:** After onboarding `finish_now`, the background understanding generation hasn't finished by the time the user lands on `/profile`. The page renders a placeholder. There's no polling or revalidation. Fix: add a thin `GET /api/profile/understanding/status` endpoint, add a `useUnderstandingFreshness` hook that polls every 1.5s when `understandingPersisted === false` (up to 60s), and every 30s when visible (for Gap #10 staleness detection).

**Files:**
- Create: `apps/web/src/app/api/profile/understanding/status/route.ts`
- Create: `apps/web/src/hooks/use-understanding-freshness.ts`
- Modify: `apps/web/src/components/profile/career-profile-page.tsx`
- Create: `apps/web/src/app/api/profile/understanding/status/__tests__/route.test.ts`

- [ ] **Step 6.1: Create the status endpoint**

Create `apps/web/src/app/api/profile/understanding/status/route.ts`:

```typescript
import { getApiSession } from "@/lib/session";
import { getCareerUnderstandingByUserId } from "@/lib/career-understanding/repository";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await getCareerUnderstandingByUserId(session.userId);
  if (!record) {
    return NextResponse.json({ revision: 0, updatedAt: null, staleSince: null });
  }
  return NextResponse.json({
    revision: record.revision,
    updatedAt: record.updatedAt?.toISOString() ?? null,
    staleSince: record.staleSince?.toISOString() ?? null,
  });
}
```

- [ ] **Step 6.2: Create useUnderstandingFreshness hook**

Create `apps/web/src/hooks/use-understanding-freshness.ts`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface UnderstandingStatus {
  revision: number;
  updatedAt: string | null;
  staleSince: string | null;
}

interface UseUnderstandingFreshnessOptions {
  /** Revision the page was server-rendered with. */
  initialRevision: number;
  /** staleSince the page was server-rendered with. */
  initialStaleSince: string | null;
  /** When true, poll aggressively (1.5s) until revision > 0 or timeout. */
  waitingForFirst: boolean;
}

/**
 * Polls /api/profile/understanding/status and calls router.refresh() when
 * the revision or staleSince changes from the server-rendered values.
 *
 * Two modes:
 * - waitingForFirst=true: polls every 1.5s for up to 60s (post-onboarding)
 * - waitingForFirst=false: polls every 30s when tab is visible (Gap #10)
 */
export function useUnderstandingFreshness(opts: UseUnderstandingFreshnessOptions) {
  const router = useRouter();
  const initialRevision = useRef(opts.initialRevision);
  const initialStaleSince = useRef(opts.initialStaleSince);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const interval = opts.waitingForFirst ? 1500 : 30_000;
    const timeout = opts.waitingForFirst ? 60_000 : Infinity;

    let timerId: ReturnType<typeof setInterval>;

    function poll() {
      if (Date.now() - startedAt.current > timeout) {
        clearInterval(timerId);
        return;
      }
      if (!opts.waitingForFirst && document.visibilityState !== "visible") return;

      fetch("/api/profile/understanding/status")
        .then((r) => r.json() as Promise<UnderstandingStatus>)
        .then((status) => {
          const revisionChanged = status.revision !== initialRevision.current && status.revision > 0;
          const staleChanged = status.staleSince !== initialStaleSince.current;
          if (revisionChanged || staleChanged) {
            clearInterval(timerId);
            router.refresh();
          }
        })
        .catch(() => {
          // Network error — keep polling
        });
    }

    timerId = setInterval(poll, interval);
    return () => clearInterval(timerId);
  }, [opts.waitingForFirst, router]);
}
```

- [ ] **Step 6.3: Wire useUnderstandingFreshness into CareerProfilePage**

In `apps/web/src/components/profile/career-profile-page.tsx`, add the hook call:

```typescript
import { useUnderstandingFreshness } from "@/hooks/use-understanding-freshness";

// Inside CareerProfilePage, after the existing state declarations:
useUnderstandingFreshness({
  initialRevision: props.initialUnderstanding?.revision ?? 0,
  initialStaleSince: props.initialUnderstanding?.staleSince ?? null,
  waitingForFirst: !props.understandingPersisted,
});
```

The `props.understandingPersisted` is already passed from the server component. When `false`, the hook polls aggressively. When `true`, it polls every 30s for staleness.

- [ ] **Step 6.4: Write tests for the status endpoint**

Create `apps/web/src/app/api/profile/understanding/status/__tests__/route.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const getApiSessionMock = vi.fn();
const getCareerUnderstandingMock = vi.fn();

vi.mock("@/lib/session", () => ({ getApiSession: getApiSessionMock }));
vi.mock("@/lib/career-understanding/repository", () => ({
  getCareerUnderstandingByUserId: getCareerUnderstandingMock,
}));

describe("GET /api/profile/understanding/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    getApiSessionMock.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns revision 0 when no understanding exists", async () => {
    getApiSessionMock.mockResolvedValue({ userId: "u1", email: "u@example.com" });
    getCareerUnderstandingMock.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ revision: 0, updatedAt: null, staleSince: null });
  });

  it("returns revision and timestamps when understanding exists", async () => {
    getApiSessionMock.mockResolvedValue({ userId: "u1", email: "u@example.com" });
    const updatedAt = new Date("2026-01-01T00:00:00Z");
    getCareerUnderstandingMock.mockResolvedValue({
      revision: 3,
      updatedAt,
      staleSince: null,
      understanding: {},
      fingerprint: "fp",
    });
    const { GET } = await import("../route");
    const res = await GET();
    const body = await res.json();
    expect(body.revision).toBe(3);
    expect(body.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.staleSince).toBeNull();
  });
});
```

- [ ] **Step 6.5: Run tests**

```bash
pnpm --filter @retune/web test -- --reporter=verbose src/app/api/profile/understanding/status
```

Expected: 3 tests pass.

- [ ] **Step 6.6: Typecheck**

```bash
pnpm --filter @retune/web exec tsc --noEmit
```

- [ ] **Step 6.7: Commit**

```bash
git add apps/web/src/app/api/profile/understanding/status/ \
        apps/web/src/hooks/use-understanding-freshness.ts \
        apps/web/src/components/profile/career-profile-page.tsx
git commit -m "fix(profile): close Gaps #9+#10 — add understanding status endpoint, useUnderstandingFreshness polling hook"
```

---

## Task 7: Minor schema niceties (Gap #11)

**Context:** `createEmptyProfile` sets `id: ""`. `service.ts` has a branch that checks `profile.id.length > 0` which always falls to `null` for email-signup users. These are low-risk but create confusing dead paths.

**Files:**
- Modify: `apps/web/src/lib/onboarding/session-store.ts`
- Modify: `apps/web/src/lib/career-understanding/service.ts`

- [ ] **Step 7.1: Fix id: "" in createEmptyProfile**

In `apps/web/src/lib/onboarding/session-store.ts`, change:

```typescript
// BEFORE:
id: "",

// AFTER:
id: crypto.randomUUID(),
```

`crypto` is available globally in Node 22+ and in the browser. No import needed.

- [ ] **Step 7.2: Verify service.ts profile.id branch is handled correctly**

In `apps/web/src/lib/career-understanding/service.ts`, the branch at lines 108-112:

```typescript
const profileId =
  params.profileId ??
  (typeof params.profile.id === "string" && params.profile.id.length > 0
    ? params.profile.id
    : null);
```

After the fix in Step 7.1, `profile.id` will always be a non-empty UUID. The branch is now correct — it will use the UUID as `profileId`. No change needed to `service.ts`.

Verify by running:
```bash
grep -n "profile\.id" apps/web/src/lib/career-understanding/service.ts
```

Confirm both occurrences (lines ~110 and ~271) will now resolve to the UUID rather than null.

- [ ] **Step 7.3: Typecheck**

```bash
pnpm --filter @retune/web exec tsc --noEmit
```

- [ ] **Step 7.4: Commit**

```bash
git add apps/web/src/lib/onboarding/session-store.ts
git commit -m "fix(schema): close Gap #11 — generate UUID for profile.id in createEmptyProfile"
```

---

## Task 8: Full verification

- [ ] **Step 8.1: Run all web tests**

```bash
pnpm --filter @retune/web test -- --reporter=verbose
```

Expected: all tests pass, 0 failures.

- [ ] **Step 8.2: TypeScript check**

```bash
pnpm --filter @retune/web exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 8.3: Build**

```bash
pnpm --filter @retune/web build
```

Expected: exits 0.

- [ ] **Step 8.4: Fix any remaining issues**

If any test or build fails, fix before proceeding.

- [ ] **Step 8.5: Final commit**

```bash
git add -A
git commit -m "chore: close all gaps — verification pass clean"
```

---

## Self-Review Checklist

- [x] Gap #3 (email verification): delete stub ✓, resend route ✓, page rewrite ✓, layout gates ✓, signup redirect ✓, tests ✓
- [x] Gap #4 (dual persistence): delete dead code ✓, Drizzle migration ✓, updateProfile chokepoint ✓, ad-hoc routes updated ✓
- [x] Gap #5 (understanding client): both writes migrated to Drizzle ✓, Supabase import removed ✓, optimistic revision via .returning() ✓
- [x] Gap #6 (JSONB validation): safeParse on all three JSONB columns ✓, session-store tightened ✓
- [x] Gap #7 (observability): events at every transition ✓, bounded retry ✓, deterministic errors not retried ✓
- [x] Gap #8 (transactional writes): collapsed into Gap #4 ✓ (db.transaction in persistProfile)
- [x] Gap #9 (polling post-onboarding): status endpoint ✓, 1.5s poll until revision > 0 ✓
- [x] Gap #10 (staleness on /profile): 30s poll when visible ✓, router.refresh() on change ✓
- [x] Gap #11 (schema niceties): UUID for profile.id ✓
- [x] No placeholder steps — all code is complete
- [x] Type names consistent across tasks
- [x] Each task ends with a commit
