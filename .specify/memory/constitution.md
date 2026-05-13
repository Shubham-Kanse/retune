<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- PRINCIPLE_1_NAME -> I. User-Trustworthy Cognitive Outputs
- PRINCIPLE_2_NAME -> II. Runtime and Package Boundary Discipline
- PRINCIPLE_3_NAME -> III. Test-First Provider Parity
- PRINCIPLE_4_NAME -> IV. Privacy, Consent, and Auditability by Default
- PRINCIPLE_5_NAME -> V. Production UX and Operational Readiness
Added sections:
- Architecture Constraints
- Development Workflow and Quality Gates
Removed sections:
- Placeholder SECTION_2_NAME
- Placeholder SECTION_3_NAME
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
Follow-up TODOs: none
-->
# Retune Constitution

## Core Principles

### I. User-Trustworthy Cognitive Outputs

Every shipped application package MUST be explainable, contestable, and grounded in user-provided
profile evidence or job-description evidence. Resume bullets, cover letters, strategy text, scores,
and refuse/revise/ship decisions MUST preserve provenance wherever the runtime has the data to do
so. The system MUST refuse or ask for clarification rather than fabricate credentials, employment
history, authorizations, certifications, or quantified impact.

Rationale: Retune sells trust in high-stakes career materials. A polished but unsupported claim is a
product failure, not a copywriting issue.

### II. Runtime and Package Boundary Discipline

Retune MUST preserve explicit boundaries between `apps/web`, `apps/api`, `apps/worker`, `apps/ml`,
and packages under `packages/*`. Browser-runnable code MUST NOT import server-only or worker-only
modules. `packages/types` MUST remain dependency-light and safe for all runtimes. `packages/agent`
MUST NOT import from `apps/*`. Worker code MUST NOT depend on auth or billing packages.

Rationale: The product is a distributed monorepo with Next.js, Hono, Temporal, Postgres/PGlite,
Python ML, and AI providers. Boundary leaks create build failures, security risks, and production
coupling.

### III. Test-First Provider Parity

Behavior that affects generation, authentication, billing/usage, persistence, profile completeness,
file rendering, SSE streaming, or AI-provider behavior MUST be covered before implementation with a
failing unit, integration, contract, or E2E test appropriate to the risk. Generation-path changes MUST
preserve Anthropic and OpenAI provider parity unless the specification explicitly scopes one provider
out and records the reason. Critical workflow changes MUST include idempotency and retry behavior in
the test plan.

Rationale: Retune has multiple execution paths and external providers. Unverified changes often pass
locally while breaking another provider, runtime, or replay path.

### IV. Privacy, Consent, and Auditability by Default

Features that process personal data, resumes, generated documents, usage records, billing state, or
outcome feedback MUST define data ownership, retention, authorization, and deletion behavior in the
spec and plan. User-visible AI decisions MUST include transparency or audit artifacts where practical.
Secrets MUST stay out of client bundles, logs, generated artifacts, and committed files.

Rationale: Retune processes sensitive career and identity data and exposes GDPR-style audit surfaces.
Privacy must be designed into the feature, not patched after implementation.

### V. Production UX and Operational Readiness

Every user-facing flow MUST include accessible loading, empty, error, success, retry, and cancellation
states where applicable. Mobile and keyboard operation are mandatory for primary flows. Long-running
work MUST emit progress or trace feedback. Production paths MUST expose enough structured logging,
health checks, and correlation identifiers to diagnose failures without reproducing them manually.

Rationale: Retune’s core value is an async AI workflow. Users need confidence while work runs, and
operators need evidence when it fails.

## Architecture Constraints

- `apps/web` owns product UI, user-facing API routes, auth entry points, onboarding UI, profile UI,
  and result presentation. It MUST keep browser bundles free of Temporal worker and Node-only modules.
- `apps/api` owns cognitive generation HTTP/SSE control-plane routes and bridges to Temporal or the
  in-memory workbench fallback.
- `apps/worker` owns durable workflow execution and MUST remain focused on cognitive execution.
- `apps/ml` owns Python ML services and must communicate through documented HTTP/gRPC contracts.
- `packages/db` owns schema, migrations, and database helpers. Schema changes MUST be migration-backed.
- `packages/types` owns shared contracts and MUST avoid runtime side effects.
- `packages/agent` owns cognitive orchestration, specialists, provider abstraction, blackboard writes,
  audit traces, and persistence adapters.
- Legacy or compatibility paths MAY remain only when documented in the feature plan with an explicit
  owner and sunset condition.

## Development Workflow and Quality Gates

- Specifications MUST describe user value, acceptance scenarios, privacy/data impact, and measurable
  outcomes before implementation planning begins.
- Plans MUST include a boundary-impact section listing touched apps/packages, runtime edges, database
  changes, provider impact, and rollback considerations.
- Tasks MUST be vertical slices grouped by independently testable user story. Foundational work must
  be completed before dependent stories.
- Tests MUST be run at the narrowest useful scope first, then widened to affected package/app suites.
- Any release-blocking failure in build, typecheck, auth, data isolation, provider parity, or primary
  mobile/accessibility flow MUST be fixed before the feature is considered complete.
- Documentation updates are required when behavior, architecture, env vars, migrations, or developer
  workflow changes.

## Governance

This constitution supersedes ad-hoc implementation preferences for Spec Kit-driven development in
this repository. Feature specs, plans, and tasks MUST check compliance with these principles before
implementation. Exceptions are allowed only when the feature plan records the violation, why it is
necessary, the simpler alternative rejected, and the follow-up task or sunset condition.

Amendments require updating this file, recording the semantic version impact, and syncing affected
Spec Kit templates. Versioning follows semantic versioning: MAJOR for incompatible governance or
principle changes, MINOR for new principles or materially expanded requirements, and PATCH for
clarifications that do not change obligations.

**Version**: 1.0.0 | **Ratified**: 2026-05-12 | **Last Amended**: 2026-05-12
