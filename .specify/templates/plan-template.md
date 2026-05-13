# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Retune Gates

- **Cognitive trust**: Plan identifies where claims, scores, generated text, or decisions are grounded
  in profile/JD evidence, and states how refusal/clarification prevents fabrication.
- **Boundary discipline**: Plan lists every touched app/package and confirms no forbidden runtime
  imports are introduced (`apps/web` browser bundles, `apps/worker`, `packages/types`,
  `packages/agent`).
- **Provider parity and tests**: Plan defines the failing tests or contract checks to write first and
  states Anthropic/OpenAI impact for generation-path work.
- **Privacy and data**: Plan describes personal data touched, authorization checks, retention/deletion
  behavior, migrations, and audit/logging constraints.
- **Production UX/ops**: Plan covers loading, error, empty, success, retry/cancel, mobile/keyboard
  accessibility, progress feedback, structured logging, and rollback/diagnostics for affected flows.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
apps/
├── web/       # Next.js product UI + user-facing API routes
├── api/       # Hono cognitive generation API and SSE control plane
├── worker/    # Temporal worker runtime
└── ml/        # Python ML service

packages/
├── agent/     # cognitive runtime, specialists, providers, blackboard
├── db/        # Drizzle/Postgres/PGlite schema and database helpers
├── types/     # shared contracts
├── auth/      # authentication primitives
├── billing/   # billing and usage accounting
└── ui/        # shared UI primitives when available

supabase/migrations/
docs/
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Boundary Impact

**Touched apps/packages**: [apps/packages and why]
**Runtime edges changed**: [web->api, api->worker, api->db, worker->agent, ml contracts, etc.]
**Database/migration impact**: [none or migration paths]
**Provider impact**: [Anthropic/OpenAI/no AI-provider impact]
**Privacy/audit impact**: [personal data, retention/deletion, audit packet/logging impact]
**Rollback/diagnostics**: [feature flag, migration rollback, logs/traces/health checks]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
