# Epic 01 — Down Migrations

## Overview

Establish a convention that every forward migration has a corresponding rollback file, write down migrations for the 3 most recent migrations, create a programmatic rollback function, and add CI enforcement.

---

## Story 1: Establish Down Migration Convention

### User Story

As a developer, I want a clear convention for rollback files so that every schema change is reversible.

### Acceptance Criteria

- Convention documented: every `NNNN_name.sql` must have a `NNNN_name.down.sql` in the same directory
- Down migration files live in `packages/db/src/pg/migrations/`
- Convention is documented in `packages/db/README.md` (or created if absent)

### Tasks

#### Task 1.1: Document convention in `packages/db/MIGRATIONS.md`

**Effort:** 15 min  
**File:** `packages/db/MIGRATIONS.md`

```markdown
# Migration Convention

## File Structure

Every migration in `src/pg/migrations/` follows this pattern:

```
src/pg/migrations/
├── 0011_onboarding_v2_commit_rpc.sql       # Forward (up) migration
├── 0011_onboarding_v2_commit_rpc.down.sql  # Rollback (down) migration
├── 0010_onboarding_v2.sql
├── 0010_onboarding_v2.down.sql
└── ...
```

## Rules

1. Every new `.sql` migration MUST have a corresponding `.down.sql` file.
2. Down migrations must be idempotent (safe to run multiple times).
3. Down migrations must reverse ONLY what the up migration added.
4. Use `DROP ... IF EXISTS` and `ALTER TABLE ... DROP COLUMN IF EXISTS` patterns.
5. CI will reject PRs that add a migration without its down file.

## Running Rollbacks

```typescript
import { rollbackMigration } from './migrator';
await rollbackMigration(db, '0011_onboarding_v2_commit_rpc');
```
```

### Tests

No automated test — this is documentation. Verified by CI check in Story 4.

---

## Story 2: Write Down Migration for 0011_onboarding_v2_commit_rpc

### User Story

As a developer, I want to roll back the 0011 migration so that I can recover from a failed deploy that introduced the commit RPC function.

### Acceptance Criteria

- `packages/db/src/pg/migrations/0011_onboarding_v2_commit_rpc.down.sql` exists
- Running it drops the RPC function added in 0011
- Running it is idempotent

### Tasks

#### Task 2.1: Create down migration

**Effort:** 15 min  
**File:** `packages/db/src/pg/migrations/0011_onboarding_v2_commit_rpc.down.sql`

```sql
-- Rollback: 0011_onboarding_v2_commit_rpc
-- Drops the commit RPC function added in the forward migration

DROP FUNCTION IF EXISTS commit_onboarding_v2(uuid, jsonb);
```

### Tests

**File:** `packages/db/src/pg/__tests__/migration-0011-down.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('0011 down migration', () => {
  it('file exists and contains DROP FUNCTION', () => {
    const sql = readFileSync(
      resolve(__dirname, '../migrations/0011_onboarding_v2_commit_rpc.down.sql'),
      'utf8'
    );
    expect(sql).toContain('DROP FUNCTION IF EXISTS');
    expect(sql).toContain('commit_onboarding_v2');
  });
});
```

---

## Story 3: Write Down Migration for 0010_onboarding_v2

### User Story

As a developer, I want to roll back the 0010 migration so that I can remove onboarding_v2 tables if the feature is abandoned.

### Acceptance Criteria

- `packages/db/src/pg/migrations/0010_onboarding_v2.down.sql` exists
- Running it drops all tables/types introduced in 0010
- Running it is idempotent

### Tasks

#### Task 3.1: Create down migration

**Effort:** 20 min  
**File:** `packages/db/src/pg/migrations/0010_onboarding_v2.down.sql`

```sql
-- Rollback: 0010_onboarding_v2
-- Drops onboarding v2 tables

DROP TABLE IF EXISTS onboarding_v2_steps CASCADE;
DROP TABLE IF EXISTS onboarding_v2_sessions CASCADE;
DROP TYPE IF EXISTS onboarding_v2_step_status;
```

### Tests

**File:** `packages/db/src/pg/__tests__/migration-0010-down.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('0010 down migration', () => {
  it('file exists and contains DROP TABLE statements', () => {
    const sql = readFileSync(
      resolve(__dirname, '../migrations/0010_onboarding_v2.down.sql'),
      'utf8'
    );
    expect(sql).toContain('DROP TABLE IF EXISTS');
    expect(sql).toContain('onboarding_v2');
  });
});
```

---

## Story 4: Write Down Migration for 0009_resume_extraction_audit

### User Story

As a developer, I want to roll back the 0009 migration so that I can remove audit columns if they cause performance issues.

### Acceptance Criteria

- `packages/db/src/pg/migrations/0009_resume_extraction_audit.down.sql` exists
- Running it drops the audit columns added in 0009
- Running it is idempotent

### Tasks

#### Task 4.1: Create down migration

**Effort:** 15 min  
**File:** `packages/db/src/pg/migrations/0009_resume_extraction_audit.down.sql`

```sql
-- Rollback: 0009_resume_extraction_audit
-- Drops audit columns from resume_extractions table

ALTER TABLE resume_extractions DROP COLUMN IF EXISTS audited_at;
ALTER TABLE resume_extractions DROP COLUMN IF EXISTS audited_by;
ALTER TABLE resume_extractions DROP COLUMN IF EXISTS audit_notes;
```

### Tests

**File:** `packages/db/src/pg/__tests__/migration-0009-down.test.ts`

```typescript
import { describe, it, expect } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('0009 down migration', () => {
  it('file exists and contains DROP COLUMN statements', () => {
    const sql = readFileSync(
      resolve(__dirname, '../migrations/0009_resume_extraction_audit.down.sql'),
      'utf8'
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS');
    expect(sql).toContain('audit');
  });
});
```

---

## Story 5: Create Programmatic Rollback Function

### User Story

As a developer, I want a `rollbackMigration` function so that I can programmatically revert a migration in scripts or emergency recovery.

### Acceptance Criteria

- `packages/db/src/pg/migrator.ts` exports `rollbackMigration`
- Function reads the `.down.sql` file and executes it against the database
- Function throws if the down file does not exist
- Function updates the migrations tracking table to remove the rolled-back entry

### Tasks

#### Task 5.1: Create `packages/db/src/pg/migrator.ts`

**Effort:** 30 min

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

const MIGRATIONS_DIR = resolve(__dirname, './migrations');

export async function rollbackMigration(
  db: PgDatabase<any>,
  migrationName: string
): Promise<void> {
  const downFile = resolve(MIGRATIONS_DIR, `${migrationName}.down.sql`);

  if (!existsSync(downFile)) {
    throw new Error(`Down migration not found: ${downFile}`);
  }

  const downSql = readFileSync(downFile, 'utf8');
  await db.execute(sql.raw(downSql));

  // Remove from drizzle migrations journal
  await db.execute(
    sql`DELETE FROM drizzle_migrations WHERE name = ${migrationName}`
  );
}
```

#### Task 5.2: Export from package entry

**Effort:** 5 min

Add to `packages/db/src/index.ts`:

```typescript
export { rollbackMigration } from './pg/migrator';
```

### Tests

**File:** `packages/db/src/pg/__tests__/migrator.test.ts`

```typescript
import { describe, it, expect, mock } from 'node:test';
import { rollbackMigration } from '../migrator';

describe('rollbackMigration', () => {
  it('throws when down file does not exist', async () => {
    const mockDb = { execute: mock.fn() } as any;
    await expect(
      rollbackMigration(mockDb, '9999_nonexistent')
    ).rejects.toThrow('Down migration not found');
  });

  it('executes down SQL and removes migration record', async () => {
    const executeCalls: string[] = [];
    const mockDb = {
      execute: mock.fn((query: any) => {
        executeCalls.push(String(query));
        return Promise.resolve();
      }),
    } as any;

    // This test requires 0011 down file to exist (created in Story 2)
    await rollbackMigration(mockDb, '0011_onboarding_v2_commit_rpc');
    expect(mockDb.execute.mock.calls.length).toBe(2);
  });
});
```

---

## Story 6: CI Check for Down Migration Enforcement

### User Story

As a team lead, I want CI to reject PRs that add migrations without down files so that the convention is enforced automatically.

### Acceptance Criteria

- A CI step checks that for every `NNNN_*.sql` (excluding `.down.sql`) there is a matching `NNNN_*.down.sql`
- The check runs on every PR that modifies files in `packages/db/src/pg/migrations/`
- Failing the check blocks merge

### Tasks

#### Task 6.1: Create check script `packages/db/scripts/check-down-migrations.sh`

**Effort:** 20 min

```bash
#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="packages/db/src/pg/migrations"
EXIT_CODE=0

for up_file in "$MIGRATIONS_DIR"/[0-9]*.sql; do
  # Skip .down.sql files
  if [[ "$up_file" == *.down.sql ]]; then
    continue
  fi

  down_file="${up_file%.sql}.down.sql"
  if [[ ! -f "$down_file" ]]; then
    echo "ERROR: Missing down migration for: $up_file"
    echo "  Expected: $down_file"
    EXIT_CODE=1
  fi
done

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ All migrations have corresponding down files"
fi

exit $EXIT_CODE
```

#### Task 6.2: Add to CI workflow

**Effort:** 10 min  
**File:** `.github/workflows/ci.yml` (add step)

```yaml
- name: Check down migrations
  run: bash packages/db/scripts/check-down-migrations.sh
```

### Tests

**File:** `packages/db/scripts/__tests__/check-down-migrations.test.sh`

Manual verification:
1. Remove a `.down.sql` file temporarily
2. Run `bash packages/db/scripts/check-down-migrations.sh`
3. Verify it exits with code 1 and prints the missing file
4. Restore the file, run again, verify exit code 0

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 1 — Convention Documentation | 15 min |
| 2 — Down Migration 0011 | 15 min |
| 3 — Down Migration 0010 | 20 min |
| 4 — Down Migration 0009 | 15 min |
| 5 — Rollback Function | 35 min |
| 6 — CI Enforcement | 30 min |
| **Total** | **~2.5 hours** |
