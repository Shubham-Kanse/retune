# ADR-005 — Monorepo + Workspace Tooling

**Status**: Accepted
**Date**: 2026-05-23
**Owner**: Platform / DX engineering
**Charter**: 20-DX, 02-Codebase-Quality

## Context

Retune ships seven runtime artefacts: `apps/web` (Next.js), `apps/api` (Hono on Node), `apps/worker` (Temporal), `apps/ml` (FastAPI/gRPC, Python), and shared packages `agent`, `db`, `types`, `billing`, `eval`, `proto`, `ui`, `onto`. They share schemas, types, and a handful of utilities.

Three options for layout:

1. Polyrepo, one package per repo.
2. Monorepo with shared `node_modules` (npm workspaces).
3. Monorepo with isolated `node_modules` per package (pnpm workspaces).

## Decision

Single **monorepo** with **pnpm workspaces** + **Turborepo** for task orchestration. **Biome** for lint+format. **Husky + lint-staged** for pre-commit.

Specifics:

- `pnpm` 10.30.x (`packageManager` field in root `package.json`).
- `turbo` runs `dev`, `build`, `test`, `lint`, `typecheck` across packages with caching.
- `biome` replaces ESLint + Prettier as a single tool.
- `pnpm.overrides` pins specific dependency versions across the workspace:
  - `drizzle-orm: 0.38.4` — peer-dep duplication otherwise (see Charter 18 / 11).
  - `@opentelemetry/api: 1.9.1` — same reason; drizzle declares it as an optional peer.
- `engines.node = "22.x"` in workspace packages; node 22 LTS targeted everywhere.

## Consequences

**Positive**:

- Cross-package refactors land in one PR with one CI run.
- Shared types (`@retune/types`) are imported as workspace deps; changing them rebuilds dependents transparently.
- Test runs are per-package; Turbo caches successful runs so unchanged packages don't re-run.
- Biome is one binary; faster than ESLint+Prettier; consistent rules; produces actionable error messages.

**Negative**:

- pnpm's strict peer-dep resolution occasionally produces multiple installs of the same library when transitive peers diverge. Mitigated via `pnpm.overrides`.
- Onboarding adds one tool (turbo) to the dev's mental model. Worth it for cache hits.
- Cross-package cycles are easy to introduce by accident; relying on Biome rule + manual review.

## Migration Notes

- 2026-05-22: zod consolidated to `^4.4.3` across all 6 packages (apps/web upgraded from 3.24.1).
- 2026-05-22: rate-limit consolidated from 4 implementations to 1 + thin adapter for career-understanding's named-args ergonomics.
- 2026-05-22: deleted `packages/auth/` after Supabase SSR replaced it (see ADR-003).

## Alternatives Considered

- **Polyrepo**: rejected. Cross-package changes would each be a multi-PR dance with versioning; CI cycle time would balloon.
- **npm workspaces**: rejected. Hoisted `node_modules` invites phantom deps; pnpm's strictness has caught real bugs.
- **Bun workspaces**: rejected for now. Bun's runtime compatibility with the Anthropic + OpenAI SDKs was incomplete at the time of this decision; revisit when both vendor-validate Bun.
- **Yarn 3+ Berry**: rejected. PnP mode produces opaque resolution errors; node_modules-mode is just slower pnpm.

## References

- `package.json` (root)
- `pnpm-workspace.yaml`
- `turbo.json`
- `biome.json`
- `docs/charters/20-dx/README.md`
