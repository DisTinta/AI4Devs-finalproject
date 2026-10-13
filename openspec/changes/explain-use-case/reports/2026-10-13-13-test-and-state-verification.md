# Test and State Verification Report

- Date: 2026-10-13
- Change: explain-use-case (DIS-39)
- Step: 13 — Backend: Run Tests and Verify Data State

## Commands executed
- `npx vitest run tests/unit/explain tests/unit/knowledge tests/unit/context tests/unit/store tests/unit/cli tests/unit/index tests/integration/store/claims-write.spec.ts tests/integration/explain tests/integration/git/git-source-tree.spec.ts tests/integration/context`
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/core/src/explain/**/*.ts,packages/core/src/knowledge/claim.ts,packages/core/src/knowledge/evidence.ts,packages/core/src/knowledge/stored-claim.ts,packages/core/src/knowledge/errors.ts,packages/core/src/knowledge/text-without-nul.ts,packages/core/src/context/context-pack.ts"`
  (the task's list plus `text-without-nul.ts`, a new file of this change)
- `npm run seed:build` (step 12), with `DATABASE_URL` of the migrated local database

All with `DATABASE_URL` set: no integration test was skipped.

## Test results
- Baseline (step 0.4, before any change): 81 files, 1057 tests passed, 0 skipped, 137 s. The run
  overlapped the first edit of `tests/unit/knowledge/claim.spec.ts`, so the new RED test of step 1.1
  may or may not be in that count.
- Targeted tests: 42 files, 601 passed, 0 failed, 0 skipped.
- Required suite: 84 files, 1124 passed, 0 failed, 0 skipped; 144.8 s.
- `lint`, `typecheck`, `docs:coverage`: exit 0, no warning. `lint:architecture`: exit 0, the three
  `no-orphans` warnings that exist on the base commit (`sample-projects.ts`, the TypeScript analyzer
  `src` and `dist` entry points); a type cycle `explain-answer.ts` ↔ `unknown-policy.ts` that the gate
  caught during step 8 was removed (`UnknownExplain` lives in `unknown-policy.ts`).
- Mutation (13.4), `MIN_MUTATION_SCORE=70`:
  - first run 92.83 % (507 killed, 11 timeout, 37 survived, 3 no coverage);
  - after the survivor tests, **94.80 %** (518 killed, 11 timeout, 27 survived, 2 no coverage). Per
    file: `context-pack` 98.37, `claim-items` 100, `explain-request` 88.24, `explain` 96.55,
    `prior-claims` 100, `prompt` 96.15, `statement-schema` 96.67, `typing-rules` 100,
    `unknown-policy` 100, `claim` 86.49, `errors` 81.25, `evidence` 100, `stored-claim` 93.94,
    `text-without-nul` 50.
  - Survivors killed by a new test or assertion (each mutant re-applied by hand: the test fails):
    `every` → `some` over a claim's evidence (`assertValidClaimItems`); `hops` / `tokenBudget` not
    passed to the pack (new non-scenario test "builds the pack with the hops and budget of the
    request"); `status` / `verification` of an unsaved answer; `InvalidExplainRequest` name and
    message; `given?.fileId` on a `null` anchor.
  - Static mutants (module-level Zod schemas in `claim.ts`, the body of `withoutNul`): reported as
    survived because the Vitest runner does not reload modules per mutant. The `L1` object mutant of
    `claim.ts` applied by hand fails the module load (`Invalid discriminated union option`).
  - Equivalent: the `'utf8'` default of `Buffer.byteLength` / `Hash.update`; `issues[0]?.` (a failed
    parse always has an issue); `first !== undefined` (`Set.has(undefined)` is false); the `has` check
    of the unsaved evidence map (it would rewrite the same entry); `files.get(path)?.content ?? ''`
    (always defined); `tokenBudget` spread when `undefined` (the pack's default applies); the fixed
    reason text of `InvalidStoreQuery` (still fixed text).
  - Survivors in the pre-existing `InvalidGraph` / `SourceUnavailable` classes of `errors.ts`: code
    this change does not touch.
- Notes: tests of steps 4, 5, 7, 8 and 9 were written one file per step and their RED was seen as a
  batch (the methods or modules missing), not test by test. Two regressions were checked by hand in
  step 5: without the `ClaimWriteFailed` mapper "A failure while writing evidence leaves no claim"
  fails; with `now()` instead of `clock_timestamp()` "The most recent claims come first, at most
  twenty" fails.

### Existing tests edited (9.10, 11.2)
- `tests/unit/knowledge/claim.spec.ts`: the helper `inference()` gains `statementType: 'INFERENCE'`
  (the modified scenario "An inferred claim without provenance is rejected"); the non-scenario test
  "accepts an inferred claim of every type but FACT" builds its `UNKNOWN` claim with a provenance
  without `statementType`. Spec header comment points to the main spec.
- `tests/unit/explain/statement-schema.spec.ts`: spec header comment only.
- `tests/unit/context/context-pack.spec.ts` (the pack reads through `readFilesAt` now):
  "Whole files are counted once for the baseline" asserts the paths of `batchReads`; "A question
  without anchor gives an empty pack without reading", "An invalid token budget is rejected before
  the store", "A relative workspace root is rejected" and "A project never indexed has no source to
  read" assert both `readFileAt` and `readFilesAt` are 0; "A relative root path is resolved against
  the workspace root" asserts the exact list of roots and commits of `batchReads` (one batch each),
  stronger than the former sets; "The process working directory is never used" compares the roots of
  `batchReads` and asserts one batch.
- `tests/unit/explain/explain.spec.ts` (new in this change): three source-reader assertions moved
  from `readFileAt === 0` to `{ readFileAt: 0, readFilesAt: 0 }`.
- `tests/unit/store/in-memory-store.spec.ts`: new tests only; existing scenarios untouched.
- `tests/unit/index/index-repository.spec.ts`, `tests/unit/cli/seed-build.spec.ts`,
  `tests/unit/cli/index-command.spec.ts`: their typed `SourceTreePort` literals gain a throwing
  `readFilesAt` (the first logs the call, as its `readFileAt` does).
- `tests/integration/store/history-claims-constraints.spec.ts`, `indexes-stale.spec.ts`: no edit
  needed (they insert SQL directly); green.
- 11.3: every `#### Scenario:` of the five delta specs has exactly one `it()` with the same title.

### Seed (12.3)
- Two first runs used a placeholder salt and changed the 32 `author_hash` values: not committed, the
  file restored with `git checkout` (sha1 back to the baseline). The run with the author's salt
  (read from `.env` in the author's shell) changed only the `analyzer-fingerprint` header line,
  `sha256:0e8048c2…` → `sha256:4fc1535b…`; `contract-fingerprint` and every row identical;
  `packages/web/src/data/sample-projects.ts` unchanged. Committed as `c278392`, after the last
  commit touching a fingerprint input.

### Privacy (10.1)
`/privacy-ethics-check`: **PASS WITH GAPS**, two Low findings with destinations in `design.md` →
Follow-ups: L1 (the question reaches the model unredacted) → B, DIS-41 (Spanish comment left there);
L2 (a stored statement may paraphrase the question) → D, accepted. No dependency change, no secrets or
emails in the diff, no `console` in new source; errors and events carry no content (tested).

### Latency (39c)
`reports/2026-10-13-9-pack-latency.md`: Q1 145 git processes / 10 825 ms → 6 / 580 ms (medians).
The author decided no cap on the files a pack reads.

### End-to-end (15.1)
Not applicable: no user interface calls `explain` yet (DIS-40 CLI, CM-HU-12 HTTP, CM-HU-15 web); it
was exercised through `@codemind/core` in step 14 (`reports/2026-10-13-14-manual-interface-testing.md`).
CI evidence (15.2), PR #37, run [38419374863](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38419374863)
(head `cfaa6be`): every job green (`scope`, `secrets`, `frontend`, `quality` in 14 min 9 s). The `Tests`
step ran 84 files, 1123 passed and 1 skipped (`tests/unit/index/path-policy.spec.ts`, a case skipped
by platform, already on the base), with the new `tests/unit/explain/explain.spec.ts`,
`tests/integration/explain/explain.spec.ts`, `tests/integration/store/claims-write.spec.ts` and the
batch tests of `tests/integration/git/git-source-tree.spec.ts` among them. The mutation step mutated
77 files including `packages/core/src/explain/` (`explain.ts` 96.55 %), all files 95.51 %.

## Data state verification
- Pre-test baseline (0.4 and 13.1):
  - `git status --porcelain seeds packages/web fixtures`: empty
  - sha1 `seeds/graph-dump.sql`: `24056e71…`; sha1 `sample-projects.ts`: `62a2b908…`
  - `SELECT count(*)` project / claim / evidence: 0 / 0 / 0
- Post-test validation:
  - project / claim / evidence: 0 / 0 / 0
  - `seeds/`, `packages/web/`, `fixtures/` unchanged since the seed commit (sha1 `seeds/graph-dump.sql`
    `98f81012…`, the committed regeneration; `sample-projects.ts` `62a2b908…`)
  - no `.stryker-tmp/` left
- State restored: Yes
- Restoration actions: step 14 loaded acme-shop with `npm run db:seed` and deleted it afterwards
  (`DELETE FROM project WHERE is_sample AND name = 'acme-shop'`), back to 0 projects; every other
  database write ran in a transaction rolled back.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
