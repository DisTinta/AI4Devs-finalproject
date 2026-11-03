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

---

## Resolution of run 1

*(Agent's text, correction round 1, autonomous run, 2026-11-03.)* In an autonomous run nothing is left
for the author (docs/AUTONOMOUS-RUN.md §6), so the agent decided the four questions as lead engineer. Each
decision is in `design.md` → Follow-ups (P16–P27) with its destination; none is C. `openspec validate
context-measurement --strict` passes after the edits. The spec now has 11 requirements and 40 scenarios.

### Questions for the author

- **Q1** — decided by the agent: a Table 1 with «Correctas (de 20)» `pendiente de DIS-82` is the DoD of
  DIS-81; the parent's AC 3 is met when DIS-82, blocked by this ticket, fills the column. P22, **B**.
- **Q2** — decided by the agent: the token and latency shares satisfy PH-27; the cost share stays
  `n/a (0 USD con Ollama local)`, and no priced estimate is invented for a model the run did not pay for.
  P23, **D**.
- **Q3** — decided by the agent: «salidas parciales» means the final outputs (CSV, JSON, `answers/`);
  the raw responses are kept to resume. Now stated in "Asking each question"; recorded in the ticket.
  P24, **A**.
- **Q4** — decided by the agent: the parent's «revisado por la autora» no longer applies; DIS-82's
  independent agents review the answers. P25, **A**.

### Blocking findings

- **B1** — fixed (decided by the agent: record, not abort). "Asking each question" keeps
  `usage.verification.cacheHits`, the CSV gains `verifyCacheHits`, the JSON sums it, the report and the
  README limitations declare it; new scenario "A verification answered from the API cache"; D3, Context,
  P16; task 5.2b; the launches recorded in 7.4c explain the hits.
- **B2** — fixed (first option). The command checks shape, ids, lengths, `expected` and the `unknown`
  count; the golden texts are checked only by `tests/unit/docs/context-savings.spec.ts` against
  `GOLDEN_PROJECTS`. D8, P17; tasks 2.1, 3.1 and 7.2.
- **B3** — fixed. JSON ratios rounded to four decimals half away from zero from the integers with
  `roundRatio` exported from `scripts/annotation-agreement.mjs`; the JSON holds Σ `latencyMs` and the
  `estimated` / `provider` counts of `min` and `max`; README and report figures formatted from integers
  only. "Aggregation rules", D9, D10, D11, P18; tasks 1.1 and 6.1b.
- **B4** — fixed. «Ahorro» `null` (`no definido`) at a zero baseline; medians and `maxCallsPerAnswer`
  `null` with no answered row; `under10s` strict `< 10 000`; `verifyMedianMs` defined. New scenarios
  "Verifier latency and calls of three answered rows" and "A project with no answered row"; D10, P19;
  task 6.1b. The audit's expected latency share of 0.5765 was corrected: 30 000 / 51 000 is 0.5882.
- **B5** — fixed. `LLM_MODEL` blank, a fixture with no `project` row and a `readSeed` error each exit 1
  before any request, and the unreachable-API line is pinned. New scenarios "The model variable is not
  set" and "The seed has no row of a sample project"; D8, P20; tasks 3.2 and 4.1.
- **B6** — fixed. "Published Table 1" and its scenario now require the small sample repositories, the
  two-agent annotation of Table 2 and the verification cache in the limitations, and the caption without
  `revisión manual`. P21; task 7.6b.

### Improvable findings

- Scope note on the README tree line and the extra CSV columns — fixed: recorded in the enhanced part of
  DIS-81 (P27).
- Missing scenarios — fixed: "The Ollama version check fails", "No variable value is written", "A
  non-200 status stops the run", "A body that is not JSON stops the run", "An answered body without a
  usage field stops the run", "A stale raw response stops the run", "A malformed generate answer stops
  the count"; stdout progress and summary lines pinned in "Measurement CLI" and in two scenarios; the
  savings scenario has output tokens and the share 0.22. The unreadable sample file stays covered by the
  requirement text and the hash scenario (same code path); no separate scenario.
- Ambiguity — fixed: "20 frozen questions" (Purpose and proposal), "5–10 minutes per question" in the
  proposal, and `## Entorno` names CPU or GPU and the processor's model name.
- "before reading any other input" — fixed: after the arguments and `.env`.
- The frozen-file scenario — fixed: no file other than `questions.json` exists or changed.
- "The answer files are blind" — fixed: aligned on keys and on values containing the model name;
  `verification` added to the forbidden keys.
- `verifyCostUsd` missing from AC 1 — fixed: recorded in the ticket (P27).
- `events` in D10 — fixed: removed; the `/ask` body has none.
- `roundRatio` duplication — fixed: exported once and imported (D9); the copy in `measure-graph.mjs` is
  left untouched, out of scope.
- `statements[].verification` in the answer files — decided by the agent: dropped, so the DIS-82
  reviewers are not anchored by the verifier's verdict (D10, P26).
- Task size — fixed: 7.4 split into 7.4a, 7.4b and 7.4c; 7.6 split into 7.6a and 7.6b; 2.1 kept as is
  (the audit judged it acceptable).
- 9.1 counts — fixed: captured in 7.3 before the API starts, referenced by 9.1.
- 9.6 — fixed: `npm run verify` with exit 0 after `npm run db:seed`.
- 7.6 link timing — fixed: the link goes in 7.6a, since the report exists from 7.1.
- Scenario counts in 8.2 and 13.8 — fixed: 40.

---

## Run 2 (2026-11-03)

CHANGES REQUIRED

**Questions for the author.** In an autonomous run the agent may answer these as lead engineer, as long as the answer is marked as the agent's text.

- **Q1. What does the README say if the measured savings are negative?** `readme.md` §0.3 (line 69) says CODEMIND "reduce coste y latencia de forma medida", and the proposal's Why says the measurement is there to back that claim. The golden answers already in the repository all send more tokens than the raw context (see B1). The parent DIS-53 lets Table 2 be explained instead of adjusted («si no, se explica en el texto en lugar de ajustarse»), but says nothing similar for Table 1. Two decisions are needed:
  - Does Table 1 get the same explain-don't-adjust rule?
  - Is the §0.3 sentence left as it is, qualified, or out of scope? If out of scope, the change must say so in its non-goals.

---

## Run 2 (2026-11-03)

Judged against the change as it stands after correction round 1, with DIS-81 (description and comments) and its parent DIS-53 (description and comments) loaded from Linear. Run 1's decisions P16–P27 are marked as the agent's text and do not contradict the ticket or the project. They are taken as accepted.

## 1. Scope against the ticket

Clean. Everything follows from DIS-81 (enhanced D1–D8 and the audit-round decisions recorded there) or from the Entrega 1 review note moved onto DIS-81 ("Medir el verificador", D13).

The additions run 1 noted are now recorded in the ticket's enhanced part:
- the tree line;
- `verifyCostUsd` and `verifyCacheHits`;
- `roundRatio`.

Nothing widens the change to Table 2 or to DIS-82.

## 2. Inherited acceptance criteria

Clean.
- DIS-81 AC 1–5 and the DoD map to requirements with scenarios (see the table in point 11).
- Parent DIS-53 AC 2 maps to "Measurement outputs".
- Parent DIS-53 AC 3 limitations, including the small repositories and the two-agent annotation, map to "Published Table 1" and its scenario.
- The parent/sub-issue disagreements of run 1 (Q1–Q4) were answered by the agent (P22–P25), and those answers are consistent with the DIS-53 comment of 2026-10-28.

The only new gap is the negative-savings case, which neither ticket foresees. It is Q1 above and B1 below.

## 3. Missing scenarios

All improvable:
- **"Live environment check":** the first-run write of `raw/run.json` (with `startedAt` from `now()`) has no scenario of its own. Task 4.2 tests it inside "A raw run of another model is not mixed". Add a THEN clause there or a separate scenario.
- **"Tokenizer deviation sample":** an unreadable sample file is still covered only by the requirement text. Run 1 accepted that as the same code path as the hash mismatch, and that is acceptable.
- **Negative «Ahorro»:** no scenario (see B1).

## 4. Ambiguity

None of the listed words appears in the proposal, design, specs or tasks. One improvable item:
- `design.md` → Risks, "some hundreds of kB of JSON": give the measured size after the run, or write "under 1 MB". It is a risk note, not a requirement.

## 5. Open decisions

### B1 (blocking): a negative «Ahorro» is neither formatted nor explained

**Evidence.** The repository already holds six live answers of the golden questions, made with the same product and the same model. Every one of them has negative savings:

| File | Line | `inputTokens` | `baselineTokens` | `savingsPct` |
|---|---|---|---|---|
| `seeds/cache/acme-shop.json` | 114–118 | 10 050 | 7 123 | −41.1 |
| `seeds/cache/acme-shop.json` | 257–261 | — | — | −56.7 |
| `seeds/cache/acme-shop.json` | 340–344 | — | — | −9.6 |
| `seeds/cache/task-api.json` | 141–145 | 8 252 | 4 227 | −95.2 |
| `seeds/cache/task-api.json` | 241–245 | — | — | −1.3 |
| `seeds/cache/task-api.json` | 367–371 | — | — | −97.8 |

The sample files are small (82 370 code points over 89 files, design Context). «CODEMIND» counts generation plus verification input (D4). So a negative «Ahorro» for one or both projects is the most likely outcome of the run, not an edge case.

**What the change leaves open:**

- **(a) Sign format.** D11 and "Published Table 1" give only the positive example (`88,3 %`). They do not say how a negative value is written: hyphen-minus `-`, the minus sign U+2212, or with a `+` for positives as `formatSigned` does. This affects the README cell, the report and the stdout summary line (`ahorro <percent>`).
- **(b) Rounding direction.** "Aggregation rules" says «Ahorro» rounds half up, equal to the product's `savingsPct` (`Math.round`, which rounds toward +∞). The JSON ratios round half away from zero (`roundRatio`, `scripts/annotation-agreement.mjs:274-278`). D11's `formatPercent(n, d)` does not say which rule it uses. For negative exact halves the two differ. Example: baseline 400 and input 401 give −2.5 tenths, so `Math.round` gives `-0,2 %` and half away from zero gives `-0,3 %`. The scenario "The savings equal the product's formula" requires only "totals above 0" and does not require a negative pair, so it cannot catch this.
- **(c) README text.** No rule says what the README says when a project's «Ahorro» is negative. The precedent is `graph-quality` → "Published Table 2": a paragraph starting `**Por qué TypeScript no supera a PHP.**`, with figures not adjusted. There is also the §0.3 claim (Q1). The Risks section does not mention this outcome.

**Fix:**
- **"Aggregation rules":** «Ahorro» is the integer number of tenths `Math.round((Σbaseline − Σinput) · 1000 / Σbaseline)`, which can be negative and rounds half toward +∞ as `savingsPct` does.
- **"Published Table 1":** «Ahorro» is written from those tenths with one decimal and a decimal comma. A negative value starts with `-` (hyphen-minus) and a non-negative value has no sign. When a project's «Ahorro» is below 0, the text below Table 1 SHALL contain a paragraph starting `**Por qué CODEMIND envía más tokens que el contexto bruto.**` that explains it, and the figures SHALL NOT be adjusted.
- **New scenario under "Published Table 1":** "A negative savings is explained" (if either project's «Ahorro» is below 0, the paragraph is present; otherwise it is absent).
- **Scenario "The savings equal the product's formula":** add a pair with input above the baseline whose exact savings end in a half tenth, for example baseline 400 and input 401, giving `-0,2 %`.
- **D11:** name the «Ahorro» formatter (for example `formatSavings(tenths)`, `-952` → `-95,2 %`) separately from `formatPercent`.
- **Risks:** add the expected negative savings.
- **The §0.3 sentence:** decide per Q1 and record the decision in Follow-ups.

### B2 (blocking): rounding and empty-list forms of the D11 formatters

These choices are pinned only by the formatters themselves. The documentation test uses the same formatters, so any choice passes and the implementer decides alone:
- **(a) Rounding.** `formatPercent(n, d)`, `formatSigned(n, d)` and `formatSeconds(ms)` round to one decimal, but no rounding rule is given. The tokenizer deviation is likely negative, since chars/4 usually undercounts code, so the rule matters for `formatSigned`. The unit tests in task 6.3 use only non-half values (`+5,9 %`, `-25,0 %`, `0,0 %`).
- **(b) No `UNKNOWN`.** The D11 line `<answered> respondidas y <unknown> UNKNOWN (<reason> <n>, …)` does not say what is written when a project has no `UNKNOWN`: `()`, nothing, or `0 UNKNOWN` without parentheses.
- **(c) Reason order.** The order of the reasons inside the parentheses is not stated. The JSON sorts them (D10), but the line does not say it follows the JSON.

**Fix in D11, and in task 6.3's formatter tests:**
- Every one-decimal formatter rounds half away from zero from the integer numerator and denominator, as `roundRatio` does, except «Ahorro» (B1).
- Add one exact-half example per formatter, for example `formatSigned(-1, 8)` and `formatSeconds(412_350)`.
- With no `UNKNOWN`, the line reads `<answered> respondidas y 0 UNKNOWN` with no parentheses.
- Reasons appear in the JSON's sorted order.

### Improvable

- **`raw/run.json` mismatch does not cover the verification model.** It compares only "version, model or digest" ("Live environment check"; D7), so a resumed run with another `LLM_MODEL_VERIFY` mixes verification models without failing. Add `verifyModel` to the compared fields.
- **"Unset" should read "unset or blank".** The spec says "`LLM_MODEL_VERIFY`, or `LLM_MODEL` when unset". Task 7.3 sets `LLM_MODEL_VERIFY=` (blank), and the product treats blank as unset (`packages/adapters/llm/src/config.ts:90`, `read(env.LLM_MODEL_VERIFY) ?? model`). Write "unset or blank".
- **Raw responses without `raw/run.json`.** No rule covers this case, for example when `run.json` was deleted. State that it exits 1 naming `docs/measurements/context/raw/run.json`, or that `run.json` is rewritten. Without a rule, the guard against mixing models has a gap.
- **Where the `PORT` usage check runs.** The CLI requirement says "before any request". D8 lists the order but does not place the `PORT` check. Place it right after `.env` loading, as `scripts/demo-ask.mjs:140-144` does, so that a copy with both a broken freeze and an invalid `PORT` has one defined exit code.

## 6. Contradictions inside the change

- **Improvable:** "Live environment check" says no output line SHALL contain "the value of … any variable other than the model names". The same requirement pins the line `… not reachable at http://127.0.0.1:<port> …`, which writes the value of `PORT`. Change the exception to "other than the model names and `PORT`".
- **Improvable:** "Tokenizer deviation sample" attributes `seeds/graph-dump.sql: the file cannot be read` to "the stderr line of `readSeed`". `readSeed` (`scripts/measure-graph.mjs:205-259`) throws only `seeds/graph-dump.sql:<line>: …`. The "cannot be read" text comes from `readInputs` (`:285`), which this script does not import. Write "the line `seeds/graph-dump.sql: the file cannot be read` (written by the command) or the error message of `readSeed`". D8 already says "its own … errors".
- Otherwise clean. The proposal, design D1–D14 and the spec now agree on:
  - the cache rule;
  - the golden-text source;
  - the rounding of the JSON ratios;
  - the null rules;
  - the order of the checks;
  - the blind answer files.

## 7. Contradictions with the project

- Clean:
  - The `graph-quality` delta replaces only the last sentence of `openspec/specs/graph-quality/spec.md` → "Published Table 2" (line 277).
  - `tests/unit/docs/graph-quality.spec.ts` stays valid unchanged (D14).
  - Task 0.1 follows the branch and base conventions of `docs/project-context.md`.
  - The merge in 13.9 follows `docs/adr/20261020-kit-autonomous-mode.md` (line 43, merge gate) and `docs/AUTONOMOUS-RUN.md` (line 247).
  - The Follow-ups use destinations A, B and D only, never C.
- **Improvable:** the ticket's enhanced D6 says Ollama's prefix reuse «se declara como limitación». Design P15 decides, from a probe, that it is not a limitation. Task 12.3 already copies P1–P15 into the enhanced part. Make sure P15 explicitly replaces that sentence of D6, so the ticket and the report do not disagree.

## 8. Contrast with the real code

- **B1** above: `seeds/cache/acme-shop.json:118,261,344` and `seeds/cache/task-api.json:145,245,371` (negative `savingsPct` on every golden answer).
- **Improvable:** `sendWithHttp` computes `Buffer.byteLength(body)` (`scripts/demo-ask.mjs:37`), and `Send` requires `body: string` (`scripts/demo-ask.d.mts:7`). A `GET /health`, `/api/version` or `/api/tags` sent with no body would throw inside the promise. The script would then report "the API is not reachable" for an API that is up. State in D9 that GET requests pass `body: ''` (and `headers: {}`), and have the 4.1 tests record the body of each GET.
- Clean otherwise:
  - `checkFreeze` (`scripts/annotation-agreement.mjs:452-474`) returns `the report records no SHA-256 hash` without a path, so the report-path prefix the spec requires is the script's job, as D8 says.
  - `roundRatio(numerator, denominator, digits)` (`:274`) takes integers, matching D10.
  - `readRow` (`scripts/measure-graph.mjs:173`) and `apiPort` (`scripts/demo-ask.mjs:66`) exist unexported, as stated.
  - The answer schema (`packages/api/src/schemas/ask.ts:86-107`) has no `events` key.
  - Statement `type` comes from the typing rule, not from the verifier (`packages/core/src/explain/claim-items.ts:32-33`), so keeping it in `answers/` does not leak the verifier's verdict.

## 9. Task size

- Clean after run 1's splits.
- 7.4b is a loop of bounded calls by design.
- 2.1 is at the limit but acceptable.
- B1 adds one RED → GREEN to 7.6a, and B2 adds examples to 6.3. Neither needs a split.

## 10. Mandatory steps

Clean:
- Step 0 is the branch and comes first.
- Steps 8 to 13 are present, labelled `(MANDATORY)`, and steps 10, 11 and 13 say `AGENT MUST EXECUTE`.
- E2E is justified as not applicable.
- The data baseline is captured in 7.3 before the API starts.
- 9.6 restores with `npm run db:seed` and then `npm run verify`, which detects the replaced golden `cache_entry` rows.
- Every step that starts services ends with `node scripts/dev-processes.mjs stop` (7.9, 9.6, 10.3).
- The PowerShell checks run with `pwsh -NoProfile` and `powershell.exe -NoProfile`, without `$env:` assignments.
- The pre-merge order matches `docs/openspec-tasks-mandatory-steps.md` §3.

**Improvable:** after B1, the scenario count in 8.2 and 13.8 becomes 41 (40 + "A negative savings is explained").

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Freeze check before measuring | A frozen question file was modified | 2.1, 2.3 |
| Freeze check before measuring | The savings report records no hash | 2.3 |
| The question set | A project has 19 questions | 3.1 |
| The question set | The committed question set is complete | 7.1, 7.2 |
| Live environment check | The API does not answer | 4.1 |
| Live environment check | The health check is not ok | 4.1 |
| Live environment check | The model variable is not set | 4.1 |
| Live environment check | The Ollama version check fails | 4.1 |
| Live environment check | The model is not in Ollama | 4.1 |
| Live environment check | A raw run of another model is not mixed | 4.2 |
| Live environment check | No variable value is written | 4.1b |
| Asking each question | Every question is sent without the cache | 5.1 |
| Asking each question | An evaluation-mode API stops the run | 5.2 |
| Asking each question | A cached answer stops the run | 5.2 |
| Asking each question | A verification answered from the API cache | 5.2b |
| Asking each question | A non-200 status stops the run | 5.2 |
| Asking each question | A body that is not JSON stops the run | 5.2 |
| Asking each question | An answered body without a usage field stops the run | 5.2 |
| Asking each question | A stale raw response stops the run | 5.4 |
| Asking each question | A resumed run skips the answered questions | 5.4 |
| Tokenizer deviation sample | The local estimate equals the product's | 3.2 |
| Tokenizer deviation sample | A sample file differs from the seed | 3.2 |
| Tokenizer deviation sample | The seed has no row of a sample project | 3.2 |
| Tokenizer deviation sample | A malformed generate answer stops the count | 5.3 |
| Tokenizer deviation sample | Every non-redacted file is counted once | 5.3 |
| Aggregation rules | Savings of two answered rows | 6.1 |
| Aggregation rules | UNKNOWN rows are counted apart | 6.1 |
| Aggregation rules | The savings equal the product's formula | 6.1 (B1 adds a negative pair) |
| Aggregation rules | Verifier latency and calls of three answered rows | 6.1b |
| Aggregation rules | A project with no answered row | 6.1b |
| Aggregation rules | The tokenizer deviation of a sample | 6.1 |
| Measurement outputs | The outputs are deterministic | 6.3 |
| Measurement outputs | The answer files are blind | 6.2 |
| Measurement outputs | A CSV field with a comma, a quote and a line break | 6.2 |
| Measurement CLI | An unknown argument is a usage error | 2.1, 2.2 |
| Committed measurement matches the raw data | The committed outputs are the current aggregation | 7.4a–7.4c, 7.5 |
| Committed measurement matches the raw data | The frozen questions still match their hash | 7.2 |
| Published Table 1 | The README Table 1 agrees with the measurement | 7.6a |
| Published Table 1 | The README limitations and verifier row are current | 7.6b |
| Published Table 1 | *(B1, to add)* A negative savings is explained | *(to add to 7.6a)* |
| Measurement report | The report agrees with the measurement | 7.7, 7.8 |
| graph-quality → Published Table 2 (MODIFIED) | The README table agrees with the measurement | 7.6b (shared intro, D14), 8.2 |
| graph-quality → Published Table 2 (MODIFIED) | A TypeScript figure below PHP is explained | 8.2 (unchanged test) |

The 40 current scenarios and the two `graph-quality` scenarios all map to tasks. The only empty cells are the scenario and task that B1 must add.

---

## Corrections to apply

### `specs/context-measurement/spec.md`

- **"Aggregation rules" (B1).** Replace «Ahorro» `100 × (1 − CODEMIND / Contexto bruto)` "in tenths of a percent rounded half up from the integers, equal to the product's `savingsPct` …" with:

  > «Ahorro» the integer number of tenths `Math.round((Contexto bruto − CODEMIND) · 1000 / Contexto bruto)`, which is negative when CODEMIND exceeds the raw context and rounds a half toward +∞, as the product's `savingsPct` does; `null` (published `no definido`) when «Contexto bruto» is 0.

- **Scenario "The savings equal the product's formula" (B1).** Replace "pairs of input and baseline totals above 0, among them one whose exact savings end in a half tenth" with:

  > pairs of input and baseline totals above 0, among them one whose exact savings end in a half tenth and one with input above the baseline whose savings end in a half tenth (baseline 400, input 401)

  and add to THEN:

  > and the second gives −2 tenths (`-0,2 %`)

- **"Published Table 1" (B1).** Replace "whose «Ahorro» is the percentage with one decimal and a decimal comma (`88,3 %`, or `no definido` for a `null`)" with:

  > whose «Ahorro» is written from its tenths with one decimal and a decimal comma, a negative value starting with `-` and a non-negative one without sign (`88,3 %`, `-95,2 %`, or `no definido` for a `null`)

  and add:

  > When the «Ahorro» of a project is below 0, the text below Table 1 SHALL contain a paragraph starting `**Por qué CODEMIND envía más tokens que el contexto bruto.**` that explains it, and the figures SHALL NOT be adjusted.

- **New scenario under "Published Table 1" (B1): "A negative savings is explained"**
  - GIVEN the committed `context-savings.json`
  - WHEN the «Ahorro» of each project is read
  - THEN if either is below 0, the README text below Table 1 holds the paragraph starting `**Por qué CODEMIND envía más tokens que el contexto bruto.**`; otherwise it does not.

- **"Live environment check".**
  - Replace "or any variable other than the model names" with "or any variable other than the model names and `PORT`".
  - Replace "(`LLM_MODEL_VERIFY`, or `LLM_MODEL` when unset)" with "(`LLM_MODEL_VERIFY`, or `LLM_MODEL` when it is unset or blank)".
  - Replace "with another version, model or digest" with "with another Ollama version, model, digest or verification model".
  - Add: "Raw responses present without `raw/run.json` SHALL make the command exit with code 1 naming `docs/measurements/context/raw/run.json`." (Or the opposite rule, if the agent decides otherwise.)

- **"Tokenizer deviation sample".** Replace "with the stderr line of `readSeed` (`seeds/graph-dump.sql: the file cannot be read` or `seeds/graph-dump.sql:<line>: <reason>`)" with:

  > with the stderr line `seeds/graph-dump.sql: the file cannot be read` or the `seeds/graph-dump.sql:<line>: <reason>` message of `readSeed`

### `design.md`

- **D11 (B1, B2).**
  - Add `formatSavings(tenths)` (`883` → `88,3 %`, `-952` → `-95,2 %`, `null` → `no definido`), used for every «Ahorro» in the README, the report and the stdout summary.
  - State that `formatPercent`, `formatSigned` and `formatSeconds` round to one decimal half away from zero from the integers, as `roundRatio` does.
  - State that a project with no `UNKNOWN` gives `<answered> respondidas y 0 UNKNOWN` with no parentheses, and that reasons appear in the JSON's sorted order.
- **D8.** Place "`PORT` read with `apiPort` (invalid: exit 2)" right after `.env` loading, before `checkFreeze`.
- **D7.** Add `verifyModel` to the fields compared on a later run, and the rule for raw responses without `run.json`.
- **D9.** Add: "GET requests pass `body: ''` and `headers: {}`, since `sendWithHttp` computes `Buffer.byteLength(body)` (`scripts/demo-ask.mjs:37`)."
- **Risks.** Add:

  > **Negative savings.** The six golden answers of `seeds/cache/*.json` all have negative `savingsPct` (−1,3 % to −97,8 %); on the small sample files the verification and the prompt can exceed the raw context. Mitigation: published as measured, with the explanation paragraph of "Published Table 1", never adjusted.

  Replace "some hundreds of kB" with the expected bound ("under 1 MB").
- **Follow-ups.** Add:
  - P28: negative savings format and explanation (B1);
  - P29: formatter rounding and the empty `UNKNOWN` list (B2);
  - P30: the §0.3 sentence, per Q1, with its destination.

  State in P15 that it replaces the ticket D6 sentence on prefix reuse.

### `proposal.md`

- **"Outputs" and "Report and README".** Add that a negative «Ahorro» is published as measured with an explanation paragraph below Table 1.
- **Non-goals.** If Q1 is decided as out of scope, add "editing the §0.3 claim".

### `tasks.md`

- **4.1.** Assert the body `''` of each GET recorded by the fake `send`.
- **4.2.** Add the case of raw responses without `run.json`, and a `run.json` with another `verifyModel`.
- **6.1.** Add the negative exact-half pair (baseline 400, input 401 → −2 tenths).
- **6.3.** Add tests for `formatSavings` (`883`, `-952`, `null`) and one exact-half example for each of `formatPercent`, `formatSigned` and `formatSeconds`, plus the D11 line with 0 `UNKNOWN`.
- **7.6a.** Add RED → GREEN for "A negative savings is explained". When the data gives a negative «Ahorro», write the explanation paragraph (agent's text, marked so).
- **8.2 and 13.8.** Change "40" to "41" scenarios.

### Linear DIS-81 (a Spanish comment, or the `[enhanced]` part; never the `[original]` block)

> *(Texto del agente, auditoría de spec de `context-measurement`, ronda 2, 2026-11-03.)*
> - Las seis respuestas golden de `seeds/cache/*.json` tienen ahorro negativo (de −1,3 % a −97,8 %): lo esperable es que la Tabla 1 muestre un «Ahorro» negativo en algún proyecto. El cambio fija su formato (`-95,2 %`, redondeo como `savingsPct`) y un párrafo «Por qué CODEMIND envía más tokens que el contexto bruto.» bajo la Tabla 1, sin ajustar las cifras.
> - Decisión pendiente sobre la frase de §0.3 («reduce coste y latencia de forma medida»): <decisión y destino>.
> - La D6 de este ticket decía que la reutilización de prefijo de Ollama se declaraba como limitación; la sonda de P15 muestra que `prompt_eval_count` cuenta el prompt entero, así que no es una limitación.

### Linear DIS-53

No edit by the agent. If Q1 is decided, record the decision as a Spanish comment on DIS-53 without touching its description.

---

## Resolution of run 2

*(Agent's text, correction round 2, autonomous run, 2026-11-03.)* Nothing is left for the author
(docs/AUTONOMOUS-RUN.md §6): the agent decided the question as lead engineer. Decisions are in
`design.md` → Follow-ups P28–P31 with their destinations; none is C. `openspec validate
context-measurement --strict` passes after the edits. The spec now has 11 requirements and 41 scenarios.

### Questions for the author

- **Q1** — decided by the agent (P30, **A**; the latency wording **D**). Table 1 gets the same
  explain-don't-adjust rule as Table 2: a negative «Ahorro» is published as measured with a paragraph
  starting `**Por qué CODEMIND envía más tokens que el contexto bruto.**`. The §0.3 sentence is in scope
  only when the measurement contradicts it: if any «Ahorro» is below 0, it is rewritten without
  `reduce coste y latencia de forma medida` and links Table 1; otherwise it is kept. Pinned in
  "Published Table 1" and its new scenario; proposal and task 7.6a updated. Recorded in a Spanish
  comment on DIS-81; DIS-53 is not edited (the comment on DIS-53 the audit suggested was optional, and
  the write to that ticket was refused by the run's permission check).

### Blocking findings

- **B1** — fixed. "Aggregation rules" defines «Ahorro» as integer tenths with the `savingsPct` formula
  (negative allowed, half toward +∞); "The savings equal the product's formula" adds baseline 400 /
  input 401 → −2 tenths (`-0,2 %`); "Published Table 1" fixes the sign format (hyphen-minus, no `+`)
  and the explanation paragraph; new scenario "A negative savings is explained"; D11 adds
  `formatSavings(tenths)`; Risks adds the negative-savings note; P28; tasks 6.1, 6.3 and 7.6a.
- **B2** — fixed. D11 and "Aggregation rules": the other one-decimal formatters round half away from
  zero from the integers, as `roundRatio`; the line reads `… y 0 UNKNOWN` with no parentheses when there
  is none; reasons in the JSON's sorted order. Exact-half examples added to task 6.3
  (`formatSigned(-1, 16)` → `-6,3 %`, `formatSeconds(412_350)` → `412,4 s`). P29.

### Improvable findings

- First-run write of `raw/run.json` — fixed: a THEN clause in "A raw run of another model is not mixed".
- Unreadable sample file — no change, as run 1 accepted and run 2 judged acceptable.
- "some hundreds of kB" — fixed: "expected under 1 MB", measured size recorded in the step 9 report.
- `verifyModel` not compared — fixed: spec, D7 and task 4.2 (P31).
- "unset" → "unset or blank" — fixed in the spec and D8 (P31).
- Raw responses without `raw/run.json` — fixed, decided by the agent: exit 1 naming the file rather than
  rewriting it, so a deleted `run.json` cannot hide a model change; spec, D7, scenario and task 4.2.
- Place of the `PORT` check — fixed: right after `.env`, before the freeze check (CLI requirement,
  freeze requirement wording, D8).
- No-variable-value exception — fixed: "other than the model names and `PORT`".
- `readSeed` attribution — fixed: the unreadable-file line is written by the command, the
  `<line>: <reason>` message comes from `readSeed`.
- P15 against the ticket's D6 — fixed: P15 says it replaces that sentence, and task 12.3 records it in
  the enhanced part of DIS-81.
- GET requests with no body — fixed: D9 states `body: ''` and `headers: {}`; task 4.1 asserts them.
- Scenario counts in 8.2 and 13.8 — fixed: 41.

---

## Run 3 (2026-11-03)

CHANGES REQUIRED

**Questions for the author:** none. Both blocking findings are engineering decisions. In this autonomous run the agent may settle them as lead engineer, as long as each answer is marked as the agent's text.

**What this run judged.** The change as it stands after correction round 2:
- `proposal.md`, `design.md` (D1–D14, P1–P31), `specs/context-measurement/spec.md` (11 requirements, 41 scenarios), `specs/graph-quality/spec.md` and `tasks.md`.
- DIS-81 (description and all six comments) and its parent DIS-53 (description and its comment of 2026-10-28), loaded from Linear.

**Earlier decisions.** P16–P31 are marked as the agent's text and do not contradict the ticket or the project, so they are accepted. One case was checked specifically: the DIS-53 comment of 2026-10-28 says «las preguntas de la Tabla 1 siguen siendo de la autora». DIS-81's enhanced D1 replaces that, citing the no-author-work rule, and the sub-issue bounds the change, so this is not a conflict.

## 1. Scope against the ticket

Clean.
- Everything follows from DIS-81 (enhanced D1–D8 and the audit decisions recorded there), or from the Entrega 1 review note "Medir el verificador" that was moved onto DIS-81 (D13).
- The conditional rewrite of §0.3 (P30) is bounded: it happens only when the measurement contradicts that sentence. It is recorded in a Spanish comment on DIS-81.
- Nothing widens the change to Table 2 or to DIS-82.

## 2. Inherited acceptance criteria

Clean.
- DIS-81 AC 1–5 and its DoD map to requirements with scenarios (point 11).
- Parent DIS-53 AC 2 maps to "Measurement outputs".
- Parent DIS-53 AC 3 limitations map to "Published Table 1" and its scenario "The README limitations and verifier row are current": one run, the annotation by two agents, the small repositories, PH-16 with the measured deviation, and PH-27.
- The parent/sub-issue disagreements were answered by the agent in earlier rounds (P22–P25).

## 3. Missing scenarios

All improvable:
- **Shared §2.6 intro (D14).** "Published Table 1" has no requirement that the first paragraph after `#### Mediciones que se publicarán` says Table 1 is measured. The `graph-quality` delta only requires that it names `DIS-81`. Today's text, «La Tabla 1 sigue pendiente de `measure-context` (DIS-81).» (`readme.md:876`), would keep every test green after the measurement, contradicting D14.
- **Freeze table.** "Freeze check before measuring" says the table SHALL list `questions.json`. But `checkFreeze` (`scripts/annotation-agreement.mjs:452-474`) passes when the table lists only other files. No rule and no scenario covers a table without the `questions.json` row.

## 4. Ambiguity

None of the listed words appears in the proposal, design, specs or tasks. One improvable item:
- The current Table 1 caption is «(~20 preguntas por repositorio, revisión manual)» (`readme.md:878`). The spec only removes `revisión manual`. Also require the caption to drop the `~`: write `20 preguntas por repositorio`, since the question set is exactly 20.

## 5. Open decisions

### B1 (blocking): integrity of the raw data on resume

The resume design (D7) rests on files left on disk by an interrupted run. The change fixes only two cases:
- a raw response whose `question` differs from the question file;
- raw data present without `run.json`.

These cases are left for the implementer:
- **(a)** A raw response, `raw/tokenizer.json` or `raw/run.json` that cannot be parsed as JSON, or that lacks its required fields (`formatVersion`, `fixture`, `questionId`, `question`, `body`; or `counts[].file`, `sha256`, `providerTokens`). A process killed during a write can leave such a file.
- **(b)** A `tokenizer.json` count whose `sha256` differs from the file's current SHA-256. This happens when the seed or a fixture changed after the count. The change does not say whether the count is redone or the command exits 1. Today such a count counts as "recorded", so `build` would publish a stale count.
- **(c)** A count or raw response for a file or question id that is not in the current sample or question file, for example `raw/acme-shop/Q21.json`.
- **(d)** When the stale check runs. D8 does not place it in the order, so it can run before the first ask or lazily in file order. The scenario uses `Q01`, which cannot tell the two apart. A stale `Q20` with `Q03` missing would send `Q03` first.

**Fix:**
- "Asking each question" and "Tokenizer deviation sample": every existing raw file is read and validated after `raw/run.json` and before the first request. Each case (a)–(c) exits 1 with one stderr line naming the file, sends no question and writes no output. Recommended for (b): exit 1 naming `docs/measurements/context/raw/tokenizer.json` and the fixture path, since a silent recount would hide that the seed changed.
- D7 and D8: add that validation step to the order.
- Add one scenario, "Unusable raw data stops the run before any question": a truncated `raw/task-api/Q05.json`, then a `tokenizer.json` count with another `sha256`; each exits 1 naming the file, and no ask or generate request is recorded. Map it to task 5.4.

### B2 (blocking): Ollama's context length is neither ensured nor recorded

`docs/project-context.md:1124-1131` (Gotcha DIS-72) and `readme.md:459` say:
- Ollama must be served with `OLLAMA_CONTEXT_LENGTH=16384`.
- With the default context it cuts the 5–7k-token `explain` prompt (`truncating input prompt`), and every answer becomes `invalid-model-output`.
- The fix is to stop the tray app and every `ollama.exe` / `llama-server`, then run `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`.

Task 7.3 starts its own `ollama serve` only "if it does not" answer. Task 7.9 says "never the tray app". So if the tray app is already running with the default context, the run measures against a truncating server. The OpenAI-compatible route takes no `num_ctx`, and the script cannot see the server's setting. The result is either:
- an all-`UNKNOWN` Table 1 (`no definido`, a wasted run of hours); or
- truncated `prompt_tokens`, which understate «CODEMIND» and overstate «Ahorro». This bias goes straight into the published figure.

Neither `run.json` nor `## Entorno` records the context length, so a reader cannot tell. This contradicts `docs/project-context.md` (point 7), and the implementer is left to decide it alone.

**Fix:**
- **Task 7.3:** follow the gotcha exactly. Stop the tray app and every `ollama.exe` / `llama-server`, start `OLLAMA_CONTEXT_LENGTH=16384 ollama serve` detached with its log in the scratchpad, and record the `inference compute … library=` line (CUDA or cpu).
- **Task 7.4b:** check the Ollama log for `truncating input prompt`. If it appears, delete the raw responses of that launch and re-run (never edit the frozen questions).
- **Task 7.9:** stop the `ollama.exe` the agent started. Restarting the tray app is optional and is recorded.
- **"Measurement report" → `## Entorno`:** add "the Ollama context length used (`OLLAMA_CONTEXT_LENGTH`) and that the Ollama log showed no `truncating input prompt`". Add the context length to the scenario "The report agrees with the measurement" through the report text.
- **Design D12:** state this decision, with the gotcha as its source.

### Improvable

- **§0.3 link target.** "Published Table 1" and "A negative savings is explained" require the §0.3 sentence to "link Table 1" but do not pin the target. Pin `(#26-tests)`, the anchor already used for Table 1 at `readme.md:29`.
- **Question length unit.** The spec bounds a question at 5–500 Unicode code points. `askBodySchema` (`packages/api/src/schemas/ask.ts:18-42`) uses `z.string().min(5).max(500)`, which counts UTF-16 code units, and it also rejects U+0000. A question that passes the script's check can therefore get a `400` from the API and stop the run hours in. Write "5 to 500 UTF-16 code units, not only whitespace, with no U+0000, as `askBodySchema`".
- **Positive provider count.** A per-file deviation with `prompt_eval_count` 0 would be `null`, and the min/max rule does not say how a `null` is ranked. No seed file is empty: no `file` row has the SHA-256 of the empty text. Still, require `prompt_eval_count` to be a positive integer, so that 0 exits 1 like a missing count.
- **`expectedUnknown` and `run` keys.** D10 names `expectedUnknown.answeredUnknown` and "the first and last receivedAt" but defines neither. Write: `answeredUnknown` = the number of questions with `expected: "unknown"` whose response is `UNKNOWN`; the keys are `firstReceivedAt` and `lastReceivedAt`.
- **Duplicate question texts.** The shape check rejects repeated ids but not repeated texts within a project. A repeated text would be answered from the verification cache (D3) and would weigh twice. Add "texts unique per project after trimming" to the shape check and to task 3.1.

## 6. Contradictions inside the change

All improvable:
- **Cost share from floats.** "Aggregation rules" says "Every ratio SHALL be computed from integers", yet the cost share is `Σ verification cost / Σ cost` over USD numbers (`costUsd` is `z.number()`). With Ollama it is always `null`, so nothing breaks today. Write "every ratio except the cost share, which divides the summed `costUsd` numbers".
- **Resumed-run scenario.** "A resumed run skips the answered questions" gives a copy with the 20 `acme-shop` raw responses but no `raw/run.json`. The rule "raw responses … without `raw/run.json` SHALL make the command exit with code 1" would then stop it. The byte-equality also needs the same `startedAt` and `receivedAt`. Write: "a copy holding `raw/run.json` and the 20 `acme-shop` raw responses of a full run, with the same injected clock".

## 7. Contradictions with the project

- **B2** above: task 7.3 and task 7.9 against `docs/project-context.md:1124-1131`.
- Clean otherwise:
  - The `graph-quality` delta replaces only the last sentence of `openspec/specs/graph-quality/spec.md:277`.
  - `tests/unit/docs/graph-quality.spec.ts` stays valid unchanged.
  - Task 0.1 follows the branch and base conventions.
  - The Follow-ups use destinations A, B and D only.
  - The merge in 13.9 follows the autonomous-run ADR.

## 8. Contrast with the real code

Clean. Checked in this run:
- `sendWithHttp` (`scripts/demo-ask.mjs:33`) and `apiPort` (`:66`) are unexported. The `PORT` line (`:142`) and the unreachable line (`:155`) match the D8 pattern.
- `roundRatio` (`scripts/annotation-agreement.mjs:274-278`) rounds half away from zero from integers.
- `checkFreeze` (`:452`) returns `the report records no SHA-256 hash` with no path, so the script adds the prefix.
- `readRow` (`scripts/measure-graph.mjs:173`) is unexported. `readSeed` (`:205`) is exported. The "cannot be read" line belongs to `readInputs` (`:285`), so the script writes its own.
- The three sibling scripts have a main-module guard (`demo-ask.mjs:170`, `measure-graph.mjs:564`, `annotation-agreement.mjs:646`), so importing them runs nothing.
- `askAnsweredSchema` (`packages/api/src/schemas/ask.ts:86-107`) has no `events` key. Its `statements[].verification` is the field D10 drops.

The only clash is the length unit noted in point 5 (improvable).

## 9. Task size

Clean.
- 7.4b is a loop of bounded calls by design.
- 2.1 is at the limit but acceptable.
- B1 adds one RED → GREEN to 5.4, and B2 adds steps to 7.3, 7.4b and 7.9. None needs a split.

## 10. Mandatory steps

Clean:
- Step 0 is the branch and comes first.
- Steps 8–13 are present and labelled `(MANDATORY)`; steps 10, 11 and 13 say `AGENT MUST EXECUTE`.
- E2E is justified as not applicable.
- The data baseline is captured in 7.3 before the API starts.
- 9.6 restores with `npm run db:seed` followed by `npm run verify`.
- Every step that starts services stops them (7.9, 9.6, 10.3).
- The pre-merge order matches `docs/openspec-tasks-mandatory-steps.md` §3.

**Improvable, tied to B2:** the B2 fix changes 7.9. Restoring the machine's Ollama state then means recording whether the tray app was running before 7.3. Record it in 7.3 and restore it in 7.9 and 10.3.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Freeze check before measuring | A frozen question file was modified | 2.1, 2.3 |
| Freeze check before measuring | The savings report records no hash | 2.3 |
| The question set | A project has 19 questions | 3.1 |
| The question set | The committed question set is complete | 7.1, 7.2 |
| Live environment check | The API does not answer | 4.1 |
| Live environment check | The health check is not ok | 4.1 |
| Live environment check | The model variable is not set | 4.1 |
| Live environment check | The Ollama version check fails | 4.1 |
| Live environment check | The model is not in Ollama | 4.1 |
| Live environment check | A raw run of another model is not mixed | 4.2 |
| Live environment check | No variable value is written | 4.1b |
| Asking each question | Every question is sent without the cache | 5.1 |
| Asking each question | An evaluation-mode API stops the run | 5.2 |
| Asking each question | A cached answer stops the run | 5.2 |
| Asking each question | A verification answered from the API cache | 5.2b |
| Asking each question | A non-200 status stops the run | 5.2 |
| Asking each question | A body that is not JSON stops the run | 5.2 |
| Asking each question | An answered body without a usage field stops the run | 5.2 |
| Asking each question | A stale raw response stops the run | 5.4 |
| Asking each question | A resumed run skips the answered questions | 5.4 |
| Asking each question / Tokenizer deviation sample | *(B1, to add)* Unusable raw data stops the run before any question | *(to add to 5.4)* |
| Tokenizer deviation sample | The local estimate equals the product's | 3.2 |
| Tokenizer deviation sample | A sample file differs from the seed | 3.2 |
| Tokenizer deviation sample | The seed has no row of a sample project | 3.2 |
| Tokenizer deviation sample | A malformed generate answer stops the count | 5.3 |
| Tokenizer deviation sample | Every non-redacted file is counted once | 5.3 |
| Aggregation rules | Savings of two answered rows | 6.1 |
| Aggregation rules | UNKNOWN rows are counted apart | 6.1 |
| Aggregation rules | The savings equal the product's formula | 6.1 |
| Aggregation rules | Verifier latency and calls of three answered rows | 6.1b |
| Aggregation rules | A project with no answered row | 6.1b |
| Aggregation rules | The tokenizer deviation of a sample | 6.1 |
| Measurement outputs | The outputs are deterministic | 6.3 |
| Measurement outputs | The answer files are blind | 6.2 |
| Measurement outputs | A CSV field with a comma, a quote and a line break | 6.2 |
| Measurement CLI | An unknown argument is a usage error | 2.1, 2.2 |
| Committed measurement matches the raw data | The committed outputs are the current aggregation | 7.4a–7.4c, 7.5 |
| Committed measurement matches the raw data | The frozen questions still match their hash | 7.2 |
| Published Table 1 | The README Table 1 agrees with the measurement | 7.6a |
| Published Table 1 | A negative savings is explained | 7.6a |
| Published Table 1 | The README limitations and verifier row are current | 7.6b |
| Measurement report | The report agrees with the measurement | 7.7, 7.8 |
| graph-quality → Published Table 2 (MODIFIED) | The README table agrees with the measurement | 7.6b (shared intro, D14), 8.2 |
| graph-quality → Published Table 2 (MODIFIED) | A TypeScript figure below PHP is explained | 8.2 (unchanged test) |

All 41 current scenarios and the two `graph-quality` scenarios map to tasks. The only empty cells are the scenario and the task that B1 must add.

---

## Corrections to apply

### `specs/context-measurement/spec.md`

- **"Asking each question" (B1).** Add:

  > After `raw/run.json` is checked and before the first request, the command SHALL read every file under `docs/measurements/context/raw/`. A raw response or `raw/tokenizer.json` that cannot be read as JSON or lacks a required field, a raw response or count for a question id or file that is not in the question file or the sample, or a count whose `sha256` differs from the file's current SHA-256, SHALL make the command exit with code 1 with one stderr line naming the file, send no request and write no output of "Measurement outputs".

  Move the existing stale-question rule into this pre-check.
- **New scenario under "Asking each question" (B1): "Unusable raw data stops the run before any question"**
  - GIVEN a copy whose `raw/task-api/Q05.json` is truncated; then a copy whose `raw/tokenizer.json` holds a count with another `sha256` than its file
  - WHEN the command runs on each
  - THEN each exits with code 1, stderr names the file, and no ask or generate request was sent
- **"Measurement report" → `## Entorno` (B2).** Add "the Ollama context length (`OLLAMA_CONTEXT_LENGTH`) and that Ollama's log showed no `truncating input prompt`".
- **"Published Table 1".**
  - Add: "the first paragraph after `#### Mediciones que se publicarán` SHALL contain `npm run measure:context` and SHALL NOT contain `sigue pendiente`".
  - Add: "the caption SHALL NOT contain `~`".
  - Add: "the §0.3 link to Table 1 is `(#26-tests)`".
  - Add these three to the scenario "The README limitations and verifier row are current".
- **"Freeze check before measuring".** Add: "a table that does not list `docs/measurements/context/questions.json` is a problem naming it".
- **"The question set".** Replace "5 to 500 Unicode code points that is not only whitespace" with "5 to 500 UTF-16 code units, not only whitespace and with no U+0000 (as `askBodySchema`), unique within its project after trimming".
- **"Tokenizer deviation sample".** Replace "without an integer `prompt_eval_count`" with "without a positive integer `prompt_eval_count`".
- **"Aggregation rules".** Replace "Every ratio SHALL be computed from integers" with "Every ratio except the cost share (a quotient of summed `costUsd` numbers) SHALL be computed from integers".
- **Scenario "A resumed run skips the answered questions".** Replace its GIVEN with "a copy holding `raw/run.json` and the raw responses of the 20 `acme-shop` questions of a full run made with the same injected clock".

### `design.md`

- **D7 and D8 (B1).** After `raw/run.json`, add the step "every raw file read and validated (JSON, required fields, known question id or file, `sha256` of each count equal to the file's current hash; else exit 1 naming the file)". This happens before "missing questions in file order".
- **D12 (B2).** Add: "Ollama is served by the agent with `OLLAMA_CONTEXT_LENGTH=16384` after stopping the tray app and every `ollama.exe` / `llama-server` (`docs/project-context.md` → Gotcha DIS-72). The OpenAI-compatible route takes no `num_ctx` and the script cannot see the server's setting, so the apply records the setting and checks the log for `truncating input prompt`."
- **D10.** Define `expectedUnknown.answeredUnknown` and name `run.firstReceivedAt` and `run.lastReceivedAt`.
- **Follow-ups.** Add:
  - P32 (raw-data integrity on resume, B1);
  - P33 (Ollama context length, B2);
  - P34 (improvable items of run 3).

  Each with its destination.

### `proposal.md`

- **"Live run against the real API":** add "Ollama served with `OLLAMA_CONTEXT_LENGTH=16384`, recorded in the report".
- **"Live run against the real API":** add "unusable or stale raw data stops the run before any question".

### `tasks.md`

- **3.1.** Add the cases: a repeated question text, a question that is too long in UTF-16 units, and a freeze table without the `questions.json` row.
- **5.3.** Add `prompt_eval_count` 0 as a malformed answer.
- **5.4 (B1).** Add RED → GREEN for "Unusable raw data stops the run before any question". Make the GIVEN of "A resumed run …" include `raw/run.json`.
- **7.3 (B2).**
  - Record whether the tray app or an `ollama.exe` is running.
  - Stop the tray app and every `ollama.exe` / `llama-server`.
  - Start `OLLAMA_CONTEXT_LENGTH=16384 ollama serve` detached, logging to the scratchpad.
  - Record its `library=` line.
- **7.4b (B2).** On each wait, grep the Ollama log for `truncating input prompt`. If it appears, stop, delete that launch's raw responses and re-launch.
- **7.6a / 7.6b.** Pin the §0.3 link `(#26-tests)`. Drop `~` from the caption. Have the shared intro contain `npm run measure:context` and no `sigue pendiente`.
- **7.8.** `## Entorno` gives the context length and the no-truncation check.
- **7.9 and 10.3 (B2).** Stop the `ollama.exe` the agent started, and restore the Ollama state recorded in 7.3.
- **8.2 and 13.8.** Change "41" to "42" scenarios.

### Linear DIS-81 (a Spanish comment, or the `[enhanced]` part; never the `[original]` block)

> *(Texto del agente, auditoría de spec de `context-measurement`, ronda 3, 2026-11-03.)*
> - Datos brutos al reanudar: antes de la primera pregunta se validan todos los ficheros de `docs/measurements/context/raw/`. Un fichero ilegible o incompleto, una respuesta o conteo de una pregunta o fichero que ya no existe, o un conteo cuyo SHA-256 no coincide con el fichero actual paran la ejecución con código 1 y nombran el fichero.
> - Ollama se sirve con `OLLAMA_CONTEXT_LENGTH=16384` después de cerrar la aplicación de bandeja y todo `ollama.exe` (gotcha DIS-72 de `docs/project-context.md`). Con el contexto por defecto, Ollama recorta el prompt y la Tabla 1 saldría sesgada o toda `UNKNOWN`. El informe registra la longitud de contexto y que el log no mostró `truncating input prompt`.

### Linear DIS-53

No edit.
