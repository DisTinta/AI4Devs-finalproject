CHANGES REQUIRED

**Questions for the author** (the sub-issue and the parent disagree; the auditor does not settle these)

- **Q1. «Correctas (de 20)» stays pending.** Parent DIS-53, AC 3: "Dado el CSV revisado por la autora, entonces `readme.md` §2.6 muestra Tabla 1 y Tabla 2 sin *(pendiente)*". DIS-81 (enhanced D7, design P7) leaves that column as `pendiente de DIS-82`. The DoD of the sub-issue only says "Tabla 1 rellena". Is a partly filled Table 1 acceptable as the DoD of DIS-81, with DIS-82 finishing it?
- **Q2. Cost ratio.** Parent AC 3 asks for the "ratio de coste de verificación sobre el total (PH-27)". With Ollama the change publishes `n/a (0 USD con Ollama local)` and uses token and latency shares in its place (D5). Hosted or paid models are a non-goal (P14). Does that satisfy PH-27, or should a priced estimate (tokens × a reference price table) be published?
- **Q3. Partial outputs on failure.** DIS-81 AC 5 says "sale con código 1 sin escribir salidas parciales". The change keeps raw responses on disk when it stops (D7, so a run can resume) and only withholds CSV, JSON and `answers/`. Is "salidas" meant as the final outputs only? If yes, the ticket's enhanced part should say so.
- **Q4. Who reviews the CSV.** Parent AC 3 has the CSV "revisado por la autora". The no-author-work rule and the DIS-53 comment of 2026-10-28 point to agent review (DIS-82). Please confirm that the parent's wording no longer applies to Table 1.

---

## 1. Scope against the ticket

Clean, with two notes (improvable).

- Everything in the change follows from DIS-81 (enhanced, D1–D8) or from the Entrega 1 review note moved onto DIS-81 as a comment ("Medir el verificador", design D13 / P13).
- Additions beyond the sub-issue:
  - `verifyCostUsd` CSV column (D5);
  - resumable raw evidence under `docs/measurements/context/raw/` (D7);
  - hash check of the sample files against `content_hash` (D6);
  - `expected` per question (D1);
  - `formatVersion` in every file;
  - the `graph-quality` MODIFIED delta (D14).

  Each one is justified by an acceptance criterion or by a test constraint. None widens the change to the parent's Table 2. No invented scope to cut.
- *Improvable:* the proposal's "Report and README" item also edits "the `scripts/` line of the tree" of `readme.md`. The ticket does not ask for it. It is harmless, but list it in the ticket's enhanced part so the scope stays traceable.

## 2. Inherited acceptance criteria

- DIS-81 AC 1 → "Asking each question" and "Measurement outputs". Covered.
- AC 2 → "Aggregation rules". Covered.
- AC 3 → "Tokenizer deviation sample". Covered; the redacted files are excluded per P6.
- AC 4 → "Freeze check before measuring". Covered.
- AC 5 → "Live environment check", "Asking each question" and "Measurement CLI". Covered.
- DoD: "Tabla 1 rellena; CSV versionado; párrafo de limitaciones con PH-16 y PH-27" → "Published Table 1" and "Committed measurement matches the raw data".
- Parent DIS-53 AC 2 (CSV with input, baseline and savings per question, no correctness column) → covered.

**B6 — blocking. Parent AC 3 limitations are only partly inherited.** The parent's AC 3 lists these limitations: one run, the annotation, small repositories, estimated `baselineTokens` with its deviation (PH-16), and the verification ratio (PH-27). The change rewrites the shared paragraph «Limitaciones a declarar junto a las tablas» (`readme.md:901`). But "Published Table 1" only requires it to name: agent-written frozen questions, one run, the local 7.6B model, PH-16 and PH-27.

Two items have no requirement and no scenario:

- "repositorios de muestra pequeños";
- the Table 2 annotation sentence (two independent agents of different models, decision recorded on DIS-53 / DIS-80).

No test protects either one: `tests/unit/docs/graph-quality.spec.ts` does not read that paragraph. A rewrite can drop them silently. Correction: add both to the requirement and to the scenario "The README limitations and verifier row are current" (see Corrections).

The disagreements between parent and sub-issue (pending «Correctas», cost ratio, author review) are listed as Q1, Q2 and Q4.

## 3. Missing scenarios

These MUST clauses have no scenario (tasks test some of them, but the spec does not pin them). All improvable:

- **"Live environment check":**
  - `LLM_BASE_URL` unset (task 4.1 tests it);
  - `GET /api/version` failing;
  - the first-run write of `raw/run.json` (task 4.2);
  - "No output SHALL contain the value of `LLM_BASE_URL`, `LLM_API_KEY`…" (task 4.1 asserts stderr only, not stdout or the files).
- **"Asking each question":**
  - a non-`200` status;
  - an unreadable or non-JSON body;
  - an answered body missing a usage field;
  - a stale raw response whose `question` differs (tasks 5.2 and 5.4 test these without a spec scenario).
- **"Tokenizer deviation sample":** a failed or malformed `/api/generate` answer, and an unreadable sample file.
- **"Aggregation rules":**
  - the median rule;
  - the count under 10 000 ms;
  - the largest `verification.calls`;
  - `null` on a zero denominator.

  These are the measurements that close the Entrega 1 review note (D13), and none has a scenario. Add one: "Verifier latency and calls of three answered rows", with fixed `latencyMs`, `verification.latencyMs` and `verification.calls` and the expected `medianMs`, `verifyMedianMs`, `under10s` and `maxCallsPerAnswer`.
- **"Measurement CLI":** the stdout progress lines and the per-project summary line format (task 6.3 checks the summary only).
- **"Published Table 1":** "Its caption SHALL NOT say `revisión manual`" is not checked by either README scenario.
- **"Savings of two answered rows":** the GIVEN gives no `outputTokens` and no verification output. So "the verification token share equals the formula over those rows" pins no value. Add output tokens (for example 300 and 200, with 100 and 50 of verification) and the expected share `(1 000 + 500 + 100 + 50) / (7 000 + 500) = 0.22`.

## 4. Ambiguity

None of the listed words (fast, easy, secure, efficient, many, appropriate, robust) appears. Related findings, all improvable:

- `spec.md` → Purpose, line 4, and `proposal.md` line 5 say "about 20 frozen questions". The requirement says exactly 20. Write "20".
- `proposal.md` line 28, "several minutes per question": write "5–10 minutes per question measured on this machine (598 s, DIS-42)", as design Context does.
- "Measurement report" → `## Entorno`, "the hardware class": the test cannot check it. Write "whether Ollama ran on CPU or GPU, and the CPU or GPU model name".

## 5. Open decisions

**B1 — blocking. The API's verification cache is not bypassed and is not measured.**

- `packages/api/src/routes/ask.ts:130` creates one `createInMemoryVerificationCache()` per API process.
- `packages/core/src/verify/semantic.ts:77-81` answers pairs from it without a call and without tokens.
- `useCache: false` only skips the *answer* cache (`packages/core/src/explain/explain.ts:321`).

Across 40 questions in one API process, a repeated (statement, path, lines, excerpt) pair is verified once, so later answers report fewer verification tokens, latency and calls. After a resume with a restarted API the cache is empty again. The published PH-27 share then depends on question order and on how many restarts happened.

The change neither records `usage.verification.cacheHits` (it has no CSV column and no JSON field) nor decides what a hit means. Decide it in design D3 and in "Asking each question". Either:

- (a) record `verifyCacheHits` per row and per project, and declare in the report and README limitations that a cached verification costs 0 tokens; or
- (b) treat `verification.cacheHits > 0` as an abort.

Add a scenario for the chosen rule.

**B2 — blocking. Where the script gets the golden texts.**

- "The question set" requires each project to hold "the exact texts of its golden questions (`packages/cli/src/cache/demo-questions.ts`)", and makes any other shape an exit 1 of the command.
- The script cannot import that TypeScript file: design Context cites `tests/unit/scripts/wiring.spec.ts`, which allows only `node:` and sibling `.mjs` imports.
- Task 7.1 names "the golden table of `fixtures/README.md`".
- The test copy of task 2.1 holds neither file.

Fix, in the requirement and in design D8: either

- the CLI shape check excludes the golden rule, and only `tests/unit/docs/context-savings.spec.ts` checks it against `GOLDEN_PROJECTS`; or
- the CLI reads `fixtures/README.md` with a stated parsing rule, and the test copy includes it.

**B3 — blocking. Rounding and formatting source of the JSON ratios.**

- D10 says the ratios are "rounded to four decimals half up … (the `roundRatio` formula of `annotation-agreement.mjs`)".
- That `roundRatio` (`scripts/annotation-agreement.mjs:274-278`) rounds half *away from zero*, which differs from "half up" for the negative deviations this change publishes (for example `-25,0 %`).
- The spec never states the JSON precision at all.
- D11 says the README percentages are formatted "from the integers". But the JSON layout of D10 holds no Σ `latencyMs` (only `verification.latencyMs` and the medians) and no per-file integers for `tokenizer.min` and `tokenizer.max` (only `{ file, deviation }`).

So the latency share and the min/max deviations can only be formatted from an already-rounded ratio. That is a double rounding: 0.88349 → 0.8835 → `88,4 %` instead of `88,3 %`.

Fix in "Aggregation rules" and D10:

- add `latencyMs` (the Σ) to each project;
- add `estimated` and `provider` to `min` and `max`;
- state "ratios in the JSON are rounded to four decimals half away from zero from the integer numerator and denominator (as `graph-quality` → 'Measures per project'); every README and report figure is formatted from the integers, never from a rounded ratio".

**B4 — blocking. Empty and boundary cases of the aggregates.**

- (a) «Ahorro» is defined both "as the product's `savingsPct`", which returns `0` when the baseline is 0 (`packages/core/src/explain/usage.ts:19`), and by "a ratio with a zero denominator is `null`". Pick one and state it. Recommended: `null`, published `no definido`, since a project with no answered row has no savings.
- (b) The median "`⌈n/2⌉`-th smallest" is undefined for n = 0. State `null`.
- (c) "the number of answers under 10 000 ms": state strictly `< 10 000` or `≤ 10 000`.
- (d) `verifyMedianMs` (D10) is not defined in the spec. State it as the `⌈n/2⌉`-th smallest `verification.latencyMs` of the answered rows.

Fix in "Aggregation rules" and in the new scenario of point 3.

**B5 — blocking. Missing-input error cases of the live check and the seed.**

- `LLM_MODEL` unset or blank: the spec compares it with `/api/tags` and records it, but says nothing about an empty value. State: exit 1, one stderr line naming `LLM_MODEL`, before `GET /health`.
- A fixture (`acme-shop` or `task-api`) with no `project` row in `seeds/graph-dump.sql`: no rule is given. State: exit 1 naming the fixture and `seeds/graph-dump.sql`, before any request, as `graph-quality` → "A project of the annotations is not in the seed".
- A seed that cannot be read or holds a malformed `file` line: `readSeed` throws `seeds/graph-dump.sql:<line>: …`. State that this message goes to stderr with exit 1.

Fix in "Live environment check" and "Tokenizer deviation sample", with one scenario each, or a combined scenario.

*Improvable:* the stderr line of "The API does not answer" says "the API is not reachable". Pin the text, for example `measure:context: the API is not reachable at http://127.0.0.1:<port> (start it with npm run up)`, as in `scripts/demo-ask.mjs:155`.

## 6. Contradictions inside the change

- **B3** (above): D10 "half up" against the cited `roundRatio`, which rounds half away from zero.
- **B2** (above): the spec names `demo-questions.ts` as the golden source, task 7.1 names `fixtures/README.md`, and design Context says the script cannot import TypeScript.
- *Improvable:* "Freeze check before measuring" says "before reading any other input", but D8 loads `.env` and parses arguments first. Write "after the arguments and `.env`, and before reading any other input".
- *Improvable:* the scenario "A frozen question file was modified" says "nothing was written under `docs/measurements/context/` of the copy", but `questions.json` lives there; task 2.3 adds "but `questions.json`". Write "no file under `docs/measurements/context/` other than `questions.json` exists or changed".
- *Improvable:* the scenario "The answer files are blind" requires that "no key or value names the model, tokens, cost, latency, confidence or the cache". Task 6.2 tests keys (`usage`, `confidence`, `events`, `cacheHit`) and the model name only. On real answers a value can legitimately hold the word "token" or "cache", for example an authentication question about `task-api`. Align the spec with the task: "no key `usage`, `confidence`, `cacheHit` or `model`, and no value equal to or containing the model name".
- *Improvable:* the ticket's AC 1 column list lacks `verifyCostUsd`, which the spec adds (D5 documents it). Record it in the ticket's enhanced part.

## 7. Contradictions with the project

- The `graph-quality` delta properly replaces the last sentence of `openspec/specs/graph-quality/spec.md` → "Published Table 2". The original requires "the pending state of Table 1 SHALL be stated in that paragraph only through a sentence naming `DIS-81`". `tests/unit/docs/graph-quality.spec.ts:107-111` only checks `npm run measure:graph`, `DIS-81` and the two negatives, so it stays green. Consistent.
- `docs/project-context.md` → branch conventions (base `final-project-CRN`, `feature/DIS-n-slug`): task 0.1 matches.
- `docs/project-context.md` → Tracking deferred findings: P1–P15 carry A, B or D; none is C. Consistent.
- The live run's restoration through `npm run db:seed` matches `docs/project-context.md:266-270`: db:seed replaces the sample projects and reloads `seeds/cache/*.json`.
- Clean otherwise: no main spec duplicated, and no ADR contradicted (the autonomous merge gate in 13.9 follows the autonomous-run ADR).

## 8. Contrast with the real code

- **B1** (above): `packages/api/src/routes/ask.ts:130` and `packages/core/src/verify/semantic.ts:77-81`.
- *Improvable:* D10 drops `events` from the answer files, but `askAnsweredSchema` (`packages/api/src/schemas/ask.ts:86-107`) has no `events` key. Remove the word, or say which body carries it.
- *Improvable, pattern duplication:* `roundRatio` exists twice already (`scripts/annotation-agreement.mjs:274`, `scripts/measure-graph.mjs:309`), both unexported, and D10 asks for "the `roundRatio` formula" a third time. Since D9 already exports helpers, export one `roundRatio` (for example from `annotation-agreement.mjs`) and import it, or state that a third copy is deliberate.
- *Improvable:* answer files copy `statements` from the body, which includes each statement's `verification` (`entailed`/`cited`, `packages/api/src/schemas/ask.ts:91`) and `type`. DIS-82 hides only the model and tokens, but showing reviewers the verifier's verdict may anchor their judgement. State in D10 whether `verification` is kept, and why.
- Clean otherwise:
  - `readRow` (`scripts/measure-graph.mjs:173`) exists and is unexported, as stated.
  - `sendWithHttp` (`scripts/demo-ask.mjs:33`) and `apiPort` (`:66`) exist and are unexported.
  - `checkFreeze` and `sha256` are exported (`scripts/annotation-agreement.mjs:439`, `:452`).
  - The `file` rows hold `content_hash` and `redacted` (`seeds/graph-dump.sql:8`).
  - `.gitattributes` `eol=lf` keeps the fixture bytes stable for the hash check.

## 9. Task size

- *Improvable:* **7.4** (the live run: hours on a CPU, relaunched across many bounded calls) cannot fit one agent turn, by design. Split it into "7.4a launch and log", "7.4b wait/relaunch loop until exit 0" and "7.4c record launches and durations", so progress is checkable.
- *Improvable:* **7.6** edits seven distinct README places and writes two tests. Split the Table 1 and lines-below edit from the limitations, §0, §3.2 and tree edits.
- *Improvable:* **2.1** builds the copy helper, the scripted fake `send` and the first test at once. Acceptable, but at the edge.

## 10. Mandatory steps

- Step 0 is first and is the branch. All mandatory sections are present, labelled `(MANDATORY)`, and say `AGENT MUST EXECUTE` where required. E2E is justified as not applicable. Pre-merge Review is last, in the right order, with the archive before the merge.
- *Improvable:* **9.1** captures "the counts of `project`, `query_log`, `claim` and `cache_entry` rows before 7.3", but runs after step 7. Move that capture into 7.3, before the API starts, and have 9.1 reference it.
- *Improvable:* **9.6.** The live run with `useCache: false` *replaces* the golden `cache_entry` rows of the sample projects (`packages/api/src/schemas/ask.ts:50-51`: "the new answer still replaces the cached one"). Row counts do not detect that. After `npm run db:seed`, add `npm run verify` (exit 0) as the restoration evidence.
- *Improvable:* **7.6** says the link to `docs/measurements/context-savings.md` is "added only together with 7.8's report content", but 7.6's own GREEN requires that link. Give 7.6 GREEN its own condition, or merge the link edit into 7.8.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Freeze check before measuring | A frozen question file was modified | 2.1, 2.3 |
| Freeze check before measuring | The savings report records no hash | 2.3 |
| The question set | A project has 19 questions | 3.1 |
| The question set | The committed question set is complete | 7.1, 7.2 |
| Live environment check | The API does not answer | 4.1 |
| Live environment check | The health check is not ok | 4.1 |
| Live environment check | The model is not in Ollama | 4.1 |
| Live environment check | A raw run of another model is not mixed | 4.2 |
| Asking each question | Every question is sent without the cache | 5.1 |
| Asking each question | An evaluation-mode API stops the run | 5.2 |
| Asking each question | A cached answer stops the run | 5.2 |
| Asking each question | A resumed run skips the answered questions | 5.4 |
| Tokenizer deviation sample | The local estimate equals the product's | 3.2 |
| Tokenizer deviation sample | A sample file differs from the seed | 3.2 |
| Tokenizer deviation sample | Every non-redacted file is counted once | 5.3 |
| Aggregation rules | Savings of two answered rows | 6.1 |
| Aggregation rules | UNKNOWN rows are counted apart | 6.1 |
| Aggregation rules | The savings equal the product's formula | 6.1 |
| Aggregation rules | The tokenizer deviation of a sample | 6.1 |
| Measurement outputs | The outputs are deterministic | 6.3 |
| Measurement outputs | The answer files are blind | 6.2 |
| Measurement outputs | A CSV field with a comma, a quote and a line break | 6.2 |
| Measurement CLI | An unknown argument is a usage error | 2.1, 2.2 |
| Committed measurement matches the raw data | The committed outputs are the current aggregation | 7.4, 7.5 |
| Committed measurement matches the raw data | The frozen questions still match their hash | 7.2 |
| Published Table 1 | The README Table 1 agrees with the measurement | 7.6 |
| Published Table 1 | The README limitations and verifier row are current | 7.6 |
| Measurement report | The report agrees with the measurement | 7.7, 7.8 |
| graph-quality → Published Table 2 (MODIFIED) | The README table agrees with the measurement | 7.6 (shared intro, D14), 8.2 |
| graph-quality → Published Table 2 (MODIFIED) | A TypeScript figure below PHP is explained | 8.2 (unchanged test) |

No empty row. The holes are on the requirement side (point 3) and in the scenarios that B1, B4 and B5 must add. When added, map them: B1 → 5.2; B4 → 6.1; B5 → 3.2 and 4.1.

---

## Corrections to apply

### `specs/context-measurement/spec.md`

- **Purpose:** replace "on about 20 frozen questions" with "on 20 frozen questions".
- **"Freeze check before measuring":** replace "before reading any other input" with "after parsing the arguments and loading `.env`, and before reading any other input".
- **Scenario "A frozen question file was modified":** replace "nothing was written under `docs/measurements/context/` of the copy" with "no file under `docs/measurements/context/` other than `questions.json` exists or changed in the copy".
- **"The question set" (B2):** choose one and write it.
  - Either: "The command SHALL check the shape, the ids, the lengths and the `expected` values; the golden texts SHALL be checked by `tests/unit/docs/context-savings.spec.ts` against `GOLDEN_PROJECTS`." Then move the golden check of "The committed question set is complete" to that test only.
  - Or: "The command SHALL read the golden texts from the demo-question table of `fixtures/README.md` (<parsing rule>)." Then add `fixtures/README.md` to the test copy.
- **"Live environment check" (B5):**
  - Add: "`LLM_MODEL` unset or blank SHALL exit with code 1 and one stderr line naming `LLM_MODEL`, before `GET /health`."
  - Add the scenario "The model variable is not set".
  - Add the stderr line of an unreachable API: `measure:context: the API is not reachable at http://127.0.0.1:<port> (start it with npm run up)`.
  - Add a scenario for `GET /api/version` failing.
  - Add a scenario asserting that neither stdout nor any written file holds the `LLM_BASE_URL` value.
- **"Asking each question" (B1):**
  - Add: "An answered body's `usage.verification.cacheHits` SHALL be kept in the raw data and in the CSV column `verifyCacheHits`, and summed per project; the report and the README limitations SHALL state that a verification answered from the API's in-memory cache costs no token." Alternative: "…with `cacheHits` > 0 SHALL exit with code 1."
  - Add the scenario "A verification answered from the API cache".
  - Add scenarios for a `500` status, a non-JSON body, a missing usage field and a stale raw question (they already exist as tests in tasks 5.2 and 5.4).
- **"Tokenizer deviation sample" (B5):**
  - Add: "A sample project with no `project` row, or an unreadable or malformed seed, SHALL exit with code 1 with the stderr line of `readSeed` (`seeds/graph-dump.sql: the file cannot be read` or `seeds/graph-dump.sql:<line>: <reason>`) or naming the fixture, before any request."
  - Add one scenario.
  - Add a scenario for a malformed `/api/generate` answer.
- **"Aggregation rules" (B3, B4):**
  - Add: "«Ahorro» SHALL be `null` (published `no definido`) when «Contexto bruto» is 0." Or state the product's `0`: choose one.
  - Add: "The median SHALL be `null` when there is no answered row."
  - Add: "`under10s` counts answers with `latencyMs` < 10 000." Or `≤`: choose one.
  - Add: "`verifyMedianMs` is the `⌈n/2⌉`-th smallest `verification.latencyMs` of the answered rows."
  - Add: "Ratios written in the JSON SHALL be rounded to four decimals half away from zero from the integer numerator and denominator, and every figure of the README and the report SHALL be formatted from the integers; the JSON SHALL hold, per project, the Σ `latencyMs`, and for `tokenizer.min` / `tokenizer.max` the file's `estimated` and `provider` counts."
- **Scenario "Savings of two answered rows":** add `outputTokens` 300 and 200, of which 100 and 50 are verification output. Replace "the verification token share equals the formula over those rows" with "the verification token share is 0.22".
- **New scenario "Verifier latency and calls"**, under "Aggregation rules":
  - GIVEN three answered rows with `latencyMs` 9 000, 12 000 and 30 000, `verification.latencyMs` 4 000, 6 000 and 20 000, and `verification.calls` 3, 7 and 20;
  - THEN `medianMs` 12 000, `verifyMedianMs` 6 000, `under10s` 1, `maxCallsPerAnswer` 20 and the latency share 0.5765;
  - and a project with no answered row gives `null` medians.
- **Scenario "The answer files are blind":** replace "no key or value names the model, tokens, cost, latency, confidence or the cache" with "no key is `usage`, `confidence`, `cacheHit`, `model`, `latencyMs` or `costUsd`, and no value contains the model name".
- **"Measurement CLI":** add to the scenario "The outputs are deterministic" that stdout holds one line per project matching `<fixture>: contexto bruto <n> · CODEMIND <n> · ahorro <percent> · <answered> respondidas, <unknown> UNKNOWN`.
- **"Published Table 1" (B6):**
  - Add to the limitations list: "the sample repositories are small and built on purpose, and the Table 2 call sites were annotated by two independent agents of different models (DIS-80)".
  - Add to the scenario "The README limitations and verifier row are current": "the limitations name the small sample repositories and the two independent annotating agents, and the Table 1 caption does not contain `revisión manual`".
- **"Measurement report":** replace "the hardware class" with "whether Ollama ran on CPU or GPU and that processor's model name".

### `design.md`

- **D3 (B1):** add the decision on `verification.cacheHits`. Record that the API keeps one in-memory verification cache per process (`packages/api/src/routes/ask.ts:130`) that `useCache: false` does not bypass, and what the measurement does about it: record and declare, or abort.
- **D8 (B5):** insert "`LLM_MODEL` set" after "`LLM_BASE_URL` set", and the missing-project and seed-error cases.
- **D10 (B3, B4):**
  - Replace "rounded to four decimals half up from the integers (the `roundRatio` formula of `annotation-agreement.mjs`)" with "rounded to four decimals half away from zero from the integers, with `roundRatio` exported from `scripts/annotation-agreement.mjs` (D9)". Or state a deliberate third copy.
  - Add `latencyMs` (Σ) to each project's JSON, `estimated` and `provider` to `min` and `max`, `verifyCacheHits` (B1), and the `null` rules for «Ahorro» and the medians.
  - Remove `events` from the dropped keys, since the `/ask` body has none.
  - State whether `statements[].verification` is kept in the answer files, and why.
- **D11:** state that every formatter takes integers, never a JSON ratio.
- **D9:** add `roundRatio` to the reuse exports if chosen.
- **Context:** add the verification-cache fact (B1).
- **Follow-ups:** add P16 (verification cache, B1) and P17 (golden-text source, B2), each with its destination.

### `proposal.md`

- Line 5: "about 20 questions" → "20 questions".
- Line 28: "several minutes per question" → "5–10 minutes per question on this machine".
- "Outputs": add `verifyCacheHits` (B1) and the null rules (B4).
- "Small reuse edits": add `roundRatio` if exported (B3).

### `tasks.md`

- **2.1:** include in the test copy whatever the B2 decision requires (`fixtures/README.md`, or nothing).
- **3.1:** follow the B2 decision. Add the missing-project and unreadable-seed cases (B5).
- **4.1:** add `LLM_MODEL` unset, `/api/version` failing, and "no `LLM_BASE_URL` value in stdout or in any written file".
- **5.2:** add the verification-cache case (B1).
- **6.1:** add the new "Verifier latency and calls" scenario and the `null` rules (B4), with the output tokens of the amended savings scenario.
- **7.3:** move here the capture of the `project`, `query_log`, `claim` and `cache_entry` counts (before the API starts). In **9.1**, reference it.
- **7.4:** split into 7.4a (launch detached with log), 7.4b (bounded wait and relaunch until exit 0) and 7.4c (record launches, exit codes, durations).
- **7.6:**
  - Split README Table 1 and lines-below from the limitations, §0, §3.2 and tree edits.
  - Keep, in the limitations paragraph, the small repositories and the two-agent annotation (B6).
  - Clarify the link timing: `docs/measurements/context-savings.md` exists since 7.1, so the link can be added in 7.6.
- **8.2:** update the scenario count from 28 to the new total after these corrections.
- **9.6:** after `npm run db:seed`, run `npm run verify` and require exit 0 (the live run replaced the golden `cache_entry` rows).
- **13.8:** update "eleven requirements and 28 scenarios" to the new counts.

### Linear DIS-81 (enhanced part or a comment, in Spanish; never the `[original]` block)

Comment to add:

> *(Texto del agente, auditoría de spec de `context-measurement`, 2026-11-03.)*
> - La API mantiene una caché de verificación en memoria por proceso que `useCache: false` no salta (`packages/api/src/routes/ask.ts:130`); el cambio decide qué hace la medición con `usage.verification.cacheHits` (registrar y declarar como limitación, o abortar).
> - Las preguntas golden se comprueban contra `<fuente elegida>`.
> - Columnas del CSV respecto al CA 1: se añaden `verifyCostUsd` y `verifyCacheHits`.
> - CA 5: «sin salidas parciales» se refiere al CSV, el JSON y `answers/`; las respuestas brutas de `docs/measurements/context/raw/` se conservan para reanudar (pendiente de confirmación de la autora, pregunta Q3).
> - El párrafo de limitaciones conserva «repositorios de muestra pequeños» y la anotación de la Tabla 2 por dos agentes independientes (CA 3 del padre DIS-53).
> - Preguntas abiertas para la autora: Q1 (columna «Correctas» pendiente de DIS-82 frente a «sin *(pendiente)*» del padre), Q2 (ratio de coste «n/a» con Ollama frente al «ratio de coste de verificación» del padre), Q4 (revisión «por la autora» del padre frente a la regla de no trabajo de la autora).

### Linear DIS-53

No edit by the agent. Q1, Q2 and Q4 go to the author. If she decides them, record the decision as a Spanish comment on DIS-53, without touching its description.
