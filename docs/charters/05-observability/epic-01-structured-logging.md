# Epic 01 — Structured Logging

## Goal

Replace all unstructured `console.log`/`console.error` calls with structured JSON logging using `pino` (Node.js) and `structlog` (Python), with consistent fields and request correlation across services.

---

## Story 1: Install and Configure Pino Logger in apps/api

**As a** platform engineer, **I want** a centralized structured logger in apps/api **so that** all log output is machine-parseable JSON with consistent fields.

### Acceptance Criteria

- [ ] `pino` is listed in `apps/api/package.json` dependencies.
- [ ] `apps/api/src/lib/logger.ts` exports a pino instance.
- [ ] Every log line is valid JSON with fields: `level`, `time`, `service`, `requestId`, `userId`, `msg`.
- [ ] `service` field is always `"retune-api"`.
- [ ] In development (`NODE_ENV=development`), logs use `pino-pretty` transport.
- [ ] In production, logs are raw JSON to stdout.

### Tasks

#### Task 1.1: Install pino

**File:** `apps/api/package.json`

```bash
pnpm --filter @retune/api add pino
pnpm --filter @retune/api add -D pino-pretty
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.1.1 | Run install command | 5 min |
| 1.1.2 | Verify `pino` appears in `apps/api/package.json` dependencies | 2 min |

#### Task 1.2: Create logger module

**File:** `apps/api/src/lib/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: { service: 'retune-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = pino.Logger;
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.2.1 | Create `apps/api/src/lib/logger.ts` with pino instance | 15 min |
| 1.2.2 | Export `Logger` type for downstream use | 5 min |

#### Task 1.3: Write unit tests for logger

**File:** `apps/api/src/lib/logger.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logger } from './logger.js';

describe('logger', () => {
  it('should export a pino logger instance', () => {
    assert.equal(typeof logger.info, 'function');
    assert.equal(typeof logger.error, 'function');
    assert.equal(typeof logger.child, 'function');
  });

  it('should have service field set to retune-api', () => {
    const bindings = logger.bindings();
    assert.equal(bindings.service, 'retune-api');
  });

  it('should create child logger with requestId', () => {
    const child = logger.child({ requestId: 'test-123', userId: 'user-456' });
    const bindings = child.bindings();
    assert.equal(bindings.requestId, 'test-123');
    assert.equal(bindings.userId, 'user-456');
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.3.1 | Write test: exports pino instance | 5 min |
| 1.3.2 | Write test: service field is `retune-api` | 5 min |
| 1.3.3 | Write test: child logger carries requestId and userId | 10 min |

---

## Story 2: Add Request ID Middleware to apps/api

**As a** backend engineer, **I want** every incoming request to be assigned a unique request ID **so that** I can correlate all log lines belonging to a single request.

### Acceptance Criteria

- [ ] Every request gets a UUID v4 `requestId` attached to the Hono context.
- [ ] If the incoming request has an `X-Request-ID` header, that value is used instead of generating a new one.
- [ ] The `requestId` is included in the response via `X-Request-ID` header.
- [ ] A child logger with `requestId` and `userId` (from auth context) is available on `c.get('logger')`.

### Tasks

#### Task 2.1: Create request ID middleware

**File:** `apps/api/src/middleware/request-id.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const requestId = c.req.header('X-Request-ID') || randomUUID();
  const userId = c.get('userId') || 'anonymous';

  const reqLogger = logger.child({ requestId, userId });
  c.set('requestId', requestId);
  c.set('logger', reqLogger);

  reqLogger.info({ method: c.req.method, path: c.req.path }, 'request started');

  c.header('X-Request-ID', requestId);
  await next();

  reqLogger.info({ status: c.res.status }, 'request completed');
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.1.1 | Create middleware file | 15 min |
| 2.1.2 | Register middleware in `apps/api/src/main.ts` before route handlers | 10 min |

#### Task 2.2: Register middleware in main.ts

**File:** `apps/api/src/main.ts`

Add before route registration:

```typescript
import { requestIdMiddleware } from './middleware/request-id.js';

app.use('*', requestIdMiddleware);
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.2.1 | Import and register middleware | 5 min |
| 2.2.2 | Ensure middleware runs after auth but before routes | 5 min |

#### Task 2.3: Write tests for request ID middleware

**File:** `apps/api/src/middleware/request-id.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { requestIdMiddleware } from './request-id.js';

describe('requestIdMiddleware', () => {
  it('should generate X-Request-ID when not provided', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/test', (c) => c.json({ id: c.get('requestId') }));

    const res = await app.request('/test');
    const header = res.headers.get('X-Request-ID');
    assert.ok(header);
    assert.match(header, /^[0-9a-f-]{36}$/);
  });

  it('should use provided X-Request-ID header', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/test', (c) => c.json({ id: c.get('requestId') }));

    const res = await app.request('/test', {
      headers: { 'X-Request-ID': 'custom-id-123' },
    });
    const header = res.headers.get('X-Request-ID');
    assert.equal(header, 'custom-id-123');
  });

  it('should attach logger to context', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/test', (c) => {
      const logger = c.get('logger');
      return c.json({ hasLogger: typeof logger.info === 'function' });
    });

    const res = await app.request('/test');
    const body = await res.json();
    assert.equal(body.hasLogger, true);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.3.1 | Write test: generates UUID when no header | 10 min |
| 2.3.2 | Write test: uses provided X-Request-ID | 10 min |
| 2.3.3 | Write test: attaches logger to context | 10 min |

---

## Story 3: Replace console.log in apps/api/src/main.ts

**As a** platform engineer, **I want** all logging in `main.ts` to use the structured pino logger **so that** startup and lifecycle events are captured in structured format.

### Acceptance Criteria

- [ ] Zero `console.log` or `console.error` calls remain in `apps/api/src/main.ts`.
- [ ] All log calls use `logger.info()`, `logger.error()`, or `logger.warn()` with structured fields.
- [ ] Server startup log includes `{ port, env }` fields.

### Tasks

#### Task 3.1: Replace console calls in main.ts

**File:** `apps/api/src/main.ts`

Replace:
```typescript
console.log(`Server running on port ${port}`);
```

With:
```typescript
import { logger } from './lib/logger.js';
logger.info({ port, env: process.env.NODE_ENV }, 'server started');
```

Replace all `console.error(...)` with:
```typescript
logger.error({ err }, 'descriptive message');
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.1.1 | Import logger at top of file | 2 min |
| 3.1.2 | Replace each `console.log` with appropriate `logger.info` | 15 min |
| 3.1.3 | Replace each `console.error` with `logger.error` | 10 min |
| 3.1.4 | Verify no `console.*` calls remain via grep | 5 min |

#### Task 3.2: Write integration test

**File:** `apps/api/src/main.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('main.ts logging', () => {
  it('should not contain any console.log calls', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('./main.ts', import.meta.url),
      'utf-8'
    );
    assert.equal(content.includes('console.log'), false);
    assert.equal(content.includes('console.error'), false);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.2.1 | Write static analysis test for console.* absence | 10 min |

---

## Story 4: Replace console.log in apps/api/src/routes/generate.ts

**As a** platform engineer, **I want** all logging in the generate route to use structured pino logger with request context **so that** generation lifecycle events are traceable per-request.

### Acceptance Criteria

- [ ] Zero `console.log` or `console.error` calls remain in `apps/api/src/routes/generate.ts`.
- [ ] All log calls use `c.get('logger')` (the request-scoped child logger).
- [ ] Generation start/complete/error events include `{ generationId, userId }` fields.

### Tasks

#### Task 4.1: Replace console calls in generate.ts

**File:** `apps/api/src/routes/generate.ts`

Replace:
```typescript
console.log(`Starting generation ${id} for user ${userId}`);
```

With:
```typescript
const log = c.get('logger');
log.info({ generationId: id, userId }, 'generation started');
```

Replace:
```typescript
console.error(`Generation failed: ${error.message}`);
```

With:
```typescript
log.error({ generationId: id, err: error }, 'generation failed');
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.1.1 | Get logger from context at handler entry | 5 min |
| 4.1.2 | Replace each `console.log` with `log.info` including structured fields | 20 min |
| 4.1.3 | Replace each `console.error` with `log.error` | 10 min |
| 4.1.4 | Verify no `console.*` calls remain | 5 min |

#### Task 4.2: Write integration test

**File:** `apps/api/src/routes/generate.test.ts` (append to existing)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('generate.ts logging', () => {
  it('should not contain any console.log calls', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('./generate.ts', import.meta.url),
      'utf-8'
    );
    assert.equal(content.includes('console.log'), false);
    assert.equal(content.includes('console.error'), false);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.2.1 | Write static analysis test | 10 min |

---

## Story 5: Replace console.log in apps/api/src/runtime/workbench-runtime.ts

**As a** platform engineer, **I want** all logging in the workbench runtime to use structured pino logger **so that** runtime execution events are captured with correlation context.

### Acceptance Criteria

- [ ] Zero `console.log` or `console.error` calls remain in `apps/api/src/runtime/workbench-runtime.ts`.
- [ ] All log calls use a pino logger instance (either passed in or imported).
- [ ] Runtime lifecycle events (start, specialist dispatch, completion, error) include `{ generationId, specialistName }` fields.

### Tasks

#### Task 5.1: Accept logger parameter in workbench runtime

**File:** `apps/api/src/runtime/workbench-runtime.ts`

Update the runtime function/class to accept a `logger` parameter:

```typescript
import type { Logger } from '../lib/logger.js';
import { logger as defaultLogger } from '../lib/logger.js';

export function createWorkbenchRuntime(opts: { logger?: Logger } = {}) {
  const log = opts.logger || defaultLogger;
  // ...
}
```

Replace:
```typescript
console.log(`Running specialist: ${name}`);
```

With:
```typescript
log.info({ specialistName: name, generationId }, 'specialist started');
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.1.1 | Add logger parameter to runtime constructor/factory | 10 min |
| 5.1.2 | Replace each `console.log` with `log.info` | 20 min |
| 5.1.3 | Replace each `console.error` with `log.error` | 10 min |
| 5.1.4 | Pass request-scoped logger from generate route | 10 min |

#### Task 5.2: Write integration test

**File:** `apps/api/src/runtime/workbench-runtime.test.ts` (append to existing)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('workbench-runtime.ts logging', () => {
  it('should not contain any console.log calls', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('./workbench-runtime.ts', import.meta.url),
      'utf-8'
    );
    assert.equal(content.includes('console.log'), false);
    assert.equal(content.includes('console.error'), false);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.2.1 | Write static analysis test | 10 min |

---

## Story 6: Replace console.log in apps/api/src/lib/internal-auth.ts

**As a** platform engineer, **I want** auth-related logging to use structured pino logger **so that** authentication events are auditable with user context.

### Acceptance Criteria

- [ ] Zero `console.log` or `console.error` calls remain in `apps/api/src/lib/internal-auth.ts`.
- [ ] Auth success/failure events include `{ userId, reason }` fields.
- [ ] Sensitive data (tokens, keys) is never logged.

### Tasks

#### Task 6.1: Replace console calls in internal-auth.ts

**File:** `apps/api/src/lib/internal-auth.ts`

```typescript
import { logger } from './logger.js';

// Replace:
// console.log(`Auth: user ${userId} authenticated`);
// With:
logger.info({ userId }, 'user authenticated');

// Replace:
// console.error(`Auth failed: ${reason}`);
// With:
logger.warn({ reason }, 'authentication failed');
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 6.1.1 | Import logger | 2 min |
| 6.1.2 | Replace each `console.log` with `logger.info` | 10 min |
| 6.1.3 | Replace each `console.error` with `logger.warn` or `logger.error` | 10 min |
| 6.1.4 | Audit that no tokens/keys are logged | 5 min |

#### Task 6.2: Write test

**File:** `apps/api/src/lib/internal-auth.test.ts` (append to existing)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('internal-auth.ts logging', () => {
  it('should not contain any console.log calls', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('./internal-auth.ts', import.meta.url),
      'utf-8'
    );
    assert.equal(content.includes('console.log'), false);
    assert.equal(content.includes('console.error'), false);
  });

  it('should not log sensitive tokens', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(
      new URL('./internal-auth.ts', import.meta.url),
      'utf-8'
    );
    assert.equal(content.includes('token'), false);
    assert.equal(content.includes('apiKey'), false);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 6.2.1 | Write static analysis test for console absence | 5 min |
| 6.2.2 | Write test for sensitive data absence in logs | 10 min |

---

## Story 7: Configure structlog for apps/ml

**As a** ML engineer, **I want** the FastAPI ML service to emit structured JSON logs **so that** ML service logs are consistent with the rest of the platform and can be correlated.

### Acceptance Criteria

- [ ] `structlog` is listed in `apps/ml/requirements.txt` (or `pyproject.toml`).
- [ ] `apps/ml/src/logging_config.py` configures structlog with JSON output.
- [ ] Every log line includes: `level`, `timestamp`, `service: "retune-ml"`, `request_id`, `msg`.
- [ ] `request_id` is extracted from the `X-Request-ID` header if present.
- [ ] No bare `print()` statements remain in `apps/ml/src/`.

### Tasks

#### Task 7.1: Install structlog

**File:** `apps/ml/requirements.txt`

```
structlog>=24.1.0
```

```bash
cd apps/ml && pip install structlog
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 7.1.1 | Add structlog to requirements | 5 min |
| 7.1.2 | Verify installation | 2 min |

#### Task 7.2: Create logging configuration

**File:** `apps/ml/src/logging_config.py`

```python
import structlog
import logging

def configure_logging():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

def get_logger(service: str = "retune-ml"):
    return structlog.get_logger(service=service)
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 7.2.1 | Create `logging_config.py` with structlog configuration | 20 min |
| 7.2.2 | Export `get_logger` factory function | 5 min |

#### Task 7.3: Add request ID middleware for FastAPI

**File:** `apps/ml/src/middleware/request_id.py`

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import structlog
import uuid

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 7.3.1 | Create request ID middleware | 15 min |
| 7.3.2 | Register middleware in FastAPI app | 5 min |

#### Task 7.4: Replace print statements

Replace all `print(...)` in `apps/ml/src/` with:

```python
from src.logging_config import get_logger
logger = get_logger()
logger.info("message", key="value")
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 7.4.1 | Grep for all `print(` calls in `apps/ml/src/` | 5 min |
| 7.4.2 | Replace each with structlog call | 30 min |
| 7.4.3 | Verify no `print(` remains | 5 min |

#### Task 7.5: Write tests

**File:** `apps/ml/tests/test_logging.py`

```python
import json
import pytest
from io import StringIO
from src.logging_config import configure_logging, get_logger

class TestStructuredLogging:
    def test_logger_outputs_json(self, capsys):
        configure_logging()
        logger = get_logger()
        logger.info("test message", key="value")
        captured = capsys.readouterr()
        log_line = json.loads(captured.out.strip())
        assert log_line["event"] == "test message"
        assert log_line["key"] == "value"
        assert log_line["service"] == "retune-ml"

    def test_logger_includes_timestamp(self, capsys):
        configure_logging()
        logger = get_logger()
        logger.info("ts test")
        captured = capsys.readouterr()
        log_line = json.loads(captured.out.strip())
        assert "timestamp" in log_line

    def test_logger_includes_level(self, capsys):
        configure_logging()
        logger = get_logger()
        logger.warning("warn test")
        captured = capsys.readouterr()
        log_line = json.loads(captured.out.strip())
        assert log_line["level"] == "warning"
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 7.5.1 | Write test: JSON output format | 10 min |
| 7.5.2 | Write test: timestamp presence | 5 min |
| 7.5.3 | Write test: level field | 5 min |

---

## Summary

| Story | Effort Estimate |
|-------|----------------|
| 1. Install and Configure Pino | 0.5 day |
| 2. Request ID Middleware | 0.5 day |
| 3. Replace console in main.ts | 0.5 day |
| 4. Replace console in generate.ts | 0.5 day |
| 5. Replace console in workbench-runtime.ts | 1 day |
| 6. Replace console in internal-auth.ts | 0.5 day |
| 7. Configure structlog for apps/ml | 1.5 days |
| **Total** | **5 days** |
