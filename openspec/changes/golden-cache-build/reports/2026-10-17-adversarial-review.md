# Adversarial Review Report

- Date: 2026-10-17
- Change: golden-cache-build (DIS-26), branch `feature/DIS-26-cache-build-ollama`
- Task: 17.6 — `/adversarial-review`, run unattended (ADR `20261016-autonomous-workflow-run-entrega-2`)
- Diff: `git diff origin/feature/entrega-2-CRN...HEAD` (37 files). Inputs also read: the change's
  proposal, design, both delta specs, tasks, the spec audit, the step 12 and 13 reports and the
  show-spec-working and verify-against-spec reports of today.
- Reviewer: the agent of the pre-merge step (not the agent of the apply step). A forked reviewer was
  also launched; nothing it returns is reflected here unless an addendum says so.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `seeds/cache/acme-shop.json` (entry `Q4`, `response.answer` and statement 2) vs `fixtures/acme-shop/app/Observers/OrderObserver.php:22-27` | A1 — The Q4 golden answer says `OrderObserver` emits `OrderPlaced` "al crear o Actualizar un pedido" and that `updated` dispatches `RecalculateTotals` on every update. The code fires `OrderPlaced` only in `created` and dispatches in `updated` only when the status changes to `paid`. Its Spanish is also mixed with English identifiers ("recalculateTotals en el created y updated methods"). | It is the answer evaluators see in evaluation mode for a demo question. The spec does not require correctness (the cache build keeps what the model and the verifier accept), and reviewing, regenerating or retiring incorrect golden answers is DIS-34's scope. |
| Minor | `seeds/cache/acme-shop.json` (entry `Q3`) vs `fixtures/README.md` (demo table, Q3) | A2 — The Q3 golden answer only says the coupons are validated in `CouponValidator`; the expected answer (0 % when the code is missing, unknown, inactive or expired, `percentFor`) appears only partly, in the single `INFERENCE` statement, which names `isRedeemable`. | Shallow demo answer; same owner as A1. |
| Minor | `.env.example`; `packages/cli/src/cache-build.ts:242` | A3 — The spec'd error message says `see .env.example`, but `.env.example` does not document `CACHE_BUILD_TIMEOUT_MS` (task 15.3 open: this run's permissions deny reading or editing that file). Same as verify-against-spec V1. | A user following the message finds nothing there; `readme.md:380` and `docs/project-context.md` do document it. |
| Minor | `tests/integration/cli/seed-load.spec.ts:126-137`, `:194`, `:207` | A4 — An existing test was modified: "Loading again changes nothing and keeps the user's projects" now compares the samples' `cache_entry` rows without `id` (`reloadSnapshot`). | Finding until justified. Justified: the modified requirement "Sample projects are loaded idempotently" of this change says the samples' cache entries come back with new ids; only that column of those rows is dropped, every other row and column is still compared whole, which remains stronger than the scenario's THEN. Recorded in the step 12 report and in DIS-26's Enhanced description. |
| Minor | `packages/cli/src/cache-build.ts:302-325`; design Risks | A5 — During an attempt (4–9 min on CPU) the transaction holds the deleted-and-reinserted sample rows. Besides a concurrent `db:seed` (in the design's Risks), any `ask` on acme-shop through the CLI or the API waits for it, because its `query_log` insert checks the locked `project` row (`query_log.project_id` references `project`). | Blast radius not documented: a developer demoing the API while a build runs sees a hung request. Fixed in this change as documentation (design Risks and `docs/project-context.md` → Testing); the behaviour is accepted for a development command. |
| Minor | `packages/cli/src/seed-load.ts` (`readGoldenFiles`); `packages/cli/src/cache/golden-file.ts:127-145` | A6 — `db:seed` checks a golden file's shape and stored responses but not that each evidence `fileId`/`path` names a file row of the seed; a hand-edited or stale golden file with dangling file ids loads and is served. | Spec-conformant (seed-load checks shape only, on purpose; fingerprints are `verify`'s job, DIS-44). The versioned file is guarded in CI by `tests/unit/seed/golden-coherence.spec.ts`, which fails on any dangling id. |
| Minor | `packages/cli/src/seed-load.ts` (`readGoldenFiles`, the `ENOENT` branch); `golden-file.ts:156-168` | A7 — Read errors other than "missing": an unreadable `seeds/cache` (e.g. a file, `ENOTDIR`) makes `db:seed` fail as `INTERNAL`; any read error of a golden file counts as `missing`. Same as verify-against-spec V3. | Fails closed before connecting; no path leaks. Unspecified but harmless. |
| Question | `packages/cli/src/cache-build.ts:205-207` | A8 — A seed without an acme-shop row or without its `indexed_commit` fails as `GOLDEN_STALE` `seed`, which the spec did not say (verify-against-spec V2). | Resolved in this change: the spec was amended with `/opsx:update` (addendum in the spec-audit report); the behaviour already had a unit test. |

### What was checked and found sound

- **Spec and task alignment.** Every requirement of both deltas has scenarios and every scenario a
  test of the same name (30, table in the verify-against-spec report); the only spec edit after the
  implementation is A8's, recorded. Tasks marked `[x]` have their evidence in the step 12 and 13
  reports; 15.3 is honestly left open; 16.x and 17.1–17.3 wait for the PR.
- **Hostile input, `cache:build`.** No argument, `Q2`, `Q3 Q3`, `q3`, an empty environment
  (usage first, no variable needed); `DATABASE_URL` blank; evaluation mode; `CACHE_BUILD_TIMEOUT_MS`
  `0`, `3600001`, `12.5`, `abc`, `  5000 `, `0012` (digits only, trimmed, range 1–3 600 000);
  `LLM_BASE_URL=ftp://x`; credentials in both URLs (no leak, exercised for real); a seed missing,
  stale, without the sample's row or its commit; a golden file missing, broken, holding `Q7`,
  with another fingerprint or another model; a model that returns non-JSON, no statement, a planted
  key, `no-anchor`, `over-budget`, HTTP 500, timeouts and refused connections; a write that fails.
  Each path was traced in `cache-build.ts` and has a test; the configuration, usage, stale and
  unreachable paths were also run against the real CLI (show-spec-working report).
- **Same request twice / two at once.** Two builds write distinct temporary files
  (`.<name>.<pid>.tmp`) and the last rename wins, never a mixed file. A second `db:seed` replaces the
  golden entries (new ids, hit count 0), tested.
- **Secrets.** `isUnsafe` (`cache-build.ts:338-345`) checks the planted key pattern, both roots (native
  and `/` form), `DATABASE_URL`, `LLM_BASE_URL` and the API key, raw and JSON-escaped; errors carry no
  answer text; the `.gitleaks.toml` allowlist added is exact (`^A[K]IAABCDEFGHIJKLMNOP$`). `gitleaks
  dir openspec/changes/golden-cache-build` → no leaks. `longFetch` follows no redirect
  (`redirect: 'manual'` honoured by construction), keeps TLS verification on (`node:https` defaults)
  and sends the authorisation header only to the configured URL.
- **Blast radius.** `db:seed` now loads `seeds/cache/*.json` inside the same transaction; `make up`
  runs it, so a broken golden file blocks `make up` (fails closed, spec'd). `readSeed` was only
  exported. `seeds/graph-dump.sql` changed only its analyzer-fingerprint header line; the web
  constant is unchanged. The integration tests that load the seed (`tests/integration/api/ask.spec.ts`,
  `tests/integration/cli/ask-command.spec.ts`, `projects-command.spec.ts`) call `loadSeed` directly
  and load no golden file. No migration; no Dockerfile or deploy script copies `seeds/`.
- **Evidence quality.** Most important test: "Answers that cannot become golden fail at once"
  (`tests/unit/cli/cache-build.spec.ts:319`) — it fails if `no-anchor` or `over-budget` is added to the
  retried reasons (stdout would show three attempts), if a non-retried model failure were retried, or
  if the error mapping lost `details.status`. "A question without a cacheable answer fails without
  writing" (integration) fails if the unsafe-content check ran after the write or let a retry happen.
  Stryker on the new code ≥ 80 (step 12 report). The suite's only failures are the pre-existing
  cross-file flake of `projects-command.spec.ts` (present in the baseline run too; its cause is noted in the archived `cli-ask` design).

### Verdict

PASS WITH GAPS — no Blocker and no Major. The gaps are Minors with a destination in `design.md` →
Follow-ups: A1–A2 → B (DIS-34), A3 → C, A4, A6, A7 → D, A5 fixed (documentation) and accepted, A8
fixed (spec amended).

### Recommended next steps before archiving

1. Comment on DIS-34 (Spanish) with A1 and A2, so its review regenerates or retires Q4 and checks Q3.
2. Leave the `.env.example` line (A3) as an explicit debt item for the author on DIS-26, since the
   agent cannot touch that file in this run; keep task 15.3 open until it is done.
3. Open the PR, confirm CI (17.3) and archive.

## Addendum — full-suite run after the fixes (task 17.8)

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `tests/integration/cli/cache-build.spec.ts` (`snapshot`) | A9 — The first full `npx vitest run` of this step failed "The golden answers are generated with a scripted model" once (130 files passed, 1 failed; the next two runs were green). Its database snapshot read every row of `project`, `claim`, `evidence`, `query_log` and `cache_entry`, so a project committed through a real pool by another integration file running in parallel (`ask-command.spec.ts` commits an `ask-pool-…` project, the same cause as the known `projects-command.spec.ts` flake) changed the "after" snapshot. | A flaky test of this change in CI. |

Fixed in this change (destination A). Proof first: a temporary probe in that test committed a
project from a second connection between the "before" snapshot and the build, and the test failed
(`+ "name": "probe-foreign-dis26"`). The snapshot now covers the rows the build can reach — the
sample projects and any project named acme-shop, with their `claim`, `evidence`, `query_log` and
`cache_entry` rows — and the probe run passed; the probe was then removed and the file passed whole
(8/8). The build cannot write elsewhere: `loadSeed` deletes and inserts only sample projects and
`explain` writes only for acme-shop. The requirement keeps its wording; the scenario's "recorded
project ids and rows" is checked over that reachable scope (recorded in `design.md` → Follow-ups).
Only a test of this change was edited; no pre-existing test.
