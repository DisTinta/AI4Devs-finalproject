# Test and State Verification Report

- Date: 2026-10-09
- Change: seed-load-and-projects (DIS-92)
- Step: 11. Backend: Run Tests and Verify Data State

## Commands executed

- Baseline (task 0.5): `docker compose up -d`; `.env` loaded without printing (`set -a; . ./.env; set +a`);
  `npm run db:migrate` (no migrations to run); `npx vitest run`; `git status --porcelain fixtures seeds packages/web`;
  `sha1sum seeds/graph-dump.sql`; `SELECT id, name, is_sample, node_count, edge_count FROM project ORDER BY name`
- Targeted, twice: `npx vitest run tests/unit/cli tests/unit/seed tests/integration/cli`
- Concurrency check (task 4.5), twice, with a populated local database (committed acme-shop sample + committed own
  project `dis92-own`): `npx vitest run tests/integration/cli/seed-load.spec.ts tests/integration/cli/projects-command.spec.ts tests/integration/cli/seed-build.spec.ts`
- Broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`,
  `npm run docs:coverage`
- Mutation: `npx stryker run --mutate "packages/cli/src/seed-load.ts,packages/cli/src/commands/projects.ts,packages/cli/src/seed/render-sample-projects.ts,packages/cli/src/seed/parse-seed.ts,packages/cli/src/seed-build.ts"`, twice
- Forced failures (task 6.7): a node script in the session scratchpad backs up each file, applies one mutation
  whose anchor must match exactly once, runs the target test, restores and compares byte for byte

## Test results

- Baseline: 53 files / 730 tests passed (130.7 s)
- Targeted: 16 files / 133 tests passed, twice (178.4 s, 153.6 s)
- Concurrency check: 14/14 passed twice (128.7 s, 130.4 s); no lock wait, no deadlock; no serialisation needed.
  The first attempt exposed two DIS-91 tests that failed **even alone** once `make up` had committed the seed
  ("Two consecutive builds produce identical files" compares seed ids with the database ids; "An existing
  acme-shop project does not block the build" creates `acme-shop`). Fixed in this change: each clears the
  projects it depends on inside its harness transaction (reverted at the end); assertions unchanged. Recorded in
  design → Risks.
- Required suite (final): 61 files / 784 tests passed (148.1 s).
  One earlier full run under heavy load (tests 606 s instead of ~445 s) failed two Git tests outside this change,
  `tests/integration/git/build-history.spec.ts` › "A re-touch that cannot be marked fails the build" and
  `tests/integration/git/git-source-tree.spec.ts` › "A broken HEAD propagates git's error"; both pass alone
  (27/27) and in the next full run. Neither file nor the code it covers is in this diff: a load-dependent flake,
  recorded in design → Follow-ups.
- Gates: `lint` 0 errors (1 pre-existing warning, `@typescript-eslint/no-empty-object-type` in a port stub);
  `typecheck` green; `docs:coverage` green; `lint:architecture` 0 errors, 5 warnings (4 pre-existing `no-orphans`;
  the new one is `packages/web/src/data/sample-projects.ts`, which nothing imports until DIS-60 — expected).
- Mutation score: 85.96 % on the first run (56 survivors); after extra cases killing the meaningful ones (default
  paths, `E'…'` decoding, value/column count, project-row types, CRLF, header position, `--version`, exact
  messages, `DATABASE_UNAVAILABLE` in `db:seed`) **94.28 %** (≥ `MIN_MUTATION_SCORE=70`):

  | File | Score | Survived |
  |---|---|---|
  | `commands/projects.ts` | 92.77 % | 4 |
  | `seed/parse-seed.ts` | 96.09 % | 10 |
  | `seed/render-sample-projects.ts` | 100 % | 0 |
  | `seed-build.ts` | 85.86 % | 5 |
  | `seed-load.ts` | 97.35 % | 1 |

  Remaining survivors are equivalent or out of reach of unit tests: whitespace characters the renderer never
  writes between statements (`' '`, `'\t'`), internal `Error` messages that the callers replace, the `commander`
  `instanceof` guard and `return 'run'`, the `force` option of the temporary-file cleanup, and the entry-module
  guards (covered by the manual runs of step 12). `load-seed.ts` is outside Stryker's `mutate` (adapter); it is
  covered by the integration scenarios and by forced failure (3).
- Forced failures (task 6.7) — each run failed and each file was restored byte for byte:
  1. seed written before the constant → "A failed write of the constant leaves both files intact" fails
  2. seed-write failure reported as `INTERNAL` → "A failed write of the seed after the constant is a partial write" fails
  3. `loadSeed` without the `DELETE` of the samples → "Loading again changes nothing and keeps the user's projects" fails
  4. one space between the fields of a `projects` line → "Sample and user projects are listed" fails
- TDD notes, recorded as they happened:
  - 3.3 "An invalid seed file fails before connecting", 4.1–4.4 and 6.5/6.6 passed on their first run: the code
    written in the preceding GREEN step (3.2, 1.1, 6.4) already covered them. Forced failures (3) and (2) prove the
    tests can fail; the RED of 6.5 was the old extra case "a failed write is INTERNAL…", which failed with
    `PARTIAL_WRITE` as soon as 6.4 landed (it was rewritten as the scenario).
  - 7.3: the RED was shown by mutating the versioned constant in place (an unused variable → lint fails; an
    exported type error → the type check fails), restored with `cmp`, instead of a scratchpad copy as the task
    text said; ESLint's `lintFiles` needs a path inside the repository.
  - Deviation agreed during apply: the `PROJECT_NAME_TAKEN` message quotes the name (`"acme-shop"`) because
    `escapeLiteral` renders a JSON string literal; spec and design updated with the author's approval.
- Runtime: see each line above.

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures seeds packages/web`: empty
  - `sha1sum seeds/graph-dump.sql`: `b3b5b87a9a7668b0171ca035fcc0a14c9120da24`
  - local `project` rows: 0
- Post-test validation:
  - `git status --porcelain fixtures`: empty
  - `seeds/graph-dump.sql`: `a677e3e8c6b45b063756d2c7079de67684acb9da` — the intended regeneration of task 7.2;
    `git diff` shows only the `analyzer-fingerprint` line (`6ad32999…` → `ca09e90f…`), rows identical
  - `packages/web/src/data/sample-projects.ts`: `62a2b90897331e86c267f9aa8f0939f0598b8929` — created by task 7.2
    (acme-shop, 53 files, 121 symbols, 170 edges, 32 commits); no test wrote to it (every successful build in the
    tests passes a temporary `sampleProjectsPath`)
  - local `project` rows: 0
- State restored: Yes
- Restoration actions: after task 4.5, `DELETE FROM project WHERE name IN ('acme-shop','dis92-own')` on the local
  database (back to 0 rows)

## Privacy and ethics check (task 8.1)

`/privacy-ethics-check` over the diff, the regenerated seed and the constant: **PASS**. No e-mail, secret shape
(`AKIA…`, `-----BEGIN`, `ghp_`, `sk-`), absolute path or user name in any changed file, the seed or the constant; no
`console.log` in new code; no dependency change. Low: synthetic database URLs with fake credentials in tests, used
only to assert they never reach any output (DIS-91 pattern). Info: `projects` never prints `rootPath`, which for own
projects is an absolute path holding the OS user name. Not assessed: the AI tool's plan.

## UI evidence (if applicable)

- (none: no browser UI reads the constant yet; DIS-60 owns `ProjectPickerPage`). End-to-end (step 13) is covered by
  the manual runs of step 12.

## Outcome

- Status: PASS
- Blocking issues: none
