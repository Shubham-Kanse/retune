# Epic 06 — Dependency Scanning & SBOM

**Charter:** 01-Security
**Priority:** P1 — Week 3
**Complexity:** M
**Owner:** Staff Engineer + DevOps Engineer
**Status:** Created in architect rewrite (2026-05-22). Legacy `ci-cd.yml` has a single `npm audit` equivalent buried in the test job; no dedicated scanning.

---

## Goal

Establish continuous dependency-vulnerability scanning and Software Bill of Materials (SBOM) generation for the pnpm 10 monorepo. Today the only audit surface is the legacy `.github/workflows/ci-cd.yml` (slated for deletion) which runs `pnpm install --frozen-lockfile` and `pnpm test` but never explicitly calls `pnpm audit`. The cognitive pipeline's authoritative CI (`.github/workflows/cognitive-cycle.yml`) has zero dependency-security gates. This epic adds automated patching, blocking CVE gates, and a machine-readable SBOM on every release.

## Definition of Done

- [ ] Renovate is configured (`.github/renovate.json`) with patch-automerge for non-major updates and scheduled batched majors (weekly).
- [ ] `pnpm audit --audit-level=high --prod` runs in `.github/workflows/cognitive-cycle.yml` and blocks merge on any critical/high CVE.
- [ ] CycloneDX SBOM is generated on every release tag and uploaded as a GitHub release asset.
- [ ] `pnpm.onlyBuiltDependencies` whitelist in root `package.json` is audited — every entry's postinstall script reviewed and documented.
- [ ] Zod version split (v3 in `apps/web`, v4 in `packages/agent`, `packages/types`, `packages/onto`, `packages/eval`, `apps/api`) is tracked as a known-risk item with a consolidation timeline.
- [ ] Drizzle ORM pinned at `0.38.4` (via `pnpm.overrides` in root `package.json`) is documented with upgrade criteria.

---

## Code grounding (verified)

- `.github/workflows/ci-cd.yml` — legacy pipeline. Runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. No explicit `pnpm audit` or `npm audit` call. Exposes `JWT_SECRET` and `ANTHROPIC_API_KEY` as plaintext env vars in the build step (lines 44–46). Slated for deletion once cognitive-cycle.yml covers all packages.
- `.github/workflows/cognitive-cycle.yml` — authoritative CI. 12 jobs (typecheck, provider-parity, lint, test-ts, test-python, cross-lang-e2e, cognitive-cycle-heavy, test-web, lighthouse, eval-mock, eval-live-matrix, performance-gate, nightly-cron, codegen-drift). Zero dependency-audit steps.
- Root `package.json` — `pnpm.onlyBuiltDependencies`: `["better-sqlite3", "@biomejs/biome", "esbuild", "sharp"]`. Each runs native compilation postinstall scripts.
- Root `package.json` — `pnpm.overrides`: `{ "drizzle-orm": "0.38.4" }`. Pins Drizzle across all workspaces.
- `apps/web/package.json` — `"zod": "^3.24.1"` (Zod 3).
- `packages/types/package.json`, `packages/agent/package.json`, `packages/onto/package.json`, `packages/eval/package.json`, `apps/api/package.json` — `"zod": "^4.4.3"` (Zod 4).
- `pnpm-lock.yaml` — single lockfile for the entire monorepo (pnpm 10 workspace protocol).
- No `.github/renovate.json` or `renovate.json` exists.
- No `.github/dependabot.yml` exists.

---

## Story 6.1 — Configure Renovate for automated dependency updates

**As a** platform engineer,
**I want** non-major dependency patches to be auto-merged after CI passes,
**so that** security patches land without manual intervention.

### Acceptance criteria

- [ ] `.github/renovate.json` is committed with: (a) `extends: ["config:recommended"]`, (b) patch/minor automerge enabled for all packages, (c) major updates batched into a single PR per week (schedule: `before 6am on Monday`), (d) `pnpm` lockfile maintenance enabled, (e) `rangeStrategy: "pin"` for production dependencies, (f) group rules for `@types/*`, `eslint*`, `biome*`.
- [ ] Renovate is enabled on the GitHub repository (requires admin action — document the step).
- [ ] Zod is excluded from automerge (`"matchPackageNames": ["zod"]`) until Charter 18 Epic 02 (zod consolidation) completes.
- [ ] Drizzle ORM is excluded from automerge (`"matchPackageNames": ["drizzle-orm"]`) — manual upgrade only, coordinated with schema migration testing.
- [ ] First Renovate onboarding PR is merged and dashboard issue is visible.

### Tasks

- **6.1.1 — Create .github/renovate.json:** Write the configuration file with all acceptance criteria rules.
- **6.1.2 — Document Renovate enablement:** Add instructions to `docs/runbooks/renovate-setup.md` for enabling the Renovate GitHub App on the repository.
- **6.1.3 — Add exclusion rules:** Pin zod and drizzle-orm to manual-only. Add `"matchUpdateTypes": ["major"], "automerge": false` for all packages.
- **6.1.4 — Coordinate with Charter 18 Epic 02:** Add a comment in renovate.json referencing the zod consolidation dependency. Remove the zod exclusion once `apps/web` migrates to Zod 4.

---

## Story 6.2 — Add pnpm audit gate to cognitive-cycle CI

**As a** security engineer,
**I want** CI to block merges when a critical or high CVE exists in production dependencies,
**so that** known-vulnerable code never ships.

### Acceptance criteria

- [ ] A new job `dependency-audit` is added to `.github/workflows/cognitive-cycle.yml`.
- [ ] The job runs `pnpm audit --audit-level=high --prod` and fails (exit code 1) on any high/critical finding.
- [ ] The job runs on every PR and every push to `main`/`develop` (same triggers as existing jobs).
- [ ] Advisory suppressions are documented in a `.pnpm-audit-ignore.json` file (or `pnpm.auditConfig.ignoreCves` in `package.json`) with justification comments.
- [ ] The job also runs `pnpm audit --audit-level=moderate` as a non-blocking warning step (annotations only, no failure).
- [ ] Job timeout: 5 minutes.

### Tasks

- **6.2.1 — Add dependency-audit job:** Insert into `cognitive-cycle.yml` after the `lint` job (no dependency on other jobs — runs in parallel).
- **6.2.2 — Create suppression file:** Add `.pnpm-audit-ignore.json` with an empty array and a comment explaining the format.
- **6.2.3 — Validate locally:** Run `pnpm audit --audit-level=high --prod` locally and resolve or suppress any existing findings before the gate goes live.
- **6.2.4 — Remove legacy npm audit:** Once cognitive-cycle.yml covers all packages, delete the `ci-cd.yml` workflow (coordinate with Charter 06 Epic 01 — CI consolidation).

---

## Story 6.3 — Generate CycloneDX SBOM on release tags

**As a** compliance officer,
**I want** a machine-readable SBOM attached to every release,
**so that** downstream consumers can verify the dependency tree.

### Acceptance criteria

- [ ] A new workflow `.github/workflows/release-sbom.yml` triggers on tag push (`v*`).
- [ ] The workflow runs `npx @cyclonedx/cdxgen -o sbom.json --spec-version 1.5 -t javascript .` to produce a CycloneDX 1.5 JSON SBOM.
- [ ] The SBOM is uploaded as a release asset named `sbom-<tag>.json` using `gh release upload`.
- [ ] The workflow also produces a Python SBOM for `apps/ml` using `cdxgen -t python apps/ml` and uploads it as `sbom-ml-<tag>.json`.
- [ ] Both SBOMs pass `cdxgen --validate` (schema validation step before upload).
- [ ] Workflow timeout: 10 minutes.

### Tasks

- **6.3.1 — Create release-sbom.yml:** Write the workflow with tag trigger, cdxgen install, generation, validation, and upload steps.
- **6.3.2 — Test locally:** Run `npx @cyclonedx/cdxgen -o sbom.json .` locally and verify the output includes all workspace packages.
- **6.3.3 — Add to Epic 02 Story 2.3:** Cross-reference — Epic 02 Story 2.3 Task 2.3.4 already mentions this workflow. Deduplicate: this story is the authoritative implementation; Epic 02 references it.

---

## Story 6.4 — Audit pnpm.onlyBuiltDependencies whitelist

**As a** security engineer,
**I want** every postinstall script in the whitelist to be reviewed and documented,
**so that** supply-chain attacks via native compilation are detected.

### Acceptance criteria

- [ ] Each entry in `pnpm.onlyBuiltDependencies` (`better-sqlite3`, `@biomejs/biome`, `esbuild`, `sharp`) has a documented justification in `docs/security/postinstall-audit.md`.
- [ ] For each package: (a) what the postinstall script does, (b) whether it downloads binaries (and from where), (c) whether the binary is integrity-checked (checksum/signature), (d) risk rating (low/medium/high), (e) whether it can be replaced with a prebuilt binary or wasm alternative.
- [ ] `better-sqlite3` is flagged as removable once the SQLite→Postgres migration (Charter 08 Epic 01) completes — it's only used by the legacy `packages/db/src/schema.ts` path.
- [ ] Root `package.json` `postinstall` script (`node scripts/copy-pdf-worker.mjs`) is also reviewed and documented.

### Tasks

- **6.4.1 — Review each postinstall script:** Read the source of each package's `install`/`postinstall` script from `node_modules/<pkg>/package.json`.
- **6.4.2 — Write docs/security/postinstall-audit.md:** Document findings per acceptance criteria.
- **6.4.3 — Remove better-sqlite3 after migration:** Add a tracking comment in `package.json` next to the whitelist entry. Remove once Charter 08 Epic 01 lands.
- **6.4.4 — Review copy-pdf-worker.mjs:** Verify `scripts/copy-pdf-worker.mjs` does not download external resources or execute untrusted code.

---

## Out of scope

- Zod 3→4 consolidation (Charter 18 Epic 02 — dependency upgrades).
- Drizzle ORM upgrade beyond 0.38.4 (Charter 18 Epic 02).
- License compliance scanning (future work — SBOM enables it but this epic doesn't implement it).
- Python dependency scanning for `apps/ml` beyond SBOM generation (future: `pip-audit` in CI).

---

## Hard dependencies

- Charter 18 Epic 02 (dependency upgrades / zod consolidation) must complete before Renovate's zod exclusion can be removed.
- Charter 06 Epic 01 (CI consolidation) determines when `ci-cd.yml` can be deleted.
- Epic 02 Story 2.3 Task 2.3.4 (release SBOM) is superseded by this epic's Story 6.3 — single implementation, cross-referenced.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Renovate automerge introduces a breaking patch | CI must pass before automerge; `test-web` + `test-ts` + `test-python` jobs catch regressions |
| `pnpm audit` produces false positives that block PRs | Suppression file with documented justifications; reviewed monthly |
| CycloneDX cdxgen fails on pnpm workspace protocol | Tested locally first (Task 6.3.2); cdxgen has pnpm 10 support since v10.7 |
| Zod split causes type conflicts during Renovate updates | Zod excluded from automerge; manual coordination required |
| `better-sqlite3` postinstall downloads unsigned binaries | Documented risk; package is on removal path (Charter 08 Epic 01) |
| Renovate PR flood overwhelms reviewers | Batch majors weekly; group `@types/*` and lint tooling; automerge patches silently |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Renovate creates PRs for outdated deps | Renovate dashboard issue shows pending updates | Manual weekly review |
| Patch automerge works | Renovate PR auto-merged after CI green | GitHub audit log |
| `pnpm audit` blocks on high CVE | Introduce a known-vulnerable package in a test branch → CI fails | Manual smoke |
| SBOM generated on tag push | Push a `v0.0.0-test` tag → release asset appears | Manual + CI |
| SBOM validates against CycloneDX schema | `cdxgen --validate` step in workflow exits 0 | CI |
| Postinstall audit documented | `docs/security/postinstall-audit.md` exists and covers all 4 packages | PR review |
| Zod excluded from automerge | Renovate config contains `matchPackageNames: ["zod"]` with `automerge: false` | Code review |
