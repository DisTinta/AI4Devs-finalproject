APPROVED

# Spec audit — golden-cache-build (DIS-26, parent DIS-16)

- Date: 2026-10-17
- Auditor: the `spec-auditor` checklist (`ai-specs/agents/spec-auditor.md`), applied read-only by the
  agent of this autonomous step: no subagent tool was available in this session, so the audit was run
  inline as a separate pass over the committed artifacts (commit `3f54472`), the Linear sub-issue
  DIS-26 and its parent DIS-16 (with comments: none), `docs/project-context.md`,
  `docs/backend-standards.md`, the main specs `seed-load`, `seed-build`, `answer-cache`, `http-ask`,
  and the code the design cites.
- The first line is the verdict of the latest run.

## Run 1

Verdict: CHANGES REQUIRED

**Questions for the author:** none. In the autonomous run (ADR
`20261016-autonomous-workflow-run-entrega-2`) the agent decides as lead engineer and records the
decision in the DIS-26 `[enhanced]` description; D1–D17 are treated as delegated decisions.

### 1. Scope against the ticket

Clean. Everything follows from DIS-26 and D1–D14 plus the amendments: the command, the format, the
fingerprint, the `db:seed` loading, the real run. Two support items are justified by the ticket: the
seed rebuild (D15, a precondition of a fresh golden file; fixable in this change) and the
unsafe-content check (the `[enhanced]` security bullet). Non-goals match DIS-26 (DIS-34 review,
DIS-44 verify, task-api, Q2/Q5/Q6, no core or adapter change).

### 2. Inherited acceptance criteria

| Source AC | Requirement → scenario | Status |
|---|---|---|
| DIS-16 AC1: evaluation hit with case variant, `cacheHit`, `costUsd 0`, `hit_count` +1 (golden part) | seed-load "Golden answers are loaded with the seed" → "Golden answers are loaded and served in evaluation mode" | covered |
| DIS-16 AC3: fingerprint checked by `verify` | — (DIS-44) | out of scope, correct |
| DIS-26 AC generation | golden-answers "How a golden answer is produced" → "The golden answers are generated with a scripted model" | covered |
| DIS-26 AC retry + failure, including "una pregunta que responde `no-anchor`" | "An invalid model output is retried", "A question without a cacheable answer fails without writing" | **hole: no scenario for `no-anchor` (nor `over-budget`, nor a non-retried model failure)** — blocking (F1) |
| DIS-26 AC configuration | "Missing or invalid cache build configuration…", "Unreachable services…" | covered, but see F12 |
| DIS-26 AC partial regeneration | "Only the named question is regenerated", "A stale golden file is not partially regenerated", "An unknown or repeated question id…" | covered |
| DIS-26 AC `db:seed` load + evaluation answer + malformed golden ("JSON roto, response rechazada, questionNormalized distinta, **clave repetida**, proyecto ausente") | seed-load "An invalid golden file fails before connecting", "Golden answers are loaded and served…", "Loading golden answers again…" | **hole: a repeated `questionNormalized` under different ids is not in the scenario** — blocking (F6) |

### 3. Missing scenarios

- **F2 (blocking)** — golden-answers "Cache build command contract and configuration": the MUST
  clauses "`LLM_TIMEOUT_MS` SHALL NOT limit the build's requests" and "`DAILY_BUDGET_USD` SHALL NOT be
  applied" have no scenario. Add one that checks the model client gets `CACHE_BUILD_TIMEOUT_MS` (or
  its default) and the build's request function whatever `LLM_TIMEOUT_MS` says, and that a spent
  daily ceiling does not stop the build.
- **F3 (blocking)** — golden-answers "How a golden answer is produced": `PROJECT_NAME_TAKEN` for a
  non-sample `acme-shop` has no scenario.
- **F4 (blocking)** — golden-answers "The seed the answers are built on is current": "check it as
  `db:seed` does" (→ `INVALID_SEED`) has no scenario.
- **F5 (blocking)** — seed-load "Command contract and configuration": "a missing or empty directory
  means no golden answers", "only `.json` files directly in the directory" and "the fingerprints of a
  golden file SHALL NOT be checked" have no scenario.
- **F14 (improvable)** — "every connection SHALL be closed" (golden-answers, "How a golden answer is
  produced"): the scripted-model and failure scenarios should state that each attempt's transaction is
  rolled back and released.

### 4. Ambiguity

Clean: no "fast", "easy", "secure", "efficient", "many", "appropriate" or "robust" (the only "many"
is the unchanged "as many as the seed's `INSERT`s" of the existing seed-load scenario).

### 5. Open decisions

- **F7 (blocking)** — the golden file's directory: `seeds/cache/` does not exist today, so the first
  real run would fail its atomic write (`INTERNAL`). Decide that the build creates the directory, with
  a scenario.
- **F8 (blocking)** — progress lines: the spec prints `not cacheable` only "for an attempt that is
  retried", but the timeout scenario stops after the third attempt with two lines; it is undecided
  whether the last failed attempt, or a failure that is never retried (`no-anchor`,
  `unsafe-content`), prints a line. Decide one rule and align the scenarios.
- **F9 (blocking)** — partial regeneration over an existing file that holds an entry whose id is not
  a golden question, or that lacks a golden question: undecided what is kept and in which order.
- **F10 (blocking)** — the unsafe-content check compares "the JSON text" with "the repository's
  absolute path": on Windows the path is written in JSON with escaped backslashes and would never
  match; `LLM_API_KEY` and the workspace root (design C5) are not in the spec's list. Decide the exact
  strings.

### 6. Contradictions inside the change

- **F13 (blocking)** — DIS-26 `[enhanced]` D5 says "el coste total se imprime en la línea final"; the
  spec's final line (D8 format) has no cost. Decide and record.
- **F15 (improvable)** — design C9 lists the unit scenarios as "configuration, usage and
  stale-golden", while tasks 6.3 also put "A failed write leaves the previous golden file intact" in
  the unit file. Align.
- **F16 (improvable)** — the proposal's Why lists the amendments D12, D15, D16, D17 but not D11.

### 7. Contradictions with the project

- Clean on `seed-load` (MODIFIED blocks copied whole; the reload-ids clause is amended, not dropped),
  `seed-build` (no seed fingerprint input is edited: C5/C6 keep `seed-build.ts`, `compose-index.ts`,
  `packages/cli/src/seed/` and `packages/adapters/store-postgres/src/` untouched), `answer-cache`
  (reused, unchanged), `docs/openspec-tasks-mandatory-steps.md` (PR and merge by the agent cited
  through the autonomous-run ADR).
- **F17 (improvable)** — `http-ask` main spec, "Evaluation mode answers UNKNOWN llm-required over the
  seed" and "A spent daily budget stops the model over the seed" load `seeds/graph-dump.sql` only;
  after this change `db:seed` would serve the same question from the cache. No delta is needed (they
  load the seed file, not `db:seed`), but design C6 should say so explicitly so the archive and the
  verification do not read it as a contradiction.

### 8. Contrast with the real code

- **F11 (blocking)** — design C5 maps `PROJECT_NAME_TAKEN` "as `ask` maps it", but `toFailure` of
  `packages/cli/src/commands/ask.ts:277-316` has no `ProjectNameTaken` branch: the build would report
  `INTERNAL`. The mapping must be the one of `packages/cli/src/seed-load.ts` (`toFailure`, message
  `a project named "<name>" already exists and is not a sample`, `details.name`).
- **F12 (blocking)** — the scenario "Unreachable services are reported without their URLs" sets
  `LLM_BASE_URL=http://k3y@127.0.0.1:1/v1`; `isHttpUrl` rejects any URL with a user name
  (`packages/adapters/llm/src/config.ts:141`), so the run fails with `LLM_CONFIG_INVALID` before the
  database is tried and the scenario cannot hold as written. Put the secret in `LLM_API_KEY`.
- **F18 (improvable)** — the integration test pre-builds the history in `beforeAll`; with the
  default `buildHistory` every test would rebuild it again (many git processes per test). Design C9
  should pass a no-op `buildHistory` seam after the one build.
- Checked and consistent: `createLlm(config, { fetch })` (`create-llm.ts:15`), `displayPath` exported
  (`seed-build.ts`), `toFailure` exported (`ask.ts:277`), `seedProjects` gives the seed's ids
  (`parse-seed.ts`), `saveCacheEntry` on a caller transaction uses a savepoint, `createScriptedLlm`
  takes a `mode` (`tests/support/scripted-llm.ts:101`), `AppDeps` (`packages/api/src/app.ts:15`).

### 9. Task size

- **F19 (improvable)** — task 7.2 (the whole per-question loop, classification, render, write and
  lines) is more than one turn. Split into the transaction/explain/rollback loop and the
  render/write/output lines.
- The real run (9.3) is long in wall time but one background command polled from one turn.

### 10. Mandatory steps

Clean: step 0 is the branch; "Review and Update Existing Tests", "Run Tests and Verify Data State",
"Manual Interface Testing (AGENT MUST EXECUTE)" with state restoration (13.7), "End-to-End Testing"
with its not-applicable record, "Update Technical Documentation" and "Pre-merge Review" last, all
present and labelled; the mutating steps (1, 9, 13) record and restore the data indicators.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| golden-answers: Cache build command contract and configuration | Missing or invalid cache build configuration… | 6.1–6.2 |
| | An unknown or repeated question id is a usage error | 6.3 |
| | Unreachable services are reported without their URLs | 7.4 |
| | A slow model answer within the build's limit is kept | 5.1–5.2 |
| | **(none for the timeout/ceiling clauses — F2)** | — |
| golden-answers: Golden questions | The golden questions match the demo-question table | 2.1–2.2 |
| golden-answers: The seed the answers are built on is current | A seed older than the code is refused | 7.4 |
| golden-answers: How a golden answer is produced | The golden answers are generated with a scripted model | 7.1–7.2 |
| golden-answers: Retries and failures of a golden answer | An invalid model output is retried; A question without a cacheable answer…; A model that keeps timing out… | 7.3 |
| | **(none for `no-anchor` / `over-budget` / other model failures — F1)** | — |
| golden-answers: Partial regeneration | Only the named question is regenerated; A stale golden file is not partially regenerated | 7.4, 6.3 |
| golden-answers: Golden file format | The canonical render is stable; Golden files with an invalid shape are rejected | 3.3–3.5 |
| golden-answers: Golden answer fingerprint | The answer fingerprint covers exactly its declared inputs | 4.1–4.2 |
| golden-answers: A failed build never leaves a broken golden file | A failed write leaves the previous golden file intact | 6.3 |
| golden-answers: The versioned golden file is coherent | The versioned golden file matches… | 9.1, 9.5 |
| seed-load: Command contract and configuration | Missing database configuration…; An invalid seed file…; An unreachable database… (existing) | existing tests (8.4) |
| | An invalid golden file fails before connecting | 8.1–8.2 |
| seed-load: Sample projects are loaded idempotently | The seed is loaded into an empty database; Loading again changes nothing… (existing) | 8.4 |
| seed-load: Golden answers are loaded with the seed | Golden answers are loaded and served…; Loading golden answers again…; A failed golden save… | 8.3 |

Empty rows (blocking): F1, F2.

### Corrections to apply

- `specs/golden-answers/spec.md`:
  - "Cache build command contract and configuration": one progress-line rule (F8); the unsafe-content
    strings move to "Retries and failures" (F10); final line without cost (F13); new scenario for the
    request limit and the daily ceiling (F2); "Unreachable services…" with `LLM_API_KEY=k3y` (F12).
  - "How a golden answer is produced": the build creates the golden file's directory (F7) and the
    scripted-model scenario writes into a directory that does not exist yet; each attempt's
    transaction rolled back and released (F14); new scenario "A non-sample acme-shop blocks the
    cache build" (F3).
  - "The seed the answers are built on is current": the refused-seed scenario also covers a missing
    seed (`INVALID_SEED` `missing`) (F4).
  - "Retries and failures of a golden answer": exact unsafe strings (F10); new scenario "Answers that
    cannot become golden fail at once" (`no-anchor`, `over-budget`, an `http-status` model failure)
    (F1); the timeout scenario prints three lines (F8).
  - "Partial regeneration": an existing entry whose id is not a golden question → `invalid`; a golden
    question missing from the file and not named stays missing; entries in golden order (F9); the
    regeneration scenario also runs without arguments and checks every `reviews` is empty.
- `specs/seed-load/spec.md`: the invalid-golden scenario adds a repeated `questionNormalized` (F6);
  new scenario "A seed without golden files loads only the graph" (missing directory, a non-`.json`
  file and a subdirectory ignored) and the served scenario uses a golden file whose fingerprints are
  not the current ones (F5).
- `design.md`: C5 error mapping (F11), unsafe strings (F10), directory creation (F7), progress rule
  (F8), partial rule (F9), cost (F13); C6 note on the `http-ask` seed scenarios (F17); C9 unit list
  (F15), no-op `buildHistory` (F18).
- `proposal.md`: Why lists D11 (F16).
- `tasks.md`: split 7.2 (F19); new scenarios placed in 6.3, 7.4, 8.1, 8.3.
- Linear DIS-26 `[enhanced]` (Spanish, outside `[original]`): record the decisions of F7, F8, F9,
  F10, F11 and F13.

### Resolution of run 1

All corrections were applied with `/opsx:update` to `proposal.md`, both delta specs, `design.md` and
`tasks.md`; the decisions were recorded in the DIS-26 `[enhanced]` description ("Decisiones de la
auditoría de especificación"), in Spanish and outside `[original]`.

| Finding | Resolution |
|---|---|
| F1 | New scenario "Answers that cannot become golden fail at once" (`no-anchor`, `over-budget`, `http-status`); task 7.3 (unit, `explain` double) |
| F2 | New scenario "The build's request limit applies and the daily ceiling does not"; task 6.3 |
| F3 | New scenario "A non-sample acme-shop blocks the cache build"; task 7.4 |
| F4 | "A missing or outdated seed is refused" now starts with a missing seed (`INVALID_SEED` `missing`); task 7.4 |
| F5 | New seed-load scenario "A seed without golden files loads only the graph" (missing dir, empty dir, non-`.json` file, subdirectory); the served scenario uses a golden file with non-current fingerprints; task 8.3 |
| F6 | The invalid-golden scenario adds two entries with different ids and the same `questionNormalized` |
| F7 | Decided: the build creates the golden file's directory and its parents; requirement text, scripted scenario ("a temporary directory that does not exist yet"), design C5 step 7, proposal |
| F8 | Decided: one line per attempt that ends with an answer or a failed model request, retried or not; non-attempt failures print none; scenarios list the exact lines; design C5 |
| F9 | Decided: an existing entry whose id is not a golden question → `invalid`; the new file holds the unnamed existing entries plus the regenerated ones in golden order; a missing, unnamed question stays missing; scenario adds `Q7` and the no-argument rerun |
| F10 | Decided: JSON text checked against the AKIA pattern and, as written and JSON-escaped, the absolute repository and workspace roots, `DATABASE_URL`, `LLM_BASE_URL` and `LLM_API_KEY` when set; requirement text and design C5 |
| F11 | Design C5: `ProjectNameTaken` mapped as `seed-load.ts` maps it; the rest through `ask`'s `toFailure` |
| F12 | Scenario uses `LLM_BASE_URL=http://127.0.0.1:1/v1` and `LLM_API_KEY=k3y` |
| F13 | Decided (D5 amended): no cost in the final line; each entry's `usage.costUsd` records it; design C5, proposal Why |
| F14 | Scripted scenario: each question's transaction rolled back and released |
| F15 | Design C9 lists every unit scenario of `cache-build.spec.ts` |
| F16 | Proposal Why lists D5 and D11 too |
| F17 | Design C6 states why the `http-ask` seed scenarios need no delta |
| F18 | Design C9: no-op `buildHistory` after the one build in `beforeAll` |
| F19 | Task 7.2 split into 7.2a (attempt loop) and 7.2b (render, directory, write, lines) |

## Run 2

Verdict: APPROVED

Re-read of the whole change after the corrections (proposal, both deltas, design, tasks), against the
same inputs. `openspec validate golden-cache-build --strict` passes.

1. Scope — clean, unchanged.
2. Inherited acceptance criteria — every DIS-26 `[enhanced]` criterion and DIS-16 AC1 now map to a
   scenario (`no-anchor` → "Answers that cannot become golden fail at once"; repeated key → "An
   invalid golden file fails before connecting").
3. Missing scenarios — none: every MUST clause of both deltas has a scenario (the request limit and
   the ceiling, `PROJECT_NAME_TAKEN`, `INVALID_SEED`, the cache directory rules, the unchecked
   fingerprints, connections released).
4. Ambiguity — clean.
5. Open decisions — none left: directory creation, progress lines, partial-regeneration contents,
   unsafe strings and the final line are fixed in the spec and the design. The `seed-load` wording
   "not valid UTF-8 JSON" was narrowed to "not valid JSON" (no untestable clause).
6. Contradictions inside the change — none: the proposal, the design (C5–C9) and the tasks name the
   same scenarios, files and seams.
7. Contradictions with the project — none; the `http-ask` seed scenarios are explained in C6.
8. Contrast with the real code — the error mapping now matches `ask.ts:277-316` and `seed-load.ts`;
   the LLM URL of the unreachable scenario passes `isHttpUrl`.
9. Task size — 7.2 split; the rest fit one turn.
10. Mandatory steps — clean.
11. Traceability — complete:

| Requirement | Scenarios | Task(s) |
|---|---|---|
| golden-answers: Cache build command contract and configuration | Missing or invalid…; An unknown or repeated question id…; Unreachable services…; The build's request limit applies and the daily ceiling does not; A slow model answer within the build's limit is kept | 6.1–6.3, 7.4, 5.1–5.2 |
| golden-answers: Golden questions | The golden questions match the demo-question table | 2.1–2.2 |
| golden-answers: The seed the answers are built on is current | A missing or outdated seed is refused | 7.4 |
| golden-answers: How a golden answer is produced | The golden answers are generated with a scripted model; A non-sample acme-shop blocks the cache build | 7.1–7.2b, 7.4 |
| golden-answers: Retries and failures of a golden answer | An invalid model output is retried; A question without a cacheable answer…; Answers that cannot become golden fail at once; A model that keeps timing out… | 7.3 |
| golden-answers: Partial regeneration | Only the named question is regenerated; A stale golden file is not partially regenerated | 7.4, 6.3 |
| golden-answers: Golden file format | The canonical render is stable; Golden files with an invalid shape are rejected | 3.3–3.5 |
| golden-answers: Golden answer fingerprint | The answer fingerprint covers exactly its declared inputs | 4.1–4.2 |
| golden-answers: A failed build never leaves a broken golden file | A failed write leaves the previous golden file intact | 6.3 |
| golden-answers: The versioned golden file is coherent | The versioned golden file matches… | 9.1, 9.5 |
| seed-load: Command contract and configuration | three existing scenarios; An invalid golden file fails before connecting | 8.4, 8.1–8.2 |
| seed-load: Sample projects are loaded idempotently | two existing scenarios | 8.4 |
| seed-load: Golden answers are loaded with the seed | Golden answers are loaded and served…; A seed without golden files loads only the graph; Loading golden answers again…; A failed golden save… | 8.3 |

No blocking finding. The change may start the apply.

## Addendum — 2026-10-17, pre-merge review (`/opsx:update`)

`/verify-against-spec` (report `2026-10-17-verify-against-spec.md`, finding V2) found one behaviour
the spec did not name: `cache:build` refuses, as `GOLDEN_STALE` `seed`, a seed that holds no
`acme-shop` project row or whose row has no `indexed_commit` (`packages/cli/src/cache-build.ts`, in
`prepare`, before the history is rebuilt). Agent decision (unattended run, ADR
`20261016-autonomous-workflow-run-entrega-2`): keep the behaviour and write it down, because without
that row there is no commit to compare the rebuilt sample against, so the seed cannot be shown to be
current, and refusing it fails closed before any connection or model call.

- `specs/golden-answers/spec.md` → "The seed the answers are built on is current": one sentence
  added; no scenario changed (the behaviour is already covered by the plain unit test
  "refuses a seed whose header or project row does not match the current code and sample" of
  `tests/unit/cli/cache-build.spec.ts`).
- `design.md` → C5 step 5: the same rule, with its origin.
- Re-check of this audit's points 1, 4, 6 and 11 for the edited requirement: still clean; the
  traceability row is unchanged (scenario "A missing or outdated seed is refused", task 7.4).
