# Show Spec Working — explain-use-case

- Date: 2026-10-13
- Change: explain-use-case (DIS-39), PR #37
- System: local Postgres (`docker compose`, `pgvector/pgvector:pg16`) with the acme-shop seed loaded by
  `npm run db:seed`; git over `fixtures/acme-shop` and throwaway repositories under the OS temp dir.
- Interface: no CLI or HTTP entry point calls `explain` yet (DIS-40, CM-HU-12), so the scenarios were
  exercised as their consumer will: a throwaway script in the session scratchpad
  (`<scratchpad>/demo-dis39.mts`, never in the repository, deleted afterwards) that imports
  `@codemind/core` and the real adapters (`createPostgresStore` on one client transaction rolled back at
  the end, plus a pool for the two commit scenarios; `createGitSourceTree`; `gitSourceTreeWith` over a
  counting `spawnReaderGit`; the evaluation model from `createLlm(llmConfigFromEnv({}))`) and a scripted
  live model that builds its output from the evidence ids of the prompt. The store and source tree are
  wrapped in counting proxies with a shared call-order log. Each line checks the scenario's THEN
  mechanically and prints PASS or FAIL. A synthetic project (`demo-own-…`) over a throwaway repository
  gives the three-span pack (`price` → `PriceA`, `PriceB`, `PriceC`) and the over-budget pack
  (`Big`, `Huge`, 100 lines × 99 characters).
- Command: `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/demo-dis39.mts` with
  `DATABASE_URL` and `REPO_ROOT` set (paths masked as `<user-home>`).
- Scenarios that need an in-memory double, a partial clone or a hostile git configuration were run
  through their own tests (part B below), and the unchanged scenarios of the MODIFIED requirements
  through their spec files.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| An empty, blank or missing question is rejected before the store | `explain` with `""`, `"   "`, `null`, no `question` | `INVALID_EXPLAIN_REQUEST` naming `question` ×4; 0 store, source and model calls | Yes | line 1 |
| A malformed request is rejected before the store | `"x"`, `debug: true`, `projectId: 42` | fields `request`, `request`, `projectId`; no value in any error; 0 calls | Yes | line 2 |
| The question length limit accepts its bound and rejects one more | evaluation, `z`×1000 / ×1001 | `no-anchor`; `question`, no extra search | Yes | line 3 |
| The question length is counted in code points | evaluation, 1000 / 1001 emojis (2000 UTF-16 units) | `no-anchor`; `question` | Yes | line 4 |
| An invalid token budget, hop count or workspace root is rejected before the store | budget 999, hops 4, root `repo` | `tokenBudget`, `hops`, `RangeError` naming `workspaceRoot`; 0 calls | Yes | line 5 |
| A question without anchor is unknown in both modes without building the pack | `¿Dónde vive el ornitorrinco?`, live and evaluation | `no-anchor` ×2; model, source, prior-claims 0; no claim | Yes | line 6 |
| Evaluation mode answers llm-required without building the pack | Q1, evaluation | `llm-required` + PH-08 message; only `findSymbols` called | Yes | line 7 |
| A pack where nothing fits is unknown over budget | `big huge`, budget 1000, synthetic project | `over-budget`; no prior-claims read, no model call | Yes | line 8 |
| A discarded model output is unknown and carries its event | `type` field, `E999`, U+0000 in text | `invalid-model-output` ×3 with `invalid_shape`, `unknown_evidence_id`, `invalid_shape`; no prior claims; order `findClaimsOverlapping>complete`; no claim | Yes | line 9 |
| An output without statements is unknown with no evidence | `{"answer":"Se calcula sumando todo.","statements":[]}` | `no-evidence`, model text absent; order `findClaimsOverlapping>complete` | Yes | line 10 |
| A failing prior-claims read stops before the model | `findClaimsOverlapping` rejecting | same error; 0 model calls | Yes | line 11 |
| An unknown project or an unindexed one fails without calling the model | well-formed unknown UUID; project with no indexed commit | `PROJECT_NOT_FOUND`; `SOURCE_UNAVAILABLE` `not-indexed`; 0 model calls | Yes | line 12 |
| Model failures propagate without writing | model throws `LlmUnavailable`, `BudgetExhausted` | the same errors; no claim | Yes | line 13 |
| The question is anchored once | Q1 answered; vs one `anchor()` | 7 symbol searches each | Yes | line 14 |
| Each span of the pack gets one evidence id in rank order | `price` on the three-span pack | `E1..E3` = the pack's spans in order, question and language instruction sent; `E4` → `unknown_evidence_id` | Yes | line 15 |
| The prompt hash covers the whole prompt | same twice, other question, edited span (second commit, re-indexed) | stored hash = SHA-256 of `JSON.stringify(messages)`; equal, equal, different, different | Yes | line 16 |
| An answer with evidence is typed, stored and returned | Q1 on acme-shop, anchor span 16–44 + a heuristic span | one `answer` call; `answered`, `persisted: true`; `FACT`/`INFERENCE`, `current`, `none`; stored excerpts = span texts | Yes | line 17 |
| A fact is stored as an inferred claim that keeps its type | rows read back with SQL | both `L2`/`INFERENCE`/`current`/`null`/`explains`, model, hash, all pack spans, clock instant; `statementType` `FACT` and `INFERENCE` | Yes | line 18 |
| The evidence of a stored answer lists every citation in order | `E1,E2` / `E1` | three entries E1, E2, E1 with distinct stored ids | Yes | line 19 |
| The subject of a claim is the symbol of its first cited span | `toClaimItems` with hand-built spans | `PriceCalculator::compute`, `docs/pricing.md` | Yes | line 20 |
| A failed write over the database still answers without leaking | trigger rejecting every evidence insert with `DETAIL` quoting excerpt + sentinel | `persisted: false`, events exactly the `claims_not_persisted` event, no sentinel or question, no claim | Yes | lines 21–22 |
| Other write errors propagate | `saveClaims` rejecting `InvalidStoreQuery`, `ProjectNotFound` | same errors; no claim | Yes | line 23 |
| Prior claims show their displayed type and stale warning | five claims on `PriceCalculator.php` 25–35 (three set stale with SQL) | newest first: UNKNOWN stale ⚠, INFERENCE stale ⚠, INFERENCE stale ⚠, FACT current, INFERENCE current; read once, before the model | Yes | line 24 |
| Explaining writes nothing to the console | `console.*` replaced; each reason, a stored and a failed write | 0 calls | Yes | line 25 |
| The claims of an answer are written with their evidence | two claims, evidence a.php 3–5 + b.php 1–2, a.php 10–12; again in upper case | ids 2 + 1, three rows; upper case succeeds | Yes | line 26 |
| A failure while writing evidence leaves no claim | trigger on the sentinel excerpt, caller transaction | `CLAIM_WRITE_FAILED`, own properties only `code`, `name`; no sentinel/database text; no row; transaction usable | Yes | line 27 |
| Invalid claims are rejected before writing | no `statementType`, U+0000 object, other project's id; foreign file | `INVALID_STORE_QUERY` `claims`, 0 statements; foreign file `claims`, nothing written | Yes | line 28 |
| Saving claims on the store's own connections commits | pool store, unique project, deleted after | another connection sees 1 claim, 1 evidence | Yes | line 29 |
| A store that cannot give a connection fails with its own error | pool ended | `Cannot use a pool after calling end on the pool` | Yes | line 30 |
| Claim operations in an unknown project fail | `not-a-uuid`; unknown UUID with lists and empty lists | `PROJECT_NOT_FOUND` ×6, 0 statements for the malformed ones; known empty project → `[]` | Yes | line 31 |
| Empty inputs read and write nothing | `saveClaims([])`, `findClaimsOverlapping([])` | `[]`, `[]`; one statement each | Yes | line 32 |
| Overlap is inclusive at both ends | F 10–20, 20–25, 21–30, 1–9, G 10–20 vs F 10–20 | exactly the first two | Yes | line 33 |
| Claims of another project are never returned | cross-project evidence inserted with SQL | `[]` | Yes | line 34 |
| A claim with several overlapping evidences appears once with all its evidence | F 1–3, F 15–16, G 1–2 | one claim, three evidences with paths | Yes | line 35 |
| The most recent claims come first, at most twenty | 21 claims, harness-style transaction and pool + caller transaction | 20 newest first ×3, first one absent; third claim's evidence 1–2, 3–4, 5–6 | Yes | line 36 |
| Invalid spans are rejected before querying | file id `x`; 5–4 | `spans` ×2, 0 statements | Yes | line 37 |
| The statement type of a provenance follows layer and type | five records | `[false,false,true,false,true]` | Yes | line 38 |
| A text holding U+0000 is rejected | subject, predicate, object, model, excerpt | all rejected; clean records accepted | Yes | line 39 |
| An inferred claim without provenance is rejected (modified) | none, `null`, with `statementType` | rejected, rejected, accepted | Yes | line 40 |
| A NUL character discards the whole output | text, answer, evidence id | `invalid_shape` ×3 | Yes | line 41 |
| A given anchor is used without searching again | Q1 anchor passed to the pack | pack equal to the searched one; 0 symbol searches | Yes | line 42 |
| A given anchor symbol without a file id is rejected | anchor without `fileId` | `RangeError` naming `anchors`; 0 store calls | Yes | line 43 |
| The files of a pack are read in one batch | `price` pack (two files on the synthetic project) and Q1 on acme-shop | one `readFilesAt`, no `readFileAt` | Yes (see note) | lines 44–45 |
| Several files are read as the given commit stores them | `b, a, b` at commit 1; `a` at commit 2; a modified on disk | `w1, v1, w1`; `v2` | Yes | line 46 |
| The first unreadable path rejects the whole batch | the four calls of the scenario | `missing`, `binary-content`, `too-large`, `not-a-repository` with their paths | Yes | line 47 |
| Many files are read with a fixed number of git processes | 1 and 50 of 50 files | 6 processes each (4 spawned + 2 repository checks) | Yes | line 48 |
| Malformed batch arguments are rejected before running git | `HEAD`; `HEAD` + `[]`; `../etc/passwd` | `commit`, `commit`, `path`; 0 processes | Yes | line 49 |
| An empty batch starts no git process | `[]` on a missing root | `[]`, 0 processes | Yes | line 50 |

Note on "The files of a pack are read in one batch": the synthetic `price` pack spans two files, not
three; the Q1 pack on acme-shop reads its candidates' files (more than three) in one call too. The
three-file case is the unit test `tests/unit/context/context-pack.spec.ts` (part B).

### Part B — through their tests

| Scenario(s) | Why a test | Result |
|---|---|---|
| The five `(in-memory double)` scenarios of `graph-store` | they are about the double | 5 ✓ (with the 30 earlier double scenarios) |
| A failed write still answers, unsaved and without leaking | needs the double's injected failure; its database variant is line 21–22 above | ✓ |
| An unreadable object outside the batch does not fail it; A requested object git cannot read fails the batch with git's error | need a partial clone with a trap remote | 2 ✓, marker file absent |
| Reading a batch executes nothing from the repository | needs the hostile repository's traps | ✓, marker file absent |
| Unchanged scenarios of the MODIFIED requirements (records, quarantine, context pack, source tree contract) | unchanged behaviour | `claim.spec`, `statement-schema.spec`, unit and integration `context-pack.spec`, `git-source-tree.spec`: 5 files, 106 tests ✓ |

## Evidence

Script output (git LF/CRLF warnings of the throwaway repositories removed; long details cut at 260 characters):

```
state before {"p":1,"c":0,"e":0}

# explain → Explain request
  1 PASS An empty, blank or missing question is rejected before the store :: {"fields":["question","question","question","question"],"calls":{}}
  2 PASS A malformed request is rejected before the store :: ["Invalid explain request: request","Invalid explain request: request","Invalid explain request: projectId"]
  3 PASS The question length limit accepts its bound and rejects one more :: {"first":"no-anchor","second":"Invalid explain request: question"}
  4 PASS The question length is counted in code points :: {"utf16":2000,"first":"no-anchor","second":"question"}
  5 PASS An invalid token budget, hop count or workspace root is rejected before the store :: ["tokenBudget","hops","workspaceRoot must be an absolute path"]

# explain → Precedence and UNKNOWN answers
  6 PASS A question without anchor is unknown in both modes without building the pack :: [{"reason":"no-anchor","model":0,"source":0,"prior":0},{"reason":"no-anchor","model":0,"source":0,"prior":0}]
  7 PASS Evaluation mode answers llm-required without building the pack :: {"reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","calls":{"store.findSymbols":7}}
  8 PASS A pack where nothing fits is unknown over budget :: {"reason":"over-budget","calls":{"store.findSymbols":2,"store.neighbors":1,"store.getProject":1,"source.readFilesAt":1}}
  9 PASS A discarded model output is unknown and carries its event :: [{"reason":"invalid-model-output","subcode":"invalid_shape","prior":false,"order":"findClaimsOverlapping>complete"},{"reason":"invalid-model-output","subcode":"unknown_evidence_id","prior":f
 10 PASS An output without statements is unknown with no evidence :: {"answer":{"kind":"unknown","answer":"UNKNOWN","reason":"no-evidence","statements":[],"evidence":[],"events":[]},"order":"findClaimsOverlapping>complete"}
 11 PASS A failing prior-claims read stops before the model :: {"error":"read failed","model":0}
 12 PASS An unknown project or an unindexed one fails without calling the model :: ["PROJECT_NOT_FOUND","SOURCE_UNAVAILABLE","not-indexed"]
 13 PASS Model failures propagate without writing :: ["LLM_UNAVAILABLE","BUDGET_EXHAUSTED"]
 14 PASS The question is anchored once :: {"explain":7,"oneAnchoring":7}

# explain → Prompt and evidence ids
 15 PASS Each span of the pack gets one evidence id in rank order :: {"ids":["E1=app/F1.php:1","E2=app/F1.php:10","E3=app/F2.php:1"],"e4":"unknown_evidence_id"}
 16 PASS The prompt hash covers the whole prompt :: ["f5d089624e6c","f5d089624e6c","1736f5f6deeb","a157410278c3"]

# explain → Answer with typed statements
 17 PASS An answer with evidence is typed, stored and returned :: ["FACT","INFERENCE"]
 18 PASS A fact is stored as an inferred claim that keeps its type :: {"compute calcula el precio final.":"FACT","Otra pieza interviene.":"INFERENCE"}
 19 PASS The evidence of a stored answer lists every citation in order :: ["app/F1.php:1","app/F1.php:10","app/F1.php:1"]
 20 PASS The subject of a claim is the symbol of its first cited span :: ["PriceCalculator::compute","docs/pricing.md"]

# explain → Persistence failure
 21 PASS A failed write over the database still answers without leaking :: {"persisted":false,"events":[{"type":"claims_not_persisted","code":"store-write-failed"}]}
 22 PASS A failed write still answers, unsaved and without leaking (real store) :: {"statements":[["E1","E2"],["E1"]],"evidence":["E1","E2"]}
 23 PASS Other write errors propagate :: ["INVALID_STORE_QUERY","PROJECT_NOT_FOUND"]

# explain → Prior claims
 24 PASS Prior claims show their displayed type and stale warning :: [["claim 4","UNKNOWN","stale","stale-evidence","app/Services/PriceCalculator.php:25-35"],["claim 3","INFERENCE","stale","stale-evidence","app/Services/PriceCalculator.php:25-35"],["claim 2","

# explain → Explain events and logging
 25 PASS Explaining writes nothing to the console :: {"consoleCalls":0}

# graph-store → Claim write / Claim retrieval by overlapping span (real Postgres)
 26 PASS The claims of an answer are written with their evidence :: {"saved":[2,1],"rows":3}
 27 PASS A failure while writing evidence leaves no claim :: {"code":"CLAIM_WRITE_FAILED","message":"The claims could not be written","keys":["code","name"]}
 28 PASS Invalid claims are rejected before writing :: {"sent":0,"foreign":"claims"}
 29 PASS Saving claims on the store's own connections commits :: {"c":1,"e":1}
 30 PASS A store that cannot give a connection fails with its own error :: Cannot use a pool after calling end on the pool
 31 PASS Claim operations in an unknown project fail :: {"sent":0,"codes":["PROJECT_NOT_FOUND","PROJECT_NOT_FOUND","PROJECT_NOT_FOUND","PROJECT_NOT_FOUND","PROJECT_NOT_FOUND","PROJECT_NOT_FOUND"]}
 32 PASS Empty inputs read and write nothing :: {"save":1,"read":1}
 33 PASS Overlap is inclusive at both ends :: ["F.php:20-25","F.php:10-20"]
 34 PASS Claims of another project are never returned :: 0
 35 PASS A claim with several overlapping evidences appears once with all its evidence :: ["F.php:1-3","G.php:1-2","F.php:15-16"]
 36 PASS The most recent claims come first, at most twenty :: {"tx":20,"pool":20,"caller":20}
 37 PASS Invalid spans are rejected before querying :: ["spans","spans"]

# claims-and-typing (records and quarantine, called as the store calls them)
 38 PASS The statement type of a provenance follows layer and type :: [false,false,true,false,true]
 39 PASS A text holding U+0000 is rejected :: {"rej":[false,false,false,false],"evRej":false,"okay":true}
 40 PASS An inferred claim without provenance is rejected
 41 PASS A NUL character discards the whole output :: ["invalid_shape","invalid_shape","invalid_shape"]

# context-engine (real store and git)
 42 PASS A given anchor is used without searching again :: {"searches":0,"spans":33}
 43 PASS A given anchor symbol without a file id is rejected :: anchors must each carry a well-formed file id
 44 PASS The files of a pack are read in one batch :: {"calls":{"source.readFilesAt":1},"files":["app/F1.php","app/F2.php"]}
 45 PASS (real data) Q1 pack: one batched read for every candidate file :: {"source.readFilesAt":1}

# repository-indexing → Reading several files at a commit (real git)
 46 PASS Several files are read as the given commit stores them :: {"x":["w1","v1","w1"],"y":["v2"]}
 47 PASS The first unreadable path rejects the whole batch :: ["missing:missing.php","binary-content:logo.bin","too-large:big.txt","not-a-repository:a.php"]
 48 PASS Many files are read with a fixed number of git processes :: {"one":6,"all":6}
 49 PASS Malformed batch arguments are rejected before running git :: ["commit","commit","path"]
 50 PASS An empty batch starts no git process :: {"processes":0}

# graph-store, repository-indexing scenarios run through their tests (doubles, partial clone, hostile config): see the report

state after {"p":1,"c":0,"e":0}

50 checks, 0 failed
```

Part B:

```
 ✓ tests/unit/store/in-memory-store.spec.ts > in-memory StorePort double > Requirement: Claim write > A failure while writing evidence leaves no claim (in-memory double)
 ✓ tests/unit/store/in-memory-store.spec.ts > in-memory StorePort double > Requirement: Claim retrieval by overlapping span > Overlap is inclusive at both ends (in-memory double)
 ✓ tests/unit/store/in-memory-store.spec.ts > in-memory StorePort double > Requirement: Claim retrieval by overlapping span > Claims of another project are never returned (in-memory double)
 ✓ tests/unit/store/in-memory-store.spec.ts > in-memory StorePort double > Requirement: Claim retrieval by overlapping span > Unknown projects and invalid spans are rejected (in-memory double)
 ✓ tests/unit/explain/explain.spec.ts > Requirement: Persistence failure > A failed write still answers, unsaved and without leaking
      Tests  35 passed | 27 skipped (62)
 ✓ tests/integration/git/git-source-tree.spec.ts > git source tree > Requirement: Reading several files at a commit > An unreadable object outside the batch does not fail it 2131ms
 ✓ tests/integration/git/git-source-tree.spec.ts > git source tree > Requirement: Reading several files at a commit > A requested object git cannot read fails the batch with git's error 3006ms
 ✓ tests/integration/git/git-source-tree.spec.ts > git source tree > Requirement: Reading several files at a commit > Reading a batch executes nothing from the repository 5326ms
      Tests  3 passed | 41 skipped (44)
 Test Files  5 passed (5)
      Tests  106 passed (106)
```

## State

- Before: `project` 0, `claim` 0, `evidence` 0. `npm run db:seed` loaded acme-shop (1 project) for the run.
- During: the script saw `{"p":1,"c":0,"e":0}` before and after its transaction (every write rolled back; each scenario in its own savepoint). The two pool scenarios used unique project names, deleted in `finally`.
- After: `DELETE FROM project WHERE is_sample AND name = 'acme-shop'` → `project` 0, `claim` 0, `evidence` 0. Throwaway repositories removed. Scratch script deleted; `git status` shows only `tasks.md`.
- Restored: yes.

## Not demonstrated

None. Every scenario of the five delta specs was exercised: 50 against the real adapters, the rest through their tests (part B). No screenshot (no UI); nothing written at the repository root.

## Handoff

The change is **demonstrably working**: 50/50 checks against real Postgres, git and the core API, and every remaining scenario green through its test.
