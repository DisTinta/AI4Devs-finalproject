CHANGES REQUIRED

Spec audit of `openspec/changes/explain-use-case/`, DIS-39 (parent DIS-29), 2026-10-13, by the
`spec-auditor` subagent (read-only; this file is written by the main session, docs/base-standards.md
§7.1). The auditor loaded both tickets and their comments from Linear: the hand-offs from DIS-27,
DIS-28, DIS-38 and DIS-17, and the `cli` label note.

## Questions for the author (these need her decision; the agent must not settle them)

- **Q1 (D7, port shape).** The ticket names `StorePort.saveClaims/saveEvidence` in three places:
  [original], the 39b group, and criteria 6–7. The design merges them into one port method,
  `saveClaims(projectId, items)`, with `saveEvidence` as an internal adapter step (design.md:135-156).
  The technical reason is sound: core cannot hold a transaction across two port calls. Still, it
  changes an API the ticket names. Does she accept it? If yes, record it in a DIS-39 comment and in
  proposal → Why.
- **Q2 (open limit).** `priorClaims` and `findClaimsOverlapping` have no limit. Every live answer
  stores new claims on the same spans, so Q1's `priorClaims` grows with every question asked and is
  returned whole. Cap it (N most recent, or deduplicated by object text), or accept it as a risk for
  Entrega 2? docs/backend-standards.md:63 says "Every listing is paginated". design.md:252 calls the
  read "acceptable" without a bound.
- **Q3 (stale `UNKNOWN`).** The ticket says "`stale` → `INFERENCE` … sea cual sea su
  `statementType`". An `L2 UNKNOWN` claim, or an `L1` claim, has no `statementType`. D11 and explain
  spec:255-257 only turn a `FACT` into `INFERENCE`, so a stale `UNKNOWN` stays `UNKNOWN`. Is that what
  she wants?
- **Q4 (blank question).** The ticket says "`question` no vacía". The spec also rejects
  whitespace-only input with an error (explain spec:16-17, scenario :24-29). Today `"   "` would
  answer `no-anchor`. Does she accept rejecting it?
- **Q5 (names introduced by the design).** `ClaimWriteFailed` (`CLAIM_WRITE_FAILED`) and
  `InvalidExplainRequest` (`INVALID_EXPLAIN_REQUEST`) are needed to meet the ticket. They are new
  stable codes that a transport will map (DIS-40, CM-HU-12), so please confirm them.

## 1. Scope against the ticket

- No significant invented scope. Additions that follow from the ticket and need no change: the
  explain-level `workspaceRoot` check (in evaluation mode the pack never runs, so without it a
  relative root would go unnoticed); "a given empty anchor gives a `no-anchor` pack"; "a path given
  twice is returned twice"; the order of claims and of evidence in the retrieval.
- **Minor.** Rejecting whitespace-only questions goes beyond the ticket (Q4).
- **Major, author decision.** D7 changes the port the ticket names (Q1).

## 2. Inherited acceptance criteria

| Criterion | Covered by | State |
|---|---|---|
| 1 Answer with evidence | explain "An answer with evidence is typed, stored and returned" | OK |
| 2 D1 | "A fact is stored as an inferred claim that keeps its type" | OK |
| 3 Displayed type, read before `complete()` | "Prior claims show their displayed type and stale warning" | OK |
| 4 Overlap, "en Postgres **y en el doble**" | graph-store :89-107 | **Blocker B1** |
| 5 D6 counts | the no-anchor and llm-required scenarios, plus "anchored once" | OK |
| 6 Atomicity, Postgres and double | graph-store :37-53 | OK |
| 7 Persistence failure, sentinel in the DB `detail` | explain :233-240 plus graph-store :37-45 | **Major M1** |
| 8 Input, quarantine, U+0000, `statementType`, errors | explain, claims-and-typing | **Blocker B2** (`ProjectNotFound`) |
| 9 `readFilesAt` per-path errors | repository-indexing :186-193 | **Blocker B3** (`too-large`) |
| Interface: `persisted: false` "con la misma forma" | explain :223-231 | **Blocker B4** |

- **B1 (Blocker).** Criterion 4 asks for the cross-project case "en Postgres y en el doble". Only
  Postgres has it (graph-store spec.md:102-107). The double has only the inclusive scenario (:96-100).
  - Fix: add the scenario "Claims of another project are never returned (in-memory double)".
  - D12's seeding helper must accept a claim of project B whose evidence is on a file of project A,
    without checking ownership.
- **B2 (Blocker).** Criterion 8 says "`ProjectNotFound`, `BudgetExhausted` y `LlmUnavailable` se
  propagan sin persistir". No explain scenario covers an unknown project; explain spec:83-85 is a
  MUST with no test. "Other write errors propagate" (:242-245) does not assert that nothing was
  written.
  - Fix: add the scenario "An unknown project fails without calling the model": a well-formed UUID
    that names no project, the price question, live model → `ProjectNotFound`; the model got 0
    calls; no claim written.
  - Fix: add "AND no claim was written" to :245.
  - `SourceUnavailable` is a MUST in the same list with no scenario either (point 3). Add the
    project-with-no-indexed-commit case to the same scenario.
- **B3 (Blocker).** Criterion 9 says "incluidos los errores `missing`/`too-large`/`binary-content`
  por ruta". In repository-indexing spec.md:190-193, `big.txt` always comes after a path that fails
  first, so `too-large` is never the error asserted.
  - Fix: add a third call (`a.php`, `big.txt` → `too-large` naming `big.txt`).
  - Optionally add a root that is not a repository → `not-a-repository` naming the first path.
- **B4 (Blocker).** The ticket interface says `{ kind: 'answered', persisted: false, … }` has "la
  misma forma" as `persisted: true`: `answer`, `statements`, `evidence`, `priorClaims`, `events`. The
  "Persistence failure" requirement (explain spec:225-231) lists only the statements, the ids and the
  event. An implementation could drop `priorClaims` or `answer` and still pass the spec.
  - Fix: state the full shape and assert `answer` and `priorClaims` in the scenario at :233-240.

## 3. Requirements whose MUST behaviour has no scenario

- **Blocker B5 (goes with B8).** graph-store spec.md:14-15 and :83-84 (`ProjectNotFound` for
  `saveClaims` and `findClaimsOverlapping`) have no scenario. Add "Claim operations in an unknown
  project fail" covering both methods: a malformed id fails before any statement is sent; a
  well-formed unknown id fails too; and `findClaimsOverlapping` in an existing project with no claims
  resolves `[]`.
- **Major.** These clauses have no scenario:
  - graph-store :21 (empty `saveClaims` list → `[]`, nothing written);
  - :82 (empty span list → `[]`, no query);
  - :79-81 (order of claims and evidence, Postgres);
  - :85-86 (the read works on the store's own connections and on a caller-owned transaction).
  - Fix: add one scenario per clause, or fold the empty-list cases into "Invalid spans are rejected
    before querying" under a new title.
- **Minor.** Explain spec:275-276 (no log): the console scenario covers it.
- **Minor.** claims-and-typing delta :113-115 (U+0000 in an evidence id): the case is tested only as
  "not a scenario" (task 2.1). Add it to the scenario at :200-205.
- **Minor.** repository-indexing :165-167 (malformed commit together with an empty path list) has no
  scenario; see B9.

## 4. Ambiguity

- **Minor.** "slow" in proposal.md:75-76, design.md:197 and tasks.md:91 (inherited from the ticket's
  "sigue lento"). Proposed wording: "after 9.10 the author reads the measured median and decides
  whether to cap; the threshold she uses is recorded in design.md → Follow-ups". The task already
  stops and asks, so this is wording only.
- **Minor.** "acceptable" in design.md:252 has no bound; it is tied to Q2. Replace it with the cap
  she decides, or "unbounded; accepted by the author on <date>".
- **Minor.** "written anywhere outside the answer and the stored claims" (explain spec:275-276). The
  prompt does send the question and spans to the model. Reword: "SHALL NOT be written to any log,
  event or error".
- **Minor.** "the SHA-256 … of the exact messages sent" (explain spec:150-153 and :166) does not pin
  the serialisation, which the test will. Write: "the SHA-256 of `JSON.stringify(messages)`, UTF-8,
  lowercase hex", as in D5.
- **Minor.** "a question … a budget of 1000 that no span fits" (explain spec:106) does not name the
  fixture. Mirror context-engine: "a pack whose anchor span and every candidate span are larger than a
  budget of 1000".

## 5. Open decisions (each is blocking)

- **B6. The answer's `evidence` list.**
  - With `persisted: true` it has "one entry per stored evidence row" (explain spec:179-180), but the
    order is not fixed.
  - With `persisted: false` the entry ids are `E1…`. When two statements cite `E1`, does `E1` appear
    twice, or once? Are the entries only the cited spans?
  - Fix in the "Answer with typed statements" and "Persistence failure" requirements, for example:
    "`evidence` lists, in statement order then citation order, one entry per citation; with
    `persisted: false` an entry per distinct cited prompt id, in first-citation order". Add a
    two-statements-cite-`E1` case to the scenario at :233-240.
- **B7. `InvalidExplainRequest`.**
  - D4 (design.md:84-88) builds a `z.strictObject` over `question`, `tokenBudget` and `hops`. As
    written, it would reject the request's own `projectId` as an unknown key.
  - Not fixed yet: whether `projectId` is validated (as a string? any value?); what happens with
    unknown keys or a non-object request (the issue path is empty, so which field is named?); the
    property that names the field.
  - Fix in explain spec "Explain request": `projectId: z.string()` (a non-UUID id stays
    `ProjectNotFound`, as anchoring gives it); unknown keys are rejected and name the key's own field,
    or the schema is `z.object` that ignores them; the property is `field: 'question' | 'tokenBudget'
    | 'hops' | 'projectId' | 'request'`.
- **B8. How Postgres tells "unknown project" from "no claims" in `findClaimsOverlapping`.**
  - D11 (design.md:202-207) is "one statement … filtered by `c.project_id = $1`".
  - The existing helper `runProjectQuery` (packages/adapters/store-postgres/src/postgres-store.ts:103-113)
    turns zero rows into `ProjectNotFound`. Reusing it would fail every project that has no claims
    yet; not reusing it leaves an unknown project returning `[]`, which the spec forbids.
  - Fix in D11: "the statement starts from the `project` row and LEFT JOINs the matched claims, so it
    returns one row with no claims for a known project and none for an unknown one".
- **B9. `readFilesAt` with a malformed commit and `paths = []`.** D10 step 1 (design.md:180) checks
  per path, so `commit` is never checked and the call resolves `[]`. The spec (:165-167, :172) leaves
  the order open. Fix: "the commit is checked first, even for an empty list"; add the case to the
  scenario at :202-207.
- **B10. Missing object of a file nobody asked for.** With a whole-tree `ls-tree -l` (D10,
  design.md:183-189), an entry elsewhere in the tree that git cannot read (`BAD`) is listed.
  `readFiles` fails on any missing object (git-source-tree.ts:82-83). Fix in D10: "only the requested
  entries are checked for a missing object".
- **Q2** (cap on `priorClaims`) and **Q3** (stale `UNKNOWN`) are open decisions that belong to the
  author.

## 6. Contradictions inside the change

- **B11 (Blocker). Validation order in D7 vs the `ProjectNotFound` rule in the spec.**
  - D7 (design.md:143-146) runs `claimSchema` first. That checks `projectId: z.uuid()`
    (packages/core/src/knowledge/claim.ts:53). It then checks `claim.projectId === projectId`, and
    only then whether the project id is well formed.
  - So with a malformed `projectId` (and the claims carrying it), the call fails with
    `InvalidStoreQuery('claims')`. graph-store spec:14-15 requires `ProjectNotFound`.
  - Fix in D7: check the project id first (`isWellFormedId` → `ProjectNotFound`), then the schemas.
- **M2 (Major). Task 5.4 vs D7.** Task 5.4 (tasks.md:38) asserts "no statement was sent" for all four
  invalid cases. D7 checks file ownership with a query inside the transaction (design.md:144-146), so
  the foreign-file case does send statements.
  - Fix: in 5.4, assert "no statement was sent" for the three schema cases and "no row written, and a
    following query on `db()` succeeds" for the foreign-file case. Or move the ownership check before
    the transaction, which costs a separate read.
- **Minor. Provenance wording vs D2.** claims-and-typing delta :23-27 says a provenance holds
  "optionally the statement type". D2 (design.md:58-60) keeps `provenanceSchema` strict, without
  `statementType`, so `provenanceSchema` rejects it. Reword the bullet: "The provenance of an `L2`
  `INFERENCE` claim also holds the statement type; the standalone provenance record does not."
- **Minor. "Nodes" vs "spans".** proposal.md:20-21 says "reads the persisted claims of the pack's
  nodes"; the spec and ticket D5 say claims whose evidence overlaps the pack's spans. Align the
  proposal.
- **Minor. Process list.** proposal.md:62-63 lists "one repository check, one tree listing and at
  most one `cat-file --batch`". D10 also runs `commitExists` (`cat-file --batch-check`). Add it.
- **Minor. Who gives the ids.** graph-store :8 says "the id the database gave the claim", but D7
  generates ids in the adapter (`crypto.randomUUID()`). Write "the id the claim was stored under".
- **Minor. Task order.** Task 7.14 (a valid answer, anchored once) needs the store step that task 8.1
  builds. Move 7.14 after 8.1, or let 7.14 use a "no statements" output.

## 7. Contradictions with the project

- **Minor. Design Risk on U+0000 is moot.** design.md:245-247 worries about a cited file whose text
  holds U+0000.
  - Evidence: indexing drops any file whose content contains NUL (`binary-content`,
    openspec/specs/repository-indexing/spec.md:304). The pack reads only files of graph nodes, at the
    indexed commit, so such a file is never a candidate.
  - Fix: replace the Risk with that citation. No author decision needed.
  - What remains: an empty or NUL-holding model name from the provider fails after a paid call
    (design.md:250-251). Keep that Risk.
- **Minor. `BudgetExhausted`.** docs/backend-standards.md:149-150 says "On exhaustion the use case
  degrades to cache-only with a warning". The ticket (criterion 8) and explain spec:83-84 propagate
  the error. Record in design that cache-only degradation arrives with DIS-21 and that the transport
  maps the error to 429.
- **Minor. `statementType` has no CHECK.** docs/backend-standards.md:98-99 says rules that matter
  belong in a database CHECK. The author settled "sin migración; la BD no lo comprueba". The ADR
  (task 16.1) should name this as an accepted exception.
- **Blocker (Q2).** The unbounded listing goes against docs/backend-standards.md:63 "Every listing is
  paginated".
- No conflict with ADR 20261011 (span text read from git). Its Consequences already foresee batching
  "behind the same port".

## 8. Contrast with the real code

- **M3 (Major). Two typed `SourceTreePort` literals are missing from the design.**
  - Adding `readFilesAt` to the port breaks the typecheck of the literals typed through
    `IndexPorts.sourceTree` in tests/unit/cli/seed-build.spec.ts:136-145 and
    tests/unit/cli/index-command.spec.ts:105-115.
  - D12 (design.md:219-220) and task 9.2 name only tests/unit/index/index-repository.spec.ts:62-79.
  - Fix: name all three in D12 and in 9.2.
- **Minor. Errors raised while rolling back.** `atomically` (postgres-store.ts:50-80) rethrows the raw
  `pg` error from `ROLLBACK TO SAVEPOINT` / `RELEASE`. D7 should say that the `ClaimWriteFailed`
  mapping wraps the whole `atomically` call, rollback errors included, while domain errors pass
  through unchanged.
- **Minor. Which UUID check core uses.** D9 says "the same regex as the store's id check". That regex
  is in the adapter (packages/adapters/store-postgres/src/ids.ts:6), which core cannot import. Say
  instead: `z.uuid()` as the records use, or a core-exported constant.
- **Minor. Batched read and partial clones.** D10 (`ls-tree -r -z -l` of the whole tree) sizes every
  blob in the repository on every pack. Cost grows with the repository, and the acme-shop measurement
  will not show it. In a partial clone, every missing blob prints `BAD`.
  - Alternative that keeps the process count fixed: `ls-tree -r -z --full-tree` without `-l`, then one
    `cat-file --batch-check` over the requested oids only (sizes and existence), then `cat-file
    --batch`.
  - Her call (informational); in either case add B10.
- **Minor. Claim order inside one answer.** `claim.created_at DEFAULT now()`
  (0002_history-claims.up.sql:53) is the transaction time, so all claims of one answer share it and
  their order "then by id" is random. That is acceptable as specified. Note it, so nobody expects
  statement order.
- **Minor. Existing pack tests.** tests/unit/context/context-pack.spec.ts:131, :201, :214 and :271
  assert `readFileAt === 0`. In 9.9, assert both `readFileAt` and `readFilesAt` are 0 rather than
  replacing one with the other.

## 9. Task size

- **Minor.** Task 7.2 (six new files, the first step of `explain.ts`, barrel exports and JSDoc) is
  borderline for one turn. Split it: 7.2a limits, request and errors; 7.2b answer and event types,
  unknown policy and index.
- **Minor.** Task 9.9 (batched pack read plus the edits to existing tests) is borderline too. Split it
  into the RED/GREEN step and the existing-test edits.
- **Minor.** Task 18.2 runs three skills in one task. That follows the project's convention; no
  change needed.

## 10. Mandatory steps

- Step 0 is the branch, and its labels are present ✓.
- These steps are all present and labelled ✓: Review and Update Existing Tests (11), Run Tests and
  Verify Data State (13, report `YYYY-MM-DD-13-test-and-state-verification.md`), Manual Interface
  Testing (14), End-to-End Testing (15, justified as not applicable), Update Technical Documentation
  (16) and Pre-merge Review as the last step (18).
- **M4 (Major). The latency measurement writes to the local database and is never undone.** Tasks 9.1
  and 9.10 (tasks.md:82, :91) index a temporary copy of acme-shop into the local database, which
  creates a project and its graph.
  - Fix: run the measurement inside a transaction that is rolled back, or delete the project in
    `finally`.
  - Add `SELECT count(*) FROM project` to the baselines in 0.4 and 13.1 and to the check in 13.5.
- **Minor.** Task 14.1 runs `npm run db:seed`, which also writes to the database. Make it conditional
  ("if acme-shop is not loaded") and restore the state afterwards.
- **Minor.** Task 13.4 mutates only `knowledge/{claim,evidence,stored-claim}.ts`. The ticket says
  "Stryker ≥ 70 en … `knowledge/`" and `knowledge/errors.ts` changes too. Add it.
- **Minor.** Task 16.1 says "if that index lists ADRs". It does (docs/adr/README.md:8-11), so make the
  step unconditional.

## 11. Traceability

| Requirement | Scenario | Task |
|---|---|---|
| explain / Explain request | empty/blank/missing; length bound; code points; invalid budget/hops/root | 7.1-7.2, 7.3, 7.4, 7.5 |
| explain / Precedence | no-anchor both modes; llm-required; over-budget; discarded output; no-evidence; failing prior read; model failures; anchored once | 7.6, 7.7, 7.8, 7.10, 7.11, 7.12, 7.13, 7.14 (order: see §6) |
| explain / Prompt and evidence ids | ids in rank order; prompt hash | 7.9, 8.2 |
| explain / Answer with typed statements | answer with evidence; fact stored as inference; subject | 8.7, 8.8, 8.1 |
| explain / Persistence failure | failed write; other write errors | 8.3, 8.4 |
| explain / Prior claims | displayed type and stale warning | 8.5 |
| explain / Events and logging | nothing to console | 8.6 |
| claims-and-typing / Records (MODIFIED) | 6 existing (1 edited); statement type; U+0000 | existing tests + 1.3; 1.1-1.2; 1.4 |
| claims-and-typing / Quarantine (MODIFIED) | 11 existing; NUL | 2.2; 2.1 |
| graph-store / Claim write | written; failure (Postgres); failure (double); invalid; pool commits | 5.1-5.2, 5.3, 4.1, 5.4, 5.5 |
| graph-store / Retrieval | inclusive (Postgres); inclusive (double); other project; several evidences; invalid spans | 5.6, 4.2, 5.7, 5.8, 5.9 |
| context-engine / Context pack (MODIFIED) | 15 existing; given anchor; anchor without file id; one batch | 6.3/9.9; 6.1; 6.2; 9.9 |
| repository-indexing / Source tree contract (MODIFIED) | 14 existing | 9.2 |
| repository-indexing / Reading several files | six scenarios | 9.3-9.8 |

Every scenario has a task, and the table has no empty row. The scenarios that §2, §3 and §5 add (B1,
B2, B3, B5, B6, B9 and the Major ones) will each need a task in the matching group.

Check of each MODIFIED requirement against its main spec:
- claims-and-typing "Records" and "Quarantine": every bullet and every scenario is kept; only the
  intended text changed.
- context-engine "Context pack": all 15 scenarios kept, bullets identical except Inputs and the files
  bullet.
- repository-indexing "Source tree contract": all 14 scenarios kept, text identical except the first
  paragraph.

Nothing of the existing behaviour is dropped silently.

Check of the author's decisions in DIS-39 [enhanced]. Each of these is in the specs with a testable
scenario:
- D1; the `statementType` rule per layer and type; the displayed type for stale and current (except
  the `UNKNOWN` edge, Q3);
- D5 inclusive overlap (10–20, 20–25, 21–30, 1–9);
- D6 order and the `findClaimsOverlapping` call counts in every case;
- the answer union with `persisted`, and DB ids vs `E1…En`;
- `claims_not_persisted` with its closed code, no detail and the sentinel test;
- the no-evidence reason; the subject/predicate/object mapping;
- `MAX_QUESTION_CHARS` = 1 000, with tests at 1 000 / 1 001 and with emojis;
- the 39a/39b/39c groups; the latency measured before and after.

The gaps are B1-B4 above, plus:
- **M5 (Major).** Overlap edge case: a claim whose only evidence is on another file G at overlapping
  lines (10–20) must not be returned. Today no scenario checks that the file matches. Add it to
  "Overlap is inclusive at both ends" (Postgres and double).

---

## Findings by severity

**Blocker:** B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, and Q2 (author decision).

**Major:**
- M1. Criterion 7 is covered only in two halves.
  - The explain scenario injects `ClaimWriteFailed` directly, so no database `detail` exists to leak.
  - The Postgres scenario tests the adapter on its own.
  - Fix: add a test in tests/integration/explain/explain.spec.ts, "A failed write over the database
    still answers without leaking". It uses the claims-write trigger whose `DETAIL` quotes a sentinel,
    and checks `persisted: false`, the exact event, and that `JSON.stringify(events)` holds neither
    the sentinel nor the question.
- M2. Task 5.4 vs D7.
- M3. The two typed `SourceTreePort` literals in tests/unit/cli.
- M4. The measurement leaves a project in the local database.
- M5. Overlap on another file of the same project.
- Q1. D7 port shape (author decision).

**Minor:** the rest of §3, §4, §6, §7, §8, §9 and §10; Q3, Q4 and Q5.

## Opinion on the design choices the main session asked about

- **Single `saveClaims` (D7).** Technically right. It goes against the API the ticket names, so it
  needs Q1.
- **`ClaimWriteFailed`.** Needed to meet "solo un fallo de la BD → `persisted: false`". Keep it, and
  have the author confirm the name and code (Q5).
- **`InvalidExplainRequest`.** Needed. Its schema details are open (B7).
- **Explain checks `workspaceRoot`.** Keep it. In evaluation mode the pack never runs, so nothing else
  would catch a bad root. No author decision needed.
- **`readFilesAt` lists the whole tree.** It keeps the command line bounded. Its cost and the
  partial-clone behaviour are in §8; B10 is required either way.
- **Risk of a cited file holding U+0000.** It cannot happen: indexing drops NUL-content files
  (repository-indexing spec.md:304). Rewrite the Risk; no author decision needed.
- **Prompt (D5).** Fine. Two notes for the author:
  - The system prompt is in English and never says which language to answer in, so a Spanish
    question may get an English answer. She may want "answer in the question's language".
  - Pin the serialisation of the hash in the spec (§4).

---

## Corrections to apply

### openspec/changes/explain-use-case/specs/explain/spec.md
1. **"Explain request" (:10-22).**
   - Add: "`projectId` MUST be a string (a malformed id is not checked here: anchoring reports it as
     `ProjectNotFound`)".
   - Add: "a field the request does not define is rejected, naming that field; a request that is not
     an object is rejected naming `request`".
   - Add: "the error's `field` is one of `question`, `tokenBudget`, `hops`, `projectId`, `request`".
     (B7)
2. **"Precedence" (:83-85).** Add the scenario "An unknown project fails without calling the model".
   Its WHEN covers a well-formed UUID that names no project, then a project with no indexed commit,
   both with a live model. Its THEN: `ProjectNotFound`, then `SourceUnavailable` with reason
   `not-indexed`; the model got 0 calls; no claim written. (B2)
3. **"Other write errors propagate" (:245).** Add "AND no claim was written". (B2)
4. **"Answer with typed statements" (:179-180).** Replace the evidence bullet with: "`evidence`, one
   entry per citation, in statement order then citation order, with the id of its stored row, …".
   (B6)
5. **"Persistence failure" (:225-231).** Rewrite as: "explain SHALL answer with the same shape as a
   stored answer — `kind: 'answered'`, `persisted: false`, the model's `answer`, the typed statements,
   the prior claims, `evidence` and `events` — where every evidence id and evidence entry id is the
   prompt's id; `evidence` holds one entry per distinct cited prompt id, in first-citation order". In
   the scenario at :233-240, have both statements cite `E1`, and assert `answer`, `priorClaims` and
   exactly one `E1` entry. (B4, B6)
6. **"Prior claims" (:255-257).** Write in the author's answer to Q3.
7. **:150-153 and :166.** "the SHA-256, in lowercase hexadecimal, of `JSON.stringify(messages)` in
   UTF-8".
8. **:106.** "a pack whose anchor span and every candidate span are larger than a budget of 1000".
9. **:275-276.** "SHALL NOT be written to any log, event or error".

### specs/graph-store/spec.md
1. **:8.** "the id the claim was stored under".
2. **:11-15.** Put the project-id check first: "A `projectId` that is not a well-formed UUID MUST fail
   with `ProjectNotFound` before any other check".
3. **New scenario "Claim operations in an unknown project fail".** `saveClaims` and
   `findClaimsOverlapping` with `not-a-uuid` → `ProjectNotFound`, no statement sent; with a
   well-formed unknown id → `ProjectNotFound`; `findClaimsOverlapping` in an existing project with no
   claims → `[]`. (B5, B8)
4. **New scenario "Empty inputs read and write nothing".** `saveClaims(p, [])` → `[]`;
   `findClaimsOverlapping(p, [])` → `[]`; no statement sent.
5. **New scenario for the order.** Three claims created in separate transactions, evidence lines 5, 1,
   3 → claims in creation order, each claim's evidence sorted by first line.
6. **"Overlap is inclusive at both ends" (Postgres and double).** Add a fifth claim whose only
   evidence is on another file `G`, lines 10–20; expect it not returned. (M5)
7. **New scenario "Claims of another project are never returned (in-memory double)".** (B1)
8. **:18-20.** "Any database failure after the write has started, including a failure to roll back,
   SHALL reject with `ClaimWriteFailed`; a failure to obtain a connection propagates unchanged".

### specs/repository-indexing/spec.md
1. **:165-167.** "The commit is checked first, even when `paths` is empty".
2. **:188-193.** Add a third call: `a.php` then `big.txt` → `too-large` naming `big.txt`. Optionally
   add a root that is not a repository → `not-a-repository` naming the first path. (B3)
3. **:202-207.** Add the case of a malformed commit with an empty path list → `RangeError` naming
   `commit`. (B9)
4. **:168-171.** "Only the entries of the requested paths are checked; an unreadable object elsewhere
   in the commit does not fail the call". (B10)

### specs/claims-and-typing/spec.md
1. **:23-27.** Reword the statement-type part of the provenance bullet as in §6.
2. **:200-205.** Add the evidence id holding U+0000 → `invalid_shape`.

### design.md
1. **D7 (:143-152).**
   - Validation order: well-formed `projectId` first, then the record schemas, then project equality.
   - The `ClaimWriteFailed` mapping wraps the whole `atomically` call, including rollback errors.
   - Name the `InvalidStoreQuery` reason as fixed text that never holds a record value.
2. **D9 (:170-171).** Replace "the same regex as the store's id check" with `z.uuid()`, or a core
   constant.
3. **D10 (:180-189).**
   - Check the commit first.
   - Only the requested entries are checked for a missing object.
   - Optionally list the tree without `-l` and run `cat-file --batch-check` over the requested oids
     (§8).
4. **D11 (:202-207).**
   - The project row LEFT JOINs the matched claims, so an unknown project and a project with no
     claims can be told apart.
   - Note that claims of one answer share `created_at`.
   - Write in the cap or acceptance from Q2.
5. **D12 (:219-220).** Name the doubles in tests/unit/cli/seed-build.spec.ts and
   tests/unit/cli/index-command.spec.ts. The seeding helper allows cross-project evidence.
6. **Risks.**
   - Replace :245-247 with the citation of repository-indexing spec.md:304.
   - Replace "acceptable" at :252 with the outcome of Q2.
   - Add the `BudgetExhausted` / DIS-21 note (docs/backend-standards.md:149-150) and the accepted
     exception to backend-standards §5.
7. **D4 (:84-88).** The full request schema from B7.

### proposal.md
- :20-21: "the claims whose evidence overlaps the pack's spans".
- :51-54: the outcome of Q1.
- :62-63: add the commit check.

### tasks.md
1. **5.4.** Split the assertion: "no statement sent" for the three schema cases; "nothing written,
   `db()` usable" for the foreign file. (M2)
2. **9.2.** Also update tests/unit/cli/seed-build.spec.ts and tests/unit/cli/index-command.spec.ts.
   (M3)
3. **9.1 and 9.10.** Run inside a transaction that is rolled back, or delete the project in
   `finally`. Add `count(*) FROM project` to 0.4, 13.1 and 13.5. (M4)
4. **14.1.** Make `db:seed` conditional and restore afterwards.
5. **13.4.** Add `packages/core/src/knowledge/errors.ts`.
6. **16.1.** Drop "if that index lists ADRs".
7. **Order.** Move 7.14 after 8.1; split 7.2 and 9.9.
8. **New tasks for the added scenarios:**
   - group 4: double cross-project, other-file overlap;
   - group 5: unknown project, empty inputs, order, other-file overlap;
   - group 7: unknown project in explain;
   - group 8: persisted-false shape, and the M1 integration test in
     tests/integration/explain/explain.spec.ts;
   - group 9: `too-large` in the batch, malformed commit with an empty list.

### Linear DIS-39 (comment in Spanish; the [original] block stays untouched)

Draft comment proposed by the auditor (to be posted only with the author's answers):

«Auditoría de especificación del change `explain-use-case` (2026-10-13): CHANGES REQUIRED. Quedan
para decisión de la autora: (1) D7 …; (2) tope de `priorClaims` …; (3) claim `stale` de tipo
`UNKNOWN` …; (4) pregunta solo con espacios …; (5) nombres y códigos nuevos `ClaimWriteFailed` e
`InvalidExplainRequest`. El resto de hallazgos se corrigen en los artefactos del propio change.»

Once she answers, add her decisions to the [enhanced] block under "Decisiones del propose".

## Resolution (first pass, 2026-10-13)

Author decisions (recorded in DIS-39 `[enhanced]` → "Decisiones del propose" and in proposal → Why):

- **Q1** — accepted: one port method `saveClaims`; `saveEvidence` is a step of the adapter (design D7).
- **Q2** — decided by the author: the 20 most recent claims, newest first (`MAX_PRIOR_CLAIMS`;
  graph-store "Claim retrieval by overlapping span", new scenario "The most recent claims come
  first, at most twenty"; design D11, Risks).
- **Q3** — decided by the author: a stale `INFERENCE` or `UNKNOWN` keeps its type; only `FACT` becomes
  `INFERENCE` (explain "Prior claims", scenario now with a stale `UNKNOWN`; design D11).
- **Q4** — decided by the author: a whitespace-only question is rejected (design D4).
- **Q5** — confirmed by the author: `ClaimWriteFailed` / `CLAIM_WRITE_FAILED`, `InvalidExplainRequest`
  / `INVALID_EXPLAIN_REQUEST`.
- **Prompt language** (auditor's note on D5) — decided by the author: the model answers in the
  question's language (explain "Prompt and evidence ids", design D5).

Findings, all fixed in the change's artifacts:

| Finding | Resolution |
|---|---|
| B1 | graph-store: "Claims of another project are never returned (in-memory double)"; D12 seeding helper without ownership check; task 4.3 |
| B2 | explain: "An unknown project or an unindexed one fails without calling the model" (task 7.11); "Other write errors propagate" asserts no claim written |
| B3 | repository-indexing: the batch scenario now asserts `too-large` and `not-a-repository` too (task 9.4) |
| B4 | explain "Persistence failure": full shape (answer, prior claims, evidence, events); scenario asserts them (task 8.4) |
| B5 | graph-store: "Claim operations in an unknown project fail" (task 5.6) |
| B6 | explain: `evidence` is one entry per citation (stored) or per distinct prompt id in first-citation order (unsaved); scenario with two statements citing `E1`; design D5 |
| B7 | explain "Explain request": `projectId` string, non-object or extra field → `request`, closed `field` set; new scenario "A malformed request is rejected before the store" (task 7.4); design D4 |
| B8 | design D11: one statement from the `project` row with a LEFT JOIN of the matched claims |
| B9 | repository-indexing: commit checked first even with empty `paths`; scenario case added; design D10 |
| B10 | repository-indexing: only requested entries are checked; design D10 lists the tree without `-l` and runs `--batch-check` over the requested objects only |
| B11 | graph-store and design D7: well-formed project id checked first, then schemas, then equality, then ownership |
| M1 | explain: "A failed write over the database still answers without leaking" (integration, task 8.10) |
| M2 | task 5.4 and graph-store scenario split: no statement for the schema cases; nothing written and transaction usable for the foreign file |
| M3 | design D12 and task 9.2 name the doubles in `seed-build.spec.ts` and `index-command.spec.ts` |
| M4 | tasks 9.1/9.11 index inside a rolled-back transaction; `count(*) FROM project` in 0.4, 13.1, 13.5 |
| M5 | graph-store "Overlap is inclusive at both ends" (Postgres and double) has a claim on file `G` |
| §3 Major (empty inputs, order, connections) | graph-store "Empty inputs read and write nothing"; "The most recent claims come first, at most twenty" (also covers both connection modes) |
| §3 Minor U+0000 in evidence id | claims-and-typing NUL scenario has the evidence-id case |
| §4 ambiguity | "slow" replaced by the author reading the median (proposal, design D10, task 9.11); "acceptable" replaced by the cap (design Risks); logging wording; hash serialisation; over-budget fixture |
| §6 Minors | provenance wording (claims-and-typing); "nodes" → spans and process list (proposal); "stored under" (graph-store); task order (7.14 → 8.2) |
| §7 Minors | U+0000 Risk replaced by the citation of "Input hygiene before analysis"; `BudgetExhausted` / DIS-21 note and the `CHECK` exception in design Risks and task 16.1 |
| §8 Minors | `ClaimWriteFailed` mapping wraps `atomically` (D7); `z.uuid()` in D9; `clock_timestamp()` for the write instant (D7, D11 — needed so "most recent" is defined inside one transaction); pack tests assert both counters (task 9.10) |
| §9 task size | 7.2 split into 7.2/7.3; 9.9 split into 9.9/9.10 |
| §10 Minors | 14.1 conditional `db:seed` with restore; 13.4 mutates `knowledge/errors.ts`; 16.1 unconditional ADR index |

The auditor runs again over the corrected change; its verdict is appended below.

---

# Second pass — CHANGES REQUIRED

Spec audit, second pass, of `openspec/changes/explain-use-case/` (DIS-39, parent DIS-29),
2026-10-13, by the `spec-auditor` subagent. It loaded DIS-39 and DIS-29 from Linear with all their
comments, and took the "Tras la auditoría de especificación del change (2026-10-13)" decisions as
overriding the older lines of the ticket.

**Bottom line:** every first-pass finding is fixed as the Resolution table says, but four of those
fixes leave a gap: two blocking findings (N1, N2) and two Majors with no scenario (N3, N4), plus one
Major against the real code (N5).

## Questions for the author (optional)

- **N1.** With an empty list, should an unknown project still fail with `ProjectNotFound`? The auditor
  recommends yes (`neighbors` with no seeds still checks the project).
- **N2.** A failure to obtain a database connection: error (as the spec says) or `persisted: false`?
  The ticket says `persisted: false` only for a failure inside the write transaction, so it should stay
  an error; only the mechanism has to be pinned down.

## Part 1: first-pass findings

All fixed (B1–B11, M1–M5, §3–§10 Minors, Q1–Q5, prompt language), with these follow-on gaps: B5 → N1;
B6 → N4 (no scenario for `persisted: true`); B10 → N3 (no scenario); M1 → m8 (trigger wording); M4 →
m11 (project-name collision); §8 "wraps the whole `atomically` call" → N2.

## Part 2: fresh audit

### Blocking

- **N1. An unknown project with an empty list.** graph-store delta :24 and :104-105 resolve `[]`
  without a statement, and D7 returns `[]` after the id check only; that contradicts the main spec
  (openspec/specs/graph-store/spec.md:311-314, "never with an empty result … applies to every read
  that names a project"), StorePort.ts:16-18, the `neighbors` precedent (postgres-store.ts:179), and
  the delta's own :107. Fix: empty lists still run the project check (one `SELECT`).
- **N2. `ClaimWriteFailed` mapping vs "a failure to obtain a connection propagates unchanged".**
  `atomically` obtains the client inside itself (postgres-store.ts:51-52) and `pg` connect errors are
  not a distinct class, so a wrapper around `atomically` cannot tell them apart. Fix in D7: (a)
  `atomically` takes an error mapper applied only after `connect()` succeeds (or from the `SAVEPOINT`
  on a caller-owned transaction), or (b) `saveClaims` obtains the client itself; plus a scenario
  (ended pool → pg's own error), or drop the sentence.
- Empty traceability rows for N3 and N4.

### Major

- **N3.** repository-indexing :171-173 ("an entry elsewhere in the commit, even one whose object git
  cannot read, does not fail the call") has no scenario. Add "An unreadable object outside the batch
  does not fail it" (partial clone, `other.php` blob removed, `readFilesAt` of `a.php` resolves) and
  task 9.4b.
- **N4.** explain :202-203 (evidence list of a stored answer in statement then citation order) has no
  scenario. Add "The evidence of a stored answer lists every citation in order" (`E1`,`E2` and `E1` →
  three entries with distinct stored ids, in order E1, E2, E1).
- **N5.** Listing without `-l` breaks `parseTree` (git-source-tree.ts:199-221: `size` undefined,
  `missing` true for every entry) and `BatchAnswers` checks `${entry.oid} blob ${entry.size}` (:359).
  Fix in D10: a parser for the no-`-l` record (or a `sized: false` mode), sizes filled from the
  `--batch-check` answer before `readBlobs`.

### Minor

- §3: the double has no unknown-project or invalid-spans scenario (graph-store :111); add it to "Claim
  operations in an unknown project fail".
- §4: "invalid lines" (graph-store :106) → spans that `inputSpanSchema` rejects; process count wording
  (repository-indexing :177-178) → "at most six … one more only when git reports a damaged object".
- §5: error order inside a batch: a damaged requested object propagates git's error before the
  per-path reasons; state it in the spec and D10.
- §6: `buildPrompt(question, pack)` (D4) vs `buildPrompt(question, spans)` (D5); "missing question"
  scenario uses `null`, add a request without `question`; seed commit is "the last commit that touches
  a fingerprint input", not of the series.
- §7: compare project ids lower-cased (main spec :315-316, any letter case); project-context:680-681
  ("no writer exists yet") becomes false — `db:seed` now wipes stored claims; the evidence-lock Risk is
  wrong: `history-claims-constraints.spec.ts:84`, `graph-write.spec.ts:84`, `indexes-stale.spec.ts:72`,
  `seed-load.spec.ts:112` insert evidence and wait at most one test.
- §8: JSDoc of `InvalidStoreQuery` / `StoreQueryArgument` (errors.ts:53-56) now covers a write; the
  double's `createdAt` needs a strictly increasing stamp.
- §9: split 9.3 (parser + batch-check / `readFilesAt`); 8.1 borderline; "The subject…" tested on the
  pure `claim-items` mapping with hand-built spans (the method span is absorbed by the class on Q1).
- §10: 14.1 precondition `node fixtures/build-history.mjs acme-shop` when `fixtures/acme-shop/.git` is
  absent; **m11** 9.1/9.11 project-name collision with the committed `acme-shop` (unique name or delete
  inside the rolled-back transaction; delete the temporary copy in `finally`).
- **m8**: the 8.10 trigger raises on every `evidence` insert with a `DETAIL` quoting `NEW.excerpt` and
  a sentinel (the 5.3 trigger matches only the sentinel excerpt, which a real span never holds).

## Corrections to apply (second pass)

- graph-store: :24 and :104-105 rewritten per N1 and §4; :81-85 "only the project check was sent";
  :73-79 adds the empty list and the double; :20-23 connection clause with a scenario or deleted (N2).
- repository-indexing: scenario N3; damaged-object order (§5); process-count wording (§4).
- explain: scenario N4; request without `question`.
- design: D7 (empty list checks the project; lower-cased comparison; error mapper after connect), D10
  (parser, sizes from batch-check, damaged-object order), D11 (`inputSpanSchema`, empty list checks the
  project), D12 (monotonic `createdAt`), D4/D5 one `buildPrompt` signature, Risks (evidence lock), D13
  (m8 trigger).
- tasks: 3.1 JSDoc; 4.1/4.2 lower-case, monotonic stamp, unknown project and empty lists in the double;
  5.2/5.5/5.7 N1 and N2; 8.1 on `claim-items` + new N4 task; 8.10 m8 trigger; 9.1/9.11 m11; 9.3 split +
  9.4b; 12.4 wording; 14.1 fixture precondition; 16.3 `db:seed` note.
- proposal Impact: add the edited tests (`statement-schema.spec.ts`, `errors.spec.ts`,
  `index-repository.spec.ts`, `seed-build.spec.ts`, `index-command.spec.ts`).
- Linear: no description change needed; record N1/N2 under "Decisiones del propose" if the author
  answers them.

## Resolution (second pass, 2026-10-13)

The author accepted the auditor's recommendations for N1 and N2 (recorded in DIS-39 `[enhanced]`).

| Finding | Resolution |
|---|---|
| N1 | graph-store: an empty list (claims or spans) still runs the project check; an unknown project fails with `ProjectNotFound`; "Empty inputs read and write nothing" sends only the project check; "Claim operations in an unknown project fail" adds the empty list (task 5.6, 5.7); design D7, D11, D12 |
| N2 | design D7: `atomically` gains `mapWriteError`, applied only once the write has started (after `connect()` on a pool, from the `SAVEPOINT` on a caller-owned transaction); new scenario "A store that cannot give a connection fails with its own error" (task 5.5b) |
| N3 | repository-indexing: "An unreadable object outside the batch does not fail it" (task 9.4b) |
| N4 | explain: "The evidence of a stored answer lists every citation in order" (task 8.1b) |
| N5 | design D10: new parser for the unsized `ls-tree` record, `--batch-check` answer parsed and its sizes fed to `readBlobs`; task 9.3 split into 9.3 (parsers, unit) and 9.3b (`readFilesAt`) |
| §3 double | graph-store: "Unknown projects and invalid spans are rejected (in-memory double)" (task 4.4) |
| §4 | graph-store: invalid spans are those `inputSpanSchema` rejects (D11, task 5.12); repository-indexing: "at most six git processes … plus one only when git reports a damaged requested object" |
| §5 | repository-indexing and D10: a damaged requested object propagates git's error before any per-path reason |
| §6 | one `buildPrompt(question, spans)` signature (D4); "missing question" scenario adds a request without `question` (task 7.1); D14 and task 12.4: after the last commit that touches a fingerprint input |
| §7 | project ids compared lower-cased (graph-store, D7, D12, tasks 4.1, 5.2); `db:seed` note in task 16.3 and design Risks; evidence-lock Risk rewritten with the four files and `SET LOCAL lock_timeout` |
| §8 | JSDoc of `InvalidStoreQuery`/`StoreQueryArgument` (task 3.1); strictly increasing write stamp in the double (D12, task 4.1) |
| §9 | 9.3 split; 8.1 split into 8.1 (pure `claim-items` mapping with hand-built spans) and 8.1b (N4) |
| §10 | 14.1 precondition `node fixtures/build-history.mjs acme-shop`; m11: 9.1/9.11 use a unique project name and delete the temporary copy in `finally` |
| m8 | design D13 and task 8.10: a trigger on every `evidence` insert with `NEW.excerpt` and a sentinel in its `DETAIL`; the events hold no excerpt |
| Proposal Impact | edited tests listed |

The auditor runs a third pass; its verdict is appended below.

---

# Third pass — APPROVED

Spec audit, third pass, by the `spec-auditor` subagent (2026-10-13). It loaded DIS-39 and DIS-29
with all comments and took the post-audit decision blocks as overriding older ticket lines.

**Verdict: APPROVED.** No Blocker and no question for the author. Every second-pass finding (N1–N5,
m8, m11, §3–§10, proposal Impact) is resolved as the Resolution table says, and the fixes add no
contradiction (N2 checked against `atomically` in postgres-store.ts:50-80; N5 against
git-source-tree.ts:203-221 and :359; N1 against the main spec "Project lookup", :311-316).

One Major, recommended before the apply (it changes no decision):

- **M-A.** repository-indexing delta: "a requested regular file whose object git cannot read …
  propagates git's error, before any … per-path reason", and the extra process it costs, have no
  scenario. Add "A requested object git cannot read fails the batch with git's error" and task 9.4c.

Minors (none blocks the apply): m-1 task 7.8 asserts `calls.readFilesAt` before 9.2 creates it; task
8.2 should reference 8.1b; 5.6/5.7 test `findClaimsOverlapping` before 5.8 builds its statement; m-2
the empty-list project check runs outside `atomically`; m-3 `lock_timeout` has no value; m-4 the
double's write stamp vs seeded `createdAt`; m-5 no scenario for an upper-case `projectId`; m-6
per-path wording ("before any `missing` path, `too-large` or `binary-content` reason"); m-7 a failing
`SAVEPOINT` inside the mapped region hides a programming error; m-8 process count misses the two
simple-git processes of `assertRepositoryRoot`; prior-claims scenario does not assert evidence path
and lines; an item with no evidence is unspecified; proposal process list and Why miss the
second-pass items.

Traceability: every requirement has scenarios and every scenario exactly one task; the only gap was
M-A.

## Resolution (third pass, 2026-10-13)

All applied before the apply, without author decisions:

| Finding | Resolution |
|---|---|
| M-A | repository-indexing: "A requested object git cannot read fails the batch with git's error"; task 9.4c |
| m-1 | task 7.8 asserts `readFileAt` and `findClaimsOverlapping`; 9.10 adds `readFilesAt === 0` to it |
| 8.2 reference | "needs the store step of 8.1b" |
| 5.6/5.7 order | 5.6 GREEN creates `findClaimsOverlapping` with the project check only; 5.8 adds the subquery |
| m-2 | design D7: the empty-list check runs `SELECT_PROJECT` through `runProjectQuery`, outside `atomically` |
| m-3 | `SET LOCAL lock_timeout = '10s'`, with its reason, in D13, Risks and tasks 5.3, 8.10 |
| m-4 | design D12: the write stamp starts after the latest seeded `createdAt` |
| m-5 | graph-store "The claims of an answer are written with their evidence": upper-case `projectId` also succeeds |
| m-6 | repository-indexing wording: "before any `missing` path, `too-large` or `binary-content` reason" |
| m-7 | design D7: the mapped region starts after a successful `SAVEPOINT`; a failing `SAVEPOINT` (`25P01`, `25P02`) propagates unchanged |
| m-8 | design D10 and task 9.1: spawned processes plus 2 per `assertRepositoryRoot` call |
| Prior-claims evidence | explain scenario asserts path `app/Services/PriceCalculator.php` and lines 25–35 |
| Item with no evidence | graph-store and D7: rejected with `InvalidStoreQuery` naming `claims` before any statement (explain never sends one) |
| Proposal | process list adds the damaged-object process; Why adds the two second-pass decisions |

The change is approved for the apply (docs/base-standards.md §7.1, step 4).
