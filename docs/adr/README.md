# Architecture Decision Records (ADRs)

This directory holds the architecturally significant decisions Retune
has made and why. Each ADR is a single Markdown file. New decisions
land as a PR; the file becomes immutable once `Status: Accepted`.

## Index

| # | Title | Status | Date | Charter |
|---|---|---|---|---|
| [001](./ADR-001-cognitive-substrate.md) | Architecture style: cognitive substrate over CRUD service | Accepted | 2026-05-23 | 02-Core |
| [002](./ADR-002-persistence.md) | Persistence: Postgres + Drizzle, with PGlite for dev/tests | Accepted | 2026-05-23 | 08-Data |
| [003](./ADR-003-auth.md) | Auth: Supabase SSR over custom auth | Accepted | 2026-05-23 | 01-Sec, 02-CodeQ |
| [004](./ADR-004-ai-provider.md) | AI provider: vendor-agnostic facade with concurrency control | Accepted | 2026-05-23 | 09-AI/ML |
| [005](./ADR-005-monorepo.md) | Monorepo + workspace tooling (pnpm + Turbo + Biome) | Accepted | 2026-05-23 | 20-DX |
| [006](./ADR-006-generation-runtime.md) | Generation runtime: Temporal in production, in-memory dev-only | Accepted | 2026-05-23 | 04-Res, 02-Core |

## Format

Each ADR follows the [Michael Nygard template](https://github.com/joelparkerhenderson/architecture-decision-record#suggestions-for-writing-good-adrs):

```
# ADR-NNN — Title

**Status**: Proposed | Accepted | Superseded | Deprecated
**Date**: YYYY-MM-DD
**Owner**: Team or named lead
**Charter**: Charter ID(s) this decision relates to

## Context
What forces are at play, what we know, what's relevant.

## Decision
The decision in prose. State it clearly.

## Consequences
Positive and negative. Both are required.

## Alternatives Considered
What we looked at and why we didn't pick it.

## References
File paths, charter sections, external links.
```

## Lifecycle

- **Proposed**: open PR; reviewers debate.
- **Accepted**: merged. Treat the file as immutable. Future changes go in a new ADR that supersedes this one.
- **Superseded**: link from the new ADR back to this one with `**Superseded by**: ADR-NNN` at the top.
- **Deprecated**: the system no longer relies on this; useful as historical record.
