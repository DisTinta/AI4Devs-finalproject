## Context

See proposal.md (Why). The current state the design builds on:

- DIS-21 left the answer cache in place: `normalizeQuestion`, `isCacheable`, `toStoredResponse`,
  `storedResponseSchema` / `parseStoredResponse` (strict; a rejected value is a miss) and
  `answerFromCache` in `packages/core/src/cache/`; `StorePort.saveCacheEntry(projectId, key,
  response)` (checks the key and the response, advisory lock, delete + insert, `hit_count` 0) with its
  Postgres SQL; `explain(deps, { projectId, question, useCache })` saves every cacheable answer after
  `saveClaims`, also with `useCache: false`.
- `npm run seed:build` (`packages/cli/src/seed-build.ts`) is the pattern of a development command:
  configuration checked first, `buildOne('acme-shop', …)` of `fixtures/build-history.mjs`, a
  transaction that never commits, `writeAtomically` (temporary file + `rename`), `displayPath`, one
  summary line, one JSON error line. Its fingerprints (`packages/cli/src/seed/fingerprint.ts`:
  `fingerprint(inputs)` and `collectFingerprintInputs(repoRoot)`) are written in the header of
  `seeds/graph-dump.sql`.
- `npm run db:seed` (`packages/cli/src/seed-load.ts`) checks the seed before connecting, then in one
  transaction calls `loadSeed(client, { sql, projectNames })` (`packages/adapters/store-postgres/src/
  load-seed.ts`: delete the sample projects, cascade, execute the seed) and commits; `seedProjects(sql)`
  gives each seed project's id and name.
- The CLI `ask` (`packages/cli/src/commands/ask.ts`) composes `explain` with `createGitSourceTree()`,
  `createLlm(config)`, `createInMemoryVerificationCache()` and `workspaceRoot` = the repository root,
  and maps errors with its exported `toFailure` (`LLM_CONFIG_INVALID`, `LLM_UNAVAILABLE`,
  `SOURCE_UNAVAILABLE`, `PROJECT_NOT_FOUND`, …).
- `createOpenAiCompatibleLlm(config, { fetch })` posts JSON with `AbortSignal.timeout(config.timeoutMs)`
  and `redirect: 'manual'`, and classifies an `AbortError`/`TimeoutError` as `timeout`.
  `llmConfigFromEnv` caps `LLM_TIMEOUT_MS` at 300 000 because Node's `fetch` (undici) ends any request
  at 300 s by itself.
- Measured state of the branch: the analyzer fingerprint the current code computes
  (`sha256:c133c15b…`) differs from the seed header's (`sha256:67a111f8…`): DIS-21 changed
  `packages/core/src/knowledge/` and `packages/adapters/store-postgres/src/` (both fingerprint inputs)
  without rebuilding the seed. The contract fingerprint matches.

The DIS-26 `[enhanced]` description fixes D1–D14 (agent as lead engineer, autonomous-run ADR
`20261016-autonomous-workflow-run-entrega-2`, reviewable by the author). This design amends D11 and
D12 and adds D15–D17, recorded in the same description, and turns them into units C1–C10.

## Goals / Non-Goals

**Goals:**

- The author regenerates the golden answers with one command and a local model, and the file says,
  through its fingerprints, which code it was built from.
- `db:seed` loads them with no change to its output, so `make up` gives an evaluator three real
  answers at zero cost.
- No seed fingerprint input changes, so the golden answers and the seed never invalidate each other
  through this change's own code (D12 amended).

**Non-Goals:** as in proposal.md. Also: no change to `explain`, `StorePort`, `loadSeed`, the LLM
adapter or the stored-response schema; no new `codemind` subcommand (it is a development script, as
`seed:build`).

## Decisions

### C1 — Golden questions (D2) — `packages/cli/src/cache/demo-questions.ts`

`GOLDEN_PROJECT = 'acme-shop'` and `GOLDEN_QUESTIONS = [{ id: 'Q1', question: … }, { id: 'Q3', … },
{ id: 'Q4', … }] as const`, texts copied from the acme-shop table of `fixtures/README.md`. A test
reads the README table and compares (golden-answers → "Golden questions"), so the README stays the
source and the constant cannot drift. Q2/Q5/Q6 are left out for the reasons of D2.

### C2 — Golden file schema, render and checks (D9, D10) — `packages/cli/src/cache/golden-file.ts`

- `goldenFileSchema`: Zod 4 `strictObject`s in the key order of D9; fingerprints
  `/^sha256:[0-9a-f]{64}$/`; `id` `/^Q[0-9]+$/`; `date` `/^\d{4}-\d{2}-\d{2}$/` plus a calendar check
  (`2026-13-01` and `2026-02-30` rejected); `response` is `z.unknown()` here, checked by
  `parseStoredResponse` in `checkGoldenFile`.
- `checkGoldenFile(value, { seedProjectNames, fileName })` → `GoldenFile | undefined`: the schema;
  `fileName === `${project}.json``; `project` among the seed's names; per entry
  `questionNormalized === normalizeQuestion(question)`, unique `id` and unique `questionNormalized`,
  `parseStoredResponse(response)?.kind === 'answered'`. It returns no reason: `db:seed` reports one
  closed reason (`cache`), as `parseStoredResponse` reports nothing (no response text can reach a
  message).
- `renderGoldenFile(file)`: rebuilds each object in the D9 key order (the `response` keeps the order
  `toStoredResponse` and the schema give it, re-created through `parseStoredResponse` so a value read
  with keys in another order renders the same) and returns `JSON.stringify(value, null, 2) + '\n'`.
  JSON has no CR, so the text is LF; `.gitattributes` already forces LF for `seeds/`.
- `readGoldenFile(path)` → the parsed JSON or a typed failure (`missing` / `invalid`), used by
  `db:seed` and by the partial regeneration of `cache:build`.
- Adds `zod` (`^4.6.5`, the version core uses) to `packages/cli/package.json`.

### C3 — Answer fingerprint (D11 amended) — `packages/cli/src/cache/answer-fingerprint.ts`

`ANSWER_FINGERPRINT_FILES` = the eleven files of the spec, `collectAnswerFingerprintInputs(repoRoot)`
reads them (a missing file throws, as the seed's collector does), and `answerFingerprint(repoRoot)` =
`fingerprint(inputs)` imported from `packages/cli/src/seed/fingerprint.ts` (same algorithm: path
order, LF-normalised, SHA-256). Amendment to D11: `explain/typing-rules.ts` and `verify/policy.ts`
join the D11 list, because they decide each stored statement's `type` and `verification`, which
`verify` (DIS-44) compares; `context/` stays out (accepted risk of D11). Importing from `seed/` does
not change that directory, so the seed fingerprint is untouched.

### C4 — Long request function (D6) — `packages/cli/src/cache/long-fetch.ts`

`longFetch(url, init)`: a `typeof fetch`-compatible function over `node:http` / `node:https`
`request`, covering exactly what the adapter uses: `POST`, headers, a string body, `signal`,
`redirect: 'manual'` (a 3xx is returned as itself; nothing is followed). It resolves a
`new Response(bodyBuffer, { status, headers })` once the whole body is read, so `response.ok`,
`text()` and `body?.cancel()` behave as the adapter expects. No socket or header timeout of its own:
the only limit is the caller's `signal`, whose abort rejects with an `Error` named `AbortError` (or
the signal's `TimeoutError` reason), which the adapter maps to `LlmUnavailable('timeout')`; a socket
error rejects with the system error (its `code` reaches `LlmUnavailable('network', code)`). No new
dependency: `undici`'s `Agent` would need the package. The adapter does not change.

### C5 — `cache:build` command (D1, D3–D8, D15–D17) — `packages/cli/src/cache-build.ts`

Root script `"cache:build": "tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/cache-build.ts"`.
`runCacheBuild(argv, deps)` with `CacheBuildDeps`: `env`, `stdout`, `stderr` and the seams `repoRoot`
(fingerprint inputs, seed, default output; default this checkout), `workspaceRoot` (D17: where
`fixtures/acme-shop` is rebuilt and where the seed's relative `root_path` resolves for `explain`;
default `repoRoot`), `seedPath`, `outputPath` (default `<repoRoot>/seeds/cache/acme-shop.json`),
`buildHistory`, `openTransaction`, `createLlm` (receives the config and the long fetch), `source`,
`explain`, `now`, `write` (the atomic write, for the failed-write scenario), `seedFingerprints`
(computes the current analyzer/contract pair; default `collectFingerprintInputs` + `fingerprint`).

Order, each step only after the previous one succeeded:

1. Arguments: ids ⊆ `GOLDEN_QUESTIONS` ids, no repeats, else `USAGE` (exit 1, D8).
2. Configuration: `DATABASE_URL`; `llmConfigFromEnv` (an `LlmConfigError` maps through `ask`'s
   `toFailure`; evaluation mode → `MISSING_CONFIG` `LLM_BASE_URL`); `CACHE_BUILD_TIMEOUT_MS`
   (`/^[0-9]+$/`, 1..3 600 000, default 1 200 000; else `INVALID_CONFIG`). The live config is copied
   with `timeoutMs` = that value.
3. Seed: read and check as `db:seed` does (its `readSeed` is exported for reuse, no behaviour change),
   compare its header fingerprints with `seedFingerprints(repoRoot)` → `GOLDEN_STALE` `seed` (D15).
4. Partial regeneration (ids given): `readGoldenFile` + `checkGoldenFile` + every entry id a golden
   question, then compare the two seed fingerprints, `answerFingerprint` and `generatedWith` with the
   current ones → `GOLDEN_STALE` `missing` / `invalid` / `fingerprint` / `model` (D16). The new file
   holds the existing entries not named (as they are, `reviews` included) plus the regenerated ones,
   ordered by the golden order; a golden question absent from the file and not named stays absent
   (audit F9).
5. History: `buildHistory(join(workspaceRoot, 'fixtures'), repoRoot)` (`buildOne` with a no-op log);
   `git rev-parse HEAD` of the rebuilt sample ≠ the seed project's `indexed_commit` (read from the
   seed's project `INSERT` by a small reader in `cache-build.ts`) → `GOLDEN_STALE` `seed` (D4). A
   seed without an `acme-shop` row, or whose row has no `indexed_commit`, fails the same way before
   the history is rebuilt (spec amended after `/verify-against-spec` V2).
6. Per requested question, in golden order, up to 3 attempts (D7): `openTransaction()`; `loadSeed`;
   `explain({ store: createPostgresStore({ transaction: client }), source, llm: createLlm(config,
   { fetch: longFetch }), workspaceRoot, now, verificationCache: createInMemoryVerificationCache() },
   { projectId, question, useCache: false })`; `rollback()` and `release()` in `finally`, always. The
   project id is the seed's (`seedProjects`). Classification: `isCacheable` and `kind === 'answered'`
   → keep `toStoredResponse(answer)` after the unsafe-content check (audit F10): the response's
   `JSON.stringify` text against `/AKIA[A-Z0-9]{16}/` and, each both as written and as
   `JSON.stringify(value).slice(1, -1)` (so a Windows path with escaped backslashes is caught), the
   absolute `repoRoot`, the absolute `workspaceRoot`, `DATABASE_URL`, `LLM_BASE_URL` and, when set,
   `LLM_API_KEY`; `UNKNOWN`
   `invalid-model-output` / `broken-evidence` / `no-evidence`, a non-cacheable answered answer
   (`not-cacheable`), and `LlmUnavailable` `timeout` / `network` → retry; `no-anchor` /
   `over-budget` / `unsafe-content` → `GOLDEN_NOT_CACHEABLE` at once; any other `LlmUnavailable`
   (`http-status`, `invalid-response`, …) → `LLM_UNAVAILABLE` at once. Error mapping (audit F11):
   `CliError` as it is; `ProjectNameTaken` → `PROJECT_NAME_TAKEN` exactly as `seed-load.ts`'s
   `toFailure` maps it (message `a project named "<name>" already exists and is not a sample`,
   `details.name`) — `ask`'s `toFailure` (`packages/cli/src/commands/ask.ts:277`) has no such branch;
   every other error through `ask`'s exported `toFailure` (`LLM_CONFIG_INVALID`, `LLM_UNAVAILABLE`,
   `SOURCE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`), whose `INTERNAL` gets the message
   `cache build failed; nothing was written`. A fresh in-memory verification cache per attempt, so a
   retry re-verifies.
7. Write: the kept entries (plus the untouched ones of step 4), `renderGoldenFile`, then
   `mkdirSync(dirname(output), { recursive: true })` (`seeds/cache/` does not exist before the first
   run; audit F7), then the atomic write (temporary `.<name>.<pid>.tmp` next to the file, `rename`,
   temporary removed on failure),
   then the final line. The atomic write is a copy of `seed-build.ts`'s private `writeAtomically` in
   `packages/cli/src/cache/write-atomically.ts`, not an export of it: `seed-build.ts` and
   `compose-index.ts` are seed fingerprint inputs and are only imported from (`displayPath`,
   `CliError`, `defaultOpenTransaction`), never edited (C6).

Progress lines (audit F8) go to stdout as each attempt ends with an answer or a failed model
request, retried or not: `<id>: answered in <s> s (attempt n/3)`, with `Math.round` of the seconds
measured with `now`, or `<id>: attempt n/3 not cacheable (<reason>)`, the reason being the `UNKNOWN`
reason, `not-cacheable`, `unsafe-content` or the `LlmUnavailable` reason. A database, source or
configuration failure prints no attempt line. The error line is `toTerminalSafeJson`. No daily
ceiling (D5): the `query_log` rows are rolled back, so `withDailyBudget` could not see the spend.
Amendment to D5 (audit F13): the final line carries no cost — the D8 format is kept; each entry's
`response.usage.costUsd` already records it, and it is 0 for `qwen2.5-coder`.

### C6 — `db:seed` loads the golden files (D12 amended, D13) — `packages/cli/src/seed-load.ts`

Amendment to D12: the golden entries are saved by `runSeedLoad`, after `loadSeed` and inside the same
transaction, with `createPostgresStore({ transaction: client }).saveCacheEntry(projectId,
questionNormalized, response)` — not by a new `SeedToLoad.cache` field in `loadSeed`. Reasons: the
store's insert is already checked, parameterised, project-scoped and tested (DIS-21), and
`packages/adapters/store-postgres/src/` is an analyzer-fingerprint input of the seed: editing it would
make the seed stale again and, with it, every golden file built on it (D15 shows the cost). The
project id comes from `seedProjects(sql)` (the seed writes deterministic ids).

- Before connecting: `readSeed` (unchanged), then `readGoldenFiles(join(repoRoot, 'seeds', 'cache'),
  seedProjectNames)`: `.json` files directly in the directory, sorted; each `readGoldenFile` +
  `checkGoldenFile`; any failure → `INVALID_SEED` with `details: { reason: 'cache', file }` and the
  message `<file> is not a loadable codemind golden file`, `file` by `displayPath`. A missing
  directory is an empty list. New seam `cacheDir` (default `<repoRoot>/seeds/cache`).
- In the transaction: `(deps.load ?? loadSeed)(client, seed)`, then for each golden file and entry
  `(deps.cacheStore ?? createPostgresStore)({ transaction: client }).saveCacheEntry(…)`; a failure
  propagates and the existing `inTransaction` rolls back (`INTERNAL`, `seed load failed; the database
  is unchanged`). New seam `cacheStore` for the failed-save scenario.
- The `http-ask` main-spec scenarios "Evaluation mode answers UNKNOWN llm-required over the seed" and
  "A spent daily budget stops the model over the seed" load `seeds/graph-dump.sql` itself (with
  `loadSeed`), not `db:seed`, so they load no golden answer and stay cache misses: no `http-ask` delta
  is needed (audit F17).
- stdout unchanged (D13). `loadSeed`'s callers in tests (`ask.spec.ts`, `ask-command.spec.ts`) load
  no golden answers.

### C7 — The stale seed (D15)

The seed is rebuilt with `npm run seed:build` (the author's `AUTHOR_HASH_SALT` from `.env`) before the
golden answers are generated. Only the `analyzer-fingerprint` header line may change; any other
difference stops the step (a row change would be a DIS-21 regression to investigate, not to commit).
`packages/web/src/data/sample-projects.ts` must come out byte-identical. The generated golden file
copies the rebuilt header.

### C8 — The real run (D14)

Local Ollama on CPU only (this machine's GPU backends crash): the tray app and any `ollama.exe` /
`llama-server` stopped first, then `ollama serve` in the background with
`CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu
OLLAMA_CONTEXT_LENGTH=16384` (its log must show `library=cpu`); `LLM_BASE_URL=http://127.0.0.1:11434/v1`,
`LLM_MODEL=qwen2.5-coder`, no `LLM_MODEL_VERIFY`, `CACHE_BUILD_TIMEOUT_MS` default; `npm run
cache:build` in the background with its output in a log under the scratchpad, polled (one Bash call
never blocks more than 10 min). Afterwards every `ollama.exe` and `llama-server` is stopped. If, after
the retries and at most two full runs, a question has no cacheable answer, the ticket stops cleanly
(D14): no golden answer is written by hand.

### C9 — Tests (TDD, every scenario of the two deltas)

- Unit: `tests/unit/cache/golden-file.spec.ts` ("The canonical render is stable", "Golden files with
  an invalid shape are rejected"); `tests/unit/cache/answer-fingerprint.spec.ts` ("The answer
  fingerprint covers exactly its declared inputs", over a temporary tree as
  `seed-fingerprint.spec.ts`); `tests/unit/cli/long-fetch.spec.ts` ("A slow model answer within the
  build's limit is kept", a local `node:http` server on port 0, the real adapter with
  `{ fetch: longFetch }`); `tests/unit/cli/cache-build.spec.ts` (with doubles for every seam: no
  database, no git — "Missing or invalid cache build configuration…", "An unknown or repeated
  question id…", "The build's request limit applies and the daily ceiling does not", "A stale golden
  file is not partially regenerated", "A failed write leaves the previous golden file intact",
  "Answers that cannot become golden fail at once" with an `explain` double; audit F15);
  `tests/unit/seed/golden-questions.spec.ts` ("The golden questions match the demo-question table");
  `tests/unit/seed/golden-coherence.spec.ts` ("The versioned golden file matches the seed, the
  questions and the code", reading the versioned files, as `sample-projects-coherence.spec.ts`).
- Integration: `tests/integration/cli/cache-build.spec.ts` (the scripted-model scenarios, the
  database-unchanged checks, the missing-or-outdated-seed scenario, "A non-sample acme-shop blocks
  the cache build" and "Unreachable services…"): a temporary workspace holding a copy of
  `fixtures/acme-shop` (without `.git`) with its history rebuilt once in `beforeAll` and a no-op
  `buildHistory` seam afterwards (audit F18), the harness's `describeWithDatabase`, a `savepoint` `openTransaction` on a dedicated
  client so the build's rollback is observable, `createScriptedLlm` of `tests/support/scripted-llm.ts`
  in live mode; the seed read from the repository, with `seedFingerprints` returning its header pair
  so CI does not depend on the seed being rebuilt (fingerprint freshness is DIS-44's), except in the
  stale-seed scenario. Long timeouts (history rebuild). New scenarios in
  `tests/unit/cli/seed-load.spec.ts` ("An invalid golden file fails before connecting") and
  `tests/integration/cli/seed-load.spec.ts` (the four golden scenarios of the delta; the served one
  builds the API with `buildApp` of `packages/api/src/app.ts` over a store on the harness
  transaction, an evaluation-mode model and `inject`), each with a temporary `cacheDir` holding a
  golden file built from `tests/support/cached-answer.ts`.
- Unchanged: every existing test keeps its assertions. The existing `seed-load` integration scenarios
  run with the default `cacheDir`, so they also load the versioned golden file once it exists; their
  assertions (stdout, row counts per table, ids) still hold by the modified requirement.
- Mutation: `packages/cli/src/cache/**`, `cache-build.ts` and `seed-load.ts` are in Stryker's
  `packages/cli/src` target; score ≥ 80.

### C10 — Security, privacy and documentation

- The golden file holds answers over redacted spans of a synthetic sample; the unsafe-content check
  (C5) blocks the planted key pattern, the absolute paths and the two URLs. Errors carry codes and
  ids, never answer text. The store's parameterised SQL is the only write; only sample projects are
  touched (their cache entries go with them by cascade).
- Docs: `readme.md` §2.4 (evaluation mode: the three golden questions answer from the cache after
  `make up`), §2.5 and the cost table line 612 (the golden answers exist: no more "llegan con
  DIS-26"), §1 regeneration line 383 (`npm run cache:build` with Ollama);
  `docs/project-context.md` (Commands: `cache:build`; Gotchas: the cache build, the golden format and
  fingerprint, `db:seed` loading `seeds/cache/*.json`, the order seed:build → cache:build, the CPU
  Ollama run); `fixtures/README.md` (golden questions and why not Q2/Q5/Q6); `.env.example`
  (`CACHE_BUILD_TIMEOUT_MS`, commented). ADR: none — the decisions are local to a development command
  and reversible (recorded in the step 11 report).

## Risks / Trade-offs

- [The real run fails on CPU: ~6–7 min per answer, plus verification calls; qwen2.5-coder may return
  non-strict JSON] → 3 attempts per question, a 20-minute per-request limit, `OLLAMA_CONTEXT_LENGTH
  =16384`; if it still fails, the ticket stops cleanly (D14).
- [A transaction stays open for the whole answer (~10 min)] → it holds only the sample projects' rows
  of the author's development database; a concurrent `db:seed` would wait, and so would an `ask` on
  acme-shop (CLI or API), whose `query_log` insert checks the locked project row (found by the
  adversarial review, A5). Accepted for a development command; documented in
  `docs/project-context.md` → Testing.
- [The golden answers reflect one model run, not a reviewed truth] → `reviews` is empty; DIS-34 reviews
  them; `verify` (DIS-44) compares structure, not free text.
- [A later change to a seed fingerprint input makes the seed stale and, through `seed.*`, the golden
  file stale] → by design (PH-12); `verify` reports it; regenerating is `seed:build` then
  `cache:build`. This change touches no seed input (C6).
- [`context/` is not in the answer fingerprint] → accepted in D11: a Context Engine change does not
  mark the golden answers stale; `verify` compares the structure of fresh evaluation answers anyway.
- [The golden ids of claims and evidence are random UUIDs of the generating transaction] → they are
  never looked up (a cache hit serves them as they are); D3.

## Migration Plan

No migration. Deploy = merge: `make up` / `npm run db:seed` loads the versioned golden file.
Rollback = revert the commit; `db:seed` then loads no golden answers (the cache directory is gone).

## Follow-ups

Pre-merge review of 2026-10-17 (reports `2026-10-17-show-spec-working.md`,
`2026-10-17-verify-against-spec.md`, `2026-10-17-adversarial-review.md`,
`2026-10-17-security-review.md`). No Blocker or Major. Every finding with its destination
(`docs/project-context.md` → Tracking deferred findings):

| Finding | Severity | Destination | Where |
|---|---|---|---|
| verify V2 / adversarial A8 — a seed without an acme-shop row or its `indexed_commit` fails as `GOLDEN_STALE` `seed`, unspecified | Minor | **A. Fixed now** | `specs/golden-answers/spec.md` → "The seed the answers are built on is current" amended with `/opsx:update`; C5 step 5; addendum in `reports/2026-10-17-spec-audit.md`; already tested (`tests/unit/cli/cache-build.spec.ts`, "refuses a seed whose header or project row…") |
| adversarial A5 — an attempt's transaction also blocks an `ask` on acme-shop (CLI or API), not only `db:seed` | Minor | **A. Fixed now** (documentation) + accepted behaviour | Risks above; `docs/project-context.md` → Testing |
| adversarial A1 — the Q4 golden answer misstates `OrderObserver::updated` (says it also emits `OrderPlaced`; drops the `paid` condition) and mixes languages | Minor | **B. DIS-34** | Spanish comment on DIS-34 (review, regenerate with `npm run cache:build -- Q4` or retire) |
| adversarial A2 — the Q3 golden answer is shallow (0 % rules of `percentFor` only partly stated) | Minor | **B. DIS-34** | same comment on DIS-34 |
| verify V1 / adversarial A3 — `.env.example` lacks `CACHE_BUILD_TIMEOUT_MS` (task 15.3), which the error message points to | Minor | **C. Explicit debt** (author) | Spanish checklist comment on DIS-26; this run's permissions deny reading or editing `.env.example`. Line to add: `# CACHE_BUILD_TIMEOUT_MS=1200000` with "cache:build only; per-request limit in ms, 1–3600000; default 20 min" |
| verify V3 / adversarial A7 — read errors other than "missing" (`seeds/cache` unreadable → `INTERNAL`; any unreadable golden file → `missing`) | Minor | **D. Accepted** | fails closed before any connection, no path leaks; no value in finer reasons for a development command |
| adversarial A6 — `db:seed` does not check golden evidence file ids against the seed | Minor | **D. Accepted** | by design (shape only; staleness is `verify`'s, DIS-44); the versioned file is guarded in CI by `tests/unit/seed/golden-coherence.spec.ts` |
| adversarial A4 — the existing "Loading again…" test now ignores the samples' `cache_entry` ids | Minor | **D. Accepted** (justified) | the modified requirement says those entries get new ids; every other row and column still compared; step 12 report and DIS-26 Enhanced |
| verify V4 — "A failed write…" proves the temporary-file cleanup through `write-atomically.spec.ts`, not in the scenario test | Minor | **D. Accepted** | the two tests together prove the THEN |
| adversarial A9 — the integration snapshot of the cache build read whole tables, so another integration file committing its own project in parallel failed "The golden answers are generated with a scripted model" once | Minor | **A. Fixed now** | `tests/integration/cli/cache-build.spec.ts` `snapshot` scoped to the rows the build can reach (sample projects and any project named acme-shop); proven with a temporary committed-project probe (red, then green); addendum in the adversarial-review report |
| verify V5 — "The build's request limit…" proves the ceiling is not applied structurally (no `withDailyBudget` wrapper) instead of recording a spend | Minor | **D. Accepted** | the structural proof is stronger for this code |
