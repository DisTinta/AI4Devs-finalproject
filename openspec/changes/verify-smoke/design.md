## Context

See proposal.md → Why. The pieces `verify` needs already exist on the base branch (`84b6e2f`):

- `packages/cli/src/seed-load.ts`: `readSeed(seedPath, shown)` and
  `readGoldenFiles(cacheDir, seedProjectNames, repoRoot)` (the `INVALID_SEED` checks of `db:seed`),
  and the development-command pattern: checks before connecting, one JSON error line on stderr,
  `toFailure`, the entry guard on `process.argv[1]`.
- `packages/cli/src/cache-build.ts`: the private `headerFingerprints(sql)` and
  `currentSeedFingerprints(repoRoot)`, the `SeedFingerprints` type, a transaction that is always
  rolled back around `explain`.
- `packages/cli/src/cache/answer-fingerprint.ts` (`answerFingerprint`),
  `packages/cli/src/cache/golden-file.ts` (`GoldenFile`, `GoldenEntry`),
  `packages/cli/src/seed/parse-seed.ts` (`seedProjects`: id, name, `isSample`).
- `@codemind/adapter-llm`'s `createEvaluationLlm({ mode: 'evaluation' })`: never calls `fetch`.
- Core's `explain` (`openspec/specs/explain/spec.md` → "Answer cache"): after anchoring, a valid
  `cache_entry` is a hit served with `usage.cacheHit: true` without building the pack, reading the
  source or calling the model; the hit is recorded (`touchCacheEntry`, one `query_log` row). In
  evaluation mode a miss answers `UNKNOWN` `llm-required`; no anchor answers `UNKNOWN` `no-anchor`.
- A golden response is always a stored *answered* response (`checkGoldenFile` rejects anything
  else), whose citations all resolve (`storedResponseSchema`).
- Measured on the branch: the seed header fingerprints and the golden file's `answerFingerprint`
  equal what the current code computes, so `verify` can be born green.

Constraints: the files that feed the seed fingerprint (`packages/cli/src/seed/**`, `seed-build.ts`,
`compose-index.ts`, `packages/adapters/{git,store-postgres}/src/**`, `packages/core/src/{index,
knowledge}/**`, the PHP analyzer, fixtures) and the answer fingerprint (`ANSWER_FINGERPRINT_FILES`)
must not change, or the change itself would turn `verify` red (D1). `verify.ts` and the new
`cache/` modules are not inputs of either fingerprint.

## Goals / Non-Goals

**Goals:**

- A `verify` whose every check and output is driven by seams, so the unit suite covers its logic
  without a database and the mutation score stays ≥ 80 on the new files.
- One structural comparison function, pure, reused for every entry and testable on its own.
- A CI job that is isolated from the integration tests' database by construction.

**Non-Goals:**

- Any change to `explain`, the answer cache, the golden format, `db:seed` or `cache:build`'s
  behaviour; any regenerated seed or golden file.
- A generic diff of JSON values: only the fields of the spec are compared.

## Decisions

**C1. Modules (D1).**

- `packages/cli/src/verify.ts`: `runVerify(deps: VerifyDeps): Promise<number>` and the entry guard;
  root script `"verify": "tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts"`.
- `packages/cli/src/cache/compare-golden.ts`: `compareGolden(golden: StoredAnswer, served:
  ExplainAnswer): GoldenDifference[]`, pure, plus the rendering of a difference as a line.
- `packages/cli/src/cache/seed-header.ts`: `SeedFingerprints`, `headerFingerprints(sql)`,
  `currentSeedFingerprints(repoRoot)` and `indexedCommitOf(sql, name)` (with its `literals` helper),
  moved verbatim out of `cache-build.ts`, which imports them and re-exports the type and
  `indexedCommitOf` (its unit spec imports it from there). Not under `packages/cli/src/seed/` (a
  fingerprint input).
- Alternatives: `scripts/verify.mjs` (the parent's sketch) would sit outside typecheck, lint and
  mutation; a `codemind verify` subcommand would mix a development check into the product CLI next
  to `ask` and `index`. Both rejected (D1).

**C2. Seams (`VerifyDeps`).** `env`, `stdout`, `stderr` (required); `repoRoot`, `seedPath`,
`cacheDir`, `openTransaction` (default `defaultOpenTransaction(DATABASE_URL)`, any failure of it
reported as `DatabaseUnavailable`; amendment A14), `listProjects`
(`(client) => Promise<Project[]>`, default the store's `listProjects` on that client, as
`commands/projects.ts` does; amendment A12), `explain` (default core's), `seedFingerprints` (default `currentSeedFingerprints`), `answerFingerprint` (default
`answerFingerprint` of `cache/answer-fingerprint.ts`), `now` (default system clock). Apart from the
`listProjects` seam, the store is always `createPostgresStore({ transaction: client })`, the model always
`createEvaluationLlm({ mode: 'evaluation' })`, the source `createGitSourceTree()` (never read on a
hit), `workspaceRoot` = `resolve(repoRoot)` (`explain` rejects a relative root, `explain.ts:146`) and
one fresh `createInMemoryVerificationCache()` per
run. No seam builds a model: there is no way to inject a live one (D4).

**C3. Order of the run (D3).** Read `DATABASE_URL` → `readSeed` → `readGoldenFiles` (same messages
as `db:seed`) → seed fingerprints (`headerFingerprints` vs `seedFingerprints(repoRoot)`; a header
without one of them is a mismatch) → per golden file in name order: `seed.*` vs header, then
`answerFingerprint` vs `answerFingerprint(repoRoot)` (computed once) → per seed project in seed order:
a golden file with ≥ 1 entry (`GOLDEN_MISSING`) → open the transaction (a failure here is
`DATABASE_UNAVAILABLE`, a URL `pg.Client` cannot parse included; amendment A14) → `listProjects()` and the `SEED_NOT_LOADED` check for every golden project, in
golden-file order, the first failing one reported → ask and compare each entry, writing its lines to
stdout as soon as it is compared → write the summary lines → rollback and release in `finally`
(errors of both swallowed) → exit code. `FINGERPRINT_MISMATCH` is a new code, not `GOLDEN_STALE`:
`cache:build`'s code means "cannot build", this one "the versioned files do not match the code", and
the parent asks for the text "seed/golden fingerprint mismatch". Amendment A6: any failure after the
transaction is open, a lost connection included, is `INTERNAL`: `defaultOpenTransaction` throws
`DatabaseUnavailable` only on `connect`/`BEGIN` (`compose-index.ts:200-224`) and the store does not
classify connection errors of its queries, so a "connection lost" branch would need a classifier the
code does not have. Amendment A8: `details` is fixed per code (`{variable}`, `db:seed`'s, `{reason}` or
`{reason, file}`, `{project}`, `{}`), so a test can pin it with `toEqual`. Amendment A14 (pre-merge
review): `defaultOpenTransaction` builds its `pg.Client` outside its `try`, so a `DATABASE_URL` the
driver cannot parse (`postgres://u:p@h:notaport/db`) threw `Invalid URL` and came out as `INTERNAL`
("the database is unchanged", which points nowhere near the cause). `verify.ts` wraps the default
opener (`defaultOpener`) so that any failure of it is `DatabaseUnavailable`; `compose-index.ts` is a
seed fingerprint input and stays untouched (D1), so `db:seed`, `cache:build` and the other commands
keep reporting that URL as `INTERNAL` (Follow-ups). An injected opener keeps the A6 mapping (only
`DatabaseUnavailable` is `DATABASE_UNAVAILABLE`). Any other failure before the transaction is open
(an unreadable directory, a fingerprint that cannot be computed) is `INTERNAL` with stdout empty, and
a failed rollback or release never changes the outcome (the server aborts the transaction when the
connection ends); both are now stated in the spec.

**C4. One transaction, always rolled back (D4).** A hit writes (`touchCacheEntry`, `query_log`);
`verify` is a check, not usage, so it must neither inflate the usage metrics (DIS-74) nor make two
runs leave different databases. `verify` never calls `commit`. Alternative rejected: a read-only
comparison of `cache_entry` rows without `explain`, which would not exercise anchoring, the
normalized key, the stored-response check or the hit path that the user runs.

**C5. Comparison (D5).** `compareGolden` returns differences in the spec's order: the cache-miss
difference alone for an `UNKNOWN`; else `usage.cacheHit` against the literal `true` (amendment A7: a
stored response always holds `false`, `response-cache.ts:85`, and a hit serves `true`); `statements`
count; per common index the
statement's `type`, `verification`, `status`, `evidence` (spans resolved through the answer's own
`evidence` by id, rendered `path:start-end`); `evidence` count; per common index `path`, `startLine`,
`endLine`. A cited id with no evidence entry is skipped, as `formatAnswer` does
(`commands/ask.ts:185-186`); real stored responses never have one (`response-cache.ts:123-126`), only
test doubles and mutants. Values are rendered with `toTerminalSafeJson`; a count difference as
`expected <n> items, got <m>`. Ids are never compared because the golden ids are random UUIDs of the
generating transaction; confidence is protected by the answer fingerprint (`confidence.ts` is one of
its inputs). The parent's `evidence[].file` is read as `path`, the field that exists.

**C6. Output (D6, amended A1, A3).** Entry lines `✓|✗ <project> <id> <question>` with project and
question through `terminalSafeText`; difference lines indented by four spaces; summary lines
`<project>: <m>/<n> golden answers match` after all entry lines, in golden-file order. Amendment
A1: the cache-miss line ends with `: run npm run db:seed` only for `llm-required` (a cache miss,
fixed by loading the golden answers); for any other reason (e.g. `no-anchor`, a Context Engine
regression) `db:seed` would not fix it, so the line names only the reason. Amendment A3: the summary
lines go at the end, after every entry line, so a reader finds the totals in one place.

**C7. Project check (D7, amended A10).** `listProjects()` on the transaction's store; per golden
project, the one with that exact name; it must be `isSample`, have the seed's id (from
`seedProjects`) and the seed's indexed commit (`Project.indexedCommit` against
`indexedCommitOf(seed.sql, name)`). Seed ids are deterministic (`seed/deterministic-ids.ts`), so the
id alone tells a `db:seed`-loaded project from a hand-made one but not an older seed from the current
one; the indexed commit adds the regenerations that rebuilt the sample history. An older seed that
differs only in analyzer output still passes (accepted limit, see Risks): the fingerprint ties the
*file* to the code, never the *database* to the file. A seed project without an indexed commit is
`SEED_NOT_LOADED` too, as `cache:build` treats it as a stale seed (`cache-build.ts:207`; amendment
A12). Row counts are not compared (D7).

**C8. Coverage (D8, amended A2).** Every golden file `readGoldenFiles` returns is verified, and every
seed project must have one. Amendment A2: a golden file with zero entries counts as missing
(`GOLDEN_MISSING`), so `verify` cannot be green by omission (the format allows an empty `entries`).

**C9. CI job (D10).** In `.github/workflows/ci.yml`:

```yaml
verify:
  needs: scope
  if: needs.scope.outputs.code == 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  services:
    postgres:
      image: pgvector/pgvector:pg16
      env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: verify }
      ports: ['5432:5432']
      options: --health-cmd pg_isready …
  steps: checkout → setup-node 20 (npm cache) → npm ci → db:migrate → db:seed → verify
```

with `DATABASE_URL: postgres://postgres:postgres@localhost:5432/verify` on the three database steps.
No paths filter: `verify` depends on almost every file, and its `npm run verify` step takes < 60 s
(the job stays within `timeout-minutes: 10`). The `scope` loop becomes `for job in quality mutation verify`. Its own service container
means the seed can never reach the `test` database of `quality` (PH-23), so
`graph-read.spec.ts` "Listing with no project returns an empty list" keeps its assumption.

**C10. Tests (amended A4, A5).**

- `tests/unit/cache/compare-golden.spec.ts`: the comparison scenarios, with responses from
  `tests/support/cached-answer.ts`.
- `tests/unit/cli/verify.spec.ts`: every seam doubled, no database: configuration, `INVALID_SEED`,
  fingerprint and `GOLDEN_MISSING` order, `SEED_NOT_LOADED` through the `listProjects` seam (no faked SQL rows), the output format, `INTERNAL` mid-run, rollback
  and release always, `commit` never called.
- `tests/integration/cli/verify.spec.ts`: on the harness (`describeWithDatabase`,
  `useTransactionPerTest`), `loadSeed` and `saveCacheEntry` of the versioned files inside the test's
  transaction, `openTransaction` = a savepoint opener like `tests/integration/cli/cache-build.spec.ts`
  (its `commit` recorded so the test can assert it never happens), the real `explain`, the HTTP
  counting server (`node:http` on port 0). Using the versioned seed and golden file there departs from
  `backend-standards.md` §7 (factories) on purpose: those files are the subject under test, as in
  `tests/integration/cli/cache-build.spec.ts`. The unit spec doubles `explain` at the command's seam,
  as `tests/unit/cli/cache-build.spec.ts` does.
- Amendment A4: every test injects `seedFingerprints` and `answerFingerprint` (returning the values
  of the files under test); none depends on the real fingerprints being current. Freshness of the
  versioned files is the job of the `verify` CI job alone, as `golden-coherence.spec.ts` already
  states ("Fingerprint freshness is `verify`'s, not this test's"): a PR touching a fingerprint input
  turns one job red, not the whole unit suite. The defaults are exercised by the CI job and the
  manual run.
- `tests/unit/ci/verify-job.spec.ts`: parses `ci.yml`. Amendment A5: `yaml` is added as a root
  devDependency at the version the lock file already resolves (`2.9.1`, through
  `@fastify/swagger`); importing a transitive package would break on any upgrade of its parent, and
  a regex over the YAML text would be brittle. No new package enters the lock file.
- No existing test changes; `tests/unit/cli/cache-build.spec.ts` stays green after the move of C1.

**C11. Security.** stdout and stderr never hold the database URL (the connection error is
`DatabaseUnavailable`, without the driver's text), an absolute path (`displayPath`), or answer,
statement or excerpt text (never compared, never printed). Questions, names and values go through
`terminalSafeText` / `toTerminalSafeJson`. The run never commits.

**C12. ADR for the fingerprint policy (amendment A9).** The command and the CI job are cheap to
revert, but the policy D2 ("a stale fingerprint fails, locally and in CI; regenerate `seed:build` then
`cache:build` locally") binds every later PR that touches a fingerprint input (DIS-32, DIS-45, any
change to `core/knowledge`, the store adapter or the prompts). It is recorded in a short ADR
(`docs/adr/`, through `/adr-new`, with the why written by the agent and marked as its decision) and in
`docs/project-context.md` → Gotchas.

## Risks / Trade-offs

- [Every PR touching a fingerprint input turns `verify` red until the author regenerates the seed and
  the golden answers locally (D2)] → the error says exactly what to run; the policy is documented in
  `docs/project-context.md`; it is the purpose of PH-12, and warning instead would hide it.
- [`verify` compares against the golden file `db:seed` just loaded, so in CI an edit by hand already
  committed to the golden file is not caught by `verify` (D11)] → the review of DIS-34 and
  `golden-coherence.spec.ts` cover the versioned file; `verify` catches regenerated or edited files
  after seeding, a missing or altered cache entry and any break of the answering path.
- [The Context Engine is not part of the answer fingerprint (DIS-26 D11)] → a regression that stops
  anchoring a golden question shows as `✗ … got UNKNOWN (no-anchor)`.
- [CI time] → one more job in parallel with `quality` and `mutation`; its `verify` step takes < 60 s.
- [Adding `yaml` changes `package-lock.json`, part of the Stryker cache key (`ci.yml:181`): this PR's
  mutation job runs without the incremental cache (29m34s measured on DIS-26, timeout 40 min)] →
  accepted once; if it times out, rerun the job, never lower the threshold.
- [A local database seeded before a PR that regenerated `seed:build` / `cache:build` without
  changing the sample history passes the project check (A10) and shows field-level `✗` lines without
  the `db:seed` hint] → `docs/project-context.md` → Gotchas: after pulling a regenerated seed or
  golden file, run `npm run db:seed` before `verify`. CI always seeds a fresh database, so it is
  unaffected.
- [The fingerprints were measured on a local working tree; `collectFingerprintInputs` also reads
  ignored or untracked files under its directories (`seed/fingerprint.ts:96-102`), which a CI
  checkout lacks] → task 0.4 recomputes them on a clean `git worktree` of `HEAD`; a difference is
  fixed before any code (amendment A13).
- [Each golden hit runs `touchCacheEntry` inside verify's transaction, so the golden `cache_entry`
  rows stay locked until the rollback (about 3 s), and no statement or lock timeout is set (pre-merge
  review)] → an `ask` of a golden question on the same database waits for those seconds; a lock held
  elsewhere on those rows makes `verify` wait for it (the CI job has its own database and
  `timeout-minutes: 10`). Accepted; noted in `docs/project-context.md` → Gotchas.
- [The local database is changed by the manual steps (`db:seed`, the cache-miss check)] → a
  `pg_dump -Fc` taken in task 0.4 and restored in task 10.7, with the indicators compared.

## Migration Plan

No data migration. Rollback is reverting the PR: the script returns to the placeholder and the CI job
disappears.

## Follow-ups

Pre-merge review of 2026-10-17 (reports `2026-10-17-show-spec-working.md`,
`2026-10-17-verify-against-spec.md` (VaS), `2026-10-17-adversarial-review.md` (AR1–AR6),
`2026-10-17-security-review.md`). No Blocker or Major. Every finding with its destination
(`docs/project-context.md` → Tracking deferred findings):

| Finding | Severity | Destination | Where |
|---|---|---|---|
| AR1 / VaS block 3 item 2 — a `DATABASE_URL` the driver cannot parse came out as `INTERNAL` ("the database is unchanged"): `pg.Client` is built outside the opener's `try` | Minor | **A. Fixed now** | `verify.ts` `defaultOpener` (amendment A14, C2/C3), TDD: plain unit test "reports DATABASE_UNAVAILABLE without the URL when the driver cannot parse DATABASE_URL" seen red, then green; spec sentence via `/opsx:update` (spec-audit addendum); real runs in the show-spec-working addendum |
| AR1, other commands — `db:seed`, `cache:build`, `index`, `projects` keep reporting an unparseable `DATABASE_URL` as `INTERNAL` | Minor | **D. Accepted** | `compose-index.ts` is a seed fingerprint input (D1: touching it means `seed:build` + `cache:build`); they fail closed, with a fixed message and no URL in any output |
| VaS block 3 item 2 — any other unexpected failure before the transaction is open is `INTERNAL` | Minor | **A. Fixed now** (spec) | `specs/verify-smoke/spec.md` → "Golden questions are asked without any model", via `/opsx:update`; already pinned by the plain unit test "reports any other failure, before or after the transaction is open, as INTERNAL" |
| VaS block 3 item 1 — a failed rollback or release keeps the outcome, unspecified | Minor | **A. Fixed now** (spec) | same requirement, one sentence; pinned by "keeps the outcome when the rollback or the release fails" |
| VaS block 2 item 4 — the git adapter copies `PATH`, `HOME`, `TEMP`… from `process.env`, against "read only `DATABASE_URL`" | Minor | **A. Fixed now** (spec) | "Verify command contract and configuration" now says "of its configuration"; no `LLM_*`, budget or timeout variable is read (unchanged tests) |
| VaS block 3 item 3 — `tests/unit/cache/seed-header.spec.ts` missing from the proposal | Minor | **A. Fixed now** | `proposal.md` → Impact → Tests |
| VaS block 2 item 3 — no test varies `persisted` | Minor | **A. Fixed now** | plain unit test "does not compare persisted" (`tests/unit/cache/compare-golden.spec.ts`), shown to fail under a mutant that compares it |
| VaS block 2 (CI scenario test) — a workflow-level `env` defining `LLM_*` would pass the CI test | Minor | **A. Fixed now** | plain unit test "gives verify no LLM_* variable from the workflow level either" (`tests/unit/ci/verify-job.spec.ts`), shown to fail with a probe `env: LLM_MODEL` in `ci.yml` |
| VaS block 2 item 1 — "The verify job is green on the pull request" has no evidence yet | — | **A. In this change** | task 14.3 (recorded CI check, addendum to the step 9 report) before `/opsx:archive` |
| AR3 — 9.8 marked done while three git integration tests failed locally | Minor | **A. Settled** | the full suite rerun in this review: 136 files, 1598 passed, 0 failed (git tests included); CI `quality` confirms it in 14.3 |
| VaS block 2 item 2 — "arguments are ignored" has no automated test | Minor | **D. Accepted** | decided in spec audit run 3 (A11/A13): `runVerify` receives no `argv` by type; checked with `npm run verify -- extra` (step 10.2 and show-spec-working E7) |
| VaS block 2 — "Every golden answer matches" injects the files' own fingerprints | Minor | **D. Accepted** | amendment A4 by design; the real fingerprints are proven by the manual runs and the CI `verify` job |
| VaS block 2 — "Verify leaves the database as it was" counts only acme-shop rows and its savepoint `release` is a no-op | Minor | **D. Accepted** | other integration files commit their own projects in parallel (the DIS-26 A9 lesson); whole-table counts and `pg_stat_activity` are checked by the real runs (show-spec-working E7/E8, step 10.7) |
| VaS block 2 — "A database without the current seed" deletes only acme-shop and does not log `explain` | Minor | **D. Accepted** | task 4.7 (a broad delete would lock rows other files commit); "no question asked" is pinned by the unit test of the same requirement |
| VaS block 3 item 4 — `timeout-minutes: 10` is design-only | Minor | **D. Accepted** | CI configuration in C9, like the Node version and the npm cache; a timed-out job fails the run like any failure |
| AR2 — tasks say RED → GREEN, but most tests passed when added (code written whole first) | Minor | **D. Accepted** (process, recorded) | step 9 report → "TDD note"; mutation score 97.39 % shows the tests bite; no Linear issue (process minor) |
| AR4 — the default-fingerprint test of `seed-header.spec.ts` rebuilds its expectation with the same functions | Minor | **D. Accepted** | it covers the wiring of the default seam; freshness is the CI `verify` job's alone (A4) |
| AR6 — golden `cache_entry` rows are locked during a run, no statement timeout | Minor | **D. Accepted** (documented) | Risks above; `docs/project-context.md` → Gotchas (`verify` and the fingerprint policy) |
| show-spec-working E5 — for a non-sample `acme-shop`, the hint "run npm run db:seed" leads to `db:seed`'s own `PROJECT_NAME_TAKEN` | Minor | **D. Accepted** | the spec fixes one `SEED_NOT_LOADED` message for every case; `db:seed`'s refusal names the conflict |
| AR5 — uncommitted tests in the working tree | Question | **Resolved** | they are this review's fixes, committed with it; `.claude/settings.json` is a local edit of the author, outside this change, never staged |
