# Verify against spec: explain-use-case (DIS-39), branch `feature/DIS-39-explain-use-case` @ `b06aab3`

Base `09a05a7`. Five delta specs were checked: `explain`, `claims-and-typing`, `graph-store`, `context-engine` and `repository-indexing`.

**How "state" is established:** I did not re-run any tests. The states come from the recorded run in `reports/2026-10-13-13-test-and-state-verification.md` at commit `28adf0d`: 1124 passed, 0 failed, 0 skipped, with `DATABASE_URL` set. The only commits after `28adf0d` (`cfaa6be`, `b06aab3`) touch reports and `tasks.md`, not code.

## 1. Requirements implemented correctly

All paths below are under ``. "U" is `tests\unit\explain\explain.spec.ts` and "I" is `tests\integration\explain\explain.spec.ts`.

**explain**
- **Explain request:**
  - Strict Zod schema: `packages\core\src\explain\explain-request.ts:35-44`.
  - Field blame with a closed set: `:12`, `:60-65`.
  - The error carries no value: `:18-27`.
  - The workspace root is checked after the request and before any call: `packages\core\src\explain\explain.ts:59-60`.
  - Code points are counted correctly. The installed zod 4.6.5 uses `util.codePointLength` (`node_modules/zod/v4/core/checks.js:273`).
  - Tests: U:146, U:173, U:194, U:212, U:227.
- **Precedence and UNKNOWN answers:**
  - The order is in `explain.ts:62-81`: anchor once, then `no-anchor`, then `llm-required`, then build the pack, then `over-budget`, then the prior-claims read, then one model call with purpose `answer`, then quarantine, then `no-evidence`.
  - The UNKNOWN shape is exact, with `message` only for `llm-required`: `packages\core\src\explain\unknown-policy.ts:10`, `:42-52`.
  - Tests: U:246, U:269, U:293, U:314, U:333, U:367, U:381, U:397, U:447.
- **Prompt and evidence ids:**
  - `packages\core\src\explain\prompt.ts:37-52`: ids `E1…En` in rank order, the user message is JSON `{question, evidence:[{id,path,startLine,endLine,text}]}`, and the hash is SHA-256 of `JSON.stringify(messages)`.
  - The language instruction is at `prompt.ts:14`.
  - Tests: U:464, U:494.
- **Answer with typed statements:**
  - Claim mapping (subject = symbol of the first cited span or its path, `explains`, `L2`/`INFERENCE`, `statementType`, the pack spans as `inputSpans`): `packages\core\src\explain\claim-items.ts:46-77`.
  - Answer shape: `explain.ts:113-136`.
  - Tests: I:111, I:139, U:562, U:524.
- **Persistence failure:**
  - Only `ClaimWriteFailed` is caught: `explain.ts:89-95`.
  - The unsaved answer uses prompt ids, de-duplicated in first-citation order: `explain.ts:139-166`.
  - The event is a closed code: `packages\core\src\explain\explain-event.ts:7`, `:17-25`.
  - Tests: U:625, I:174, U:652.
- **Prior claims:**
  - Read once before the model: `explain.ts:73-76`.
  - Displayed type and stale rule: `packages\core\src\explain\prior-claims.ts:15-20`.
  - Exact fields and warning: `prior-claims.ts:28-44`.
  - Test: U:689.
- **Events and logging:** there is no `console` call in `packages\core\src\explain\*`, and the event type union is in `explain-event.ts:25`. Test: U:750.

**claims-and-typing**
- `statementType` is required on `L2` `INFERENCE` and forbidden on `L2` `UNKNOWN` and on `L1`: `packages\core\src\knowledge\claim.ts` (the `statementProvenanceSchema` and the nested discriminated union on `type`).
- U+0000 is rejected in subject, predicate, object and model (`claim.ts`), in the excerpt (`packages\core\src\knowledge\evidence.ts`), and by the quarantine (`packages\core\src\explain\statement-schema.ts`, via `packages\core\src\knowledge\text-without-nul.ts:8-25`).
- Tests: `tests\unit\knowledge\claim.spec.ts:46-170` and `tests\unit\explain\statement-schema.spec.ts:51-203`.

**graph-store**
- **Claim write:**
  - Validation order: `packages\adapters\store-postgres\src\postgres-store.ts:231-242` and `packages\core\src\knowledge\stored-claim.ts:60-69`.
  - Project and file ownership are checked inside the transaction: `packages\adapters\store-postgres\src\claims.ts:19-23`, `queries.ts:236-238`.
  - The insert uses `clock_timestamp()`: `queries.ts:248`.
  - The `ClaimWriteFailed` mapper is in `postgres-store.ts:75-122`. `ClaimWriteFailed` has no cause: `packages\core\src\knowledge\errors.ts`.
  - Tests: `tests\integration\store\claims-write.spec.ts:123-294` and `tests\unit\store\in-memory-store.spec.ts:665`.
- **Overlap read:**
  - Project-scoped, inclusive overlap, `LIMIT` 20, newest first: `queries.ts:267-290`.
  - Validation: `postgres-store.ts:244-258`.
  - Tests: `claims-write.spec.ts:315-470` and `in-memory-store.spec.ts:746-792`.
- **Authorisation (project scoping), which the spec requires:** it is done in all three places: `c.project_id = p.id` (`queries.ts:276-282`), the file-ownership count (`claims.ts:21-23`), and `claim.projectId` matching (`stored-claim.ts:64`). No check is missing.

**context-engine**
- Precomputed anchors are accepted and validated: `packages\core\src\context\context-pack.ts:118`, `:172-177`.
- Files are read in one batch: `context-pack.ts:189-197`.
- Tests: `tests\unit\context\context-pack.spec.ts:314`, `:334`, `:359`.

**repository-indexing**
- `readFilesAt`: `packages\adapters\git\src\git-source-tree.ts:122-163`. The commit and paths are checked first, an empty list starts no process, git's error comes before any per-path reason, and the first failing path in the given order rejects.
- The port is declared in `packages\core\src\ports\SourceTreePort.ts`.
- Tests: `tests\integration\git\git-source-tree.spec.ts:841-987`.

**Manifest:** no new dependency. Core imports only `zod` (already in `packages\core\package.json`) plus `node:crypto` and `node:path`. The Postgres adapter imports `pg` and `node:crypto`, both already present.

## 2. Requirements missing or partial

Every requirement has code. The gaps below are in tests or edge cases.

1. **"Any database failure once the write has started, including a failure to roll it back, SHALL reject with `ClaimWriteFailed`"** (graph-store spec:22-26).
   - The rollback paths (`postgres-store.ts:89-92`, `:105-109`) have no test. `tests\**\*claim*` has no rollback-failure case.
   - On a pool, if the write raised a domain error and then `ROLLBACK` also fails, the call rejects with the domain error (`:89-92`). On a caller-owned transaction the same situation gives `ClaimWriteFailed` (`:108-109`). The two branches behave differently.
2. **"on failure undoes only its own writes and leaves that transaction usable"** (graph-store spec:29-31). The test only shows that the transaction is still usable (`claims-write.spec.ts:185`). No test checks that earlier caller writes in the same transaction survive.
3. **`readFilesAt` "SHALL reject with the `SourceUnavailable` that `readFileAt` would raise for the first such path"** (repository-indexing spec:168-170). A well-formed but unknown commit maps to `missing` on the first path (`git-source-tree.ts:133`). No batch test covers this.
4. **"One call SHALL start at most six git processes"** (repository-indexing spec:179-180). The test counts only spawner processes and asserts `≤ 4` (`git-source-tree.spec.ts:952`). The two processes from simple-git (`assertRepositoryRoot`, `packages\adapters\git\src\repository.ts:177`) are assumed in a comment (`:951`), not measured.

**Tests that assert less than their scenario states:**
- **U:173-192** ("A malformed request is rejected before the store"): checks only `findSymbols === 0` (`:191`), not every store method.
- **U:227-242** ("An invalid token budget, hop count or workspace root…"):
  - Same pattern: only `findSymbols` is checked (`:241`).
  - For budget and hops it asserts `.field` but not `instanceof InvalidExplainRequest` (`:237-238`).
- **U:524-560** ("The subject of a claim is the symbol of its first cited span"): calls `toClaimItems` directly. The scenario says "are stored", but nothing checks the stored subject through `explain`.
- **I:162** ("A fact is stored as an inferred claim…"): checks the prompt hash only by format (`/^[0-9a-f]{64}$/`). It does not check that it equals the hash of the messages sent. U:515 does check that, but only on the in-memory double.
- **U:625-650** ("A failed write still answers… without leaking"): the double throws a bare `new ClaimWriteFailed()` (`tests\support\in-memory-store.ts`, `saveClaims`). So the sentinel check can only catch `explain` copying text into the event, never the error leaking it. I:174 covers the real leak path.

## 3. Unspecified behaviour

Each item below needs a decision: either remove it, or add it to the spec.

1. **Prompt instructions that neither the spec nor the design ask for:**
   - `prompt.ts:16`: "Each statement is one checkable sentence".
   - `prompt.ts:17`: "If the evidence does not answer the question, return an empty "statements" list." This one actively pushes the model toward the `no-evidence` UNKNOWN path.
   - Design D5 (`design.md:124-128`) lists the instructions and includes neither. The spec (explain:170-176) only requires the language instruction.
   - Both lines are part of the hashed prompt.
2. **A row lock that is never specified:** `CHECK_CLAIM_FILES` takes `FOR SHARE OF p` on the project row (`queries.ts:233-238`). This makes a concurrent graph write of the project wait until the claims are written. This concurrency effect appears in neither the spec nor `design.md`.
3. **The `SAVEPOINT` exception:**
   - A failing `SAVEPOINT` on a caller-owned transaction propagates the raw `pg` error, not `ClaimWriteFailed` (`postgres-store.ts:99`, outside the `try`).
   - This is decided in design D7 (`design.md:179-182`). The spec (graph-store:22-26) only exempts "a failure to obtain a connection".
4. **Response fields the spec does not list:** graph-store:119-121 lists the fields of a stored claim, and the result returns more:
   - `createdAt`: `stored-claim.ts:47-48`, `claims.ts:83`.
   - `confidence`: `claims.ts:81`.
   - `projectId`: rebuilt from the argument, lower-cased (`claims.ts:74`), not read from the database. The in-memory double returns `claim.projectId` exactly as given, so the two stores can disagree on letter case.
5. **Wider public API of `@codemind/core`:**
   - Through `packages\core\src\explain\index.ts:1-12` and `packages\core\src\knowledge\index.ts` it now exports `explainRequestSchema`, `parseExplainRequest`, `buildPrompt`, `EXPLAIN_SYSTEM_PROMPT`, `toClaimItems`, `displayType`, `toPriorClaim`, `assertValidClaimItems`, `assertValidClaimSpans`, `hasNoNul`, `textWithoutNul`, `withoutNul`, `statementProvenanceSchema` and `PROVENANCE_STATEMENT_TYPES`.
   - The spec only requires `MAX_QUESTION_CHARS`, `CLAIM_PREDICATE_EXPLAINS` and `MAX_PRIOR_CLAIMS`, plus the closed sets "declared once".
   - The Postgres adapter needs `assertValidClaim*`. The rest are exported for tests or by convenience.
6. **A defensive check with an unspecified error:** `distinctRegularFiles` calls `assertValidObjectId(entry.oid)` (`git-source-tree.ts:171-181`). If git ever lists a malformed object id, that check raises an error on a path the spec does not describe.

## Scenario → test → state

State for every row: **green** (recorded run, not re-run). No scenario is red or absent.

| Spec | Scenario | Test |
|---|---|---|
| explain | Empty, blank or missing question | U:146 |
| explain | Malformed request (weak assert) | U:173 |
| explain | Question length limit | U:194 |
| explain | Length in code points | U:212 |
| explain | Invalid budget, hops or root (weak assert) | U:227 |
| explain | No anchor in both modes | U:246 |
| explain | Evaluation mode → `llm-required` | U:269 |
| explain | Over budget | U:293 |
| explain | Discarded output carries event | U:333 |
| explain | No statements → `no-evidence` | U:367 |
| explain | Failing prior-claims read | U:381 |
| explain | Unknown or unindexed project | U:314 |
| explain | Model failures propagate | U:397 |
| explain | Anchored once | U:447 |
| explain | One evidence id per span | U:464 |
| explain | Prompt hash covers prompt | U:494 |
| explain | Answer typed, stored, returned | I:111 |
| explain | FACT stored as INFERENCE (weak hash assert) | I:139 |
| explain | Evidence lists every citation | U:562 |
| explain | Subject = first cited span (not via store) | U:524 |
| explain | Failed write, no leak (double) | U:625 |
| explain | Failed write, no leak (DB) | I:174 |
| explain | Other write errors propagate | U:652 |
| explain | Prior claims displayed type and stale | U:689 |
| explain | Nothing written to console | U:750 |
| claims-and-typing | 8 record scenarios | `tests\unit\knowledge\claim.spec.ts`:46, 60, 75, 86, 103, 121, 142, 170 |
| claims-and-typing | 12 quarantine scenarios | `tests\unit\explain\statement-schema.spec.ts`:51, 69, 85, 97, 106, 115, 124, 141, 156, 171, 186, 203 |
| graph-store | Claims written with evidence | `claims-write.spec.ts`:123 |
| graph-store | Evidence failure leaves no claim | `claims-write.spec.ts`:167 |
| graph-store | Same, in-memory double | `in-memory-store.spec.ts`:665 |
| graph-store | Invalid claims rejected | `claims-write.spec.ts`:188 |
| graph-store | Own connections commit | `claims-write.spec.ts`:220 |
| graph-store | No connection → own error | `claims-write.spec.ts`:250 |
| graph-store | Unknown project | `claims-write.spec.ts`:266 |
| graph-store | Unknown project and invalid spans (double) | `in-memory-store.spec.ts`:792 |
| graph-store | Empty inputs | `claims-write.spec.ts`:294 |
| graph-store | Overlap inclusive | `claims-write.spec.ts`:315 |
| graph-store | Overlap inclusive (double) | `in-memory-store.spec.ts`:746 |
| graph-store | Other project never returned | `claims-write.spec.ts`:342 |
| graph-store | Other project never returned (double) | `in-memory-store.spec.ts`:773 |
| graph-store | Several evidences appear once | `claims-write.spec.ts`:366 |
| graph-store | Most recent first, at most 20 | `claims-write.spec.ts`:416 |
| graph-store | Invalid spans | `claims-write.spec.ts`:470 |
| context-engine | Price pack holds calculator once | `tests\integration\context\context-pack.spec.ts`:88 |
| context-engine | Every anchor symbol is an anchor | `tests\integration\context\context-pack.spec.ts`:106 |
| context-engine | 14 unit scenarios | `tests\unit\context\context-pack.spec.ts`:92, 112, 135, 155, 175, 188, 207, 222, 239, 252, 266, 279, 294, 314, 334, 359 |
| repository-indexing | 14 `readFiles` / `realPath` scenarios | `git-source-tree.spec.ts`:72, 92, 102, 115, 180, 195, 231, 253, 279, 310, 333, 354, 381, 417 |
| repository-indexing | Batch: as committed | `git-source-tree.spec.ts`:841 |
| repository-indexing | Batch: first unreadable path | `git-source-tree.spec.ts`:863 |
| repository-indexing | Batch: unreadable object outside | `git-source-tree.spec.ts`:892 |
| repository-indexing | Batch: requested object unreadable | `git-source-tree.spec.ts`:911 |
| repository-indexing | Batch: fixed process count (≤ 6 not measured) | `git-source-tree.spec.ts`:932 |
| repository-indexing | Batch: malformed arguments | `git-source-tree.spec.ts`:955 |
| repository-indexing | Batch: empty list | `git-source-tree.spec.ts`:974 |
| repository-indexing | Batch: executes nothing | `git-source-tree.spec.ts`:987 |

Nothing was fixed in this turn.

## Addendum — fixes (2026-10-13)

Each finding has a destination in `design.md` → Follow-ups ("verify-against-spec … destinations").

- **Fixed (behaviour, TDD):** a failed `ROLLBACK` on a pool after a domain error now rejects with
  `ClaimWriteFailed` (RED seen: `ProjectNotFound`), new `tests/unit/store/postgres-claim-write-errors.spec.ts`
  (pool + domain error, pool + database error, caller transaction); the in-memory double returns the
  project id lower-cased (RED seen in `returns the ids of the stored claims and evidence in order`).
- **Fixed (tests):** "undoes only its own writes" asserted in `claims-write.spec.ts`; unknown commit in a
  batch; every store/source/model call 0 and `instanceof` in the two request scenarios; stored hash =
  SHA-256 of the messages sent and stored subjects in the integration "A fact is stored…".
- **Specified / documented:** failing `SAVEPOINT` and a failed rollback in the `graph-store` delta; the
  returned fields of a stored claim; the two prompt lines (D5); the `FOR SHARE` lock (D7).
- **Accepted (D):** process count measured through the spawner plus the two simple-git checks; the
  double's `ClaimWriteFailed`; the public exports of core; the defensive object-id check.
- Re-run after the fixes: `tests/unit/store`, `tests/unit/explain`, `tests/integration/explain`,
  `tests/integration/store/claims-write.spec.ts`, `tests/integration/git/git-source-tree.spec.ts`:
  151 passed; typecheck and lint clean; `openspec validate explain-use-case`: valid.
