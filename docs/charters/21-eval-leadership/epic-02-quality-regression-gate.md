# Charter 21 Epic 02 — Quality Regression Gate

**Charter:** 21 — Eval Leadership
**Status:** Not started
**Owner:** Eval lead + Platform CI

## Goal

Make every PR that touches the cognitive substrate, prompts, or model
selection produce a quality-score delta vs main as a PR comment. PRs
that regress quality > 2pp on the canonical set are blocked from
merge.

## Definition of Done

- A new GitHub Actions job `eval-regression` runs on every PR touching:
  `packages/agent/**`, `packages/eval/**`, `apps/api/src/runtime/**`,
  or any prompt `*.md` file.
- The job runs `pnpm --filter @retune/eval eval --baseline-only` and
  compares against the main-branch baseline.
- A PR comment is posted with: per-rubric delta, total score delta,
  per-case-family breakdown, and the canonical-set version.
- The job exits non-zero if any of: total score drops > 2pp; any
  rubric category drops > 5pp; any new case fails that previously passed.
- The baseline is regenerated on push to main and stored as a CI
  artifact (or in S3 with a 90-day retention).

## Stories

### Story 2.1 — Baseline storage
Decide where the main-branch baseline lives. Options:
- GitHub Actions cache (cheap, 7-day retention).
- Workflow artifact (90-day, downloadable per-run).
- S3 bucket (90+ day, but costs).

Pick artifact. Each push to main archives `eval-baseline.json`.

**Acceptance:** Workflow uploads `eval-baseline.json` on every main push.

### Story 2.2 — PR delta job
New workflow `eval-regression.yml` triggered on PR. Pulls the baseline
from the most recent main artifact, runs the eval against the PR head,
computes delta, posts a comment.

**Acceptance:** A demo PR sees the comment with a delta table.

### Story 2.3 — Block-on-regression
Add a status check that fails when total score drops > 2pp. Wire it
into branch protection on main.

**Acceptance:** A demo PR with intentionally-bad prompt is blocked.

### Story 2.4 — Override flow
Sometimes a regression is intentional (refactoring trades 1pp for
clarity). Add a `[skip-eval-regression]` PR-body marker that downgrades
the gate to advisory.

**Acceptance:** PR with marker passes the check with a "manual override"
note in the comment.

## Tasks

- [ ] 2.1.1 Add `eval:json-output` script to package.json that emits
      `eval-baseline.json`.
- [ ] 2.1.2 Add baseline-upload step to `cognitive-cycle.yml` on push to main.
- [ ] 2.2.1 Write `.github/workflows/eval-regression.yml`.
- [ ] 2.2.2 Write the delta + comment formatter.
- [ ] 2.3.1 Configure branch protection.
- [ ] 2.4.1 Implement the marker check.

## Dependencies

- Epic 01 (canonical set ≥ 200) — without enough cases, p-values are noisy.

## Estimated effort

~2 working days.
