CHANGES REQUIRED

**Questions for the author**

- Q1. Parent DIS-53 still says "anotación humana" (reality map, `fixtures/annotations/...` *to-create*) and, in its third acceptance criterion, that the limitations paragraph mentions "anotación por la autora". DIS-80's own `[original]` text records your decision of 2026-10-27 to replace human annotation with two agents, and this change follows DIS-80 (D8, D12). I have not resolved this myself. Please confirm that the sub-issue supersedes the parent on this point. If it does, record it in a Spanish comment on DIS-53 (see "Corrections → Linear").

Inputs read: `proposal.md`, `design.md`, `specs/graph-annotations/spec.md`, `tasks.md`; DIS-80 (description and its 3 comments) and its parent DIS-53 (no comments); `docs/base-standards.md` §7/§7.1, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md`; `openspec/specs/**` (no capability on annotations); `docs/adr/` (no ADR on measurements); `.claude/workflows/autonomous-sdd.js` (`runPanel`); `fixtures/README.md` § "Table 2 seed"; the fixture code at the control sites; `scripts/demo-excerpt.mjs`; `README.md` §2.6.

---

## 1. Scope against the ticket

Clean, with one minor note. Everything in the change follows from DIS-80, whether from its `[original]` DoD and procedure or from its enhanced D1–D12:
- site lists, panel, tie-break, frozen files, report, hashes and freeze test;
- the README §2.6 wording (D12) and the `fixtures/README.md` pointer.

The proposal's additions P1 (`form`), P3 (`control.json`), `agreement.json`, `annotation-sites.spec.ts` and the `docs/project-context.md` note (task 11.3) are means to the ticket's ends, not new scope. They do not widen the change toward DIS-53's Table 1, `measure-graph` or Table 2; those are explicitly out of scope.

- *Improvable.* Task 11.1 also rewrites the § "Table 2 seed" **title** ("hand-annotated"). D12 only names the pointer sentences. See point 6.

## 2. Inherited acceptance criteria

The DoD of the sub-issue (50 entries per language with resolution and `file:line` reason; agreement report with % and kappa per language, disagreements and resolution; SHA-256 committed before any `measure-graph` run) is covered. So are original procedure steps 2–5. Of the parent's criteria, only the annotation itself ("Dado 50 sitios anotados por lenguaje") is inherited, and it is covered.

- **B5 — blocking. Selection coverage has no requirement.** The `[original]` procedure step 1 of DIS-80 says: "La selección cubre los casos difíciles del fixture (dispatch dinámico, alias, callbacks, atributos Eloquent, rutas por string), no solo llamadas triviales". Enhanced D5 adds the thresholds (the 7 PHP traps with ≥ 2 new sites each where the fixture has ≥ 2 instances, plus the TS constructions). This appears only in design D5 and tasks 2.2/6.2. The requirement "Call-site lists" says nothing about coverage, and no scenario checks it. Correction in "Corrections → spec.md".
- **B6 — blocking. Control discrepancies are not tested.** Enhanced AC 5, second half, says a final annotation that differs from a control row is listed in the report, never forced. The requirement "Frozen annotations and agreement report" states this as a MUST, but no scenario covers it. The scenario "The report states the method and every disagreement" checks panel disagreements only.
- Q1 above (parent vs. sub-issue on "anotación humana / por la autora") is a question, not a finding.

## 3. Missing scenarios

- **B4 — blocking. "Panel output validation" has MUST clauses with no scenario, and the validation list is incomplete.**
  - The requirement says `expected` is `none` **exactly when** `target` is `null`, that `expected` is one of three values, and that `reason` cites at least one `file:line`. But the "Validation SHALL reject" list names only:
    - wrong id sets;
    - citations to a missing file or line;
    - a missing `target.file`;
    - forbidden `sourcesRead`.
  - So an output with `expected: "exact"` and `target: null`, an unknown `expected` value, a `reason` with **no** citation at all, or a missing top-level field (`sourcesRead`, `sites`) is not explicitly rejected. Such an output would flow into format-1 files that DIS-79 consumes.
  - There is no scenario for `target.file` not existing, nor for the **resolver's** role allowlist. Task 5.1 relies on that allowlist, but the only `sourcesRead` scenario is about a panelist.
  - The format of a `sourcesRead` entry is open:
    - a file path only, or also a directory (`fixtures/acme-shop/app`) or a glob (`fixtures/acme-shop/app/**`)?
    - is the literal `linear:DIS-80/description` (Panel group, output format) accepted as the only non-path entry?

  A test will pin all of this.
- B5 and B6 (point 2) are also missing scenarios.
- *Improvable.* "the commit that records them SHALL precede any run of `measure-graph`" has no scenario. That is acceptable while `measure-graph` does not exist. State it as checked in the step-8 report (`scripts/measure-graph.mjs` absent at the freeze commit) instead of leaving it unverified.

## 4. Ambiguity

- *Improvable.* `design.md:180` says "many TS sites are `exact` or `none`". Replace it with "the report gives, per language, the number of sites per `expected` value; TS is expected to have fewer `heuristic` sites than PHP".
- No other occurrence of fast / easy / secure / efficient / many / appropriate / robust in the change.

## 5. Open decisions

- **B1 — blocking. The site model cannot represent three control sites, nor the Eloquent sites that D5 requires.** The spec allows `form` ∈ {`call`, `new`, `reference`}. For `call`/`new`, `call` is "the text … up to and including its opening parenthesis".
  - **php-04** is a property read with no parenthesis: `$subtotal = $order->subtotal;` (`fixtures/acme-shop/app/Services/PriceCalculator.php:27`). No form fits it, and D5 asks for ≥ 2 more Eloquent attribute reads.
  - **php-11 and php-12** are route actions. The README edge goes to the action, while the only call text "up to the parenthesis" on those lines is the framework call:
    - `Route::get('/orders/{order}', [OrderController::class, 'show'])` (`routes/api.php:13`);
    - `Route::post('/checkout', 'App\Http\Controllers\CheckoutController@store')` (`routes/web.php:13`).
  - Under D2 that framework call is `none`, which contradicts the control. The spec's `reference` ("a function or method reference passed as an argument, e.g. `controller.create`") does not say that an array callable or a `'C@m'` string counts.

  Fix it in the requirement "Call-site lists", in design D1/D3/P1 and in the Panel group's input description.
- **B2 — blocking. The criterion (D2, copied into the Panel group) leaves cases that the real fixture contains undecided.**
  - (a) The fixture dispatches jobs only as `RecalculateTotals::dispatch($order);` (`app/Observers/OrderObserver.php:18` and `:25`). `RecalculateTotals` uses `Dispatchable` and declares `handle` (`app/Jobs/RecalculateTotals.php:22,30`). D2 lists only `dispatch(new Job)` → `handle`, a form that does not occur in the fixture. Read literally, `X::m()` makes it `exact` with a target (`RecalculateTotals::dispatch`) that is not declared in the fixture, or `none`. Control php-10 depends on this.
  - (b) Precedence between `heuristic` and `none` is not stated. `event(` is a "framework function" (`none`, first clause) and also `event(new E)` (`heuristic`). Control php-06 depends on this.
  - (c) `new X(...)` when `X` declares no constructor: D2 says `exact`, but the target `X::__construct` / `X::constructor` does not exist. The analyzers emit no edge in that case (`docs/project-context.md:1395`, `:1411`).
  - (d) "the one declared first in the code", when a call can reach several symbols, has no ordering across files (e.g. several listeners, several implementations).
  - (e) A method inherited from a fixture parent class: is the target `Parent::m` or `Child::m`?
- **B3 — blocking. The control target of ts-03 is undefined, and the control test does not check targets.**
  - README row 3 names the target "`TaskNotFoundError` (via `get`)" and describes two edges. Design D3 makes the control site the call `this.get(` (`src/services/task.service.ts:46`).
  - The requirement "Control reference" says `target` is "the row's graph target when the row names one". That reads as `TaskNotFoundError::constructor`, not `TaskService::get`, so the site and its reference would not match.
  - The scenario only compares `expected` and checks that `target.file` exists, so a wrongly transcribed target is not caught. That target directly changes the published control agreement (n = 10).
- **B7 — blocking. The CLI contract is not in the spec.** The commands `agreement` / `merge` / `hashes`, their exit codes, "writes nothing on error" for `agreement`, and the form of the optional root argument are only in design D10. Task 9.2 leaves the unknown-command exit code open: "usage `2` … if the script follows `demo-excerpt`". The project convention is `2` for a usage error (`docs/project-context.md:78-88`, `scripts/demo-excerpt.mjs:15-16`). Fix it in the spec, with scenarios and unit tests.

## 6. Contradictions inside the change

- *Improvable.* Task 11.1 rewrites the § "Table 2 seed" title. Task 8.3 asserts that `git diff final-project-CRN -- fixtures/README.md` "touches only the pointer sentences", and design D12 names only those sentences. Align them: either D12 and 8.3 include the title, or 11.1 drops it.
- *Improvable.* Design P4 and the Panel group give `app/Services/TaxService.php:21` as the example citation. That line sits in `TaxService::taxFor`, the README target of control php-02. It is a small hint inside a text the panelists read. Use a neutral placeholder (`app/<Dir>/<File>.php:<line>`, `src/<dir>/<file>.ts:<line>`).
- No other contradictions: proposal, design and spec agree on the files, the nine hashed files, the format, the measures and the merge.

## 7. Contradictions with the project

- *Improvable.* The workflow's resolver prompt (`.claude/workflows/autonomous-sdd.js:154`) forbids reading "any measurement output". Task 4.4, design D8 and the spec's resolver allowlist have the resolver read `docs/measurements/annotation/agreement.json`. A resolver obeying its prompt may refuse it. In task 4.4, say explicitly that `agreement.json` is the list of disagreement ids between the two panel outputs, not a measurement of the graph. Alternatively, let the resolver derive the ids from `panelist-1.json` / `panelist-2.json` itself (same result).
- *Improvable.* For the route sites, the PHP analyzer's source is a `route` symbol spanning the whole statement (`docs/project-context.md:1431-1437`), while format 1 records `source: { "file": "routes/api.php" }`. Format 1 is fixed here for DIS-79 (D1). State in D1 that DIS-79 matches a site by target `file` + `symbol` and by `site.file` + `site.line` lying inside the source symbol's span, not by source name equality.
- No duplication of a main spec (`openspec/specs/` has no capability on annotations) and no ADR conflict.

## 8. Contrast with the real code

- Confirmed by reading the fixture, these become B1, B2 and B3:
  - `PriceCalculator.php:27` (property read);
  - `routes/api.php:13` and `routes/web.php:13` (route actions);
  - `OrderObserver.php:18,25` (static `dispatch`);
  - `EventServiceProvider.php:20-27` (one listener per event, so php-06 is single-target);
  - `task.service.ts:46` (ts-03).
- *Improvable.* `routes/web.php:13-15` shows a chain spread over several lines (`->middleware(` on line 14, `->name(` on line 15). By the spec's rule ("from the start of its callee") the text starts on line 13, so the scenario "its `call` text appears on that line" fails. Either define `call` for a chained call as the text from the member operator on that line (`->name(`), or exclude such calls from the selection. Write that in the requirement.
- *Improvable.* `scripts/demo-excerpt.mjs:40-42` (`isProject`) will accept `fixtures/annotations` as a "project". This is harmless, and task 7.1 already reviews it.
- The script follows the `demo-excerpt` pattern (`.mjs` + `.d.mts` + tests in `tests/unit/scripts/`, `docs/project-context.md:287-289`) with no new abstraction.

## 9. Task size

- *Improvable.* Task 2.2 locates the 22 controls, selects 78 new sites across 56 files covering every D5 construction, and writes two 50-entry JSON files with exact lines and call texts. That is the heaviest task of `apply-prepare`, run by Sonnet in one step. Split it into 2.2a (PHP, `acme-shop.sites.json`) and 2.2b (TS, `task-api.sites.json`), each running the `annotation-sites.spec.ts` checks for its file.
- The other tasks fit one turn.

## 10. Mandatory steps

Clean:
- Step 0 is first and labelled `(MANDATORY - FIRST STEP)`.
- Review existing tests (7), Run tests and verify data state (8, with the baseline in 0.4, a report path and the §6 template), Manual interface testing (9, `AGENT MUST EXECUTE`, error cases, restoration in 9.3), E2E (10, justified N/A) and Docs (11) are present and labelled.
- Pre-merge review is last (13), with the three checks in order, fixes on the same PR and the archive before the merge.
- Every scenario maps to a task (7.2).

Merging by the agent (13.7) follows the autonomous-run relaxation in `docs/project-context.md` (§ autonomous profile), not the interactive rule.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Call-site lists | Each site list has 50 sites with the controls first | 2.1, 2.2 |
| Call-site lists | Every site points at its call in the fixture | 2.1, 2.2 |
| Call-site lists | A site list carries no answer | 2.1, 2.2, 3.1 |
| Call-site lists — selection covers the hard constructions (ticket procedure 1, D5) | **— (no requirement, no scenario: B5)** | 2.2, 6.2 |
| Call-site lists — property reads and route actions as sites | **— (not representable: B1)** | 2.2 |
| Control reference | The control reference transcribes the 22 README rows | 2.1, 2.3 |
| Control reference — target of each control (ts-03) | **— (undefined and untested: B3)** | 2.3 |
| Panel output validation | A complete panel output is accepted | 1.1, 1.2, 4.3 |
| Panel output validation | An incomplete panel output is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A citation to a line that does not exist is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A declared forbidden source is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation — `none`⇔`null`, enum, no citation, missing `target.file`, missing fields, resolver allowlist, `sourcesRead` entry format | **— (B4)** | 1.2, 5.1 |
| Agreement measures | Percent agreement and Cohen's kappa per language | 1.1, 1.2, 4.3 |
| Agreement measures | Kappa is undefined when the expected agreement is 1 | 1.1, 1.2 |
| Agreement measures | Agreement with the control per panelist | 1.1, 1.2, 4.3 |
| Deterministic merge | Agreed sites take the common answer | 1.1, 1.2, 5.1 |
| Deterministic merge | Disagreements take the resolution | 1.1, 1.2, 5.1 |
| Deterministic merge | A missing or extra resolution fails the merge | 1.1, 1.2, 5.1, 9.2 |
| Deterministic merge | The merge is deterministic | 1.1, 1.2, 5.2 |
| Frozen annotations and report | The recorded hashes match the frozen files | 6.1, 6.2, 6.3, 8.3 |
| Frozen annotations and report | A changed annotation file fails the freeze check | 6.1 |
| Frozen annotations and report | The report states the method and every disagreement | 6.1, 6.2 |
| Frozen annotations and report — control discrepancies listed | **— (B6)** | 6.2, 6.4 |
| CLI (`agreement`, `merge`, `hashes`, exit codes) | **— (no requirement: B7)** | 1.2, 9.1, 9.2 |

Empty rows: B1, B3, B4, B5, B6, B7 (all blocking, counted above).

**Improvable findings not listed above:**
- **Rounding.** D6 rounding (percent to one decimal, kappa to three decimals) is only in the design. Move it into the requirement "Agreement measures", because the hand-computed test pins it.
- **Criterion contamination.** The criterion's author (the enrich/propose agent) read the README control before writing D2. On top of that, the workflow passes the author's run notes to every panelist, and those notes name `fixtures/README.md` as the location of the control. The report's limitations (task 6.2) and the design's Risks should say both.
- **Unchecked `target.symbol`.** Validation does not check `target.symbol` at all. A cheap check: the symbol's last segment (method or function name) appears in `target.file`. Without it, a mistyped symbol silently lowers DIS-79's coverage.

---

## Corrections to apply

### `specs/graph-annotations/spec.md`

1. **Requirement "Call-site lists" (B1, B5, point 8).**
   - Replace the `form` sentence with:
     "`form` SHALL be `call`, `new`, `read` or `reference`. For `call` or `new`, `call` is the text of the call expression on that line from the start of its callee up to and including its opening parenthesis; when the receiver of a chained call starts on an earlier line, it is the text from the member operator on that line (`->name(`). For `read` (a property read served by `__get`, such as an Eloquent attribute or relation), `call` is the text from the receiver to the property name (`$order->subtotal`). For `reference`, `call` is the literal text of a function or method reference passed as an argument: a property access or identifier (`controller.create`), a PHP array callable (`[OrderController::class, 'show']`) or a route action string (`'App\Http\Controllers\CheckoutController@store'`)."
   - Add: "The selection SHALL include, per fixture, at least 2 new sites (beyond the controls) of each construction of design D5 that has 2 or more instances in the application code, and at least 1 when it has exactly 1."
   - Add the scenario:
     `#### Scenario: The report counts the selection per construction` — **WHEN** the report's selection table is read next to the site lists — **THEN** it gives, per fixture, the count of sites per construction of design D5, the counts add up to 50, and every construction meets its minimum.
   - Update the test count of 6.1 and 7.2 accordingly. This scenario can live in `annotation-freeze.spec.ts`, since the table is written after the panel.
2. **Requirement "Control reference" (B3).** Replace "`target` is `{ file, symbol }` (the row's graph target when the row names one)" with:
   "`target` is the target of the call that design D3 identifies as the control site: the row's graph target when the row names one, and, for a row that describes two edges, the target of the first call that leaves the row's source symbol (task-api row 3: `TaskService::get`, `exact`)."
   Extend the scenario's THEN: "… and every non-null `target.symbol` is the symbol named by its README row (its graph target when given), except task-api row 3, whose target is `TaskService::get`."
   The control answer may appear here because `openspec/**` other than `tasks.md` is forbidden to panelists. **Do not copy it into `tasks.md` or into the DIS-80 description.**
3. **Requirement "Panel output validation" (B4).**
   - Extend the rejection list: "… an answer whose `expected` is not one of the three values, whose `expected` is `none` with a non-null `target` or another value with a `null` target, whose `reason` contains no citation matching design P4, whose `target.file` does not exist in the fixture, an output missing `sites` or `sourcesRead`, or a resolution whose `sourcesRead` falls outside the resolver allowlist."
   - Fix the entry format: "Each `sourcesRead` entry is either a repository-relative **file** path or the literal `linear:DIS-80/description`; a directory or a glob is rejected."
   - Replace "the fixture source code" in the role allowlist with the exact list of design D4.
   - Add the scenarios:
     - `An answer inconsistent between expected and target is rejected`;
     - `A reason without a citation is rejected`;
     - `A target file that does not exist is rejected`;
     - `A resolution with a source outside the resolver allowlist is rejected`;
     - `A sourcesRead entry that is a directory or a glob is rejected`.
4. **Requirement "Agreement measures".** Add: "the percent is rounded to one decimal and kappa to three decimals (half away from zero)".
5. **Requirement "Frozen annotations and agreement report" (B6).** Add the scenario:
   `#### Scenario: The report lists every control discrepancy` — **WHEN** the final annotation of each control site is compared with `control.json` (same `expected` and `target`) — **THEN** every control id that differs appears in the report's discrepancy section with both answers and a `file:line` justification, and no other id appears there.
   Add it to task 6.1 (the freeze test).
6. **New requirement "Agreement CLI" (B7).**
   "`node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]` SHALL exit `0` on success; `1` when validation or the merge fails, after printing every problem to stderr and writing no file; `2` with a usage line for a missing or unknown command or an unknown option (`docs/project-context.md` convention)."
   Scenarios:
   - `An unknown command is a usage error`;
   - `A rejected panel output writes no agreement file`;
   - `hashes prints the nine files in order`.
   Add the three `it` cases to task 1.1, and make task 9.2 read "exit code `2`" without the "if".

### `design.md`

- **D1:** add `read` to `form`. State DIS-79's matching key: target `file` + `symbol`, and `site.file` + `site.line` inside the edge source's span. Route edges have a `route` symbol as source (`docs/project-context.md:1431-1437`).
- **D2** (and the identical **Criterion** in the Panel group of `tasks.md`), add:
  - "Precedence: the `heuristic` list wins over `none` when one of its conventions applies to fixture code (`event(new E)`, `dispatch(...)`)."
  - "`X::dispatch(...)` (also `dispatchSync`, `dispatchIf`, `dispatchUnless`, `dispatchAfterResponse`) on a fixture class that uses `Dispatchable` and declares `handle` → `heuristic`, target `X::handle`; `dispatch(new X(...))` likewise."
  - "`new X(...)` where `X` declares no constructor → `none` (no symbol exists to target)."
  - "A method inherited from a fixture class → the declaring class's symbol (`Parent::m`)."
  - "'Declared first' = first in the registration list when there is one (`$listen` array, binding), otherwise by file path, then line."
  - "A `read` site is judged as the access `__get` serves: the declared accessor `get{Studly}Attribute` or relation method, `heuristic`; a plain column → `none`."
- **D3:** say that a `read` site and a `reference` route action are each one site.
- **D6:** keep the rounding as in the spec.
- **P4** and the Panel group: replace the example `app/Services/TaxService.php:21` with a neutral placeholder.
- **Risks:** add that the criterion was written by an agent that had read the control, and that the run notes given to the panelists name `fixtures/README.md`. The report states both.
- `design.md:180`: replace "many TS sites" (point 4).
- **D12:** say whether the § "Table 2 seed" title changes, consistently with tasks 11.1 and 8.3.
- **Follow-ups:** one row per finding of this audit with its destination (A for all of them; B for the D1 matching note → comment on DIS-79).

### `tasks.md`

- **1.1:** add the `it` cases of corrections 3 and 6 (spec).
- **2.1:** extend "The control reference transcribes the 22 README rows" to targets (correction 2).
- **2.2:** split into 2.2a (PHP) and 2.2b (TS). Include `read` and `reference` route sites. Record the count per construction for 6.2.
- **4.4:** "`agreement.json` is the list of disagreement ids between the two panel outputs, not a measurement of the graph; read it, or derive the same ids from the two panel outputs."
- **6.1:** add "The report counts the selection per construction" and "The report lists every control discrepancy".
- **6.2:** add the two limitations (criterion author had read the control; run notes name the README).
- **7.2:** update the scenario counts.
- **8.3:** align with 11.1 (pointer sentences **and** title, or pointer sentences only). Add the freeze-before-`measure-graph` check (no `scripts/measure-graph.mjs` at the freeze commit).
- **9.2:** exit code `2` for an unknown command, unconditionally.

### Linear

- **DIS-80:** a Spanish comment summarising this audit's corrections (form `read`, route actions as `reference`, criterion additions, CLI exit codes, ts-03 control rule). **Do not write any control answer in the description:** panelists read the description (design D4). Rule-level changes to the criterion may go in the enhanced part. The ts-03 target goes only in the spec and the design. The `[original]` block is not edited.
- **DIS-79:** a Spanish comment: format 1 gains `form: "read"`; a site is matched by target `file` + `symbol` and by `site.file` + `site.line` inside the edge source's span (for routes the source is the `route` symbol of the statement).
- **DIS-53** (after Q1 is answered): a Spanish comment saying that, by the author's decision recorded in DIS-80 (2026-10-27), the Table 2 annotation is made by two independent annotator agents of different models, not by the author, and that the limitations paragraph of README §2.6 says so.
