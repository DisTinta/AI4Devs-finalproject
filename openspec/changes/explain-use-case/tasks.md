## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-39 to In Progress in Linear, with a short comment in Spanish (change `explain-use-case`, branch `feature/DIS-39-explain-use-case`)
- [x] 0.2 Feature branch `feature/DIS-39-explain-use-case` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `origin/feature/entrega-2-CRN` (09a05a7) during `/opsx:propose` with the upstream unset; confirm the upstream is still unset, so a bare `git push` cannot target the delivery branch, and that `openspec/changes/explain-use-case/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, stop and ask the author whether to rebase
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 13 report; record `git status --porcelain seeds packages/web fixtures` (must be empty), `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`, the `analyzer-fingerprint` / `contract-fingerprint` header lines of `seeds/graph-dump.sql`, and `SELECT count(*) FROM project`, `FROM claim`, `FROM evidence` in the local database
- [x] 0.5 Check with Context7 (Zod 4) whether `z.discriminatedUnion` accepts a nested discriminated union on `type` inside the `L2` branch (design D2); record the answer and the chosen form in `design.md` D2 before step 1

## 1. Core (39b): claim records — statement type rule and U+0000 (TDD, design D2, D3) — `claims-and-typing` → "Claim and evidence records mirror the database checks"

- [x] 1.1 RED: in `tests/unit/knowledge/claim.spec.ts`, test "The statement type of a provenance follows layer and type" (five cases of the scenario; plus `// @ts-expect-error` on a typed `L2` `INFERENCE` claim without `statementType` and on an `L1` one with it). See it fail
- [x] 1.2 GREEN: `packages/core/src/knowledge/claim.ts` — three variants and two provenance shapes (design D2), `statementType` literal from `['FACT', 'INFERENCE']`; export the new schema and type; JSDoc on every export
- [x] 1.3 Update the existing test "An inferred claim without provenance is rejected" to the modified scenario text (its valid provenance now holds `statementType: 'INFERENCE'`), without weakening it; confirm "The provenance shape is validated" and the other existing scenarios still pass unchanged
- [x] 1.4 RED → GREEN: test "A text holding U+0000 is rejected" — shared `textWithoutNul` (design D3) in `knowledge/`, used by subject, predicate, object, provenance model and evidence excerpt (`knowledge/evidence.ts`)

## 2. Core (39b): quarantine rejects U+0000 (TDD, design D3) — `claims-and-typing` → "Model output quarantine"

- [x] 2.1 RED → GREEN: in `tests/unit/explain/statement-schema.spec.ts`, test "A NUL character discards the whole output" (statement `text`, `answer` and a cited evidence id; the evidence-id case is `invalid_shape`, not `unknown_evidence_id`); `explain/statement-schema.ts` uses `textWithoutNul` for `answer`, `text` and each evidence id
- [x] 2.2 Confirm every existing quarantine and audit-event scenario still passes unchanged

## 3. Port and domain errors (39b): claim operations (design D7, D11)

- [x] 3.1 `packages/core/src/knowledge/errors.ts`: `ClaimWriteFailed` (code `CLAIM_WRITE_FAILED`, fixed message, no `cause`) and `StoreQueryArgument` gains `'claims'` and `'spans'`; update the JSDoc of `InvalidStoreQuery` and `StoreQueryArgument`, which now also cover a write (design D7); RED → GREEN unit test in `tests/unit/knowledge/errors.spec.ts` (code, no `cause`, message without arguments)
- [x] 3.2 `packages/core/src/knowledge/stored-claim.ts`: `ClaimSpan`, `StoredClaim`, `StoredEvidence`, `SavedClaim`, `ClaimItem` and `MAX_PRIOR_CLAIMS = 20` (design D7, D11); export from `knowledge/index.ts`
- [x] 3.3 `packages/core/src/ports/StorePort.ts`: `saveClaims(projectId, items)` and `findClaimsOverlapping(projectId, spans)` with JSDoc stating the contract of the `graph-store` delta (validation order, atomicity, `ClaimWriteFailed`, scoping, cap, order)
- [x] 3.4 `npm run typecheck`: the Postgres store and the in-memory double now fail to implement the port; add temporary `throw new Error('not implemented')` bodies only if needed to keep the next RED focused, removed in steps 4–5

## 4. In-memory double (39b): claim write and overlap read (TDD, design D12) — `graph-store` in-memory scenarios

- [x] 4.1 RED → GREEN: in `tests/unit/store/in-memory-store.spec.ts`, test "A failure while writing evidence leaves no claim (in-memory double)"; `tests/support/in-memory-store.ts` gains `saveClaims` (same validation order as the adapter: project id, record schemas, project equality compared lower-cased, project check also for an empty list, file of the project), a strictly increasing write stamp (design D12), the `failClaimWrite` option and `calls.saveClaims`
- [x] 4.2 RED → GREEN: test "Overlap is inclusive at both ends (in-memory double)" (five claims, including the one on file `G`); `findClaimsOverlapping` with project scoping, inclusive overlap on the same file, one entry per claim with all its evidence and paths, newest first, at most `MAX_PRIOR_CLAIMS`, `calls.findClaimsOverlapping`, span validation (`InvalidStoreQuery` naming `spans`); the seeding helper (status, `createdAt`, provenance, evidence, no ownership check)
- [x] 4.3 RED → GREEN: test "Claims of another project are never returned (in-memory double)" (claim of the second project seeded with evidence on a file of the first)
- [x] 4.4 RED → GREEN: test "Unknown projects and invalid spans are rejected (in-memory double)"

## 5. Postgres adapter (39b): claim write and overlap read (TDD, design D7, D11, D13) — `graph-store` → "Claim write", "Claim retrieval by overlapping span"

- [x] 5.1 Create `tests/integration/store/claims-write.spec.ts` (`describeWithDatabase`, `useTransactionPerTest`, factories; the store built with `{ transaction: db() }`). RED: test "The claims of an answer are written with their evidence"
- [x] 5.2 GREEN: `queries.ts` (claim insert with `created_at = clock_timestamp()` and evidence insert with `unnest`, ownership check of project and files) and `saveClaims` in `postgres-store.ts`: validation order of design D7 (project ids compared lower-cased), inside `atomically`, ids from `crypto.randomUUID()`; `atomically` gains the optional `mapWriteError` applied only once the write has started (design D7), and `saveGraph`/`createProject` pass none
- [x] 5.3 RED → GREEN: test "A failure while writing evidence leaves no claim" — trigger created inside the harness transaction (after `SET LOCAL lock_timeout = '10s'`, design D13) that raises on the sentinel excerpt with a `DETAIL` quoting it; assert `ClaimWriteFailed`, `JSON.stringify` of the error (and its own properties) without the sentinel or the database text, no rows of the call, and a following query on `db()` succeeds
- [x] 5.4 RED → GREEN: test "Invalid claims are rejected before writing" — "no statement was sent" for the three schema cases; for the foreign-file case, "nothing written, and a following query on `db()` succeeds" (the ownership check runs a query, design D7)
- [x] 5.5 RED → GREEN: test "Saving claims on the store's own connections commits" (pool store, unique project name, project deleted in `finally`, pattern of `graph-write-pool.spec.ts`)
- [x] 5.5b RED → GREEN: test "A store that cannot give a connection fails with its own error" (a store on a pool already ended; the rejection is the pool's own error, not `ClaimWriteFailed`)
- [x] 5.6 RED → GREEN: test "Claim operations in an unknown project fail" (GREEN creates `findClaimsOverlapping` with the project check only; 5.8 adds the claim subquery) (malformed id: no statement; well-formed unknown id, with a non-empty and an empty list each; existing project with no claim → `[]`)
- [x] 5.7 RED → GREEN: test "Empty inputs read and write nothing" (only the project check sent; count the statements on the connection)
- [x] 5.8 RED → GREEN: test "Overlap is inclusive at both ends" — `findClaimsOverlapping` as one statement from the `project` row with a LEFT JOIN of the matched claims (design D11)
- [x] 5.9 RED → GREEN: test "Claims of another project are never returned" (cross-project evidence row inserted directly)
- [x] 5.10 RED → GREEN: test "A claim with several overlapping evidences appears once with all its evidence"
- [x] 5.11 RED → GREEN: test "The most recent claims come first, at most twenty" (21 claims saved in separate calls on the harness transaction, then read on it and on a pool store over a committed project deleted in `finally`)
- [x] 5.12 RED → GREEN: test "Invalid spans are rejected before querying" (spans checked with `inputSpanSchema`, design D11)

## 6. Context pack (39a): given anchors (TDD, design D9) — `context-engine` → "Context pack"

- [x] 6.1 RED → GREEN: in `tests/unit/context/context-pack.spec.ts`, test "A given anchor is used without searching again" (`calls.findSymbols` unchanged while building with the anchor; packs `toEqual`); `ContextPackRequest.anchors`
- [x] 6.2 RED → GREEN: test "A given anchor symbol without a file id is rejected" (`z.uuid()` check, design D9)
- [x] 6.3 Confirm every existing `context-engine` scenario still passes unchanged

## 7. Core (39a): explain request, precedence and UNKNOWN answers (TDD, design D4, D5) — `explain` → "Explain request", "Precedence and UNKNOWN answers", "Prompt and evidence ids"

- [x] 7.1 Create `tests/unit/explain/explain.spec.ts` with doubles: `createInMemoryStore` over `tests/support/acme-shop-graph.ts`, `createInMemorySourceTree` with acme-shop's files at the subset's commit, a scripted `LlmPort` (mode, recorded requests, scripted output built from the ids it reads in the prompt, recorded call order shared with the store double), and a fixed clock. RED: test "An empty, blank or missing question is rejected before the store" (`""`, `"   "`, `null` and a request without `question`)
- [x] 7.2 GREEN, part 1: `explain/limits.ts` (`MAX_QUESTION_CHARS = 1_000`), `explain/explain-request.ts` (Zod schema, `EXPLAIN_REQUEST_FIELDS`, `InvalidExplainRequest`, design D4) and the first step of `explain/explain.ts`; export from `explain/index.ts`; JSDoc on every export
- [x] 7.3 GREEN, part 2: `explain/unknown-policy.ts` (`UNKNOWN_REASONS`, `LLM_REQUIRED_MESSAGE`, `unknown()`), `explain/explain-answer.ts`, `explain/explain-event.ts` (`ExplainEvent`, `ClaimsNotPersistedEvent`, `CLAIMS_NOT_PERSISTED_CODES`); export from `explain/index.ts`; JSDoc on every export
- [x] 7.4 RED → GREEN: test "A malformed request is rejected before the store"
- [x] 7.5 RED → GREEN: test "The question length limit accepts its bound and rejects one more" (built from `MAX_QUESTION_CHARS`)
- [x] 7.6 RED → GREEN: test "The question length is counted in code points" (`'😀'.repeat(MAX_QUESTION_CHARS)` accepted, one more rejected)
- [x] 7.7 RED → GREEN: test "An invalid token budget, hop count or workspace root is rejected before the store"
- [x] 7.8 RED → GREEN: test "A question without anchor is unknown in both modes without building the pack" (counts: model, `calls.readFileAt`, `calls.findClaimsOverlapping` all 0; 9.10 adds `calls.readFilesAt === 0`, which exists only after 9.2)
- [x] 7.9 RED → GREEN: test "Evaluation mode answers llm-required without building the pack" (also `calls.neighbors` and `calls.getProject` 0); leave the comment marking DIS-21's cache slot (design D4)
- [x] 7.10 RED → GREEN: test "A pack where nothing fits is unknown over budget" (anchor and candidate spans larger than 1000 tokens)
- [x] 7.11 RED → GREEN: test "An unknown project or an unindexed one fails without calling the model"
- [x] 7.12 RED → GREEN: test "Each span of the pack gets one evidence id in rank order" — `explain/prompt.ts` (design D5, with the exported instruction that includes "answer in the language of the question")
- [x] 7.13 RED → GREEN: test "A discarded model output is unknown and carries its event" (three outputs; prior-claims read once and before the model, by the order of recorded calls)
- [x] 7.14 RED → GREEN: test "An output without statements is unknown with no evidence" (`JSON.stringify(answer)` does not contain the model's answer)
- [x] 7.15 RED → GREEN: test "A failing prior-claims read stops before the model" (store double whose `findClaimsOverlapping` rejects)
- [x] 7.16 RED → GREEN: test "Model failures propagate without writing" (`LlmUnavailable` and `BudgetExhausted` from the scripted model)

## 8. Core (39b): answer, persistence and prior claims in explain (TDD, design D5, D6, D8, D11) — `explain` → "Answer with typed statements", "Persistence failure", "Prior claims", "Prompt and evidence ids", "Precedence and UNKNOWN answers", "Explain events and logging"

- [x] 8.1 RED → GREEN: test "The subject of a claim is the symbol of its first cited span" — on the pure mapping of `explain/claim-items.ts` with hand-built spans (design D13), with `CLAIM_PREDICATE_EXPLAINS`
- [x] 8.1b RED → GREEN: test "The evidence of a stored answer lists every citation in order" — the store step of `explain.ts` and the `evidence` list of design D5 (three entries for `E1`, `E2`, `E1`, distinct stored ids)
- [x] 8.2 RED → GREEN: test "The question is anchored once" (`calls.findSymbols` equals the count of one `anchor()` over the same double; needs the store step of 8.1b)
- [x] 8.3 RED → GREEN: test "The prompt hash covers the whole prompt" (hash compared with SHA-256 of `JSON.stringify` of the recorded messages, computed in the test)
- [x] 8.4 RED → GREEN: test "A failed write still answers, unsaved and without leaking" (`failClaimWrite`; two statements citing `E1`+`E2` and `E1`; `answer` and `priorClaims` present; one `E1` and one `E2` entry; events exactly the `claims_not_persisted` event; no sentinel, no question in the serialised events)
- [x] 8.5 RED → GREEN: test "Other write errors propagate" (store double whose `saveClaims` rejects with `InvalidStoreQuery`, then `ProjectNotFound`; no claim written)
- [x] 8.6 RED → GREEN: test "Prior claims show their displayed type and stale warning" — `explain/prior-claims.ts` (`displayType`, `warning: 'stale-evidence'`; five claims, newest first, stale `UNKNOWN` stays `UNKNOWN`)
- [x] 8.7 RED → GREEN: test "Explaining writes nothing to the console" (spy on every output method of `console`; one run per `UNKNOWN` reason, one stored answer, one failed write)
- [x] 8.8 Create `tests/integration/explain/explain.spec.ts` (pattern of `tests/integration/context/context-pack.spec.ts`: temporary copy of acme-shop, history with `buildOne`, real adapters, harness transaction). RED → GREEN: test "An answer with evidence is typed, stored and returned"
- [x] 8.9 RED → GREEN: test "A fact is stored as an inferred claim that keeps its type" (claim and evidence rows read back with SQL in the test)
- [x] 8.10 RED → GREEN: test "A failed write over the database still answers without leaking" (trigger of design D13 that raises on every `evidence` insert with a `DETAIL` quoting `NEW.excerpt` and a sentinel, after `SET LOCAL lock_timeout = '10s'`; the serialised events hold neither the sentinel, nor any excerpt, nor the question)
- [x] 8.11 REFACTOR with the suite green (`/tdd-refactor`) over `explain/*`, `knowledge/claim.ts`, `knowledge/stored-claim.ts`; no behaviour change

## 9. Source tree (39c): batched read (TDD, design D10) — `repository-indexing` → "Reading several files at a commit"; `context-engine` → "Context pack"

- [x] 9.1 Measure BEFORE: scratchpad `tsx` script (never committed) that indexes a temporary copy of acme-shop into the local database **inside a transaction it rolls back** (store on `{ transaction }`), under a unique project name (the committed sample `acme-shop` already holds that name), deletes the temporary copy in `finally`, builds Q1's pack with `gitSourceTreeWith` wrapping `spawnReaderGit` to count processes (plus 2 per `assertRepositoryRoot` call, which runs through simple-git, design D10), and times it; record files read, git processes and wall time (three runs, median); confirm `count(*) FROM project` is unchanged afterwards
- [x] 9.2 `SourceTreePort.readFilesAt` in `packages/core/src/ports/SourceTreePort.ts` (JSDoc with the contract); `tests/support/in-memory-source-tree.ts` gains `readFilesAt` (`calls.readFilesAt`, `batchReads`, same failures per path, first failure in order); the typed `SourceTreePort` literals of `tests/unit/index/index-repository.spec.ts`, `tests/unit/cli/seed-build.spec.ts` and `tests/unit/cli/index-command.spec.ts` gain a throwing `readFilesAt`; confirm every existing scenario of "Source tree contract" still passes unchanged (its text only gains the fourth operation)
- [x] 9.3 RED → GREEN, unit (`tests/unit/git/git-source-tree-parsers.spec.ts`): the parser of the unsized `ls-tree` record and the parser of the `--batch-check` answer (`<oid> blob <size>` / `<oid> missing`), design D10
- [x] 9.3b RED → GREEN: in `tests/integration/git/git-source-tree.spec.ts`, test "Several files are read as the given commit stores them" — `readFilesAt` in `git-source-tree.ts` (design D10: commit first, tree listing without `-l`, `--batch-check` over the requested objects with sizes fed to `readBlobs`, damaged requested object before the per-path scan)
- [x] 9.4 RED → GREEN: test "The first unreadable path rejects the whole batch" (four calls: `missing`, `binary-content`, `too-large`, `not-a-repository`)
- [x] 9.4b RED → GREEN: test "An unreadable object outside the batch does not fail it" (partial-clone setup of the existing "A partial clone never fetches a missing object" test)
- [x] 9.4c RED → GREEN: test "A requested object git cannot read fails the batch with git's error" (partial-clone setup of 9.4b)
- [x] 9.5 RED → GREEN: test "Many files are read with a fixed number of git processes"
- [x] 9.6 RED → GREEN: test "Malformed batch arguments are rejected before running git" (including commit `HEAD` with an empty list)
- [x] 9.7 RED → GREEN: test "An empty batch starts no git process"
- [x] 9.8 RED → GREEN: test "Reading a batch executes nothing from the repository"
- [x] 9.9 RED → GREEN: in `tests/unit/context/context-pack.spec.ts`, test "The files of a pack are read in one batch" — `buildContextPack` collects the candidates' distinct paths and calls `readFilesAt` once (design D9)
- [x] 9.10 Update the existing pack tests to the batched read without weakening them: where they assert `calls.readFileAt === 0` (`context-pack.spec.ts` around lines 131, 201, 214, 271, and the explain test of 7.8), assert both `readFileAt` and `readFilesAt` are 0; where they assert files read, assert them through `batchReads`; confirm "Unreadable source fails without its content" and every other `context-engine` scenario pass; list each edit in the step 13 report
- [x] 9.11 Measure AFTER with the same script, unique name, rollback, cleanup and runs as 9.1; write `openspec/changes/explain-use-case/reports/YYYY-MM-DD-9-pack-latency.md` (before/after: files, git processes, time). Stop and show the author the median; she decides whether to cap the files a pack reads, and the decision and its threshold go to `design.md` → Follow-ups

## 10. Privacy and ethics check

- [x] 10.1 Run `/privacy-ethics-check` over the diff (prompt with repository content and the question; events and errors without content; `ClaimWriteFailed` without database text; no question in any claim column). Record the outcome in the step 13 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 11. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 11.1 Identify tests affected by the change: every implementer of `StorePort` and `SourceTreePort` in `tests/`, every test asserting `calls.readFileAt` of a pack, `claim.spec.ts` cases building `L2` claims, and the store specs touching `claim`/`evidence` (`history-claims-constraints.spec.ts`, `indexes-stale.spec.ts`)
- [x] 11.2 Update them without weakening their assertions; list every edited existing test with the reason in the step 13 report
- [x] 11.3 Confirm that each `#### Scenario:` of the five delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`); for the MODIFIED requirements, the unchanged scenarios keep their existing tests

## 12. Seed: regenerate the analyzer fingerprint (design D14) — last commit of the series

- [x] 12.1 Preconditions: `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` print nothing; `DATABASE_URL` points to a migrated local database (`npm run db:migrate`). When reaching this step, ask the author to provide `AUTHOR_HASH_SALT` in the session with `!` — never earlier, never written to any file
- [x] 12.2 Run `npm run seed:build`
- [x] 12.3 Review the diff: in `seeds/graph-dump.sql` only the `analyzer-fingerprint` header line changes (the `contract-fingerprint` line and every row identical); `packages/web/src/data/sample-projects.ts` unchanged. If anything else changes, stop and tell the author; do not commit
- [x] 12.4 Commit the regenerated seed after the last commit that touches a fingerprint input (`chore(DIS-39): regenerate the seed for the new analyzer fingerprint`); reports, docs and the archive may follow it. If a later fix touches a fingerprint input, repeat 12.1–12.4

## 13. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 13.1 Capture the pre-test baseline: the 0.4 indicators (including `count(*) FROM project`, `claim`, `evidence`); integration tests run in rolled-back transactions, and the pool tests delete their project
- [x] 13.2 Run the targeted tests: `npx vitest run tests/unit/explain tests/unit/knowledge tests/unit/context tests/unit/store tests/unit/cli tests/unit/index tests/integration/store/claims-write.spec.ts tests/integration/explain tests/integration/git/git-source-tree.spec.ts tests/integration/context`
- [x] 13.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 13.4 Run `npx stryker run --mutate "packages/core/src/explain/**/*.ts,packages/core/src/knowledge/claim.ts,packages/core/src/knowledge/evidence.ts,packages/core/src/knowledge/stored-claim.ts,packages/core/src/knowledge/errors.ts,packages/core/src/context/context-pack.ts"` (score ≥ `MIN_MUTATION_SCORE=70`); for each meaningful survivor, a RED → GREEN test; if a fix touches a fingerprint input, redo step 12
- [x] 13.5 Verify the post-test state: same `project`/`claim`/`evidence` counts as 13.1; `seeds/`, `packages/web/`, `fixtures/` unchanged since the step 12 commit; no `.stryker-tmp/` left. Restore and document if not
- [x] 13.6 Create `openspec/changes/explain-use-case/reports/YYYY-MM-DD-13-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the 0.4 baseline, the edited existing tests (9.10, 11.2), the seed diff (12.3), the Stryker score and survivors (13.4), the privacy check (10.1) and the link to the 39c latency report
- [x] 13.7 Mark complete only after the tests pass and the report exists

## 14. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 No CLI or HTTP entry point calls `explain` yet (DIS-40, CM-HU-12): exercise it through a scratchpad `tsx` script (never committed) importing from `@codemind/core` and the real adapters, with a scripted live `LlmPort` and with the evaluation model built by `createLlm`. Precondition: if `fixtures/acme-shop/.git` is absent (it is generated and gitignored), run `node fixtures/build-history.mjs acme-shop` first, or the batched read fails with `not-a-repository`/`missing`. Use acme-shop from the local database; only if it is not loaded, run `npm run db:seed` and, after the step, restore the previous state (record the `project` count before and after)
- [x] 14.2 Success path: Q1 with the scripted model → `answered`, `persisted: true`, `FACT` and `INFERENCE` statements; read the stored `claim`/`evidence` rows back with SQL (`L2`, `INFERENCE`, `statementType`)
- [x] 14.3 Mutating operation and restore: the script runs inside one transaction it rolls back (store on `{ transaction }`); confirm the `claim`/`evidence` counts equal the baseline afterwards
- [x] 14.4 Error and `UNKNOWN` paths: `no-anchor` (live and evaluation), `llm-required`, `over-budget`, `invalid-model-output`, `no-evidence`, an invalid question, an unknown project; print each answer or error and confirm none holds the question, a span's text or the model's output where the spec forbids it
- [x] 14.5 Delete the scratchpad script; `git status` shows no stray file
- [x] 14.6 Document every command and output in `openspec/changes/explain-use-case/reports/YYYY-MM-DD-14-manual-interface-testing.md` (mask the OS user name in paths)

## 15. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 15.1 No user interface calls `explain` yet (DIS-40 CLI, CM-HU-12 HTTP, CM-HU-15 web): record "not applicable; exercised through `@codemind/core` in step 14" in the step 13 report
- [ ] 15.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/explain`, `tests/integration/explain`, `tests/integration/store/claims-write.spec.ts` and the git batch tests ran and passed, and that the mutation step covered `packages/core/src/explain`. Link the run in the step 13 report

## 16. Update Technical Documentation (MANDATORY)

- [x] 16.1 ADR `docs/adr/20261013-fact-statements-stored-as-l2-inference.md` from `docs/adr/_template.md` (design D1): the author's why transcribed verbatim from DIS-39 `[enhanced]` D1, the rejected alternative (promotion to `L1`) and its reason, and the accepted exception to `docs/backend-standards.md` §5 (the `statementType` rule has no database `CHECK`); add it to the index in `docs/adr/README.md`
- [x] 16.2 `readme.md` §3.2 CLAIM: statement type kept in `provenance.statementType`, the layer/type rule, U+0000 rejected, `FACT` statements stored as `L2` `INFERENCE`; the explain flow (one pass, precedence, `UNKNOWN` reasons including `no-evidence`, prior claims capped at 20) where §2 describes it. §4 (`/ask`) stays for CM-HU-12; note there that `reason` now has five values
- [x] 16.3 `docs/project-context.md`: the `explain/` use case and its precedence; `StorePort` claim operations, `ClaimWriteFailed` and `MAX_PRIOR_CLAIMS`; `readFilesAt` and the pack's batched read with the 39c measurement; the in-memory doubles' new operations (`failClaimWrite`, the seeding helper, `readFilesAt`); the gotcha that `ExplainEvent` is not part of `AuditEvent`; the gotcha that claims are written with `clock_timestamp()`; `BudgetExhausted` propagates until DIS-21; rewrite the note that `db:seed` cascades the sample projects' `claim`/`evidence` rows and "no writer exists yet": now every `db:seed`/`make up` deletes the claims `explain` stored for a sample project
- [x] 16.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 17. Pull request preparation

- [ ] 17.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (DIS-39 `[enhanced]` decisions, the propose decisions and the post-audit decisions), the 39a/39b/39c groups, the latency before/after, the seed regeneration and the Stryker score; after verification, set DIS-39 to In Review in Linear with a comment in Spanish linking the PR and the change

## 18. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 18.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 18.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/explain-use-case/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [ ] 18.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report; if a fix touches a fingerprint input, redo step 12 so the seed commit stays last
- [ ] 18.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 18.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards (never before the archive commit)
