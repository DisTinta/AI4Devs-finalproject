## Why

`npm run verify` is the executable evidence the readme promises (§1.4, §2.4, §6): one command, with
no model and no account, that tells an evaluator (or CI) that the installation reproduces what is
documented. Today it is a placeholder that prints "pending" and exits `0`, so CI is green on a seed
or golden answers the current code no longer produces (PH-12) and nothing checks that the answer
cache really serves the golden answers after `db:seed`. The seed (DIS-91, DIS-92) and the golden
answers with their fingerprints (DIS-26) are now in the base branch, so the check can be real.

This is DIS-44 (CM-HU-14.1), the first sub-issue of CM-HU-14 (DIS-43). Its DoD: `npm run verify`
green locally and in CI; an altered golden answer or a stale fingerprint turns it red; the CI job
does not share a database with the integration tests (PH-23). The decisions D1–D14 were taken by
the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-44 `[enhanced]` description
on 2026-10-17; the amendments A1–A13 (those of the propose and of the three spec-audit runs) are
recorded there too. The author reviews them afterwards.

## What Changes

- `npm run verify` becomes real (`packages/cli/src/verify.ts`, the pattern of `db:seed` and
  `cache:build`; D1). Before connecting, in order: `DATABASE_URL`; the versioned seed and every
  golden file of `seeds/cache/`, read and checked as `db:seed` reads them; the seed's header
  fingerprints against the ones the current code computes; each golden file's seed fingerprints
  against the seed header and its answer fingerprint against the current code; and one golden file
  with entries per seed project. A stale fingerprint fails with the new code `FINGERPRINT_MISMATCH`
  and the message `seed/golden fingerprint mismatch: … run npm run seed:build, then npm run
  cache:build` (or `… run npm run cache:build`), before any question is asked (D2, D3, PH-12).
- Then, in one database transaction that is always rolled back (D4), it checks that every golden
  project is the seed's sample project: same name, sample, seed id and indexed commit
  (`SEED_NOT_LOADED` otherwise, D7, A10) and asks each golden
  question through the real `explain` use case with the evaluation model forced: the `LLM_*`
  variables are never read, so no request reaches a model even when they are set. The served answer
  is compared with the golden response on structural fields only (cache hit, statement types,
  verification, status and cited spans, evidence paths and lines; never free text, ids, usage or
  confidence; D5).
- Output (D6): one `✓`/`✗` line per golden entry with its project, id and question; under each `✗`,
  one indented line per differing field (`statements[0].type: expected "FACT", got "INFERENCE"`), or
  the cache-miss line; then one `<project>: <m>/<n> golden answers match` line per project. Exit `0`
  only when every answer matches, `1` otherwise. A mismatch goes to stdout; a check or environment
  failure is one JSON error line on stderr.
- CI: a new `verify` job in `.github/workflows/ci.yml` (D10, PH-23) with its own Postgres service
  and database `verify`, running `npm ci`, `db:migrate`, `db:seed` and `verify` without any `LLM_*`
  variable; `scope` also looks at the previous `verify` result before skipping a docs-only push. The
  `quality` job keeps its unseeded `test` database.
- The private seed-header helpers of `cache-build.ts` (`headerFingerprints`,
  `currentSeedFingerprints`, `SeedFingerprints`, and the exported `indexedCommitOf`) move to `packages/cli/src/cache/seed-header.ts`
  so `verify` and `cache:build` share them; `cache:build`'s behaviour does not change.
- Docs: `docs/project-context.md` (the command, its checks and codes, the fingerprint policy D2 and
  the CI job; `verify` stops being a placeholder). A short ADR records the fingerprint policy D2,
  which binds every later PR (A9). `readme.md` only where a sentence becomes false.

## Capabilities

### New Capabilities

- `verify-smoke`: the `npm run verify` command (contract, order of the checks, error codes, output
  format, exit code), the fingerprint check of the seed and golden files, the structural comparison
  of the served answers with the golden ones without any model, the read-only effect on the
  database, and the separate CI job that runs it on a database of its own.

### Modified Capabilities

None. `golden-answers` and `seed-load` keep their requirements: `verify` only reuses their readers
and the fingerprints they define (D14).

## Impact

- Code: `packages/cli/src/verify.ts` (new), `packages/cli/src/cache/compare-golden.ts` (new, the
  structural comparison), `packages/cli/src/cache/seed-header.ts` (new, moved out of
  `cache-build.ts`), `packages/cli/src/cache-build.ts` (imports them), root `package.json` (script
  `verify`; `yaml` as a root devDependency for the CI workflow test, already resolved in the lock
  file). No file under `packages/core`, `packages/adapters/*/src`, `packages/cli/src/seed/`,
  `seed-build.ts` or `compose-index.ts` changes, so neither fingerprint of the seed nor the answer
  fingerprint changes (D1).
- CI: `.github/workflows/ci.yml` (new `verify` job; `scope` loop).
- Data: none. No migration; `seeds/` is not regenerated.
- Tests: `tests/unit/cli/verify.spec.ts`, `tests/unit/cache/compare-golden.spec.ts`,
  `tests/integration/cli/verify.spec.ts`, `tests/unit/ci/verify-job.spec.ts` (new). No existing test
  changes its assertions.
- Policy consequence (D2): from now on any PR that touches an input of the seed fingerprint or of the
  answer fingerprint turns the `verify` job red until the author regenerates `seed:build` and then
  `cache:build` locally (the salt and a live model are not in CI). Documented in
  `docs/project-context.md`.
- Security and privacy: no output holds the database URL, credentials, an absolute path or any
  answer or statement text; the question and every compared value are printed terminal-safe. The
  run never commits. No personal data.
- Commands and constraints: as in `docs/project-context.md` (`npx vitest run`, `npm run typecheck`,
  `npm run lint`, `npm run lint:architecture`, `npm run test:mutation`, `npm run docs:coverage`,
  `npm run db:migrate`, `npm run db:seed`).

### Non-goals

- Comparing free text (`answer`, statement text, excerpts), ids, `fileId`, `usage` other than the
  cache flag, `confidence` or `priorClaims` (D5); latency or cost as a success criterion.
- Regenerating the seed or the golden answers in CI or locally, calling any model, reading git or
  re-checking excerpts against the source (D11).
- Checking `reviews` (D9); golden answers for task-api (DIS-32: `verify` already walks every golden
  file, so it will cover them unchanged).
- `docs/DEMO.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` (DIS-45); the Playwright suite (DIS-75);
  running `verify` from `make up`.
