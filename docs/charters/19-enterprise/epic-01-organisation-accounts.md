# Epic 01 — Organisation Accounts

## Summary

Add multi-tenancy primitives: an `organisations` table, a `organisation_members` join table, API routes to create organisations and invite members, and full test coverage.

## Stories

---

### Story 1: Add Organisation Schema

**As a** platform engineer  
**I want** `organisations` and `organisation_members` tables in the database  
**So that** users can belong to organisations with defined roles  

#### Acceptance Criteria

- [ ] `organisations` table exists with columns: `id`, `name`, `slug`, `plan`, `created_at`, `updated_at`, `deleted_at`
- [ ] `slug` column has a unique constraint
- [ ] `plan` defaults to `'free'`
- [ ] `organisation_members` table exists with columns: `id`, `organisation_id`, `user_id`, `role`, `created_at`
- [ ] `organisation_id` references `organisations.id`
- [ ] `user_id` references `users.id`
- [ ] `role` defaults to `'member'` and accepts `'owner' | 'admin' | 'member'`
- [ ] Migration `0015_organisations.sql` applies cleanly on a fresh database
- [ ] Migration is idempotent (re-running does not error)

#### Tasks

**Task 1.1: Add schema definitions**  
File: `packages/db/src/pg/schema.ts`  
Effort: 1 hour

Add after existing table definitions:

```typescript
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 256 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  plan: varchar('plan', { length: 32 }).notNull().default('free'),
  createdAt: tcol('created_at'),
  updatedAt: updated(),
  deletedAt: deleted(),
});

export const organisation_members = pgTable('organisation_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  organisationId: uuid('organisation_id').notNull().references(() => organisations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: varchar('role', { length: 32 }).notNull().default('member'), // 'owner' | 'admin' | 'member'
  createdAt: tcol('created_at'),
});
```

**Task 1.2: Create migration file**  
File: `packages/db/migrations/0015_organisations.sql`  
Effort: 30 minutes

```sql
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(256) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  plan VARCHAR(32) NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organisation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organisation_members_org ON organisation_members(organisation_id);
CREATE INDEX idx_organisation_members_user ON organisation_members(user_id);
CREATE UNIQUE INDEX idx_organisation_members_unique ON organisation_members(organisation_id, user_id);
```

**Task 1.3: Export schema from package**  
File: `packages/db/src/pg/index.ts`  
Effort: 15 minutes

Add exports:
```typescript
export { organisations, organisation_members } from './schema';
```

#### Tests

File: `packages/db/src/pg/__tests__/organisations.test.ts`  
Effort: 1 hour

```typescript
import { describe, it, assert } from 'node:test';
import { organisations, organisation_members } from '../schema';

describe('organisations schema', () => {
  it('organisations table has required columns', () => {
    const cols = Object.keys(organisations);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('name'));
    assert.ok(cols.includes('slug'));
    assert.ok(cols.includes('plan'));
    assert.ok(cols.includes('createdAt'));
    assert.ok(cols.includes('updatedAt'));
    assert.ok(cols.includes('deletedAt'));
  });

  it('organisation_members table has required columns', () => {
    const cols = Object.keys(organisation_members);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('organisationId'));
    assert.ok(cols.includes('userId'));
    assert.ok(cols.includes('role'));
    assert.ok(cols.includes('createdAt'));
  });
});
```

---

### Story 2: Create Organisation API Route

**As a** user  
**I want** to create an organisation via `POST /api/organisations`  
**So that** I can set up a team workspace  

#### Acceptance Criteria

- [ ] `POST /api/organisations` with body `{ name, slug }` creates an organisation
- [ ] The authenticated user is automatically added as `owner` in `organisation_members`
- [ ] Returns `201` with the created organisation object
- [ ] Returns `400` if `name` or `slug` is missing
- [ ] Returns `409` if `slug` is already taken
- [ ] Returns `401` if not authenticated
- [ ] `slug` is validated: lowercase alphanumeric + hyphens, 3–64 chars

#### Tasks

**Task 2.1: Create route handler**  
File: `apps/api/src/routes/organisations.ts`  
Effort: 2 hours

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from '@retune/db';
import { organisations, organisation_members } from '@retune/db';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const slugRegex = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

const createOrgSchema = z.object({
  name: z.string().min(1).max(256),
  slug: z.string().min(3).max(64).regex(slugRegex, 'Slug must be lowercase alphanumeric with hyphens'),
});

const app = new Hono();

app.post('/', authMiddleware, zValidator('json', createOrgSchema), async (c) => {
  const { name, slug } = c.req.valid('json');
  const userId = c.get('userId');

  const existing = await db.select().from(organisations).where(eq(organisations.slug, slug)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Slug already taken' }, 409);
  }

  const [org] = await db.insert(organisations).values({ name, slug }).returning();

  await db.insert(organisation_members).values({
    organisationId: org.id,
    userId,
    role: 'owner',
  });

  return c.json(org, 201);
});

export default app;
```

**Task 2.2: Mount route in main app**  
File: `apps/api/src/main.ts`  
Effort: 15 minutes

```typescript
import organisationRoutes from './routes/organisations';
// ...
app.route('/api/organisations', organisationRoutes);
```

#### Tests

File: `apps/api/src/routes/__tests__/organisations.test.ts`  
Effort: 2 hours

```typescript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { app } from '../../main';

describe('POST /api/organisations', () => {
  it('returns 201 and creates organisation with owner membership', async () => {
    const res = await app.request('/api/organisations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp' }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.name, 'Acme Corp');
    assert.strictEqual(body.slug, 'acme-corp');
    assert.strictEqual(body.plan, 'free');
    assert.ok(body.id);
  });

  it('returns 400 when slug is missing', async () => {
    const res = await app.request('/api/organisations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ name: 'Acme Corp' }),
    });

    assert.strictEqual(res.status, 400);
  });

  it('returns 409 when slug is already taken', async () => {
    // Create first org
    await app.request('/api/organisations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp' }),
    });

    // Attempt duplicate
    const res = await app.request('/api/organisations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ name: 'Acme Corp 2', slug: 'acme-corp' }),
    });

    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.error, 'Slug already taken');
  });

  it('returns 401 when not authenticated', async () => {
    const res = await app.request('/api/organisations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp' }),
    });

    assert.strictEqual(res.status, 401);
  });

  it('returns 400 when slug has invalid characters', async () => {
    const res = await app.request('/api/organisations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ name: 'Acme', slug: 'ACME Corp!' }),
    });

    assert.strictEqual(res.status, 400);
  });
});
```

---

### Story 3: Invite Member API Route

**As an** organisation owner or admin  
**I want** to invite a user by email via `POST /api/organisations/:id/invite`  
**So that** I can add team members to my organisation  

#### Acceptance Criteria

- [ ] `POST /api/organisations/:id/invite` with body `{ email, role }` creates a membership
- [ ] Only users with role `owner` or `admin` in the organisation can invite
- [ ] If the email matches an existing user, they are added immediately as a member
- [ ] If the email does not match an existing user, returns `202` (pending invite)
- [ ] `role` must be `'admin'` or `'member'` (cannot invite as `owner`)
- [ ] Returns `403` if the requester is a `member` (not owner/admin)
- [ ] Returns `404` if the organisation does not exist
- [ ] Returns `409` if the user is already a member
- [ ] Returns `400` if email is invalid or role is invalid

#### Tasks

**Task 3.1: Add invite route handler**  
File: `apps/api/src/routes/organisations.ts`  
Effort: 2 hours

```typescript
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

app.post('/:id/invite', authMiddleware, zValidator('json', inviteSchema), async (c) => {
  const orgId = c.req.param('id');
  const { email, role } = c.req.valid('json');
  const userId = c.get('userId');

  // Verify org exists
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId)).limit(1);
  if (!org) return c.json({ error: 'Organisation not found' }, 404);

  // Verify requester is owner or admin
  const [membership] = await db
    .select()
    .from(organisation_members)
    .where(
      and(
        eq(organisation_members.organisationId, orgId),
        eq(organisation_members.userId, userId),
      ),
    )
    .limit(1);

  if (!membership || membership.role === 'member') {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  // Find target user by email
  const [targetUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!targetUser) {
    // TODO: Store pending invite and send email
    return c.json({ status: 'pending', email }, 202);
  }

  // Check if already a member
  const [existingMembership] = await db
    .select()
    .from(organisation_members)
    .where(
      and(
        eq(organisation_members.organisationId, orgId),
        eq(organisation_members.userId, targetUser.id),
      ),
    )
    .limit(1);

  if (existingMembership) {
    return c.json({ error: 'User is already a member' }, 409);
  }

  const [member] = await db
    .insert(organisation_members)
    .values({ organisationId: orgId, userId: targetUser.id, role })
    .returning();

  return c.json(member, 201);
});
```

**Task 3.2: Import `and` from drizzle-orm**  
File: `apps/api/src/routes/organisations.ts`  
Effort: 5 minutes

```typescript
import { eq, and } from 'drizzle-orm';
```

#### Tests

File: `apps/api/src/routes/__tests__/organisations-invite.test.ts`  
Effort: 2 hours

```typescript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { app } from '../../main';

describe('POST /api/organisations/:id/invite', () => {
  let orgId: string;

  beforeEach(async () => {
    // Create org as owner
    const res = await app.request('/api/organisations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ name: 'Test Org', slug: `test-org-${Date.now()}` }),
    });
    const body = await res.json();
    orgId = body.id;
  });

  it('returns 201 when owner invites existing user as member', async () => {
    const res = await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'existing@example.com', role: 'member' }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.role, 'member');
    assert.strictEqual(body.organisationId, orgId);
  });

  it('returns 202 when inviting non-existing user', async () => {
    const res = await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'nobody@example.com', role: 'member' }),
    });

    assert.strictEqual(res.status, 202);
    const body = await res.json();
    assert.strictEqual(body.status, 'pending');
    assert.strictEqual(body.email, 'nobody@example.com');
  });

  it('returns 403 when member tries to invite', async () => {
    const res = await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({ email: 'someone@example.com', role: 'member' }),
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.error, 'Insufficient permissions');
  });

  it('returns 404 when organisation does not exist', async () => {
    const res = await app.request('/api/organisations/00000000-0000-0000-0000-000000000000/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'someone@example.com', role: 'member' }),
    });

    assert.strictEqual(res.status, 404);
  });

  it('returns 409 when user is already a member', async () => {
    // Invite once
    await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'existing@example.com', role: 'member' }),
    });

    // Invite again
    const res = await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'existing@example.com', role: 'admin' }),
    });

    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.error, 'User is already a member');
  });

  it('returns 400 when role is owner', async () => {
    const res = await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'someone@example.com', role: 'owner' }),
    });

    assert.strictEqual(res.status, 400);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await app.request(`/api/organisations/${orgId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ email: 'not-an-email', role: 'member' }),
    });

    assert.strictEqual(res.status, 400);
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Organisation Schema | 2.75 hours |
| Story 2: Create Organisation Route | 4.25 hours |
| Story 3: Invite Member Route | 4.1 hours |
| **Total** | **~11 hours** |

## Dependencies

- `packages/db` schema helpers (`tcol`, `updated`, `deleted`, `users` table)
- `apps/api` auth middleware
- Charter 08 RLS (for org-scoped row isolation — follow-up)

## Risks

- Slug collisions under concurrent creation — mitigated by unique constraint + check-before-insert
- Pending invites require email delivery — deferred to a follow-up story with email integration
- Role escalation — validated at schema level (enum constraint in route, not DB)
