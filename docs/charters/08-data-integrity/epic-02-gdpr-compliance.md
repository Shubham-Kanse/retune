# Epic 02 — GDPR Compliance

## Overview

Implement right-to-erasure (Article 17) and right-to-portability (Article 20) for Retune users. Remove committed PII from git history. The existing `DELETE /api/account` route performs an immediate hard-delete with no grace period and does not delete the Supabase auth user — this epic replaces it with a compliant implementation.

## Current State

- `apps/web/data/` committed to git: PGlite DB, SQLite DB, 34 user generation directories (user `a961e9e4-8b0c-413d-b502-76c91acce4ee`), 7 uploaded PDFs
- `apps/web/src/app/api/account/route.ts` (1816 bytes): has `DELETE` handler that hard-deletes immediately, no soft-delete, no Supabase auth deletion
- No data export endpoint exists
- No data retention policy or scheduled hard-delete sweep
- `users` table has `deleted_at` column (nullable timestamptz) — soft-delete infrastructure exists in schema but is unused

---

## Story 1: Remove Committed PII from Git History

### User Story

As a **data protection officer**, I want all committed user data removed from the git history so that PII is not recoverable from any historical commit.

### Acceptance Criteria

- [ ] `apps/web/data/` is removed from all git history using BFG Repo-Cleaner
- [ ] `apps/web/data/` is added to `.gitignore`
- [ ] Repository size decreases after `git gc`
- [ ] All team members are notified to re-clone
- [ ] No user UUIDs, resumes, cover letters, or uploaded PDFs exist in any historical commit

### Tasks

#### Task 1.1: Add `apps/web/data/` to `.gitignore`

**File:** `.gitignore`

Add at the end:

```gitignore
# GDPR: local PGlite/SQLite data and user-generated files
apps/web/data/
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Append entry to `.gitignore` | 5m |
| 1.1.2 | Verify `git status` no longer shows `apps/web/data/` as tracked | 5m |

#### Task 1.2: Remove from git history using BFG

**Commands:**

```bash
# Install BFG if not present
brew install bfg

# Clone a mirror
git clone --mirror git@github.com:org/retune.git retune-mirror.git

# Remove the directory from all history
bfg --delete-folders data --no-blob-protection retune-mirror.git

# Clean up
cd retune-mirror.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (requires team coordination)
git push --force
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.2.1 | Coordinate force-push window with team (Charter 01 Epic 1) | 1h |
| 1.2.2 | Run BFG on mirror clone | 30m |
| 1.2.3 | Verify no `apps/web/data/` in any commit via `git log --all -- apps/web/data/` | 15m |
| 1.2.4 | Force push and notify team to re-clone | 30m |

### Tests

```bash
# After BFG + force push:
git log --all --diff-filter=A -- "apps/web/data/" | wc -l
# Expected: 0

git show HEAD:.gitignore | grep "apps/web/data/"
# Expected: apps/web/data/
```

---

## Story 2: Right to Erasure — Soft-Delete with Scheduled Hard-Delete

### User Story

As a **user**, I want to delete my account with a 30-day grace period so that I can recover it if I change my mind, and after 30 days all my data is permanently erased.

### Acceptance Criteria

- [ ] `POST /api/account/delete` requires an authenticated session
- [ ] Sets `users.deleted_at = NOW()` (soft-delete)
- [ ] Deletes the Supabase auth user via `supabase.auth.admin.deleteUser(userId)`
- [ ] Returns `{ ok: true, deletedAt: <ISO timestamp>, hardDeleteAt: <ISO timestamp +30d> }`
- [ ] A scheduled job hard-deletes users where `deleted_at < NOW() - INTERVAL '30 days'`
- [ ] Hard-delete cascades to all FK-linked tables (generations, applications, etc.)
- [ ] Clears session cookie
- [ ] Returns 401 if no session
- [ ] Returns 404 if user already soft-deleted

### Tasks

#### Task 2.1: Implement `POST /api/account/delete` route

**File:** `apps/web/src/app/api/account/route.ts`

Add the following handler to the existing file:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const POST = withAuth(async (_request, session) => {
  const now = new Date();
  const hardDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Check user is not already soft-deleted
  const [user] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, session.userId));

  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Soft-delete the user
  await db
    .update(users)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(users.id, session.userId));

  // Delete Supabase auth user (immediate — prevents login)
  await supabaseAdmin.auth.admin.deleteUser(session.userId);

  // Clear session
  const response = NextResponse.json({
    ok: true,
    deletedAt: now.toISOString(),
    hardDeleteAt: hardDeleteAt.toISOString(),
  });
  response.cookies.set("session", "", { maxAge: 0, path: "/" });
  return response;
});
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Add `POST` handler to `apps/web/src/app/api/account/route.ts` | 1h |
| 2.1.2 | Add Supabase admin client initialization | 15m |
| 2.1.3 | Add 404 guard for already-deleted users | 15m |
| 2.1.4 | Clear session cookie in response | 15m |

#### Task 2.2: Implement hard-delete cron job

**File:** `apps/web/src/app/api/cron/hard-delete/route.ts`

```typescript
import { db, users } from "@retune/db";
import { lt, isNotNull, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Cron endpoint: hard-deletes users whose deleted_at is older than 30 days.
 * Triggered by Vercel Cron or external scheduler.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(users)
    .where(
      and(
        isNotNull(users.deletedAt),
        lt(users.deletedAt, thirtyDaysAgo)
      )
    )
    .returning({ id: users.id });

  return NextResponse.json({
    ok: true,
    hardDeletedCount: deleted.length,
    userIds: deleted.map((u) => u.id),
  });
}
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.2.1 | Create cron route file | 1h |
| 2.2.2 | Add `CRON_SECRET` to `.env.example` | 5m |
| 2.2.3 | Add Vercel cron config to `vercel.json` (or document manual trigger) | 15m |
| 2.2.4 | Verify FK cascades delete all child rows | 30m |

### Tests

**File:** `apps/web/src/app/api/account/__tests__/delete.test.ts`

```typescript
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

describe("POST /api/account/delete", () => {
  it("returns 401 when no session is present", async () => {
    const response = await handler(new Request("http://localhost/api/account", {
      method: "POST",
    }));
    assert.equal(response.status, 401);
  });

  it("soft-deletes the user and returns timestamps", async () => {
    // Setup: create user, mock session
    const response = await authenticatedPost("/api/account");
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.ok(body.deletedAt);
    assert.ok(body.hardDeleteAt);

    const deletedAt = new Date(body.deletedAt);
    const hardDeleteAt = new Date(body.hardDeleteAt);
    const diffDays = (hardDeleteAt.getTime() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);
    assert.equal(Math.round(diffDays), 30);
  });

  it("returns 404 if user is already soft-deleted", async () => {
    // Setup: soft-delete user first
    await authenticatedPost("/api/account");
    const response = await authenticatedPost("/api/account");
    assert.equal(response.status, 404);
  });

  it("deletes Supabase auth user", async () => {
    const deleteUserMock = mock.fn(async () => ({ data: {}, error: null }));
    // Mock supabaseAdmin.auth.admin.deleteUser
    await authenticatedPost("/api/account");
    assert.equal(deleteUserMock.mock.calls.length, 1);
  });

  it("clears the session cookie", async () => {
    const response = await authenticatedPost("/api/account");
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie?.includes("session="));
    assert.ok(setCookie?.includes("Max-Age=0"));
  });
});
```

**File:** `apps/web/src/app/api/cron/hard-delete/__tests__/hard-delete.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("GET /api/cron/hard-delete", () => {
  it("returns 401 without CRON_SECRET", async () => {
    const response = await handler(new Request("http://localhost/api/cron/hard-delete"));
    assert.equal(response.status, 401);
  });

  it("hard-deletes users with deleted_at older than 30 days", async () => {
    // Setup: insert user with deleted_at = 31 days ago
    const response = await authorizedCronGet();
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.equal(body.hardDeletedCount, 1);
  });

  it("does not delete users with deleted_at less than 30 days ago", async () => {
    // Setup: insert user with deleted_at = 5 days ago
    const response = await authorizedCronGet();
    const body = await response.json();

    assert.equal(body.hardDeletedCount, 0);
  });

  it("cascades deletion to generations and applications", async () => {
    // Setup: user with generations and applications, deleted_at = 31 days ago
    await authorizedCronGet();

    // Verify generations table has no rows for this user
    const gens = await db.select().from(generations).where(eq(generations.user_id, userId));
    assert.equal(gens.length, 0);

    // Verify applications table has no rows for this user
    const apps = await db.select().from(applications).where(eq(applications.userId, userId));
    assert.equal(apps.length, 0);
  });
});
```

---

## Story 3: Right to Portability — Data Export

### User Story

As a **user**, I want to download all my personal data as a ZIP archive so that I can exercise my GDPR Article 20 right to data portability.

### Acceptance Criteria

- [ ] `GET /api/account/export` requires an authenticated session
- [ ] Returns a ZIP file (`application/zip`) with Content-Disposition header
- [ ] ZIP contains:
  - `profile.json` — user row + profile data
  - `generations/` — one JSON file per generation with blackboard snapshots
  - `applications/` — one JSON file per application with outcomes
  - `usage-records.json` — all usage records
- [ ] Returns 401 if no session
- [ ] Returns 404 if user is soft-deleted
- [ ] ZIP filename includes user ID and export date: `retune-export-<userId>-<YYYY-MM-DD>.zip`

### Tasks

#### Task 3.1: Create `GET /api/account/export` route

**File:** `apps/web/src/app/api/account/export/route.ts`

```typescript
import { withAuth } from "@/lib/api-handler";
import { db, users } from "@retune/db";
import {
  generations,
  blackboard_snapshots,
  applications,
  outcomes,
  usageRecords,
  profiles,
} from "@retune/db/pg/schema";
import { eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import JSZip from "jszip";

export const GET = withAuth(async (_request, session) => {
  // Verify user exists and is not soft-deleted
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId));

  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const zip = new JSZip();

  // 1. Profile data
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.userId));

  zip.file("profile.json", JSON.stringify({ user, profile }, null, 2));

  // 2. Generations with blackboard snapshots
  const userGenerations = await db
    .select()
    .from(generations)
    .where(eq(generations.user_id, session.userId));

  const gensFolder = zip.folder("generations")!;
  for (const gen of userGenerations) {
    const snapshots = await db
      .select()
      .from(blackboard_snapshots)
      .where(eq(blackboard_snapshots.generation_id, gen.id));

    gensFolder.file(
      `${gen.id}.json`,
      JSON.stringify({ ...gen, blackboard_snapshots: snapshots }, null, 2)
    );
  }

  // 3. Applications with outcomes
  const userApplications = await db
    .select()
    .from(applications)
    .where(eq(applications.userId, session.userId));

  const appsFolder = zip.folder("applications")!;
  for (const app of userApplications) {
    const appOutcomes = await db
      .select()
      .from(outcomes)
      .where(eq(outcomes.application_id, app.id));

    appsFolder.file(
      `${app.id}.json`,
      JSON.stringify({ ...app, outcomes: appOutcomes }, null, 2)
    );
  }

  // 4. Usage records
  const records = await db
    .select()
    .from(usageRecords)
    .where(eq(usageRecords.userId, session.userId));

  zip.file("usage-records.json", JSON.stringify(records, null, 2));

  // Generate ZIP buffer
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const date = new Date().toISOString().split("T")[0];
  const filename = `retune-export-${session.userId}-${date}.zip`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Install `jszip` dependency: `pnpm --filter apps-web add jszip` | 10m |
| 3.1.2 | Create route file at `apps/web/src/app/api/account/export/route.ts` | 2h |
| 3.1.3 | Query profile, generations, snapshots, applications, outcomes, usage records | 1h |
| 3.1.4 | Assemble ZIP with correct folder structure | 30m |
| 3.1.5 | Set Content-Disposition header with dynamic filename | 15m |

### Tests

**File:** `apps/web/src/app/api/account/export/__tests__/export.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

describe("GET /api/account/export", () => {
  it("returns 401 when no session is present", async () => {
    const response = await handler(new Request("http://localhost/api/account/export"));
    assert.equal(response.status, 401);
  });

  it("returns 404 if user is soft-deleted", async () => {
    // Setup: soft-delete user
    const response = await authenticatedGet("/api/account/export");
    assert.equal(response.status, 404);
  });

  it("returns a ZIP file with correct content-type", async () => {
    const response = await authenticatedGet("/api/account/export");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
  });

  it("ZIP filename contains user ID and date", async () => {
    const response = await authenticatedGet("/api/account/export");
    const disposition = response.headers.get("content-disposition")!;
    assert.ok(disposition.includes(`retune-export-${userId}`));
    assert.match(disposition, /\d{4}-\d{2}-\d{2}\.zip/);
  });

  it("ZIP contains profile.json with user data", async () => {
    const response = await authenticatedGet("/api/account/export");
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const profileJson = await zip.file("profile.json")!.async("string");
    const profile = JSON.parse(profileJson);
    assert.equal(profile.user.id, userId);
    assert.ok(profile.user.email);
  });

  it("ZIP contains generations folder with snapshots", async () => {
    // Setup: create generation with blackboard snapshot
    const response = await authenticatedGet("/api/account/export");
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const genFiles = Object.keys(zip.files).filter(f => f.startsWith("generations/"));
    assert.ok(genFiles.length > 0);

    const genJson = await zip.file(genFiles[0])!.async("string");
    const gen = JSON.parse(genJson);
    assert.ok(gen.id);
    assert.ok(Array.isArray(gen.blackboard_snapshots));
  });

  it("ZIP contains applications folder with outcomes", async () => {
    // Setup: create application with outcome
    const response = await authenticatedGet("/api/account/export");
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const appFiles = Object.keys(zip.files).filter(f => f.startsWith("applications/"));
    assert.ok(appFiles.length > 0);

    const appJson = await zip.file(appFiles[0])!.async("string");
    const app = JSON.parse(appJson);
    assert.ok(app.id);
    assert.ok(Array.isArray(app.outcomes));
  });

  it("ZIP contains usage-records.json", async () => {
    const response = await authenticatedGet("/api/account/export");
    const buffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const recordsJson = await zip.file("usage-records.json")!.async("string");
    const records = JSON.parse(recordsJson);
    assert.ok(Array.isArray(records));
  });
});
```

---

## Total Effort Estimate

| Story | Effort |
|-------|--------|
| Story 1: Remove Committed PII | 2h 15m |
| Story 2: Right to Erasure | 3h 30m |
| Story 3: Right to Portability | 4h |
| **Total** | **~10h** |

## Dependencies

| Dependency | Reason |
|-----------|--------|
| Charter 01 Epic 1 (BFG history rewrite) | Story 1 coordinates the force-push window |
| `jszip` npm package | Story 3 ZIP generation |
| Supabase service role key in env | Story 2 auth user deletion |
| Vercel Cron or external scheduler | Story 2 hard-delete sweep |

## Rollback Plan

1. **Story 1:** Cannot be rolled back (history rewrite is permanent). Ensure backup mirror exists before BFG.
2. **Story 2:** Revert route changes; users with `deleted_at` set can be un-deleted by setting `deleted_at = NULL`.
3. **Story 3:** Remove the export route file. No data mutation involved.
