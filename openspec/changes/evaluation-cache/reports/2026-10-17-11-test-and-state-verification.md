# Test and State Verification Report

- Date: 2026-10-17
- Change: evaluation-cache (DIS-21)
- Step: 11 — Backend: run tests and verify data state (tasks 11.1–11.8), with the records tasks 1.3,
  8.1, 9.2, 13.1, 13.2 and 14.3 ask for

Run inside the autonomous workflow of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`).
The TDD triad (test writer → implementer → refactorer) was played by the single agent of the step:
no sub-agent tool was available in this run. Every RED below was observed before its GREEN; the
characterisation tests are the scenarios that passed when first run, and each group of them was
checked against a hand-made sabotage of the code it covers (see "Characterisation tests").

## Commands executed

- `npx vitest run` (baseline, task 0.4, and final run) with `DATABASE_URL` set to the local compose
  database (`postgres://codemind:codemind@localhost:5432/codemind`)
- `npx vitest run tests/unit/cache tests/unit/explain tests/unit/store tests/unit/api tests/integration/store tests/integration/explain tests/integration/api tests/integration/cli`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation` (incremental, from the local `reports/stryker-incremental.json`)
- `npx stryker run --mutate "packages/core/src/cache/**/*.ts,packages/core/src/knowledge/cache-entry.ts,packages/core/src/knowledge/errors.ts,packages/core/src/explain/explain.ts" --incrementalFile <scratchpad file> --force`
  (forced over the changed core files after the survivor tests; its incremental file was written
  outside the repository so the shared `reports/stryker-incremental.json` is untouched)
- `/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN...HEAD`, plus
  `gitleaks git --log-opts="origin/feature/entrega-2-CRN..HEAD"` and `gitleaks dir packages|tests`
  (both `--config .gitleaks.toml --redact`)
- `docker exec codemind-postgres-1 psql -U codemind -d codemind -At -c "SELECT (SELECT count(*) FROM project), (SELECT count(*) FROM claim), (SELECT count(*) FROM query_log), (SELECT count(*) FROM cache_entry), (SELECT max(created_at) FROM query_log)"`

## Test results

- Baseline (task 0.4, before any code): 117 files, 1443 tests passed, 0 failed, 0 skipped (145.9 s).
- Targeted tests (task 11.2): 47 files, 538 tests passed, 0 failed, 0 skipped.
- Required suite (final, task 11.3): 123 files, 1490 tests passed, 0 failed, 0 skipped (142.6 s).
- Lint: green. Typecheck: green. Architecture lint: 0 errors and the 3 `no-orphans` warnings that
  already exist on `feature/entrega-2-CRN` (`packages/web/src/data/sample-projects.ts`,
  `packages/analyzers/typescript/{src,dist}/index.*`); no cycle between `cache/` and `explain/`.
  Docs coverage: 0 warnings.
- New spec files: `tests/unit/cache/normalize.spec.ts` (3), `tests/unit/cache/response-cache.spec.ts`
  (9 scenarios + 1 boundary test), `tests/unit/explain/explain-cache.spec.ts` (15),
  `tests/integration/store/cache-entry.spec.ts` (10), `tests/unit/store/postgres-cache-write-errors.spec.ts`
  (2), `tests/unit/knowledge/cache-entry.spec.ts` (2 boundary tests, added for the mutation run).
  New tests in existing files: `in-memory-store.spec.ts` (1), `explain.spec.ts` (1),
  `tests/integration/explain/explain.spec.ts` (1), `tests/integration/api/ask.spec.ts` (3),
  `tests/integration/cli/ask-command.spec.ts` (1), `tests/unit/knowledge/errors.spec.ts` (1).
- Every `#### Scenario:` of the five delta specs maps to a test of exactly that name (task 9.3,
  checked with a grep of each title under `tests/`), the unchanged scenarios of the modified
  `explain` and `http-ask` requirements included.

### Characterisation tests (passed when first run)

The tasks write some units whole (design C4 implements the four store calls in task 4.2; design C6
writes the lookup, the hit, the save and the failure paths of `explain` in one edit, task 6.2), so
later scenarios found their behaviour in place. Each was seen green at once, and the code under it
was sabotaged by hand to prove the tests are not empty:

- 1.3 `answer-cache`: "Identifiers, symbols and compatibility characters become plain words", "A
  question of only punctuation has no key, and a key is stable" (Stryker: `normalize.ts` 100 %).
- 4.3a `graph-store`: "Saving a key again replaces its entry", "The most recent of duplicated entries
  is found", "Touching an entry records the hit", "Invalidating a project deletes only its entries";
  4.3b: "Invalid cache arguments are rejected before querying", "Cache calls on an unknown project
  fail without writing", "A failed cache write does not leak"; 4.4: "Concurrent saves of one key
  leave one entry", "Cache writes on the store's own connections commit"; 4.5: "A failed rollback of
  a cache write is a write failure", "A store that cannot give a connection fails cache writes with
  its own error". Sabotage: reversing the duplicate order, dropping the project filter of the touch
  and dropping the delete of the save made all five 4.1–4.3a tests fail; removing the advisory lock
  made the concurrency test fail 3 runs out of 3.
- 6.3–6.7 `explain`: the 14 scenarios of `explain-cache.spec.ts` after the first one. Sabotage:
  skipping the hit record, saving answers that are not cacheable, looking up with `useCache: false`
  and not writing the row before a rethrown save error made 3, 4, 2 and 1 of them fail.
- 6.8 `explain`: "A hit over the database counts in its entry and its row".
- 7.3 `http-ask`: "A cached question answers from the cache over the seed", "A spent daily budget
  still answers a cached question", "The refund demo question answers no-anchor without the model
  over the seed" (the D14 characterisation the task names).
- 8.1 `cli-ask`: "Evaluation mode prints a cached answer" (no CLI code change, as the task says).

### Existing tests edited (task 9.2)

Only tests whose contract this change modifies, as design C8 lists them, never weakened:

- `tests/unit/explain/explain.spec.ts` "A question holding U+0000 is rejected before the store", "A
  malformed request is rejected before the store", "An invalid token budget, hop count or workspace
  root is rejected before the store": the whole `calls` comparison gains `findCacheEntry: 0,
  saveCacheEntry: 0, touchCacheEntry: 0, invalidateCache: 0` (the double counts the cache calls).
- `tests/unit/explain/explain.spec.ts` "A discarded model output is unknown and carries its event"
  (`findCacheEntry` first), "An output without statements is unknown with no evidence"
  (`findCacheEntry` first, `saveCacheEntry` before `saveQueryLog`), "Prior claims show their displayed
  type and stale warning" (`findCacheEntry` first, `saveCacheEntry` after `saveClaims`);
  `tests/unit/explain/explain-verification.spec.ts` "Every citation broken is unknown with broken
  evidence" (`findCacheEntry` first) and "No verification read without statements" (one expected
  order per run: the `no-evidence` run also saves its entry). Extended with the cache calls, never
  filtered: they pin the precedence of "Precedence and UNKNOWN answers", which this change modifies.
- The modified scenarios whose repeat now sends `useCache: false`: `tests/integration/explain/explain.spec.ts`
  "An answer leaves one query log row the daily spend sees", `tests/unit/explain/explain-verification.spec.ts`
  "A valid but irrelevant citation is cited and never a fact", `tests/unit/api/ask.spec.ts` "Requests
  to one API share verification verdicts"; and the two unit tests of design C8,
  `tests/unit/explain/explain.spec.ts` "builds the pack with the hops and budget of the request" and
  `tests/unit/explain/explain-sanitization.spec.ts` "Untrusted text reaches the prompt wrapped and
  unchanged". Each failed once the save existed (the repeat was a hit) and passed with the flag.
- `tests/unit/api/ask.spec.ts` "Optional fields are forwarded as the use case expects": `useCache`
  is now forwarded (D6), with a fourth request carrying `useCache: true`. It failed before the route
  forwarded the flag.
- A `StorePort` double needing the four methods: none besides the in-memory double; the `as unknown
  as StorePort` doubles of the index and seed tests are never given to `explain`.

## Mutation testing (task 11.4)

- `npm run test:mutation` (incremental): **95.06** overall, break threshold 80, exit 0. New or changed
  files: `cache/normalize.ts` 100, `cache/response-cache.ts` 89.16, `explain/explain.ts` 94.86,
  `explain/usage.ts` 100, `knowledge/cache-entry.ts` 56.90 (its scenario runs against Postgres,
  outside Stryker), `knowledge/errors.ts` 81.58.
- Survivors turned into tests: `tests/unit/knowledge/cache-entry.spec.ts` (the four argument checks,
  their fixed messages, a prefixed and a suffixed id), `errors.spec.ts` "CacheWriteFailed carries its
  stable code and no cause or database text", and a boundary test of `response-cache.spec.ts`
  (`endLine ≥ startLine`, every cited id of every statement, the prior-claim warning union, at least
  one statement). The redundant `entry !== undefined &&` of the lookup was removed by nesting the
  checks (no behaviour change).
- Forced run over the changed core files afterwards: **95.29** (`normalize.ts` 100,
  `response-cache.ts` 96.39, `cache-entry.ts` 96.55, `explain.ts` 95.26, `errors.ts` 89.47, whose
  survivors are pre-existing lines of `InvalidGraph` and `SourceUnavailable`).
- Remaining survivors of new code, not gaps: the three static schema mutants of `response-cache.ts`
  (`storedAnswerSchema` / `storedUnknownSchema` → `z.strictObject({})`, discriminator `''`) are
  reported survived, but applied by hand each makes the module throw at load (`Invalid discriminated
  union option`) and every suite importing it fail, a static-mutant artefact of the Vitest runner;
  `typeof entryId !== 'string'` → `false` is equivalent (the UUID test rejects any non-string); the
  `key !== ''` guards of `explain.ts` are equivalent (an anchored question always has a letter or
  digit the key keeps; the spec marks the rule as a guard); `events.length === 0 ? answer : …` is
  equivalent (same content). The regex anchor survivor of `cache-entry.ts` is killed by the
  prefixed-id case (checked by hand). The other `explain.ts` and `explain-request.ts` survivors are
  pre-existing lines.

## Privacy check (task 11.5)

`/privacy-ethics-check` verdict **PASS**. Surface: local storage of the normalized question and of
the answer. Evidence: the key is written only to `cache_entry.question_normalized` (same local
policy as `query_log.question`, DIS-74 D3); `answer_not_cached` carries a closed code and
`CacheWriteFailed` a fixed message without `cause` (`postgres-cache-write-errors.spec.ts`, "A failed
cache write does not leak"); every new statement is parameterised and filters by `project_id`; the
diff adds no `console` call and no dependency; a hit sends nothing to the model. gitleaks over the 26
branch commits and over `packages/` and `tests/`: no leaks. One test URL that carried the compose
credentials was replaced by a credential-free one.

## Data state verification

- Pre-test baseline (task 0.4 and 11.1): `project` 1 (acme-shop), `claim` 0, `query_log` 0,
  `cache_entry` 0, `max(query_log.created_at)` `NULL`.
- Post-test validation (task 11.6, after the final suite and after step 12): `project` 1, `claim` 0,
  `query_log` 0, `cache_entry` 0, `max(created_at)` `NULL`; no `.stryker-tmp/` left.
- State restored: Yes. Restoration actions: none for the suites (the integration specs roll back,
  and the pool specs delete their uniquely named project in `finally`); the manual step 12 rows were
  removed as its report describes.

## Other records

- 13.1: the change has no browser UI (`packages/web` is untouched and does not call `/ask` yet;
  CM-HU-14 will): end-to-end testing is not applicable beyond step 12.
- 13.2: the CI evidence (the new spec files ran and passed, the mutation job ≥ 80) is collected in
  task 16.3, once the PR exists.
- 14.3: no ADR for D3 (no unique key, one entry per project and key kept by the store). It is
  reversible by a later migration that adds the unique index without changing the port, and the
  decision and its trade-off are recorded in design C4 and `readme.md` §3 `CACHE_ENTRY`.

## UI evidence (if applicable)

- None: the change has no browser UI.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum — pre-merge checks (tasks 16.4–16.8), 2026-10-17

- Reports: `2026-10-17-show-spec-working.md` (demonstrably working), `2026-10-17-verify-against-spec.md`
  (CONFORMS), `2026-10-17-adversarial-review.md` (PASS), `2026-10-17-security-review.md` (PASS).
- Tests created by this change and edited in this step (never an existing test of the base branch):
  `tests/unit/explain/explain-cache.spec.ts` (V1–V3: stronger assertions), `tests/unit/cache/normalize.spec.ts`
  (V4: the same inputs written as escapes), `tests/integration/store/cache-entry.spec.ts` (AR4: the
  order-dependent lookup of "Saving a key again replaces its entry" picks the entry by key).
- Source: `packages/adapters/store-postgres/src/queries.ts` (V5: `FIND_CACHE_ENTRY` no longer selects
  the unused `project_id`).
- Results on the fixed tree: `npx vitest run` (with `DATABASE_URL`) 123 files, 1 490 tests passed;
  `npm run lint`, `npm run typecheck`, `npm run docs:coverage` clean; `npm run lint:architecture`
  0 errors, 3 pre-existing `no-orphans` warnings.
- Data state: the `/show-spec-working` run left its `query_log` rows in the local database (see that
  report, State); `cache_entry` is back to 0 and `project`/`claim` are unchanged.

## Addendum — CI (task 16.3), 2026-10-17

- PR: https://github.com/DisTinta/AI4Devs-finalproject/pull/47 (`feature/DIS-21-evaluation-cache` →
  `feature/entrega-2-CRN`).
- First run (`38990401555`): `mutation` passed (incremental; see the 11.4 score above for the forced
  local run). `quality` failed once: "Concurrent saves of one key leave one entry"
  (`tests/integration/store/cache-entry.spec.ts`) had one of six concurrent saves rejected under the
  full suite's load. The job's own Postgres log showed a genuine `deadlock detected` (`40P01`) between
  one save's implicit foreign-key check on the `project` row and an unrelated concurrent `DELETE FROM
  project` from another test file's cleanup — a real, if rare, Postgres interaction, not a bug in the
  cache's own serialisation. Fixed in this change (design.md → Follow-ups, "CI (PR #47, `quality` job,
  run `38990401555`)"): `atomically` (own connections) now retries a deadlocked or non-serializable
  write on a fresh connection, up to three attempts, before mapping it like any other write error. Local
  verification after the fix: `npx vitest run` (with `DATABASE_URL`) 123 files, 1 492 tests passed;
  `npm run lint`, `npm run typecheck`, `npm run lint:architecture` and `npm run docs:coverage` all clean.
- Second run: pending — see the PR's checks for the final link once green.
