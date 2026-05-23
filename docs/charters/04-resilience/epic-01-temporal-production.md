# Epic 01 — Temporal Production Activation

## Summary

Enable Temporal as the production execution engine for generation workflows. Currently, the Temporal client factory, workflow definition, activities, and worker process all exist but are not activated in production. The API falls back to the in-memory `workbench-runtime.ts`, which loses all state on process restart.

## Goal

Generations execute as durable Temporal workflows in production. If the API process restarts mid-generation, the workflow continues on the Temporal worker and the API can re-attach to stream results.

---

## Story 1: Configure Temporal Environment Variables in Production

### User Story

As a **platform operator**, I want Temporal enabled in the production environment so that generation workflows are durable.

### Acceptance Criteria

- [ ] `RETUNE_TEMPORAL=1` is set in Vercel production environment variables
- [ ] `RETUNE_TEMPORAL_ADDRESS` is set to the Temporal Cloud gRPC endpoint
- [ ] `RETUNE_TEMPORAL_NAMESPACE` is set to the production namespace
- [ ] `.env.example` documents all three variables with descriptions
- [ ] Application starts successfully with these variables set

### Tasks

#### Task 1.1: Update `.env.example`

**File:** `.env.example`

Add the following block after the existing ML Service section:

```env
# ─── Temporal (OPTIONAL — enables durable generation workflows) ──────────────
# Set RETUNE_TEMPORAL=1 to route generations through Temporal instead of in-memory runtime
RETUNE_TEMPORAL=
# Temporal Cloud gRPC address (e.g., your-namespace.tmprl.cloud:7233)
RETUNE_TEMPORAL_ADDRESS=
# Temporal namespace (e.g., retune-prod.abc123)
RETUNE_TEMPORAL_NAMESPACE=
```

**Subtasks:**
- Add env block to `.env.example` — **5 min**
- Verify no existing duplicate entries — **2 min**

#### Task 1.2: Set Vercel Production Environment Variables

Set the following in Vercel Dashboard → Project Settings → Environment Variables (Production):

| Variable | Value |
|----------|-------|
| `RETUNE_TEMPORAL` | `1` |
| `RETUNE_TEMPORAL_ADDRESS` | `<temporal-cloud-namespace>.tmprl.cloud:7233` |
| `RETUNE_TEMPORAL_NAMESPACE` | `<temporal-cloud-namespace>` |

**Subtasks:**
- Add `RETUNE_TEMPORAL=1` to Vercel production env — **2 min**
- Add `RETUNE_TEMPORAL_ADDRESS` to Vercel production env — **2 min**
- Add `RETUNE_TEMPORAL_NAMESPACE` to Vercel production env — **2 min**
- Verify variables are scoped to Production only (not Preview/Development) — **2 min**

---

## Story 2: Wire Generation Lifecycle to Use Temporal Path

### User Story

As a **developer**, I want the generation lifecycle to route through Temporal when `RETUNE_TEMPORAL=1` is set so that workflows are durable without code changes at the call site.

### Acceptance Criteria

- [ ] When `RETUNE_TEMPORAL=1`, `generation-lifecycle.ts` starts a Temporal workflow instead of the in-memory workbench
- [ ] When `RETUNE_TEMPORAL` is unset or `0`, the in-memory fallback is used (backward compatible)
- [ ] The Temporal workflow ID is deterministic: `generation-${generationId}`
- [ ] If a workflow with that ID already exists (restart scenario), the lifecycle attaches to the existing workflow instead of starting a new one

### Tasks

#### Task 2.1: Update `generation-lifecycle.ts` to branch on Temporal flag

**File:** `apps/api/src/runtime/generation-lifecycle.ts`

```typescript
import { getTemporalClient } from './temporal-factory';
import { runWorkbench } from './workbench-runtime';

export async function startGeneration(generationId: string, input: GenerationInput) {
  if (process.env.RETUNE_TEMPORAL === '1') {
    const client = await getTemporalClient();
    const workflowId = `generation-${generationId}`;

    try {
      await client.workflow.start('runGeneration', {
        taskQueue: 'retune-generation',
        workflowId,
        args: [input],
      });
    } catch (err: any) {
      if (err.code === 'ALREADY_EXISTS') {
        // Workflow already running (restart scenario) — attach to it
        return client.workflow.getHandle(workflowId);
      }
      throw err;
    }

    return client.workflow.getHandle(workflowId);
  }

  // Fallback: in-memory workbench
  return runWorkbench(generationId, input);
}
```

**Subtasks:**
- Import Temporal client factory — **5 min**
- Add conditional branch on `RETUNE_TEMPORAL` — **15 min**
- Handle `ALREADY_EXISTS` error for restart scenario — **10 min**
- Ensure return type is compatible with both paths — **10 min**

#### Task 2.2: Verify `temporal-factory.ts` reads all required env vars

**File:** `apps/api/src/runtime/temporal-factory.ts`

Ensure the factory reads:
- `RETUNE_TEMPORAL_ADDRESS` (required when `RETUNE_TEMPORAL=1`)
- `RETUNE_TEMPORAL_NAMESPACE` (required when `RETUNE_TEMPORAL=1`)

Add validation:

```typescript
export async function getTemporalClient() {
  const address = process.env.RETUNE_TEMPORAL_ADDRESS;
  const namespace = process.env.RETUNE_TEMPORAL_NAMESPACE;

  if (!address) throw new Error('RETUNE_TEMPORAL_ADDRESS is required when RETUNE_TEMPORAL=1');
  if (!namespace) throw new Error('RETUNE_TEMPORAL_NAMESPACE is required when RETUNE_TEMPORAL=1');

  // ... existing client creation logic
}
```

**Subtasks:**
- Add env var validation with clear error messages — **10 min**
- Verify singleton pattern is maintained — **5 min**

---

## Story 3: Deploy `apps/worker` as a Separate Service

### User Story

As a **platform operator**, I want the Temporal worker deployed as a long-running service so that it can execute generation workflows independently of the API server lifecycle.

### Acceptance Criteria

- [ ] `apps/worker` is deployed as a Railway service (or equivalent long-running process)
- [ ] The worker connects to the same Temporal Cloud namespace as the API
- [ ] The worker registers the `runGeneration` workflow and all activities
- [ ] The worker has its own health check endpoint
- [ ] The worker auto-restarts on crash (Railway default behavior)

### Tasks

#### Task 3.1: Add Railway deployment configuration

**File:** `apps/worker/railway.toml`

```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm --filter @retune/worker build"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5

[service]
internalPort = 8080
```

**Subtasks:**
- Create `railway.toml` — **10 min**
- Verify build command produces correct output — **10 min**

#### Task 3.2: Add health check endpoint to worker

**File:** `apps/worker/src/health.ts`

```typescript
import { createServer } from 'node:http';

export function startHealthServer(port = 8080) {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', worker: true }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}
```

**Subtasks:**
- Create health server module — **10 min**
- Wire into worker entry point — **5 min**

#### Task 3.3: Configure worker environment variables on Railway

Set the following on the Railway service:

| Variable | Value |
|----------|-------|
| `RETUNE_TEMPORAL_ADDRESS` | Same as API |
| `RETUNE_TEMPORAL_NAMESPACE` | Same as API |
| `RETUNE_DATABASE_URL` | Same as API |
| `AI_PROVIDER` | Same as API |
| `OPENAI_API_KEY` | Same as API |
| `ANTHROPIC_API_KEY` | Same as API |

**Subtasks:**
- Configure Railway environment variables — **5 min**
- Verify worker connects to Temporal on deploy — **10 min**

---

## Story 4: Integration Test — Generation Survives API Restart

### User Story

As a **developer**, I want an integration test that proves a generation survives an API process restart so that I have confidence in the Temporal path.

### Acceptance Criteria

- [ ] Test starts a generation via the Temporal path
- [ ] Test kills the API process mid-generation (after at least 1 specialist has run)
- [ ] Test restarts the API process
- [ ] Test verifies the generation completes successfully
- [ ] Test verifies all trace events are eventually received (no gaps)

### Tasks

#### Task 4.1: Write the integration test

**File:** `packages/agent/src/temporal/__tests__/generation-survives-restart.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { Client } from '@temporalio/client';

describe('Generation survives API restart', () => {
  let env: TestWorkflowEnvironment;
  let client: Client;
  let worker: Worker;

  // Setup: create test environment with Temporal test server
  before(async () => {
    env = await TestWorkflowEnvironment.createLocal();
    client = env.client;
    worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: 'retune-generation',
      workflowsPath: require.resolve('../workflows/run-generation.workflow'),
      activities: await import('../activities/make-activities').then(m => m.makeActivities()),
    });
  });

  after(async () => {
    await env.teardown();
  });

  it('resumes generation after simulated API restart', async () => {
    const generationId = 'test-gen-restart-001';
    const workflowId = `generation-${generationId}`;

    // Start worker in background
    const workerRun = worker.run();

    // Start workflow (simulates API starting a generation)
    const handle = await client.workflow.start('runGeneration', {
      taskQueue: 'retune-generation',
      workflowId,
      args: [{ generationId, jobDescription: 'Test job', resumeText: 'Test resume' }],
    });

    // Wait for at least one activity to complete (simulates partial progress)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate API restart: get a NEW client handle (old reference is gone)
    const reattachedHandle = client.workflow.getHandle(workflowId);

    // Verify workflow is still running or completed
    const description = await reattachedHandle.describe();
    assert.ok(
      ['RUNNING', 'COMPLETED'].includes(description.status.name),
      `Expected RUNNING or COMPLETED, got ${description.status.name}`
    );

    // Wait for completion
    const result = await reattachedHandle.result();

    // Verify generation completed with output
    assert.ok(result, 'Workflow should return a result');
    assert.ok(result.generationId === generationId, 'Generation ID should match');

    // Cleanup
    worker.shutdown();
    await workerRun;
  });
});
```

**Subtasks:**
- Install `@temporalio/testing` as dev dependency — **5 min**
- Write test setup with `TestWorkflowEnvironment` — **15 min**
- Write test body: start, wait, reattach, verify — **20 min**
- Verify test passes locally with `tsx --test` — **10 min**

### Test Assertions

| Assertion | Purpose |
|-----------|---------|
| `description.status.name` is `RUNNING` or `COMPLETED` | Workflow survived simulated restart |
| `result.generationId === generationId` | Correct generation completed |
| `result` is truthy | Workflow produced output |

---

## Rollout Plan

1. **Stage 1:** Deploy `apps/worker` to Railway staging, set `RETUNE_TEMPORAL=1` in staging
2. **Stage 2:** Run 10 test generations in staging, verify all complete
3. **Stage 3:** Enable in production with `RETUNE_TEMPORAL=1`
4. **Stage 4:** Monitor for 48 hours, verify zero lost generations
5. **Rollback:** Set `RETUNE_TEMPORAL=` (empty) to revert to in-memory fallback

## Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: Environment variables | 0.5 day |
| Story 2: Lifecycle wiring | 1 day |
| Story 3: Worker deployment | 1 day |
| Story 4: Integration test | 1 day |
| **Total** | **3.5 days** |
