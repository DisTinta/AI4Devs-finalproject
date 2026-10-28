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

---

## Resolution of run 1

*Agent's text (correction round 1, 2026-10-28), decided as lead engineer in an autonomous run without the author. Each decision is also in `design.md` → Follow-ups with its destination. `openspec validate callsite-annotations --strict` passes after the edits.*

**Question for the author**

- **Q1 — decided by the agent.** The sub-issue supersedes the parent on this point: DIS-80 records the author's explicit, later decision (2026-10-27) to replace human annotation with two annotator agents. The change keeps following DIS-80 (D8, D12). A Spanish comment on DIS-53 records it (destination B); the parent's text is not edited.

**Blocking findings**

- **B1 — fixed.** Spec "Call-site lists": `form` is `call`, `new`, `read` or `reference`; `read` covers property reads served by `__get` (`call` = receiver and property name); `reference` covers identifiers or property accesses, PHP array callables and route action strings; a chained call whose receiver starts on an earlier line starts at the member operator on its line. Design D1, D3 and P1 and the Panel group's input description updated. The spec examples use neutral shapes, not fixture sites.
- **B2 — fixed.** Design D2 and the Panel group criterion gain: precedence of `heuristic` over `none`; static `X::dispatch` (and its variants) on a `Dispatchable` fixture class → `heuristic`, target `X::handle`; `new X(...)` with no declared constructor → `none`; inherited method → declaring class's symbol; "declared first" ordering (registration list, else file path then line); judgement of `read` sites (declared accessor or relation → `heuristic`, plain column → `none`). All are rule-level and name no site, file, line or target.
- **B3 — fixed.** Spec "Control reference": the control target is the target of the control call identified by D3; for task-api row 3 it is `TaskService::get` (`exact`). The scenario now checks every non-null `target.symbol` against the README row. The ts-03 rule is written only in the spec and in design D3 (both forbidden to panelists), never in `tasks.md` or the ticket description. Task 2.1 extended to targets.
- **B4 — fixed.** Spec "Panel output validation": explicit rejection of missing `sites` / `sourcesRead`, unknown `expected`, `none`⇔`null` inconsistency, a reason with no citation, a missing `target.file`, a `target.symbol` whose last segment does not appear in `target.file`, and `sourcesRead` entries that are a directory, a glob or outside the role's allowlist. Entry format fixed (one file path or `linear:DIS-80/description`); both allowlists written out as exact lists. Five new scenarios; task 1.1 has their `it` cases; design D4 and the Panel group updated.
- **B5 — fixed.** Spec "Call-site lists" gains the coverage requirement (minimum 2 new sites per construction row of design D5, or every remaining instance when fewer than 2 remain) and the scenario "The report counts the selection per construction", tested in `annotation-freeze.spec.ts` (task 6.1). Design D5 lists the construction rows and an "other call" row without minimum; tasks 2.2a/2.2b record each site's row in the scratchpad, task 6.2 writes the table.
- **B6 — fixed.** Scenario "The report lists every control discrepancy" added to the frozen-report requirement and to task 6.1; the requirement compares with `control.json` (same `expected` and `target`).
- **B7 — fixed.** New requirement "Agreement CLI": `node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]`, exit `0` / `1` (every problem on stderr, nothing written) / `2` (usage line). Three scenarios, three `it` cases in task 1.1; task 9.2 now expects exit `2` for an unknown command without condition; design D10 updated.

**Improvable findings**

- **§ "Table 2 seed" title (point 1 and point 6) — decided by the agent.** The title and first sentence change too, because leaving "hand-annotated" for the 50 sites would keep a false claim; design D12, task 11.1 and task 8.3 now name the same set (title, intro sentences, two headings; rows untouched).
- **Freeze before `measure-graph` (point 3) — fixed.** Stated in the spec as checked in step 8; task 8.3 verifies that `scripts/measure-graph.mjs` is absent at the freeze commit.
- **"many TS sites" (point 4) — fixed.** Design Risks now say the report gives the number of sites per `expected` value per language; task 6.2 adds that count.
- **Example citation hint (point 6) — fixed.** P4 and the Panel group use `app/<Dir>/<File>.php:<line>` and `src/<dir>/<file>.ts:<line>`.
- **Resolver prompt vs. `agreement.json` (point 7) — fixed.** Task 4.4 and design D4 say `agreement.json` is the list of disagreement ids, not a graph measurement, and allow deriving the ids from the two panel outputs.
- **DIS-79 matching key for routes (point 7) — fixed.** Design D1 states the key (target `file` + `symbol`; `site.file` + `site.line` inside the edge source's span); Spanish comment on DIS-79 (destination B).
- **Multi-line chained call (point 8) — fixed** in the spec's `call` rule (member operator on the site's line).
- **`isProject` of `demo-excerpt` (point 8) — rejected as a change:** harmless, and task 7.1 already reviews it (destination D).
- **Task 2.2 size (point 9) — fixed.** Split into 2.2a (PHP) and 2.2b (TypeScript), each running the site-list checks for its file.
- **Rounding — fixed.** Moved into the spec "Agreement measures" (one decimal / three decimals, half away from zero); D6 refers to it.
- **Criterion contamination — fixed.** Design Risks and the limitations of task 6.2 state that the criterion's author had read the control and that the run notes given to the panelists name `fixtures/README.md`.
- **Unchecked `target.symbol` — fixed.** Validation checks that its last segment appears in `target.file` (part of B4's scenario "A target that does not exist in the fixture is rejected").

**Linear.** Spanish comments on DIS-80 (summary of this round, with no control answer), DIS-79 (`form: "read"`, route actions as `reference`, matching key) and DIS-53 (Q1). The DIS-80 description is not edited in this round.

Scenario count after the round: 19 in `annotation-agreement.spec.ts`, 4 in `annotation-sites.spec.ts`, 5 in `annotation-freeze.spec.ts` (task 7.2).

---

## Run 2 (2026-10-28)

CHANGES REQUIRED

**Questions for the author**

None. Every finding below can be fixed inside the change and in the enhanced part of DIS-80 without a product or scope decision. The run 1 decision Q1 (the sub-issue supersedes the parent on "anotación humana") is acceptable: it matches the `[original]` text of DIS-80, and DIS-53 now carries the comment.

Inputs read:
- **The change:** `proposal.md`, `design.md`, `specs/graph-annotations/spec.md`, `tasks.md`, and `reports/2026-10-28-spec-audit.md` (run 1 and its resolution).
- **Linear:** DIS-80 (description, with `[original]`, `[reality-map]` and `[enhanced]`, plus 4 comments) and its parent DIS-53 (description and 1 comment).
- **Project docs:** `docs/base-standards.md` §7.1 and `docs/openspec-tasks-mandatory-steps.md`.
- **Workflow:** `.claude/workflows/autonomous-sdd.js` (`step`, `runPanel`, the `apply-prepare` / `apply-finish` split).
- **Code and docs:** `scripts/demo-excerpt.mjs`, `README.md` §2.6 (lines 845 and 854), `fixtures/README.md` § "Table 2 seed", and the file layout of `fixtures/*/{README.md,docs,tests}`.

---

## 1. Scope against the ticket

Clean. Everything traces to DIS-80: its `[original]` DoD and procedure, its enhanced D1–D12, and the run 1 corrections:
- site lists, `control.json`, panel, tie-break, merge, report, hashes and the freeze test;
- the README §2.6 wording and the `fixtures/README.md` pointer.

The change does not widen toward DIS-53's Table 1, `measure-graph` or the filled Table 2. All three are explicit non-goals in the proposal and design.

## 2. Inherited acceptance criteria

Clean. The DoD of DIS-80 is covered by a requirement and a scenario:
- 50 entries per language with a resolution and a `file:line` reason: "Deterministic merge" and "Panel output validation".
- Agreement report with percent and kappa per language, disagreements and their resolution: "Agreement measures" and "Frozen annotations and agreement report".
- SHA-256 committed before any `measure-graph` run: "Frozen annotations…" and task 8.3.

Enhanced AC 1–5 are each covered:
- AC 5 "control discrepancy": scenario "The report lists every control discrepancy".
- AC 5 "panelist output not used, ticket stops": the validation scenarios and task 4.3.

Of DIS-53's criteria, only "Dado 50 sitios anotados por lenguaje" is inherited, and it is covered.

## 3. Missing scenarios

Clean. Every MUST clause added in run 1 now has a scenario: the validation list, the CLI exit codes, control discrepancies and coverage per construction. The "precedes any `measure-graph` run" clause is checked by task 8.3, as the spec states.

## 4. Ambiguity

Clean. None of fast / easy / secure / efficient / many / appropriate / robust occurs in the change's artifacts. The only hits are the run 1 quotations in `design.md:288` and in the report.

## 5. Open decisions

- **B2 — blocking. The per-site construction record does not survive from preparation to the report.**
  - Tasks 2.2a/2.2b record "each site's construction row and the instance count per row in the scratchpad for the report (task 6.2)".
  - In the workflow, tasks 2.x run in the `apply-prepare` agent and task 6.2 runs in a different agent, `apply-finish` (`.claude/workflows/autonomous-sdd.js:190` and `:194`, two separate `step` calls). The scratchpad is per session, so 6.2 cannot read it.
  - The implementer would then have to rebuild the classification after seeing the panel's answers. That is the very thing D5 ("written after the panel… so as not to hint answers") and the blindness of the procedure try to keep apart.
  - It also leaves the scenario "The report counts the selection per construction" without a fixed input.
  - Correction: persist the record as a committed file that panelists may not read. For example, `docs/measurements/annotation/selection.json`, shaped `{ "fixture", "rows": [ { "construction", "instances", "ids": [...] } ] }`, written in 2.2a/2.2b and committed in 2.4. It is already forbidden to panelists under "`docs/**` otherwise", but name it explicitly in the Panel group's forbidden list and in D4. Task 6.2 copies the table from it. Decide whether it joins the hashed set (if it does, "nine files" becomes ten in the spec "Agreement CLI", D10 and tasks 1.1/8.3); if it does not, say why in D10.
- **B3 — blocking. The report sections that the freeze tests parse have no fixed name or shape.**
  - Only `## Hashes SHA-256` and its row format are fixed (D10).
  - The tests of task 6.1 also parse three other parts of the report:
    - "the selection table" (scenario "The report counts the selection per construction");
    - "the report's discrepancy section", where "no other id appears there";
    - the list of disagreements with "its resolution".
  - None of them has a fixed heading, and the selection table has no fixed column order or construction labels. The labels matter because the test has to know which rows have a minimum (D5 lists them in prose: "facade", "container binding by string", …).
  - Those are names a test pins, and the implementer would pick them alone.
  - Correction: in design D10 (or a new P9) and in task 6.2, fix:
    - the headings, for example `## Selección por construcción`, `## Desacuerdos`, `## Discrepancias con el control`;
    - the table columns: `| Construcción | Instancias | Control | Nuevos |` for the selection, and `| Id | Panelista 1 | Panelista 2 | Resolución |` for the disagreements;
    - the exact construction labels of D5, with the minimum flag per row;
    - that the discrepancy section holds a table with one id per row, or the line "Ninguna." when it is empty.
- **B4 — blocking. The shape of the resolution output is defined two ways.**
  - Spec "Panel output validation" says a resolution has "the same shape with `resolver` instead of `panelist`", which implies `resolver`, `model`, `date`, `sourcesRead` and `sites`, with `resolver` of unstated type.
  - The Panel group (tasks.md:50) says `"resolver": "<model id>"` instead of `"panelist"` and does not mention `model`.
  - A resolver that follows `tasks.md` writes no `model`. If the validator requires `model` (as the spec's wording implies), task 5.1 fails and the ticket stops after the whole panel has run.
  - Correction: one definition in the spec, copied into the Panel group. For example: "A resolution output SHALL be `{ resolver: <model id>, date, sourcesRead, sites }` (no `panelist`, no `model`)". Alternatively, `{ resolver: 1, model, date, sourcesRead, sites }`. Add the case to the scenario "A complete panel output is accepted" or to a resolution case in task 1.1.
- **B5 — blocking. The citation rule says "at least one" in one place and "every" in another.**
  - Design P4 and the requirement's first sentence: at least one citation per answer must name an existing fixture file and a line inside it.
  - The rejection list: "whose citations name a missing file or a line beyond the end of the file". Read literally, any bad citation rejects.
  - The scenario: "cites **only** a file that does not exist… or a line beyond the end".
  - Task 9.2: "a citation beyond the end of its file".
  - The difference decides whether the ticket stops. A `none` reason may well mention a framework path that matches the P4 regex, such as `Illuminate/Support/Facades/Route.php:1`, next to a valid fixture citation.
  - Other edge cases are also left open: line `0`, and a citation of a file of the *other* fixture.
  - Correction, in the requirement "Panel output validation" and in the Panel group: "An answer is rejected when none of its P4 citations names an existing file of the site's fixture with a line between 1 and the file's last line; other citations are ignored" (or the strict "every P4 citation must…", if that is preferred). Align the scenario and the 9.2 case wording with whichever rule is chosen.

## 6. Contradictions inside the change

- **B1 — blocking. Panelists are told to read the ticket description, and its enhanced D2/D4 contradict the Panel group.**
  - The workflow prompt tells every panelist "Read the ticket (Linear MCP) and the group titled Panel" (`.claude/workflows/autonomous-sdd.js:145`), and the allowlist includes `linear:DIS-80/description`.
  - The description was not edited in run 1, so it still carries the enrich-step versions:
    - **Enhanced D2:** "`exact` si el destino queda fijado por … `new X` dentro del fixture". The Panel group says `new X(...)` with no declared constructor → `none`. The description also has none of the run 1 rules: precedence of `heuristic`, static `X::dispatch`, inherited methods, ordering, `read` sites.
    - **Enhanced D4:** "Permitido al panelista: `fixtures/acme-shop/**` y `fixtures/task-api/**`". The Panel group forbids `fixtures/*/README.md`, `fixtures/*/docs/**` and `fixtures/*/tests/**`, which exist (`fixtures/acme-shop/tests/Unit/TaxServiceTest.php`, `fixtures/task-api/tests/unit/task.service.test.ts`, `fixtures/acme-shop/docs/pricing.md`, …). A panelist who follows the description and honestly declares a fixture test makes validation stop the ticket. One who does not declare it is no longer blind.
    - **Enhanced AC 1:** each site gives "solo `id`, `site`, `call` y `source`". The site lists also carry `control` and `form`.
  - Nothing says which text wins, so each panelist decides alone, and the two panelists may decide differently. That inflates disagreement for a reason that has nothing to do with the code.
  - Correction, both:
    - (a) In the Panel group, add a first line: "Where the description of DIS-80 differs from this group (criterion, allowed sources, site fields), this group prevails."
    - (b) In the DIS-80 description, enhanced part only, update D2, D4 and AC 1 to the rule-level text of the Panel group. Name no site, file, line or control answer; the ts-03 rule stays out. The `[original]` block is not touched.
- *Improvable.* Task 3.1 says "no tracked file written by this change … contains an answer of a control site". But `control.json`, the spec "Control reference" and design D3 are written by this change and do contain control answers on purpose (`TaskService::get`). Reword it: "no file a panelist may read (allowlist of design D4) and nothing in the Panel group contains an answer of a control site".
- Otherwise proposal, design and spec agree on the files, the nine hashed files, format 1, the measures, the merge and the CLI.

## 7. Contradictions with the project

Clean.
- **Main specs:** `openspec/specs/` has no capability on annotations, so nothing is duplicated.
- **ADRs:** no ADR bears on measurement data, and design P8 records why none is written.
- **Project docs:**
  - Exit code `2` for a usage error follows `scripts/demo-excerpt.mjs:15-16`.
  - English artifacts with a Spanish report, PR and Linear text follow `docs/base-standards.md` §2 and the project's Linear rule, with design P6.
  - Agent merge in 13.7 follows the autonomous profile, as run 1 noted.

The workflow's resolver prompt ("any measurement output") is reconciled by task 4.4 and D4.

## 8. Contrast with the real code

- Clean on abstractions. The script follows the `scripts/demo-excerpt.mjs` pattern (`.mjs` + `.d.mts` + pure functions + a thin CLI, `--root` like `fixturesRoot`), and no existing abstraction is duplicated.
- The README targets of D12 and task 11.2 exist as described: `README.md:845` "anotados a mano" and `README.md:854` "preguntas y anotación realizadas por la autora".
- The `fixtures/README.md` targets of task 11.1 exist: `:328` and `:330` "hand-annotated", `:332` "pending", and the headings at `:336` and `:353`.
- The fixture `tests/`, `docs/` and `README.md` files exist, which is what makes B1 concrete.
- The `apply-prepare` / `apply-finish` split at `autonomous-sdd.js:190-194` is what makes B2 concrete.

## 9. Task size

Clean. After the run 1 split (2.2a / 2.2b), every task fits one agent turn. Task 6.2 is the heaviest; it fits once its inputs are fixed (B2, B3).

## 10. Mandatory steps

Clean.
- Step 0 comes first and is labelled `(MANDATORY - FIRST STEP)`, with the branch name and prefix.
- These steps are present and labelled:
  - 7 Review existing tests;
  - 8 Run tests and verify data state, with the baseline in 0.4, the report path and the §6 template;
  - 9 Manual interface testing, `AGENT MUST EXECUTE`, with success and error paths;
  - 10 E2E, justified N/A;
  - 11 Docs;
  - 13 Pre-merge review, last, with the three checks in order, fixes on the same PR and the archive before the merge.
- Mutating tasks restore state: 9.1/9.2 work on a scratchpad copy and 9.3 deletes it and checks `git status`. The dev-process stops are present.
- Every scenario maps to a task (7.2: 19 + 4 + 5 = 28; matches the spec).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Call-site lists | Each site list has 50 sites with the controls first | 2.1, 2.2a, 2.2b |
| Call-site lists | Every site points at its call in the fixture | 2.1, 2.2a, 2.2b |
| Call-site lists | A site list carries no answer | 2.1, 2.2a, 2.2b, 3.1 |
| Call-site lists | The report counts the selection per construction | 2.2a, 2.2b (record; see B2), 6.1, 6.2 |
| Control reference | The control reference transcribes the 22 README rows | 2.1, 2.3 |
| Panel output validation | A complete panel output is accepted | 1.1, 1.2, 4.3 |
| Panel output validation | An incomplete panel output is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A citation to a line that does not exist is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A reason without a citation is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | An answer inconsistent between expected and target is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | A target that does not exist in the fixture is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | A declared forbidden source is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A sourcesRead entry that is a directory or a glob is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | A resolution with a source outside the resolver allowlist is rejected | 1.1, 1.2, 5.1 |
| Agreement measures | Percent agreement and Cohen's kappa per language | 1.1, 1.2, 4.3 |
| Agreement measures | Kappa is undefined when the expected agreement is 1 | 1.1, 1.2 |
| Agreement measures | Agreement with the control per panelist | 1.1, 1.2, 4.3 |
| Deterministic merge | Agreed sites take the common answer | 1.1, 1.2, 5.1 |
| Deterministic merge | Disagreements take the resolution | 1.1, 1.2, 5.1 |
| Deterministic merge | A missing or extra resolution fails the merge | 1.1, 1.2, 5.1, 9.2 |
| Deterministic merge | The merge is deterministic | 1.1, 1.2, 5.2 |
| Agreement CLI | An unknown command is a usage error | 1.1, 1.2, 9.2 |
| Agreement CLI | A rejected panel output writes no agreement file | 1.1, 1.2, 4.3, 9.2 |
| Agreement CLI | hashes prints the nine files in order | 1.1, 1.2, 6.2, 9.1 |
| Frozen annotations and report | The recorded hashes match the frozen files | 6.1, 6.2, 6.3, 8.3 |
| Frozen annotations and report | A changed annotation file fails the freeze check | 6.1 |
| Frozen annotations and report | The report states the method and every disagreement | 6.1, 6.2 |
| Frozen annotations and report | The report lists every control discrepancy | 6.1, 6.2, 6.4 |

No empty row. The construction-per-selection row depends on B2 being fixed: its input does not currently reach task 6.2.

---

## Corrections to apply

### `specs/graph-annotations/spec.md`

1. **Requirement "Panel output validation" (B4).** Replace "A resolution output SHALL have the same shape with `resolver` instead of `panelist` and one answer per disagreement" with: "A resolution output SHALL be `{ resolver, date, sourcesRead, sites }`, where `resolver` is the model id, with no `panelist` and no `model` field, and one answer per disagreement." (Or the alternative shape, if it is preferred; the Panel group must use the same one.)
2. **Requirement "Panel output validation" (B5).** Replace "whose `reason` contains no citation, whose citations name a missing file or a line beyond the end of the file" with: "whose `reason` contains no design-P4 citation that names an existing file of the site's fixture with a line between 1 and the file's last line (other citations in the reason are ignored)". Adjust the scenario "A citation to a line that does not exist is rejected" so its WHEN reads: "an answer's reason has no citation to an existing file of the site's fixture with a line inside it (only a missing file, line 0, or a line beyond the end)".
3. **Requirement "Frozen annotations and agreement report" (B3).** Add: "The report SHALL contain the sections `## Selección por construcción` (table `| Construcción | Instancias | Control | Nuevos |`, construction labels as in design D5), `## Desacuerdos` (table `| Id | Panelista 1 | Panelista 2 | Resolución |`), `## Discrepancias con el control` (one id per table row, or the line `Ninguna.`) and `## Hashes SHA-256`."
4. **If B2 adds `selection.json` to the hashed set:** "nine" becomes "ten" in the requirements "Agreement CLI" and "Frozen annotations…", with the file named in the order list.

### `design.md`

- **D4 (B2):** name `docs/measurements/annotation/selection.json` among the files forbidden to panelists and to the resolver.
- **D5 (B2, B3):**
  - the per-site construction record is committed in `docs/measurements/annotation/selection.json` before the panel, never in the site lists;
  - list the exact construction labels the report and the test use, and mark which ones have a minimum.
- **D10 (B2, B3, B4):**
  - the report's section headings and table columns (as in spec correction 3);
  - whether `selection.json` is hashed;
  - the resolution shape (spec correction 1).
- **P4 (B5):** "An answer is valid when at least one P4 citation names an existing file of the site's fixture with a line between 1 and its last line; other citations are ignored."
- **Follow-ups:** one row per finding of this run (B1–B5 and the 3.1 wording), destination A. For B1, also destination B: the enhanced part of the DIS-80 description.

### `tasks.md`

- **Panel group, first paragraph (B1):** add "Where the description of DIS-80 differs from this group (criterion, allowed sources, site fields), this group prevails."
- **Panel group, Output format (B4, B5):**
  - the resolution is `{ "resolver": "<model id>", "date", "sourcesRead", "sites" }`, with no `panelist` and no `model`;
  - "at least one citation must name an existing file of the site's fixture with a line inside it; other citations are ignored".
- **Panel group, Forbidden sources (B2):** add `docs/measurements/annotation/selection.json`.
- **2.2a / 2.2b (B2):** replace "Record each site's construction row and the instance count per row in the scratchpad" with "Write each site's construction row and the instance count per row in `docs/measurements/annotation/selection.json` (labels of design D5)".
- **2.4 (B2):** add `selection.json` to the commit's explicit paths.
- **3.1:** reword to "no file a panelist may read (allowlist of design D4) and nothing in the Panel group contains an answer of a control site".
- **6.1 / 6.2 (B2, B3):** 6.2 builds the selection table from `selection.json` and uses the section headings and columns of design D10; 6.1's real-report cases parse those headings.
- **1.1 (B4, B5):** the accepted-output case includes a resolution of the fixed shape. The citation case covers an answer whose reason has one valid and one out-of-range citation (accepted) and one with only invalid ones (rejected).
- **8.3 / 1.1:** if `selection.json` is hashed, the hash count changes from nine to ten.

### Linear

- **DIS-80, description, enhanced part only (B1).** Update the rules there so they match the Panel group, at rule level:
  - D2: `new X(...)` with no declared constructor → `none`; the run 1 additions (precedence of `heuristic`, static `X::dispatch`, inherited method, "declared first" ordering, `read` sites).
  - D4: allowed sources = `fixtures/acme-shop/{app,routes,config,database}/**`, `composer.json`, `fixtures/task-api/src/**`, `package.json`, `tsconfig.json`; the fixtures' `README.md`, `docs/` and `tests/` are forbidden.
  - AC 1: the site lists also carry `control` and `form`.

  Rules for this edit:
  - Write it in Spanish, marked as agent's text.
  - Name no site, file, line or control answer; keep the ts-03 rule out.
  - Do not edit the `[original]` block.
- **DIS-80, comment in Spanish:** a summary of this round: the description is aligned with the Panel group, which prevails; the selection record is committed in `selection.json`, forbidden to the panel; the report headings are fixed; the resolution shape is fixed; and the citation rule is "at least one valid citation".

---

## Resolution of run 2

*Agent's text (correction round 2, 2026-10-28), decided as lead engineer in an autonomous run without the author. Each decision is also in `design.md` → Follow-ups (rows R2-*) with its destination. `openspec validate callsite-annotations --strict` passes after the edits.*

**Questions for the author:** none in this run.

**Blocking findings**

- **B1 — fixed (both corrections).** (a) The Panel group's first paragraph now says that where the DIS-80 description differs from the group (criterion, allowed sources, site fields, output format), the group prevails. (b) The enhanced part of the DIS-80 description was edited, in Spanish and marked as agent's text: AC 1 lists `control` and `form`; D2 says `new X` is `exact` only for a fixture class that declares a constructor and carries the run 1 additions (precedence of `heuristic`, static `X::dispatch` and variants, `new` with no constructor, inherited method, "declared first" ordering, `read` sites); D4 has the closed allowlist and forbids the fixtures' `README.md`, `docs/`, `tests/`, `control.json` and `selection.json`. No site, file line or control answer is named; the ts-03 rule stays out; `[original]` is untouched.
- **B2 — fixed, decided by the agent.** The construction record is `docs/measurements/annotation/selection.json` (`{ "fixtures": [ { "fixture", "rows": [ { "construction", "instances", "ids" } ] } ] }`), written in tasks 2.2a/2.2b and committed in 2.4 with the site lists, before the panel. It is forbidden to panelists and resolver (D4, Panel group, spec scenario for the resolver allowlist). Task 6.2 copies the report table from it. Decided **not** to hash it (the set stays at nine files): it is committed before the panel, it is neither a panel output nor an input of DIS-79, and the freeze test compares the report's selection table with it, so a later edit fails that test anyway (reason in D10).
- **B3 — fixed.** The spec "Frozen annotations and agreement report" fixes four sections and their columns: `## Selección por construcción` (`### acme-shop` / `### task-api`, `| Construcción | Instancias | Control | Nuevos |`), `## Desacuerdos` (`| Id | Panelista 1 | Panelista 2 | Resolución |`, or `Ninguno.`), `## Discrepancias con el control` (`| Id | Anotación final | Control | Justificación |`, or `Ninguna.`) and `## Hashes SHA-256`. Design D5 gains the exact construction labels per fixture, with the minimum flag (`other` has none). Tasks 6.1 and 6.2 use them.
- **B4 — fixed.** One shape: a resolution is `{ resolver: <model id>, date, sourcesRead, sites }`, with no `panelist` and no `model`. Spec, design D10 and the Panel group say the same; the validation list names the required fields per shape; the accepted-output scenario includes a resolution and the incomplete-output scenario a resolution without `resolver`; task 1.1 has both cases.
- **B5 — fixed, decided by the agent: the lenient rule.** An answer is valid when at least one P4 citation names an existing file of the site's fixture with a line between 1 and its last line; other citations (a framework path, a file of the other fixture, line 0, a line beyond the end) are ignored. Chosen because a `none` reason may legitimately cite a framework path next to the fixture line. Spec, P4, Panel group, task 4.3, task 9.2 and the scenarios "A complete panel output is accepted" (one valid and one out-of-range citation) and "A citation to a line that does not exist is rejected" are aligned.

**Improvable findings**

- **Task 3.1 wording — fixed.** It now checks that no file a panelist may read (the two site lists, `tasks.md`, the DIS-80 description) and nothing in the Panel group contains a control answer or a site's construction label.

**Other edits.** The proposal names `selection.json` and the exact hashed set. Scenario count unchanged: 19 + 4 + 5 = 28 (task 7.2).

**Linear.** DIS-80: description, enhanced part only, aligned (B1); Spanish comment summarising this round.

---

## Run 3 (2026-10-28)

CHANGES REQUIRED

**Questions for the author**

None. The three blocking findings below can be fixed inside the change and in the enhanced part of DIS-80. Earlier decisions marked as the agent's text are accepted except where noted: the lenient citation rule (R2-B5) conflicts with enhanced AC 5 of DIS-80 (finding B3).

Inputs read:
- **The change:** `proposal.md`, `design.md`, `specs/graph-annotations/spec.md`, `tasks.md`, and `reports/2026-10-28-spec-audit.md` (runs 1–2 and their resolutions).
- **Linear:** DIS-80 (description `[original]` / `[reality-map]` / `[enhanced]`, and its 5 comments) and its parent DIS-53.
- **Workflow:** `.claude/workflows/autonomous-sdd.js` (`COMMON`, `step`, `runPanel`).
- **Docs:** `docs/AUTONOMOUS-RUN.md` §6 and `docs/base-standards.md` (searched for fixture or Table 2 content: none).

---

## 1. Scope against the ticket

Clean. Everything traces to DIS-80's `[original]` DoD and procedure, its enhanced D1–D12, or a correction from runs 1–2. Nothing widens toward DIS-53's Table 1, `measure-graph` or the filled Table 2, which stay explicit non-goals.

## 2. Inherited acceptance criteria

The DoD of DIS-80 and enhanced AC 1–4 each have a requirement and a scenario. From DIS-53, only "Dado 50 sitios anotados por lenguaje" is inherited, and it is covered.

- **B3 — blocking. Enhanced AC 5 contradicts the citation rule of the change.**
  - AC 5 of the DIS-80 description (enhanced part, which the panelists read) says: "*Si* un panelista … cita una línea que no existe en el fixture … su salida no se usa y el ticket se para".
  - Run 2 decided the lenient rule instead (R2-B5): an answer is valid when **at least one** citation is valid, and other citations, including lines beyond the end of a file, are ignored. That is now in the spec "Panel output validation", P4, the Panel group and tasks 4.3/9.2.
  - So the ticket's acceptance criterion and the change's requirement give opposite results for an answer with one valid and one out-of-range citation. The scenario "A complete panel output is accepted" pins acceptance of exactly that answer.
  - `/verify-against-spec` will compare the PR with AC 5 as written.
  - Run 2 aligned AC 1, D2 and D4 of the description but not AC 5.
  - Correction: in the enhanced part of DIS-80 (never `[original]`), reword AC 5's first sentence at rule level: "… o una respuesta no tiene ninguna cita válida (fichero existente del fixture del sitio y línea dentro del fichero; las demás citas se ignoran) …".

## 3. Missing scenarios

Clean. Every MUST clause has a scenario:
- the validation list;
- the CLI exit codes;
- the selection per construction;
- the control discrepancies;
- the merge failure.

The "precedes any `measure-graph` run" clause is checked by task 8.3, as the spec states.

## 4. Ambiguity

Clean. None of fast / easy / secure / efficient / many / appropriate / robust occurs in the artifacts. The only hit is the quotation in `design.md:340` (Follow-up I3).

## 5. Open decisions

- **B1 — blocking. The resolver may read `agreement.json`, which holds each panelist's agreement with the control. This breaks the blindness of the tie-break with respect to the control.**
  - **The file's content.** The spec "Agreement measures" says the computation "SHALL write `docs/measurements/annotation/agreement.json` with these figures and the ids of the disagreements". "These figures" include, per panelist and language, the agreement with the control reference (agreed count, percent, kappa).
  - **Who reads it.** The spec's resolver allowlist, design D4, D8, the Panel group allowlist and task 4.4 all let the resolver read `agreement.json`.
  - **What the resolver can infer.** The site lists mark every control site with `control: true`. A resolver that reads "panelist 1: 10/10 on the TS control, panelist 2: 7/10" knows which panelist matches the hidden reference. On any disagreement at a control site, it can side with that panelist without judging the code.
  - **What that breaks:**
    - D8 and enhanced D8 of the ticket: the resolver sees "only the disagreement ids, both answers and the fixture code (… no el control)".
    - The "Discrepancias con el control" section: its count would be biased towards zero.
  - **The change contradicts itself.** Task 4.4 and D4 call `agreement.json` "the list of disagreement ids … not a measurement". The spec makes it hold percent and kappa, which is precisely the "measurement output" that the workflow's resolver prompt forbids (`.claude/workflows/autonomous-sdd.js:154`).
  - **Also open:** the content of `agreement.json` is not fixed beyond "these figures and the ids", so the implementer could also add per-site control results.
  - **Correction, preferred:** remove `agreement.json` from the resolver allowlist. The resolver derives the disagreement ids from `panelist-1.json` and `panelist-2.json`, which task 4.4 already allows. Edit:
    - spec "Panel output validation": the resolver allowlist, and the scenario "A resolution with a source outside the resolver allowlist is rejected", which must now reject `agreement.json`;
    - design D4 and D8;
    - the Panel group allowlist;
    - tasks 1.1/1.2 and 4.4.
  - **Alternative:** fix the shape of `agreement.json` in the spec with no control figures, and move the control figures to a separate file that the resolver may not read. This changes the hashed set from nine to ten.
- **B2 — blocking. The resolver's own workflow instructions direct it to files outside its allowlist.** An honest resolver therefore stops the ticket after the whole panel has run.
  - **What the workflow tells the resolver.** The resolver runs as a workflow `step` (`autonomous-sdd.js:154` → `step()` at `:90-91`), so its prompt starts with `COMMON` (`:62-73`):
    - "Follow the contract in docs/AUTONOMOUS-RUN.md §6 strictly";
    - "record each decision in the Linear ticket and in design.md → Follow-ups";
    - "Use the Linear MCP for the ticket".
  - **What that conflicts with:**
    - `docs/AUTONOMOUS-RUN.md` is outside the resolver allowlist ("`docs/**` otherwise" is forbidden). If declared in `sourcesRead`, `merge` (task 5.1) rejects the resolution and the ticket stops. If not declared, `sourcesRead` is false.
    - `design.md` is forbidden, and D3 in it states the control target of ts-03. Writing a Follow-up there means reading it.
    - Linear comments are forbidden (P2): the DIS-31 comment on DIS-80 gives the answers of ts-07 and ts-10.
  - **The same applies to every agent.** The project `CLAUDE.md` points every agent at `docs/base-standards.md`, which is also outside both allowlists. I searched it for fixture or Table 2 content and found none, so allowing it costs no blindness.
  - **Nothing in the change reconciles this.** The Panel group never tells the resolver how to treat its step contract.
  - **Correction:**
    - In the spec "Panel output validation", design D4 and the Panel group allowlist, add `docs/base-standards.md` to both allowlists and `docs/AUTONOMOUS-RUN.md` to the resolver allowlist. Both are process documents with no fixture content.
    - In the Panel group, add a resolver paragraph: "The general contract of your workflow step applies to git and commits only: the resolver records no decision in `design.md` and writes no Linear comment; it reads neither `design.md`, the specs, the spec-audit report nor any Linear comment; every process document it reads goes in `sourcesRead`."
    - Add an accepted case for these process documents to task 1.1, under the scenario "A complete panel output is accepted".

## 6. Contradictions inside the change

- B1 (task 4.4 and D4 say `agreement.json` is "not a measurement"; the spec "Agreement measures" makes it hold percent and kappa) is counted above.
- Otherwise, the proposal, the design and the spec agree on:
  - the files and the nine hashed files;
  - format 1;
  - the measures;
  - the merge;
  - the CLI;
  - the report sections.

## 7. Contradictions with the project

- B2 (the workflow step contract against the panel allowlists) is counted above.
- No main spec is duplicated: `openspec/specs/` has no capability on annotations.
- No ADR bears on this change (P8).
- Exit code `2` for usage errors follows the project convention.
- The agent merge follows the autonomous profile.

## 8. Contrast with the real code

- The script follows the `scripts/demo-excerpt.mjs` pattern and duplicates no abstraction.
- The README targets of D12 and the fixture-layout facts were confirmed in run 2 and are unchanged.
- The workflow code at `autonomous-sdd.js:62-73`, `:90-91` and `:154` makes B2 concrete.
- *Improvable.* `source` is "the function or method that contains the call". It does not say what happens for a call inside a closure, an arrow function or an anonymous callback (`.map(t => …)` in `src/**`, `Route::get(…, function () {…})`). Add to the spec "Call-site lists": "anonymous functions and closures are transparent: `source` is the innermost named function or method, or the file". Impact is low, because the D1 matching key does not compare source names, but the site-list test pins it.

## 9. Task size

Clean. Tasks 2.2a/2.2b and 6.2 are the heaviest. Each fits one agent turn now that its inputs are fixed.

## 10. Mandatory steps

Clean.
- Step 0 comes first and is labelled `(MANDATORY - FIRST STEP)`, with the branch.
- These steps are present and labelled:
  - 7 Review existing tests;
  - 8 Run tests and verify data state, with the baseline in 0.4, the report path and the §6 template;
  - 9 Manual interface testing (`AGENT MUST EXECUTE`), with error cases and restoration in 9.3;
  - 10 E2E, justified N/A;
  - 11 Docs;
  - 13 Pre-merge review, last, with the archive before the merge.
- The scenario count is 19 + 4 + 5 = 28, and it matches the spec.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Call-site lists | Each site list has 50 sites with the controls first | 2.1, 2.2a, 2.2b |
| Call-site lists | Every site points at its call in the fixture | 2.1, 2.2a, 2.2b |
| Call-site lists | A site list carries no answer | 2.1, 2.2a, 2.2b, 3.1 |
| Call-site lists | The report counts the selection per construction | 2.2a, 2.2b, 2.4, 6.1, 6.2 |
| Control reference | The control reference transcribes the 22 README rows | 2.1, 2.3 |
| Panel output validation | A complete panel output is accepted | 1.1, 1.2, 4.3 |
| Panel output validation | An incomplete panel output is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A citation to a line that does not exist is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A reason without a citation is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | An answer inconsistent between expected and target is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | A target that does not exist in the fixture is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | A declared forbidden source is rejected | 1.1, 1.2, 4.3, 9.2 |
| Panel output validation | A sourcesRead entry that is a directory or a glob is rejected | 1.1, 1.2, 4.3 |
| Panel output validation | A resolution with a source outside the resolver allowlist is rejected | 1.1, 1.2, 5.1 (content changes with B1/B2) |
| Agreement measures | Percent agreement and Cohen's kappa per language | 1.1, 1.2, 4.3 |
| Agreement measures | Kappa is undefined when the expected agreement is 1 | 1.1, 1.2 |
| Agreement measures | Agreement with the control per panelist | 1.1, 1.2, 4.3 |
| Deterministic merge | Agreed sites take the common answer | 1.1, 1.2, 5.1 |
| Deterministic merge | Disagreements take the resolution | 1.1, 1.2, 5.1 |
| Deterministic merge | A missing or extra resolution fails the merge | 1.1, 1.2, 5.1, 9.2 |
| Deterministic merge | The merge is deterministic | 1.1, 1.2, 5.2 |
| Agreement CLI | An unknown command is a usage error | 1.1, 1.2, 9.2 |
| Agreement CLI | A rejected panel output writes no agreement file | 1.1, 1.2, 4.3, 9.2 |
| Agreement CLI | hashes prints the nine files in order | 1.1, 1.2, 6.2, 8.3, 9.1 |
| Frozen annotations and report | The recorded hashes match the frozen files | 6.1, 6.2, 6.3, 8.3 |
| Frozen annotations and report | A changed annotation file fails the freeze check | 6.1 |
| Frozen annotations and report | The report states the method and every disagreement | 6.1, 6.2 |
| Frozen annotations and report | The report lists every control discrepancy | 6.1, 6.2, 6.4 |

No empty row.

**Improvable findings not listed above**
- **File shapes the tests read are fixed only in tasks.**
  - The top-level shape of the site lists (`{ fixture, language, sites }`) is in task 2.2a only, and that of `control.json` (`{ sites: [...] }`) in task 2.3 only.
  - The shape of `agreement.json` is fixed nowhere, yet task 6.1's real-report test reads its disagreement ids.
  - Move all three into the spec, with "Agreement measures" fixing `agreement.json` as, for example, `{ "languages": [ { "fixture", "n", "agreed", "percent", "kappa", "disagreements": [ids], "control": [ { "panelist", "n", "agreed", "percent", "kappa", "indicative": true } ] } ] }`.
  - State in D10 that `agreement` reads `control.json`.
- **Discrepancy table cells.** The cells "Anotación final" and "Control" of `## Discrepancias con el control` have no fixed format. Use the format of `## Desacuerdos` (`<expected> · <target.file> · <target.symbol>` or `none`).
- **`panelist` field not checked against its file.** Validation could require `panelist` to equal 1 in `panelist-1.json` and 2 in `panelist-2.json`. It is a cheap check against a swapped file.

---

## Corrections to apply

### `specs/graph-annotations/spec.md`
1. **"Panel output validation" (B1, B2).**
   - Resolver allowlist: replace "the panelist allowlist plus `docs/measurements/annotation/panelist-1.json`, `panelist-2.json` and `agreement.json`" with "the panelist allowlist plus `docs/measurements/annotation/panelist-1.json`, `docs/measurements/annotation/panelist-2.json` and `docs/AUTONOMOUS-RUN.md`".
   - Panelist allowlist: add `docs/base-standards.md`.
   - Scenario "A resolution with a source outside the resolver allowlist is rejected": WHEN "… includes `docs/measurements/annotation/control.json`, `docs/measurements/annotation/selection.json`, `docs/measurements/annotation/agreement.json` or `fixtures/README.md`, while `panelist-1.json`, `panelist-2.json` and `docs/AUTONOMOUS-RUN.md` are accepted".
2. **"Agreement measures" (improvable).** Fix the shape of `agreement.json`.
3. **"Call-site lists" (improvable).**
   - Add the top-level shape `{ fixture, language, sites }`.
   - Add the closure rule for `source`.
4. **"Control reference" (improvable).** Add the shape `{ sites: [ { id, target, expected } ] }`.
5. **"Frozen annotations and agreement report" (improvable).** The cells of `## Discrepancias con el control` are written like those of `## Desacuerdos`.

### `design.md`
- **D4:** apply B1 (drop `agreement.json` from the resolver's reads) and B2 (add `docs/base-standards.md` to both roles and `docs/AUTONOMOUS-RUN.md` to the resolver).
- **D8:** "the resolver derives the disagreement ids from the two panel outputs; it never reads `agreement.json`, which holds the control figures".
- **D10:** `agreement` reads `control.json`; the shape of `agreement.json` is as in the spec.
- **Follow-ups:** rows R3-B1, R3-B2, R3-B3 (destination A; R3-B3 also B, the enhanced part of the DIS-80 description), plus one row per improvable finding that is taken.

### `tasks.md`
- **Panel group:**
  - **Allowed sources.** Drop `agreement.json` from the resolver's list. Add `docs/base-standards.md` (all roles) and `docs/AUTONOMOUS-RUN.md` (resolver).
  - **New resolver paragraph (B2).** "The general contract of your workflow step applies to git and commits only: you record no decision in `design.md` and write no Linear comment; you read neither `design.md`, the specs, the spec-audit report nor any Linear comment; every process document you read goes in `sourcesRead`."
- **4.4:** "Derive the disagreement ids from `panelist-1.json` and `panelist-2.json` (same `expected` and same `target` = agreed); do not read `agreement.json`."
- **1.1:**
  - the resolver-allowlist case rejects `agreement.json`;
  - the accepted-output case accepts `docs/base-standards.md` (panelist) and `docs/AUTONOMOUS-RUN.md` (resolver).
- **1.2:** the allowlists as above.

### Linear
- **DIS-80, description, enhanced part only (B3).** In AC 5, replace "cita una línea que no existe en el fixture" with "tiene una respuesta sin ninguna cita válida (fichero existente del fixture del sitio y línea dentro del fichero; las demás citas se ignoran)".
  - Optionally, also in enhanced D8: "el desempate deduce los desacuerdos de las dos salidas y no lee `agreement.json`".
  - Write it in Spanish, marked as agent's text. Do not touch `[original]`. Name no site and no control answer.
- **DIS-80, comment in Spanish:** a summary of round 3:
  - the resolver no longer reads `agreement.json`, because it holds the panelists' agreement with the control;
  - process documents (`docs/base-standards.md`, `docs/AUTONOMOUS-RUN.md`) are now allowed;
  - the resolver does not write to `design.md` or Linear;
  - AC 5 is aligned with the citation rule.
