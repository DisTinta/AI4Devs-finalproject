# Test and State Verification Report

- Date: 2026-10-19
- Change: cross-shell-demo-spanish-docs (DIS-102)
- Step: 14 — Run Tests and Verify Data State (with the addenda of 17.1 and 17.2)

## Commands executed

- Baseline (0.4) and final run: `DATABASE_URL=postgresql://codemind:codemind@localhost:55432/codemind_test npx vitest run`
  (a throwaway `pgvector/pgvector:pg16` container, `dis102-testdb`, on port 55432 with its own
  `codemind_test` database, so the author's `codemind` database is never the integration target)
- `npx vitest run tests/unit/scripts tests/unit/docs tests/unit/knowledge/confidence-doc.spec.ts packages/web/src/pages/ProjectPickerPage.test.tsx`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run test:a11y`
- `npm run test:mutation`
- `npm run verify` on a freshly seeded database (the step 15 clone `manual-15`)
- D12 demonstration (task 14.3, design A11), in the step 15 clone only: with its own `.env` and its own
  running database, `DATABASE_URL=…55432/codemind_test npx vitest run tests/integration/store/migrations.spec.ts`
- `/privacy-ethics-check` over the diff against `368dc38`

## Test results

- Baseline (before any code, HEAD `2b551c2`): 153 files (152 passed, 1 failed), 1688 tests (1687
  passed, 1 failed), 155.12 s. The failure is “A failed golden save leaves the database unchanged” of
  `tests/integration/cli/seed-load.spec.ts`, one of the known races documented in `docs/TESTING.md` →
  Carreras conocidas.
- Targeted tests: 8 files, 45 passed, 0 failed.
- Required suite (after the change): 159 files passed (159), 1719 tests passed (1719), 0 failed,
  164.83 s. The `migrations.spec.ts` scenarios that spawn `npm run --silent db:migrate|db:rollback`
  without `DATABASE_URL` pass with the author's `.env` present in the working tree: the suite's
  `CODEMIND_SKIP_DOTENV=1` keeps the preload from reading it (design D12).
- D12 demonstration in the clone: 18 of 18 migration tests passed; the clone's own database (the one
  its `.env` names) had 4 applied migrations before and 4 after, so no test rolled it back.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm run docs:coverage`: exit 0.
- `npm run lint:architecture`: 0 errors, 3 warnings, all pre-existing `no-orphans` on
  `packages/web/dist/…`, `packages/analyzers/typescript/src/index.ts` and its `dist/` (no file of this
  change).
- `npm run test:a11y`: 3 files, 5 tests passed.
- `npm run test:mutation` (incremental): final mutation score **96.01** (break threshold 80), 3 min 50 s.
  `scripts/` is outside Stryker's scope by design (D16), and the change touches no mutated file
  (`packages/web` is not mutated).
- `npm run verify` on the clone's freshly seeded database: `acme-shop: 3/3 golden answers match`, exit
  `0` (fingerprints unchanged). Observation: on the author's own local database, `npm run verify` from
  the working tree (reading `DATABASE_URL` from her `.env`, read-only) answered Q3 with one evidence item
  instead of two (2/3). This change touches no file of the seed or answer fingerprints
  (`packages/core/src`, `seeds/`, `package-lock.json`) and the fresh seed gives 3/3 in three separate
  clones, so it is the state of that local database, not a regression; it was left untouched.
- TDD notes: every scenario test was seen failing before its code, except two guard tests that were
  green on their first run because the property already held: “The startup scripts need no installed
  dependency” (its RED was shown by a temporary `import 'tsx'` in `scripts/up.mjs`, reverted) and
  “Links to the guides' sections resolve” (RED shown by a temporary stale `#verifying-an-installation`
  link in `docs/TESTING.md`, reverted). “Down keeps the data volume” was green on its first run because
  task 3.2 adds the `down` script with the other scripts. The TDD subagents could not be started from
  this step, so each red → green → refactor phase was done inline with the same contract.
- Existing tests changed: only the two that follow a modified requirement —
  `tests/unit/knowledge/confidence-doc.spec.ts` (Spanish document, test names unchanged) and
  `packages/web/src/pages/ProjectPickerPage.test.tsx` “A failed retry keeps the alert” (one string:
  `npm run up`). `migrations.spec.ts`, `dev-script.spec.ts` and every other test are untouched.

## Data state verification

- Pre-test baseline (0.4):
  - `node -v` v24.11.1, `npm -v` 11.19.0, `docker compose version` v5.5.1
  - Author's `codemind` Compose project: no container at the start; the agent started it with
    `docker compose -p codemind up -d --wait` (container created on the existing `codemind_pgdata`
    volume) to read the counts
  - `SELECT count(*) FROM project` 1, `claim` 0, `query_log` 3, `cache_entry` 3 with `sum(hit_count)` 0
  - `codemind_pgdata` volume present
  - `git hash-object .env` recorded (not printed here)
- Post-test validation:
  - Same counts: project 1, claim 0, query_log 3, cache_entry 3 / 0
  - `codemind_pgdata` present; no `manual-15`, `e2e-bash` or `e2e-pwsh` volume left
  - `.env` hash identical to the baseline; no temporary `.env`, `.env` copy or `.stryker-tmp/` in the
    working tree; `git status` shows only the author's own `.claude/` edit
- State restored: Yes, except that the author's `codemind-postgres-1` container, absent at the start,
  is left running for the next workflow steps (same volume, same data); `docker compose -p codemind
  down` (never `-v`) returns it to the initial state. The throwaway `dis102-testdb` container is also
  left for the later steps' suite runs (`docker rm -f dis102-testdb`).
- Restoration actions: see step 15 and 16 reports (clones' own projects removed with `down -v`, clones
  moved aside, dev servers stopped by process tree).

## Privacy / ethics check

Verdict **PASS**. Surfaces: configuration loading, logging (stderr lines), delivery (docs and PR).

| Severity | Area | Finding | Evidence | Action |
|---|---|---|---|---|
| Low | Delivery | The OS user name appeared in one path of `design.md` and `tasks.md` | `C:/Users/<name>/Desktop/~` | Masked as `C:/Users/<user>/…` (commit `c129278`) |

- The `.env` loader never prints a key or value: its only output is `warning: .env not read (<code>)`
  (`scripts/env.mjs`); `up` prints command labels only; `demo:ask` prints the origin
  `http://127.0.0.1:<PORT>` and the API's response; `db:migrate` with a wrong-password URL in the shell
  did not print the URL (step 15).
- `demo:excerpt` is confined to `fixtures/<project>` lexically and by real path; the outside, absolute
  and `..` cases are tested.
- No volume is removed by any script (`npm run down` is `docker compose down`, pinned by a test); the
  only `down -v` runs were on the clones' own Compose projects.
- No dependency installed and `package-lock.json` unchanged: no npm package check needed.
- No PII or secrets in the diff (searched for e-mail shapes, `Authorization:`, API-key shapes).

## Addendum — 17.1 recorded check “The guides are in Spanish and say that .env is read”

- `docs/DEPLOYMENT.md` and `docs/TESTING.md` were reviewed section by section against
  `git show 368dc38:docs/…`: same sections in the same order (with the renamed headings), same figures
  (Node 20.11, Git 2.45.1 / 2.43.4 / 2.44.1, gitleaks 8.30.1, the score of 80, the run totals of
  2026-10-17), same commands and pasted output, except the deliberate changes: `npm run up` /
  `npm run down` instead of `make up` / `make down` (make kept as the Git Bash/WSL shortcut), the `up`
  step table with `--wait` and `POSTGRES_PORT`, the `MISSING_CONFIG` row, the integration-test
  `DATABASE_URL` as a labelled `bash` / `powershell` pair, the smoke check without `export`/`echo`, and
  the verify output re-captured on 2026-10-19 (its `> tsx …` line now shows the preload).
- The searches of the scenario (case-insensitive, backticks removed) over `readme.md`,
  `docs/project-context.md`, the four guides and `.env.example` were run: `.env.example` has 0 hits for
  every pattern; every hit in the other files was reviewed and is a true statement: `PowerShell` in
  sentences that say the commands are the same in both shells or in the labelled PowerShell variants,
  and `make up` only as the Git Bash/WSL shortcut or in text that stays true because `make up` runs
  `npm run up` (`project-context.md` re-seeding notes, `readme.md` §8 history of DIS-45).
- `docs/project-context.md` lines 38, 62, 191, 227 and 1180–1181 of the base now say that the guide's
  npm scripts read `.env` and that `npm run up` starts the system in any shell; `readme.md` §1.2, §1.4
  and §2.4 give `npm run up`, and the §1.4 start block has no `&&`.

## Addendum — 17.2 ADR

Not warranted (`adr-new` criteria): the decisions (D2–D18, A1–A26) are local to the start-up tooling
and the guides, cheap to reverse (revert the PR), and recorded in `design.md` and the ticket.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — after the pre-merge review fixes (step 19, 2026-10-19)

- `npx vitest run` (integration database `dis102-testdb`, as above), four runs during step 19:
  - after the show-spec-working and verify-against-spec fixes (`f9df1ca`): 159 files, **1724 passed**, 0
    failed, 144.13 s;
  - after the adversarial-review fixes (`525724f` and the run-2 fixes): 1729 tests; three runs had one or
    two failures, always and only in `tests/integration/cli/projects-command.spec.ts` (an extra
    `ask-pool-…` project, or the empty-database test timing out), the known race of `docs/TESTING.md` →
    Carreras conocidas; that file, alone and with `seed-load.spec.ts`, passes (10 of 10). No file of
    this change touches it.
- `npx vitest run tests/unit/scripts tests/unit/docs` → 6 files, 41 tests passed (31 at step 14, plus
  ten new scenarios of the reviews).
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`,
  `npm run test:a11y`: exit `0`. `npm run test:mutation` not re-run: the review fixes touch only
  `scripts/` and tests, outside Stryker's scope (D16).
- `openspec validate cross-shell-demo-spanish-docs --strict`: valid.
- Data state: the author's `codemind` database untouched by step 19 (counts 1/0/3/3/0 as the baseline;
  `codemind_pgdata` present). The throwaway `codemind_test` database was seeded once with `npm run
  db:seed` to run the real API against it (adversarial review, AR1); the integration tests reset it.
  The clone `ssw-102` and its Compose project were removed (`down -v` on that project only).
- Dependencies: none added; `package-lock.json` unchanged; the new `node:http` and `node:buffer`
  imports are Node built-ins (pinned by "The startup scripts need no installed dependency").
