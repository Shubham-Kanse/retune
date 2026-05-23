# Epic 02 — Distributed Tracing

## Goal

Implement end-to-end distributed tracing using OpenTelemetry so that any request can be followed from apps/web through apps/api into packages/agent specialist execution, with trace context propagated via `traceparent` headers and exported to a configurable OTLP endpoint.

---

## Story 1: Install OpenTelemetry SDK in apps/api

**As a** platform engineer, **I want** the OpenTelemetry Node.js SDK installed in apps/api **so that** I can instrument the service with automatic and manual tracing.

### Acceptance Criteria

- [ ] `@opentelemetry/sdk-node` is listed in `apps/api/package.json` dependencies.
- [ ] `@opentelemetry/auto-instrumentations-node` is listed in `apps/api/package.json` dependencies.
- [ ] `@opentelemetry/exporter-trace-otlp-http` is listed in `apps/api/package.json` dependencies.
- [ ] `@opentelemetry/api` is listed in `apps/api/package.json` dependencies.
- [ ] All packages install without peer dependency conflicts.

### Tasks

#### Task 1.1: Install OpenTelemetry packages

```bash
pnpm --filter @retune/api add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/api @opentelemetry/resources @opentelemetry/semantic-conventions
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.1.1 | Run install command | 5 min |
| 1.1.2 | Verify all packages in `apps/api/package.json` | 5 min |
| 1.1.3 | Verify no peer dependency warnings | 5 min |

#### Task 1.2: Write verification test

**File:** `apps/api/src/lib/telemetry.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('OpenTelemetry dependencies', () => {
  it('should be importable', async () => {
    const sdk = await import('@opentelemetry/sdk-node');
    assert.ok(sdk.NodeSDK);

    const api = await import('@opentelemetry/api');
    assert.ok(api.trace);
    assert.ok(api.context);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.2.1 | Write import verification test | 10 min |

---

## Story 2: Create Telemetry Initialization Module

**As a** platform engineer, **I want** a telemetry initialization module that starts the OTel SDK before the Hono app boots **so that** all HTTP requests are automatically traced from the first request.

### Acceptance Criteria

- [ ] `apps/api/src/lib/telemetry.ts` exports an `initTelemetry()` function.
- [ ] The SDK is configured with service name `retune-api`.
- [ ] Traces are exported to the endpoint specified by `OTEL_EXPORTER_OTLP_ENDPOINT` env var.
- [ ] If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, telemetry is disabled (no-op).
- [ ] Auto-instrumentation covers HTTP and fetch calls.
- [ ] `initTelemetry()` is called in `apps/api/src/main.ts` before `new Hono()`.

### Tasks

#### Task 2.1: Create telemetry module

**File:** `apps/api/src/lib/telemetry.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export function initTelemetry(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

  sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: 'retune-api' }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

export function shutdownTelemetry(): Promise<void> {
  return sdk?.shutdown() ?? Promise.resolve();
}
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.1.1 | Create `telemetry.ts` with SDK initialization | 30 min |
| 2.1.2 | Handle missing endpoint gracefully (no-op) | 10 min |
| 2.1.3 | Export shutdown function for graceful termination | 5 min |

#### Task 2.2: Wire telemetry into main.ts

**File:** `apps/api/src/main.ts`

Add at the very top of the file (before any other imports that might trigger instrumentation):

```typescript
import { initTelemetry, shutdownTelemetry } from './lib/telemetry.js';
initTelemetry();
```

Add graceful shutdown:

```typescript
process.on('SIGTERM', async () => {
  await shutdownTelemetry();
  process.exit(0);
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.2.1 | Add `initTelemetry()` call at top of main.ts | 5 min |
| 2.2.2 | Add SIGTERM handler with `shutdownTelemetry()` | 5 min |
| 2.2.3 | Verify telemetry initializes before Hono app | 5 min |

#### Task 2.3: Write unit tests

**File:** `apps/api/src/lib/telemetry.test.ts`

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('initTelemetry', () => {
  const originalEnv = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  afterEach(() => {
    if (originalEnv) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEnv;
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
  });

  it('should be a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { initTelemetry } = await import('./telemetry.js');
    // Should not throw
    assert.doesNotThrow(() => initTelemetry());
  });

  it('should initialize SDK when endpoint is configured', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
    const { initTelemetry, shutdownTelemetry } = await import('./telemetry.js');
    assert.doesNotThrow(() => initTelemetry());
    await shutdownTelemetry();
  });

  it('should export shutdownTelemetry as a function', async () => {
    const { shutdownTelemetry } = await import('./telemetry.js');
    assert.equal(typeof shutdownTelemetry, 'function');
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.3.1 | Write test: no-op without endpoint | 10 min |
| 2.3.2 | Write test: initializes with endpoint | 10 min |
| 2.3.3 | Write test: shutdown function exists | 5 min |

---

## Story 3: Propagate Trace Context from apps/web to apps/api

**As a** frontend engineer, **I want** trace context propagated from the browser to the API via `traceparent` header **so that** frontend-initiated requests are linked to backend traces.

### Acceptance Criteria

- [ ] `apps/web/src/lib/api-client.ts` (or equivalent fetch wrapper) includes `traceparent` header on every request to apps/api.
- [ ] The `traceparent` header follows W3C Trace Context format: `00-{traceId}-{spanId}-{flags}`.
- [ ] If `X-Request-ID` is also sent, it is separate from trace context.
- [ ] apps/api auto-instrumentation picks up the incoming `traceparent` and continues the trace.

### Tasks

#### Task 3.1: Create trace context utility for apps/web

**File:** `apps/web/src/lib/trace-context.ts`

```typescript
function generateHexId(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createTraceparent(): string {
  const version = '00';
  const traceId = generateHexId(16); // 32 hex chars
  const spanId = generateHexId(8);   // 16 hex chars
  const flags = '01';                // sampled
  return `${version}-${traceId}-${spanId}-${flags}`;
}
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.1.1 | Create `trace-context.ts` with `createTraceparent()` | 15 min |
| 3.1.2 | Ensure crypto.getRandomValues works in both browser and edge runtime | 10 min |

#### Task 3.2: Attach traceparent to API requests

**File:** `apps/web/src/lib/api-client.ts`

```typescript
import { createTraceparent } from './trace-context';

// In the fetch wrapper / API client:
const headers = {
  ...existingHeaders,
  traceparent: createTraceparent(),
};
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.2.1 | Import `createTraceparent` in API client | 5 min |
| 3.2.2 | Add `traceparent` header to all outgoing requests | 10 min |
| 3.2.3 | Verify header is present in browser DevTools network tab | 10 min |

#### Task 3.3: Write unit tests

**File:** `apps/web/src/lib/trace-context.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createTraceparent } from './trace-context';

describe('createTraceparent', () => {
  it('should return a valid W3C traceparent string', () => {
    const tp = createTraceparent();
    const parts = tp.split('-');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('00');           // version
    expect(parts[1]).toHaveLength(32);     // trace-id
    expect(parts[2]).toHaveLength(16);     // parent-id
    expect(parts[3]).toBe('01');           // flags
  });

  it('should generate unique trace IDs', () => {
    const tp1 = createTraceparent();
    const tp2 = createTraceparent();
    expect(tp1).not.toBe(tp2);
  });

  it('should only contain valid hex characters in IDs', () => {
    const tp = createTraceparent();
    const parts = tp.split('-');
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2]).toMatch(/^[0-9a-f]{16}$/);
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.3.1 | Write test: valid W3C format | 10 min |
| 3.3.2 | Write test: unique trace IDs | 5 min |
| 3.3.3 | Write test: hex character validation | 5 min |

---

## Story 4: Instrument Orchestrator with Manual Spans

**As a** platform engineer, **I want** each specialist invocation in the orchestrator to be wrapped in a manual OpenTelemetry span **so that** I can see the execution timeline of the cognitive pipeline in trace visualizations.

### Acceptance Criteria

- [ ] `@opentelemetry/api` is available in `packages/agent`.
- [ ] Each specialist invocation in `packages/agent/src/workbench/orchestrator.ts` creates a child span.
- [ ] Span name follows pattern: `specialist.{specialistName}`.
- [ ] Span attributes include: `specialist.name`, `specialist.goal`, `generation.id`.
- [ ] Span status is set to ERROR if the specialist throws.
- [ ] The error is recorded on the span before re-throwing.
- [ ] Spans are nested under the parent HTTP span from apps/api.

### Tasks

#### Task 4.1: Add OpenTelemetry API to packages/agent

```bash
pnpm --filter @retune/agent add @opentelemetry/api
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.1.1 | Run install command | 5 min |
| 4.1.2 | Verify in `packages/agent/package.json` | 2 min |

#### Task 4.2: Instrument orchestrator specialist loop

**File:** `packages/agent/src/workbench/orchestrator.ts`

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('retune-agent');

// Inside the specialist execution loop:
async function runSpecialist(specialist: Specialist, context: RunContext) {
  return tracer.startActiveSpan(
    `specialist.${specialist.name}`,
    {
      attributes: {
        'specialist.name': specialist.name,
        'specialist.goal': specialist.goal,
        'generation.id': context.generationId,
      },
    },
    async (span) => {
      try {
        const result = await specialist.execute(context);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.2.1 | Import OTel API and create tracer | 5 min |
| 4.2.2 | Wrap specialist execution in `startActiveSpan` | 30 min |
| 4.2.3 | Set span attributes (name, goal, generationId) | 10 min |
| 4.2.4 | Handle error recording and status | 15 min |
| 4.2.5 | Ensure span is always ended in finally block | 5 min |

#### Task 4.3: Write unit tests

**File:** `packages/agent/src/workbench/orchestrator.test.ts` (append or create)

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  NodeTracerProvider,
} from '@opentelemetry/sdk-trace-node';

describe('orchestrator tracing', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterEach(() => {
    provider.shutdown();
  });

  it('should create a span for each specialist invocation', async () => {
    // Run orchestrator with a mock specialist
    // ...invoke orchestrator...

    const spans = exporter.getFinishedSpans();
    const specialistSpan = spans.find((s) =>
      s.name.startsWith('specialist.')
    );
    assert.ok(specialistSpan, 'specialist span should exist');
  });

  it('should set specialist.name attribute on span', async () => {
    // ...invoke orchestrator with specialist named "resume-writer"...

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'specialist.resume-writer');
    assert.ok(span);
    assert.equal(
      span.attributes['specialist.name'],
      'resume-writer'
    );
  });

  it('should record error on span when specialist throws', async () => {
    // ...invoke orchestrator with a failing specialist...

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name.startsWith('specialist.'));
    assert.ok(span);
    assert.equal(span.status.code, SpanStatusCode.ERROR);
    assert.ok(span.events.length > 0); // exception event recorded
  });

  it('should include generation.id attribute', async () => {
    // ...invoke orchestrator with generationId = 'gen-123'...

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name.startsWith('specialist.'));
    assert.ok(span);
    assert.equal(span.attributes['generation.id'], 'gen-123');
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.3.1 | Install `@opentelemetry/sdk-trace-node` as dev dependency in packages/agent | 5 min |
| 4.3.2 | Write test: span created per specialist | 20 min |
| 4.3.3 | Write test: span attributes set correctly | 15 min |
| 4.3.4 | Write test: error recorded on span | 20 min |
| 4.3.5 | Write test: generation.id attribute present | 10 min |

---

## Story 5: Export Traces to Configurable OTLP Endpoint

**As a** DevOps engineer, **I want** traces exported to a configurable OTLP endpoint **so that** I can send traces to Jaeger, Grafana Tempo, or any OTLP-compatible backend without code changes.

### Acceptance Criteria

- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` env var controls the export destination.
- [ ] When the env var is unset, no traces are exported (no errors, no network calls).
- [ ] When set to `http://localhost:4318`, traces are sent to that endpoint.
- [ ] `OTEL_SERVICE_NAME` env var overrides the default service name.
- [ ] `.env.example` documents both env vars.
- [ ] A `docker-compose.observability.yml` provides a local Jaeger instance for development.

### Tasks

#### Task 5.1: Update .env.example

**File:** `.env.example`

Add:

```env
# ─── Observability (OPTIONAL) ────────────────────────────────────────────────
# OpenTelemetry OTLP endpoint (e.g., http://localhost:4318 for local Jaeger)
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
# OTEL_SERVICE_NAME=retune-api
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.1.1 | Add observability section to .env.example | 5 min |

#### Task 5.2: Create docker-compose for local observability

**File:** `docker-compose.observability.yml`

```yaml
version: '3.8'
services:
  jaeger:
    image: jaegertracing/all-in-one:1.54
    ports:
      - '16686:16686' # Jaeger UI
      - '4318:4318'   # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.2.1 | Create docker-compose file with Jaeger service | 10 min |
| 5.2.2 | Document usage in README or charter | 5 min |

#### Task 5.3: Update telemetry.ts to respect OTEL_SERVICE_NAME

**File:** `apps/api/src/lib/telemetry.ts`

```typescript
const serviceName = process.env.OTEL_SERVICE_NAME || 'retune-api';
// Use in Resource creation
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.3.1 | Read `OTEL_SERVICE_NAME` with fallback | 5 min |
| 5.3.2 | Pass to Resource constructor | 5 min |

#### Task 5.4: Write integration test

**File:** `apps/api/src/lib/telemetry-integration.test.ts`

```typescript
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('telemetry OTLP export configuration', () => {
  afterEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
  });

  it('should not create exporter when endpoint is not set', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { initTelemetry } = await import('./telemetry.js');
    // Should complete without error and without network calls
    assert.doesNotThrow(() => initTelemetry());
  });

  it('should use OTEL_SERVICE_NAME when provided', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
    process.env.OTEL_SERVICE_NAME = 'custom-service';
    const { initTelemetry, shutdownTelemetry } = await import('./telemetry.js');
    initTelemetry();
    // Verify via SDK internals or span export
    await shutdownTelemetry();
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.4.1 | Write test: no exporter without endpoint | 10 min |
| 5.4.2 | Write test: custom service name | 10 min |

---

## Summary

| Story | Effort Estimate |
|-------|----------------|
| 1. Install OpenTelemetry SDK | 0.5 day |
| 2. Create Telemetry Initialization Module | 1 day |
| 3. Propagate Trace Context from apps/web | 1 day |
| 4. Instrument Orchestrator with Manual Spans | 2 days |
| 5. Export Traces to Configurable OTLP Endpoint | 0.5 day |
| **Total** | **5 days** |
