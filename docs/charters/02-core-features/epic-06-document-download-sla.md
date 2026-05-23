# Epic 06 — Document Download SLA

**Charter:** 02-Core-Features
**Priority:** P1 — Week 4
**Complexity:** M
**Owner:** Staff Engineer + DevOps Engineer
**Status:** Created in architect rewrite (2026-05-22). Silent 501s are a known gap.

---

## Goal

Replace silent 501 responses with a real document download SLA. Today, `apps/api/src/lib/docx-renderer.ts` shells out to `packages/scripts/generate_resume.py` for DOCX/PDF generation. If Python is unavailable, the API returns 501 with no user-facing explanation. Production must either guarantee Python availability OR explicitly disable downloads with a clear UX signal.

## Definition of Done

- [ ] API startup probe verifies Python + `python-docx` availability. If missing in production, the process fails-fast with a clear error.
- [ ] When Python is temporarily unavailable (cold-start, transient failure), the API returns 503 (`service_temporarily_unavailable`) instead of 501, with a `Retry-After` header.
- [ ] The production Dockerfile (when Charter 06-CI/CD Epic 05 lands) bundles Python 3.11+ and all required dependencies.
- [ ] The user sees a meaningful message ("Document generation is temporarily unavailable, please retry in a moment") instead of a generic error.

---

## Code grounding (verified)

- `apps/api/src/lib/docx-renderer.ts:31` — resolves path to `generate_resume.py`.
- `apps/api/src/lib/docx-renderer.ts:40` — fallback path: `resolve(__dirname, "../../../../packages/agent/src/agent/generate_resume.py")`.
- `apps/api/src/lib/docx-renderer.ts:9` — comment: "If `python3` or `python-docx` is missing on the host we return" (implying a graceful degradation that currently manifests as 501).
- `apps/api/src/routes/result.ts:171-172` — comment: "501 distinguishes 'we can't render that' (e.g. cover letter not yet generated, python not installed, PDF unsupported on".
- `apps/api/src/routes/result.ts:181` — returns status `501`.
- `packages/scripts/generate_resume.py` — the Python script that produces DOCX output.

---

## Story 6.1 — Startup probe for Python availability

**As a** platform engineer,
**I want** the API to verify Python availability at boot,
**so that** a misconfigured deploy is caught immediately rather than on the first download request.

### Acceptance criteria

- [ ] `apps/api/src/lib/docx-renderer.ts` exports a `probeDocxRuntime(): Promise<{ available: boolean, error?: string }>` function.
- [ ] The probe runs `python3 -c "import docx; print('ok')"` (or equivalent minimal import check).
- [ ] `apps/api/src/main.ts` calls the probe at boot. In `NODE_ENV=production`: if probe fails, log error and `process.exit(1)`. In development: log warning, continue (downloads will 503).
- [ ] Probe result is cached — not re-run on every request.

### Tasks

- **6.1.1** Add `probeDocxRuntime()` to `apps/api/src/lib/docx-renderer.ts`. Spawns `python3 -c "import docx"` with a 5-second timeout.
- **6.1.2** Call from `apps/api/src/main.ts` after `assertProductionRuntime()` (from Epic 02). Fail-fast in production on probe failure.
- **6.1.3** In development mode, set an internal flag `docx_available = false` and log a warning. Subsequent download requests return 503 immediately without attempting the spawn.
- **6.1.4** Unit test: mock `child_process.spawn` to simulate Python missing → assert probe returns `{ available: false, error: "..." }`.

---

## Story 6.2 — Replace 501 with 503 and Retry-After

**As a** user requesting a document download,
**I want** a clear signal that the service is temporarily unavailable (not permanently broken),
**so that** I know to retry rather than assume my document is lost.

### Acceptance criteria

- [ ] `apps/api/src/routes/result.ts` returns 503 (not 501) when Python is unavailable due to cold-start or transient failure.
- [ ] Response includes `Retry-After: 30` header.
- [ ] Response body: `{ error: "service_temporarily_unavailable", message: "Document generation is temporarily unavailable. Please retry in 30 seconds." }`.
- [ ] 501 is retained ONLY for genuinely unsupported operations (e.g., PDF format not implemented) — not for runtime unavailability.
- [ ] Frontend displays the message from the response body (not a generic error).

### Tasks

- **6.2.1** In `apps/api/src/routes/result.ts`, distinguish between "Python not installed" (now caught at boot in production) and "Python temporarily unavailable" (transient spawn failure).
- **6.2.2** For transient failures: return 503 with `Retry-After: 30` and the standard error envelope.
- **6.2.3** For genuinely unsupported formats (e.g., PDF on a platform that can't render it): retain 501 with `{ error: "not_implemented", message: "..." }`.
- **6.2.4** Update `apps/web` download handler to show the `message` from 503 responses and offer a retry button.

---

## Story 6.3 — Production Dockerfile Python layer

**As a** DevOps engineer,
**I want** the production container to bundle Python 3.11+ with `python-docx` and all script dependencies,
**so that** document downloads are guaranteed available in production.

### Acceptance criteria

- [ ] The production Dockerfile (owned by Charter 06-CI/CD Epic 05) includes a Python layer with: `python3`, `pip`, `python-docx`, and any other dependencies from `packages/scripts/requirements.txt`.
- [ ] The startup probe (Story 6.1) passes in the production container.
- [ ] Container image size increase is documented (expected: ~50-80 MB for Python + deps).
- [ ] This story is a specification for the CI/CD charter — implementation happens there.

### Tasks

- **6.3.1** Document the Python runtime requirements in `docs/deploy/python-requirements.md`: Python version, pip packages, system dependencies.
- **6.3.2** Provide a `Dockerfile.python-layer` fragment or multi-stage build instructions for the CI/CD charter to incorporate.
- **6.3.3** Verify the startup probe passes in a local Docker build.

---

## Out of scope

- PDF generation via a different tool (e.g., Puppeteer, WeasyPrint) — future work.
- Client-side document generation (would eliminate the Python dependency but is a major architecture change).
- Python version management beyond "3.11+" — the script works on 3.11, 3.12, 3.13.

---

## Hard dependencies

- **Charter 06-CI/CD Epic 05 (deploy automation)** — the production Dockerfile that bundles Python is owned there. Story 6.3 here is a specification; implementation is in that epic.
- **Epic 02 (Generation Runtime Contract)** — `assertProductionRuntime()` in `apps/api/src/main.ts` is the call site where the Python probe is also invoked.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Python probe adds 1-2s to API boot time | Probe runs once at boot, cached; acceptable for production (not hot-path) |
| Container image bloat from Python layer | Multi-stage build; Python layer is ~50-80 MB; document the tradeoff |
| Transient Python failures in production (OOM, timeout) | 503 + Retry-After gives the user a clear path; monitor spawn failure rate |
| `generate_resume.py` path resolution breaks in container | Startup probe catches this at boot; fail-fast prevents silent breakage |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Startup probe catches missing Python | Boot API without Python in PATH, `NODE_ENV=production` → exits 1 | CI integration test |
| 503 returned on transient failure | Mock Python spawn timeout → assert 503 + Retry-After header | CI unit test |
| 501 retained for unsupported formats | Request unsupported format → assert 501 + `not_implemented` | CI unit test |
| Production container has Python | `docker run <image> python3 -c "import docx"` exits 0 | CI (after 06-cicd/epic-05) |
| User sees meaningful message | Frontend test: mock 503 response → retry button visible | CI component test |
