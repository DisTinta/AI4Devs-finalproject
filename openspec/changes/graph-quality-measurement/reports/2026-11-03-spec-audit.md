CHANGES REQUIRED

**Questions for the author** (the sub-issue and the parent disagree; the auditor does not settle them):

- Q1. **Coverage definition.** Parent DIS-53, AC 1: "cobertura (sitios con arista / 50)". Sub-issue DIS-79 `[enhanced]` M4 (agent text): `tp / positives`, so the 19 + 24 `none` sites are excluded and the denominators are 31 and 26. The change follows M4 (design D4). Do you accept that the published "Cobertura" is `tp / positives` and not "/ 50"? Not blocking: the sub-issue governs and the deviation is recorded in design → Follow-ups (M4).
- Q2. **Precision definition.** Parent DIS-53, AC 1: "precisión (aristas con la resolución esperada / aristas emitidas)". The change publishes `tp / (tp + false-positive edges)` and moves the parent's ratio to `resolutionAgreement`, which appears in the report only and is not a README column (P2). Do you accept that Table 2's "Precisión" column means "no wrong edge with the called name" rather than "right resolution"? Not blocking, for the same reason as Q1.

Audit inputs: `proposal.md`, `design.md`, `specs/graph-quality/spec.md` and `tasks.md` of `openspec/changes/graph-quality-measurement` (branch `feature/dis-79-measure-graph` at `2655657`). Linear DIS-79 (`[original]` + `[reality-map]` + `[enhanced]`, 7 comments) and its parent DIS-53 (1 comment). `docs/base-standards.md` §7.1, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (lines 316-328, 628-630, 1671-1676), `docs/adr/20261020-kit-autonomous-mode.md`, `openspec/specs/graph-annotations/spec.md`, `readme.md` (lines 20-33, 866-894), `docs/measurements/annotation-agreement.md`, `docs/measurements/annotation/agreement.json`, `docs/measurements/annotation/selection.json`, `fixtures/annotations/*.callsites.json`, `seeds/graph-dump.sql`, `scripts/annotation-agreement.mjs`, `packages/cli/src/seed/parse-seed.ts` and `tests/unit/scripts/wiring.spec.ts`. `docs/backend-standards.md` sets nothing for `scripts/` that bears on this change.

---

## 1. Scope against the ticket

Everything in the change follows from the DIS-79 sub-issue (original text plus `[enhanced]` M1–M10):

- Script, freeze check first, seed as the graph, M3 rules, M4 measures, JSON, report, Table 2, README intro rewrite and the re-pointing of row 29 (M9), the PowerShell check (M10). All are in the ticket.
- P1 ("Annotation files are complete") comes from the parent's AC "el script falla si faltan sitios", which the sub-issue inherits for Table 2. Accepted.
- P4 (`read` → `get<Studly>Attribute` / camel case) and P6 (every enclosing symbol) refine the M3 rules so they work on the frozen data (`form: read` exists since DIS-80). They are not new scope. Task 10.4 records them in the ticket. Accepted.
- Edits to `docs/project-context.md` and `prompts.md`: mandatory documentation. Accepted.

The change does not widen to the parent's Table 1 (`measure-context` is a non-goal). No invented scope. **Clean.**

## 2. Inherited acceptance criteria

The parent ACs the sub-issue inherits (Table 2 only), plus the sub-issue's own ACs 1–5:

| AC | Requirement | Scenario | State |
|---|---|---|---|
| Parent 1: coverage, precision, exact/heuristic counts; fails if sites are missing | Measures per project; Annotation files are complete | Measures of a synthetic project; An annotation file has 49 sites | Covered (definitions: Q1, Q2) |
| Parent 4: deterministic | Measurement output and CLI | The measurement is deterministic | Covered |
| Parent 5: TS ≥ PHP, otherwise explained in the text | Published Table 2 (last sentence) | **none** | **B1** |
| Parent 3: Table 2 without *(pendiente)* | Published Table 2 | The README table agrees with the measurement | Covered |
| Sub 1: per-site result with "aristas atribuidas" | Measurement output and CLI | The measurement is deterministic | **Partial**: D6 stores only `hit` and `falsePositiveEdges`, not the attributed edges. See B4 |
| Sub 2: freeze broken → 1, seed not read; unknown argument → 2 | Freeze check; CLI | 2 + 1 scenarios | Covered |
| Sub 3 (a)–(f): matching rules | Site matching and attribution; Measures | 9 + 2 scenarios | Covered (B2 and B3 are open rules inside it) |
| Sub 4: Table 2 format, caption with the agreement, doc test | Published Table 2; Committed measurement | 2 scenarios | Covered (format of the caption: B6) |
| Sub 5: frozen sources untouched | The frozen sources are not modified | 1 scenario | Covered |

- **B1 (blocking).** The parent's "TS ≥ PHP; si no, se explica en el texto en lugar de ajustarse" is a SHALL clause of "Published Table 2" with no scenario. Nothing tests it. Fix: add a scenario that a test can evaluate against the JSON (see Corrections).

The parent's limitation "anotación por la autora" is superseded by the DIS-80 comment on DIS-53 (2026-10-28). The change respects that: the report says agents, never "humana" or "a mano". Consistent.

## 3. Missing scenarios

- B1 (above): the TS < PHP explanation clause.
- **B7 (blocking).** Design D2 and D5 make a malformed line of the four tables an error (exit 1), and the Goals promise "a failure mode for every broken input (… seed)". The requirement "The graph is read from the seed" has no MUST for a missing or malformed seed, and no scenario covers it. The only nearby scenario uses an unparseable seed to prove the seed is *not* read. See point 5 for the open error case.
- **Improvable.** "Measurement report" requires the method, the M7 independence statement, the definitions and four limitations. Its only scenario checks the three parsed sections and the forbidden words. Add to that scenario: the report contains the headings `## Método` and `## Limitaciones`, and the sentence stating that the measuring agent annotated no site. M7 comes from the ticket's original text ("la ejecuta un agente distinto de los anotadores").
- **Improvable.** "Annotation files are complete": `formatVersion` ≠ 1 and duplicated ids are in the MUST, but only the 49-sites case is a scenario (task 2.1 adds them as "extra assertions"). There is also no scenario for the CLI exit 1 and the empty output. Extend the scenario: "… and `formatVersion: 2` or a repeated id each give one problem naming the file; through the CLI the exit code is 1 and no output file is written".

## 4. Ambiguity

Searched for "fast", "easy", "secure", "efficient", "many", "appropriate" and "robust". Hits:
- spec line 81 "however many sites attribute it": this is a quantifier, not a vague quality. Fine.
- proposal line 15 "a small CLI": descriptive, not a requirement. Fine.
- spec line 231, limitation "a small sample built on purpose". **Improvable:** write "50 sitios por lenguaje en dos repositorios de muestra creados a propósito", so the report states the size.

No blocking ambiguity.

## 5. Open decisions

- **B2 (blocking): called-name derivation is underspecified, and wrong on real data.** Spec "Site matching and attribution" and design D3.4 say "last identifier of `call` once parentheses, quotes and `@` are removed".
  - *Removing* `@` concatenates its two sides. The frozen site `php-12` has `call: "'App\\Http\\Controllers\\CheckoutController@store'"` (`fixtures/annotations/acme-shop.callsites.json:234`). That rule gives `CheckoutControllerstore`, not `store`, so a wrong `store` edge would never be attributed.
  - D3.4 lists only `(`, while the spec says "parentheses".
  - `<StudlyName>` and "camel-case form" are not defined for snake_case properties. The frozen read site `$order->shipping_country` (`acme-shop.callsites.json:866`) needs a fixed conversion, because a test will pin the outcome.
  - Fix: replace each of `(`, `)`, `'`, `"`, `@`, `[`, `]` with a space, then take the last match of `[A-Za-z_$][A-Za-z0-9_$]*`. For `read`, define camel case as "split on `_`, first part unchanged, every later part with its first letter upper-cased" (`shipping_country` → `shippingCountry`) and Studly as the camel form with its first letter upper-cased (`getShippingCountryAttribute`). Add both examples to a scenario.
- **B3 (blocking): which edge is "the hit" when several qualify.** Several edges of one scope can reach the annotated target. Under rule D3.2 a method and its enclosing class both qualify as sources, and the analyzers may emit an `exact` and a `heuristic` edge to the same target. The JSON records one `hit: { resolution, extractor }`, and `resolutionAgreement.agreed` depends on which one is chosen. Neither the spec nor D3 fixes the choice. Fix: in "Site matching and attribution", add: "When several edges of the scope are hits, the site's hit SHALL be the one whose `resolution` equals `expected` if any, otherwise the first in seed order". Add a scenario "Of two hits, the one with the expected resolution is recorded".
- **B4 (blocking): the `## Sitios fallados` table cannot be derived from the JSON, and its cell formats are open.**
  - The spec says the cells `Llamada`, `Sitio` and `Aristas atribuidas` equal "the value derived from the JSON". The D6 layout stores neither `call` nor `site`, and stores only `falsePositiveEdges`, not the attributed edges. Sub-issue AC 1 asks for "aristas atribuidas" per site.
  - The formats are not fixed: `Sitio` as `file:line`? How are several edges listed? What does an `fn` site with no attributed edge show?
  - Fix (choose one and write it in D6 and the spec): add `call`, `site: { file, line }` and `attributedEdges: [ { file, symbol, resolution } ]` (sorted by `file`, `symbol`, `resolution`) to every `sites[]` entry, and have the report cells read them. Fix the formats: `Sitio` = `` `<file>:<line>` ``; `Llamada` = `` `<call>` ``; `Aristas atribuidas` = `` `<file> · <symbol> · <resolution>` `` joined by `<br>`, or `—` when empty.
- **B5 (blocking): `## Resultados` formatting is self-contradictory.** "the first three cells formatted as in Table 2" for the columns `Proyecto | Cobertura | Precisión | Resolución coincidente | …`. The first cell is the project name, so `Resolución coincidente` has no stated format. Fix: "the cells `Cobertura`, `Precisión` and `Resolución coincidente` formatted with `formatRatio` (`Resolución coincidente` = `formatRatio(agreed, of)`); `Proyecto` is `` `<fixture>` ``".
- **B6 (blocking): the agreement citation under Table 2 has no fixed text, and a test will parse it.** The spec says "cite, per sample project, the inter-annotator percent agreement and kappa … (decimal comma)". D7 gives only fragments (`100 %`, `kappa 1`). Nothing fixes how a project is named, the format of a non-integer percent, or what a `null` kappa looks like. Fix in D7 and the spec, one line per project: `` `<fixture>`: concordancia <percent with decimal comma, no trailing ,0> % (<agreed>/<n>), kappa <kappa with decimal comma or «no definido»> ``. Example: `` `acme-shop`: concordancia 100 % (50/50), kappa 1 ``.
- **B7 (blocking, also point 3): seed missing or malformed.** The exit code, the stderr text and the no-write guarantee are only in the design. Fix: add to "The graph is read from the seed": "When `seeds/graph-dump.sql` cannot be read, or a line of the tables `project`, `file`, `symbol` or `edge` cannot be read, the command SHALL exit 1, write one stderr line naming `seeds/graph-dump.sql` (and the line number for a malformed line), and write no output file". Add the scenario "A malformed seed line is an error".
- **Improvable.**
  - The stdout summary line and the usage line have no exact text. Task 3.5 only counts lines, and the README is filled "from the printed values". Pin both in D5: usage `Usage: node scripts/measure-graph.mjs [--root <dir>]`; summary `` <fixture>: cobertura <formatRatio> · precisión <formatRatio> · calls <exact> exact / <heuristic> heuristic ``.
  - Project order and file discovery ("in the order of the annotation files"): write "the fixed list `acme-shop`, `task-api`, paths `fixtures/annotations/<fixture>.callsites.json`".
  - `falsePositiveEdges` is sorted by `file`, `symbol` only. Add `resolution` as the tie-break, so the order is a total order.
  - `--root` given without a value, or given twice → state exit 2 (the template `parseArguments` in `scripts/annotation-agreement.mjs:610-613` already does this).

## 6. Contradictions inside the change

- D6 (JSON layout) vs. the spec "Measurement report" / its scenario: the report's cells come "from the JSON", but the JSON lacks them. This is B4.
- Spec "Measurement report" `## Resultados`: "first three cells" vs. the column order. This is B5.
- D3.4 "removing `(`" vs. the spec "parentheses". This is part of B2.
- D6 `sites[]` vs. sub-issue AC 1 ("aristas atribuidas"). This is part of B4.
- **Improvable.** Design Context quotes `checkFreeze`'s problem as `the report records no hash`. The real text is `the report records no SHA-256 hash` (`scripts/annotation-agreement.mjs:461`). Quote it exactly, since a test may assert it.

## 7. Contradictions with the project

- `openspec/specs/graph-annotations/spec.md` → "Frozen annotations and agreement report": the change keeps the freeze commit before any `measure-graph` run, and creates no delta. Consistent.
- `docs/openspec-tasks-mandatory-steps.md` §3, Pre-merge item 5 ("the agent never merges") vs. task 11.9 (`gh pr merge <n> --merge`): `docs/adr/20261020-kit-autonomous-mode.md` (line 71) explicitly supersedes that item for the autonomous run. Consistent.
- **Improvable.** `readme.md:894` and `docs/project-context.md:1672` say "dos agentes … de modelos distintos". The spec's report limitation says "agents of one model family" (true: `claude-opus-5-5` and `claude-sonnet-5-5`, `annotation-agreement.md:19-20, 124`). The two statements are not false, but they read as opposite. Write the limitation as "dos modelos distintos (`claude-opus-5-5`, `claude-sonnet-5-5`) de una misma familia".
- No other conflict with `docs/project-context.md` (scripts import only `node:` built-ins and siblings; tests in `tests/unit/scripts/` typed through `.d.mts`; outside Stryker).

## 8. Contrast with the real code

- **Improvable: rounding.** D4 rounds with `Math.sign(x) * Math.round(Math.abs(x) * 1e4) / 1e4` on the float ratio. `scripts/annotation-agreement.mjs:265-278` (`roundRatio`) deliberately uses integer arithmetic "so that no binary rounding error decides a tie". It is not exported, and the design's non-goals forbid changing that file's exports. Fix: D4 and D7 should round from the integers with the same formula (`Math.floor((2·n·10^k + d) / (2·d)) / 10^k`), reimplemented in the script. Do not use the float formula.
- **Improvable: seed-reader parity.** `packages/cli/src/seed/parse-seed.ts:163, 172-201` accepts `E'…'` literals with `\\` and `\uXXXX`. D2's reader accepts only `'…'` with `''`. Today the seed has no `E'` (0 occurrences), so the parity test passes. A later seed with a backslash in a signature would make `measure-graph` fail while `db:seed` loads it. Fix: D2 also accepts `E'…'` with the same two escapes.
- `checkFreeze(report, root)` (`scripts/annotation-agreement.mjs:452`) takes the report *text*. The script reads the report itself and names it on failure; D5 and the scenario "The agreement report is missing" already plan this. Consistent.
- `tests/unit/scripts/wiring.spec.ts:150-168` limits `scripts/*.mjs` to `node:` and `./*.mjs` imports. D2 respects it; tests importing `packages/cli/src/seed/parse-seed.ts` have precedent (`tests/unit/cli/seed-build.spec.ts:11-12`). Consistent.
- The README Table 2 header is ``Aristas `exact` `` / ``Aristas `heuristic` `` with backticks (`readme.md:887`). **Improvable:** quote it that way in the spec, so the parser matches.

## 9. Task size

Every task fits one agent turn. **Improvable:** 5.4 bundles the report test, the three parsed sections and the whole report text. Splitting it ("5.4 RED test" / "5.5 write report") would make the RED evidence cleaner. Not blocking.

## 10. Mandatory steps

- Step 0 is first and creates/verifies `feature/dis-79-measure-graph` from `final-project-CRN` (`docs/project-context.md:628`).
- Steps 6, 7, 8, 9, 10 and 11 are present, numbered in order and labelled `(MANDATORY)`. Steps 8, 9 and 11 say `AGENT MUST EXECUTE`. Step 7 names `reports/YYYY-MM-DD-7-test-and-state-verification.md`.
- Mutating tasks restore state: 5.2 (point the test at a changed copy, then restore), 7.6, 8.2 (delete the copies), 8.3. `node scripts/dev-processes.mjs stop` is in 7.6 and 8.3.
- The PowerShell check is the agent's (8.1), with `pwsh -NoProfile` and `powershell.exe -NoProfile` and no `$env:`.
- Pre-merge runs the three checks in order, puts fixes on the same PR, and commits the archive before the merge.

**Clean.** After the corrections, update 6.2 and 11.8 to the new number of scenarios (22 → 26 if the four scenarios below are added).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Freeze check before measuring | A frozen annotation file was modified | 1.3 |
| | The agreement report is missing | 1.3 |
| The graph is read from the seed | The seed reader agrees with the CLI's seed parser | 2.2 |
| | A project of the annotations is not in the seed | 2.3 |
| | **(missing: malformed/missing seed — B7)** | **—** |
| Annotation files are complete | An annotation file has 49 sites | 2.1 |
| Site matching and attribution | An edge from the enclosing symbol to the annotated target is a hit | 3.1 |
| | An edge from the site's file is in scope | 3.1 |
| | A positive site without a matching edge is a miss | 3.1 |
| | An edge with the called name to another target is a false positive | 3.2 |
| | A none site with an attributed edge is a false positive | 3.2 |
| | A none site without an attributed edge is a true negative | 3.2 |
| | Two sites in one symbol do not count each other's hit as a false positive | 3.3 |
| | An edge of another kind or another project does not count | 3.3 |
| | A source symbol whose range ends before the site is out of scope | 3.3 |
| | **(missing: called-name derivation for `@`, `[…]` and snake_case `read` — B2)** | **—** |
| | **(missing: choice among several hits — B3)** | **—** |
| Measures per project | Measures of a synthetic project | 3.4 |
| | Undefined measures are null | 3.4 |
| Measurement output and CLI | The measurement is deterministic | 3.5 |
| | An unknown argument is a usage error | 1.1, 1.2 |
| Committed measurement matches the repository | The committed JSON is the current measurement | 5.1, 5.2 |
| Published Table 2 | The README table agrees with the measurement | 5.3 |
| | **(missing: TS below PHP is explained — B1)** | **5.3 (task exists, scenario does not)** |
| Measurement report | The report agrees with the measurement | 5.4 |
| The frozen sources are not modified | The frozen sources still match their hashes | 5.2, 5.5 |

Docs-only tasks with no requirement (acceptable): 10.1 (row 29, README tree), 10.2, 10.3, 10.4, and the intro rewrite inside 5.3. **Improvable:** have "Published Table 2" also require that the intro of «Mediciones que se publicarán» no longer says *(pendiente)* for Table 2, and assert it in the README scenario.

The empty rows (B1, B2, B3, B7) are blocking.

---

## Corrections to apply

### `specs/graph-quality/spec.md`

1. **"The graph is read from the seed"** (B7). Append: "When `seeds/graph-dump.sql` cannot be read, or a line of the tables `project`, `file`, `symbol` or `edge` cannot be read (values other than `'…'` with `''`, `E'…'` with `\\` and `\uXXXX`, `NULL`, `true`, `false` or a number), the command SHALL exit with code 1, write one stderr line naming `seeds/graph-dump.sql` and, for a malformed line, its line number, and write no output file." Add:
   `#### Scenario: A malformed seed line is an error` — GIVEN a copy whose seed has an `INSERT INTO edge` line truncated before `);` · WHEN the command runs with `--root <copy>` · THEN exit 1, stderr names `seeds/graph-dump.sql` and the line number, no `graph-quality.json`.
2. **"Site matching and attribution"** (B2). Replace the called-name sentence with: "The site's *called name* SHALL be the last match of `[A-Za-z_$][A-Za-z0-9_$]*` in `call` after each `(`, `)`, `[`, `]`, `'`, `"` and `@` is replaced by a space; for `form: new` it SHALL be `__construct` (language `php`) or `constructor` (language `typescript`); for `form: read` the called names SHALL be the property name, its camel-case form (split on `_`, every part after the first with its first letter upper-cased) and `get<Studly>Attribute`, where `<Studly>` is the camel-case form with its first letter upper-cased." Add:
   `#### Scenario: The called name of a route action, an array callable and a snake_case read` — THEN `'App\\Http\\Controllers\\CheckoutController@store'` → `store`; `[OrderController::class, 'show']` → `show`; `$order->shipping_country` (`read`) → `shipping_country`, `shippingCountry`, `getShippingCountryAttribute`.
3. **"Site matching and attribution"** (B3). Append: "When several edges of the scope are hits, the site's hit SHALL be the one whose `resolution` equals the site's `expected` if there is one, otherwise the first of them in seed order." Add:
   `#### Scenario: Of two hits the one with the expected resolution is recorded` — GIVEN a site expecting `heuristic` to `B::m`, and two edges of its scope to `B::m`, the first `exact`, the second `heuristic` · THEN outcome `tp`, hit `resolution: heuristic`, `resolutionAgreement` counts it as agreed.
4. **"Measurement output and CLI"** (B4). The per-site entry becomes: "its `id`, `call`, `site` (`file`, `line`), `expected`, `outcome`, the hit (`resolution`, `extractor`) or `null`, its attributed edges and its false-positive edges (each `file`, `symbol`, `resolution`, sorted by `file`, `symbol`, `resolution`)." Also pin: "The usage line SHALL be `Usage: node scripts/measure-graph.mjs [--root <dir>]`. Each stdout line SHALL be `` <fixture>: cobertura <ratio> · precisión <ratio> · calls <exact> exact / <heuristic> heuristic `` with `<ratio>` as in Table 2. `--root` without a value, or given twice, is a usage error. The projects are `acme-shop` then `task-api`, read from `fixtures/annotations/<fixture>.callsites.json`."
5. **"Published Table 2"** (B1, B6).
   - Replace the agreement sentence with: "Below the table, one line per sample project SHALL read `` `<fixture>`: concordancia <percent> % (<agreed>/<n>), kappa <kappa> `` with the values of `agreement.json` (decimal comma, no trailing `,0`, `no definido` for a `null` kappa), and the text SHALL link `docs/measurements/graph-quality.md`."
   - Quote the headers as ``Aristas `exact` `` and ``Aristas `heuristic` ``.
   - Replace the TS clause with: "When the TypeScript coverage or precision is below the PHP one, the text below the table SHALL contain a paragraph starting `**Por qué TypeScript no supera a PHP.**` that explains it, and the figures SHALL NOT be changed." Add:
   `#### Scenario: A TypeScript figure below PHP is explained` — GIVEN `graph-quality.json` · WHEN the coverage and precision of `task-api` are compared with those of `acme-shop` · THEN, if either is lower, the README text below Table 2 holds the paragraph `**Por qué TypeScript no supera a PHP.**`; otherwise it does not.
   - Also: "The introduction of «Mediciones que se publicarán» SHALL NOT mark Table 2 as pending" (improvable), and assert it in "The README table agrees with the measurement".
6. **"Measurement report"** (B4, B5).
   - `## Resultados`: "with one row per project, `Proyecto` written `` `<fixture>` `` and `Cobertura`, `Precisión` and `Resolución coincidente` (`agreed`/`of`) formatted as in Table 2".
   - `## Sitios fallados`: "`Resultado` the outcome; `Llamada` `` `<call>` ``; `Sitio` `` `<file>:<line>` ``; `Aristas atribuidas` each attributed edge as `` `<file> · <symbol> · <resolution>` `` joined by `<br>`, or `—`".
   - Scenario "The report agrees with the measurement": add "and the report contains `## Método` with the sentence that the measuring agent annotated no site, and `## Limitaciones`" (improvable).
   - Limitation text: "annotation by two agents of different models of one family (`claude-opus-5-5`, `claude-sonnet-5-5`) … 50 sites per language in two sample repositories built on purpose" (improvable).
7. **"Annotation files are complete"** (improvable). Extend the scenario: `formatVersion: 2` and a repeated id each give one problem naming the file; through the CLI, exit 1 and no output file.

### `design.md`

- D2: accept `E'…'` with `\\` and `\uXXXX` like `parse-seed.ts:163-201`; a malformed line → exit 1 naming `seeds/graph-dump.sql:<line>`.
- D3.4: the replace-with-space rule and the camel/Studly definitions of correction 2. New D3.6: the hit choice of correction 3.
- D4 and D7: round from the integers, half away from zero (`Math.floor((2·n·10^k + d) / (2·d)) / 10^k`, as `roundRatio` in `scripts/annotation-agreement.mjs:274`), not with the float formula. D7: the agreement line format of correction 5.
- D5: the usage and stdout texts of correction 4.
- D6: add `call`, `site`, `attributedEdges`; sort tie-break by `resolution`.
- Context: quote `checkFreeze`'s text as `the report records no SHA-256 hash`.
- Follow-ups: add a row per finding of this audit (B1–B7 and the improvable ones taken), destination A.

### `tasks.md`

- 2.2: the reader also covers `E'…'`. New 2.4: RED → GREEN "A malformed seed line is an error" (CLI on a copy).
- 3.2: assert the called-name scenario of correction 2. 3.3: add "Of two hits the one with the expected resolution is recorded".
- 3.5: assert the exact usage and stdout line texts.
- 5.3: add "A TypeScript figure below PHP is explained", and the intro check.
- 5.4: the new cell formats; optionally split it into test and text.
- 6.2 and 11.8: 22 → 26 scenarios.

### Linear

- **DIS-79**, `[enhanced]` part (never `[original]`), in Spanish, marked as the agent's text:
  "*(Texto del agente, auditoría de spec, ejecución autónoma, 2026-11-03.)* Decisiones añadidas tras la auditoría:
  - el nombre llamado sustituye `(`, `)`, `[`, `]`, comillas y `@` por espacios antes de tomar el último identificador (`'…CheckoutController@store'` → `store`), con camelCase y `get<Studly>Attribute` definidos para propiedades snake_case;
  - si varias aristas son acierto, cuenta la de la resolución esperada o, si no hay, la primera de la semilla;
  - cada sitio del JSON guarda `call`, `site` y sus aristas atribuidas;
  - una línea mal formada o ausente de la semilla da código 1 sin escribir;
  - bajo la Tabla 2, una línea por proyecto `concordancia … %, kappa …`;
  - si TypeScript queda por debajo de PHP, un párrafo «Por qué TypeScript no supera a PHP» lo explica."
- **DIS-79**, comment in Spanish: record Q1 and Q2 (coverage `tp/positivos` instead of «/ 50», precision `tp/(tp+fp)` with the parent's ratio as `resolutionAgreement`) as open questions for the author, stating that the change applies M4 meanwhile.

---

## Resolution of run 1

*Agent's text, correction round 1 of the autonomous run (2026-11-03). The questions are decided by the
agent as lead engineer, not left for the author (`docs/AUTONOMOUS-RUN.md` §6); every decision is in
`design.md` → Follow-ups, table "spec audit run 1", with its destination. `openspec validate
graph-quality-measurement --strict` passes; the spec has 10 requirements and 26 scenarios.*

| Finding | Resolution | Where |
|---|---|---|
| Q1 coverage definition | Decided by the agent: `tp / positives` (sub-issue M4) stays. A `none` site has no edge to find, so "/ 50" would cap a perfect analyzer at 62 % (`acme-shop`) and 52 % (`task-api`); each cell prints its fraction, so the denominator is visible. Destination D. | Follow-ups Q1 |
| Q2 precision definition | Decided by the agent: `tp / (tp + false-positive edges)` (M4) stays; the parent's ratio is published as `resolutionAgreement` and the report's `Resolución coincidente` column. Destination D. | Follow-ups Q2 |
| B1 TS below PHP untested | Fixed: the clause now requires the paragraph `**Por qué TypeScript no supera a PHP.**`; new scenario "A TypeScript figure below PHP is explained"; task 5.3. | spec "Published Table 2"; tasks 5.3 |
| B2 called-name derivation | Fixed: each of `(`, `)`, `[`, `]`, quotes and `@` is replaced by a space, then the last identifier; camel case and `get<Studly>Attribute` defined; new scenario "The called name of a route action, an array callable and a snake_case read" with `php-12`, `[OrderController::class, 'show']` and `shipping_country`. | spec; design D3.4; tasks 3.2 |
| B3 choice among several hits | Fixed: the hit with the expected resolution, otherwise the first in seed order; every hit edge stays out of the false positives; new scenario "Of two hits the one with the expected resolution is recorded". | spec; design D3.5, D3.6; tasks 3.3 |
| B4 failed-sites table not derivable | Fixed: each JSON site holds `call`, `site` and `attributedEdges`; the `Id`, `Llamada`, `Sitio` and `Aristas atribuidas` formats are fixed (`<br>` join, `—` when empty). | spec "Measurement output and CLI", "Measurement report"; design D6; tasks 3.5, 5.4 |
| B5 `## Resultados` formats | Fixed: format stated per column, `Resolución coincidente` from `resolutionAgreement`. | spec "Measurement report" |
| B6 agreement citation text | Fixed: one line per project `` `<fixture>`: concordancia <percent> % (<agreed>/<n>), kappa <kappa> `` with `no definido` for a `null` kappa, built by the exported `formatAgreement`. | spec "Published Table 2"; design D7; tasks 3.4, 5.3 |
| B7 missing or malformed seed | Fixed: exit 1, one stderr line naming `seeds/graph-dump.sql` (and the line number), no output file; new scenario "A malformed seed line is an error"; task 2.4. | spec "The graph is read from the seed"; design D2, D5; tasks 2.4 |
| Improvable: report headings and independence sentence | Fixed: the scenario checks `## Método` with the fixed sentence `La medición la ejecutó un agente que no anotó ningún sitio.` and `## Limitaciones`; task 5.4. | spec; design D8 |
| Improvable: annotation completeness scenario | Fixed: `formatVersion: 2`, a repeated id and the CLI exit 1 with no output are in the scenario; task 2.1. | spec; tasks 2.1 |
| Improvable: sample-size wording | Fixed: "50 sites per language in two sample repositories built on purpose". | spec "Measurement report" |
| Improvable: usage, stdout, project list, sort, `--root` | Fixed: exact usage and summary texts, fixed project list and paths, `resolution` as the last sort key, `--root` without a value or twice is exit 2; tasks 1.1, 3.5. | spec "Measurement output and CLI"; design D5, D6 |
| Improvable: `checkFreeze` quote | Fixed: `the report records no SHA-256 hash`. | design Context |
| Improvable: model-family wording | Fixed: "two different models of one family (`claude-opus-5-5`, `claude-sonnet-5-5`)". | spec "Measurement report"; tasks 5.5 |
| Improvable: rounding | Fixed: ratios and percentages rounded from the integers with the `roundRatio` formula, reimplemented in the script; the spec says no floating-point quotient decides a tie. | spec "Measures per project"; design D4, D7 |
| Improvable: `E'…'` parity | Fixed: the reader also accepts `E'…'` with `\\` and `\uXXXX`; task 2.2 asserts it. | spec; design D2; tasks 2.2 |
| Improvable: README header quoting | Fixed: ``Aristas `exact` `` and ``Aristas `heuristic` ``. | spec "Published Table 2" |
| Improvable: intro no longer pending | Fixed: required in "Published Table 2" and asserted in "The README table agrees with the measurement". | spec; tasks 5.3 |
| Improvable: task 5.4 size | Fixed: split into 5.4 (RED test) and 5.5 (write the report); the old 5.5 is 5.6. | tasks |
| Mandatory steps: scenario count | Fixed: 6.2 and 11.8 say 26 scenarios. | tasks 6.2, 11.8 |
| Linear `[enhanced]` and comment | Done: the decisions are added to the `[enhanced]` part of DIS-79 (never `[original]`) and a Spanish comment records Q1 and Q2 as decided by the agent, not as questions left open (rejected as "open questions for the author": the autonomous run leaves nothing for the author). | Linear DIS-79 |

---

## Run 2 (2026-11-03)

CHANGES REQUIRED

**Questions for the author:** none. Q1 (coverage `tp / positives` instead of the parent's "/ 50") and Q2 (precision `tp / (tp + false-positive edges)`, with the parent's ratio published as `resolutionAgreement`) were decided by the agent in run 1, in design → Follow-ups (Q1, Q2, destination D). Both decisions follow the sub-issue's M4. The sub-issue governs over the parent, so they are acceptable.

Audit inputs (run 2): `proposal.md`, `design.md`, `specs/graph-quality/spec.md` and `tasks.md` of `openspec/changes/graph-quality-measurement` (branch `feature/dis-79-measure-graph` at `d2100bf`), and `reports/2026-11-03-spec-audit.md` (run 1 and its resolution). From Linear: DIS-79 (`[original]`, `[reality-map]`, `[enhanced]` including the "Decisiones añadidas tras la auditoría de spec (ejecución 1)", and 8 comments) and its parent DIS-53. From the repository: `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (lines 628-630 and 1671), `readme.md` lines 29 and 872-894, `scripts/annotation-agreement.mjs` (lines 265-278, 440-474 and 605), `packages/cli/src/seed/parse-seed.ts` (lines 18-83), `seeds/graph-dump.sql` (header, `project`/`symbol`/`edge` lines), `fixtures/annotations/*.callsites.json` (the `new`, `read` and route sites), `docs/measurements/annotation/agreement.json` and `docs/measurements/annotation/selection.json`.

### 1. Scope against the ticket

Every item follows from the DIS-79 sub-issue (original text plus `[enhanced]` M1–M10 and the run-1 decisions recorded in the enhanced part):
- the script, with the freeze check first;
- the seed as the graph;
- the M3 rules and the M4 measures;
- the JSON, the report and Table 2;
- the README intro rewrite and the re-pointing of row 29 (M9);
- the DIS-81 comment hand-off (M9, destination B);
- the PowerShell check (M10).

Other items:
- P1 comes from the parent's inherited "el script falla si faltan sitios".
- P4 and P6 refine M3 so it works on the frozen data.
- The `docs/project-context.md` and `prompts.md` edits are mandatory documentation.

The change does not widen to Table 1 or `measure-context`. **Clean.**

- **Improvable (ticket fidelity, also point 6).** The ticket's M3 defines an *attributed* edge as one "cuyo destino es el del acierto **o** cuyo destino tiene como último segmento … el nombre llamado". The spec ("Site matching and attribution") and proposal line 28 keep only the called-name clause. The outcome and false-positive counts do not change, because a hit is never a false positive. But a hit whose target name differs from the called name would be missing from `attributedEdges`, the "aristas atribuidas" of sub-issue AC 1. Fix: in the spec, "An *attributed* edge SHALL be an edge of the scope whose target is the site's annotated target, or a symbol whose last name segment … is a called name of the site". Do the same in proposal line 28 and design D3.

### 2. Inherited acceptance criteria

| AC | Requirement | Scenario | State |
|---|---|---|---|
| Parent 1: coverage, precision, exact/heuristic counts; fails if sites are missing | Measures per project; Annotation files are complete | Measures of a synthetic project; An annotation file has 49 sites | Covered (definitions per M4, Q1/Q2) |
| Parent 3: Table 2 without *(pendiente)* | Published Table 2 | The README table agrees with the measurement | Covered (intro predicate open, see B1 in point 5) |
| Parent 4: deterministic | Measurement output and CLI | The measurement is deterministic | Covered |
| Parent 5: TS ≥ PHP, otherwise explained | Published Table 2 | A TypeScript figure below PHP is explained | Covered |
| Sub 1: JSON per project and per site with "aristas atribuidas", byte-identical | Measurement output and CLI; Measures per project | The measurement is deterministic | Covered |
| Sub 2: freeze broken → 1, seed not read, `checkFreeze` messages; unknown argument → 2 | Freeze check; CLI | A frozen annotation file was modified; The agreement report is missing; An unknown argument is a usage error | Covered |
| Sub 3 (a)–(f) | Site matching and attribution; Measures per project | 11 + 2 scenarios | Covered |
| Sub 4: Table 2 format, agreement under the table, link, doc test | Published Table 2; Committed measurement matches the repository | 3 scenarios | Covered |
| Sub 5: frozen sources untouched | The frozen sources are not modified | The frozen sources still match their hashes | Covered |

The parent's limitation "anotación por la autora" is superseded by DIS-80, and the report never says "humana" or "a mano". **Clean.**

### 3. Missing scenarios

Every behaviour a test must pin has a scenario. The following MUST clauses have none (all improvable):
- "Measurement output and CLI": `--root` **given twice** → exit 2. The scenario covers `--verbose` and `--root` with no value only. Add "and again with `--root a --root b`".
- "Freeze check before measuring": a report that **records no hash**. `checkFreeze` returns `the report records no SHA-256 hash` (`scripts/annotation-agreement.mjs:461`), and that message names no file, while the requirement says each line names the file. Fix the requirement: "a problem that concerns the report itself is prefixed `docs/measurements/annotation-agreement.md: `". Add the case to the scenario "The agreement report is missing", or add a sibling scenario.
- "The graph is read from the seed": an **unreadable** seed. Task 2.4 tests it, but no scenario names it. Append to "A malformed seed line is an error": "and a copy without `seeds/graph-dump.sql` exits 1 with one stderr line `seeds/graph-dump.sql: the file cannot be read`". If this becomes a 27th scenario instead, update tasks 6.2 and 11.8.

### 4. Ambiguity

Searched the four artifacts for "fast", "easy", "secure", "efficient", "many", "appropriate" and "robust":
- spec "however many sites attribute it": a quantifier, not a vague quality.
- proposal line 15, "a small CLI": descriptive, not a requirement.

**Clean.**

### 5. Open decisions

- **B1 (blocking): the "intro no longer pending" check has no testable predicate.**
  - Spec "Published Table 2" says "The introduction of «Mediciones que se publicarán» SHALL NOT mark Table 2 as pending". Its scenario says the intro "does not say *(pendiente)* of Table 2".
  - The current intro (`readme.md:876`) begins `*(pendiente, Entrega 3).* Las dos tablas …`. Task 5.3 rewrites it so that it still says Table 1 is pending (DIS-81).
  - `tests/unit/docs/graph-quality.spec.ts` must decide alone what "*(pendiente)* of Table 2" means inside a paragraph that legitimately marks Table 1 as pending. That decision is a test-pinned rule.
  - Fix it in the requirement and the scenario: "The first paragraph after `#### Mediciones que se publicarán` SHALL NOT start with `*(pendiente`, SHALL contain `npm run measure:graph`, and SHALL NOT contain `Las dos tablas se rellenan`. The pending state of Table 1 SHALL be stated in that paragraph only through a sentence naming `DIS-81`." In the scenario's THEN, replace the *(pendiente)* clause with those three assertions.
- **Improvable: `formatRatio` for whole percentages.** Spec "Published Table 2" says "with one decimal". The prototype gives `task-api` 26/26, so the cell will be either `100,0 % (26/26)` or `100 % (26/26)`. The agreement line uses the opposite convention (`100 %`, "no trailing `,0`"). Both sides of the test use the same `formatRatio`, so the test cannot detect a wrong choice. State it once in D7 and the spec: "always one decimal: `formatRatio(26, 26)` is `100,0 % (26/26)`". Add that assertion to task 3.4.
- **Improvable: annotation files that are not valid JSON or lack fields.** This can only happen on a `--root` copy whose report hash was updated, as task 2.1 does. "Annotation files are complete" covers `formatVersion`, count and ids, but not invalid JSON or a site without `site`/`call`/`form`. Add to the requirement: "an annotation file that cannot be read or parsed as JSON is a problem naming the file (exit 1)".
- **Improvable: child rows of an unknown project.** Task 2.3 removes the `task-api` rows from a copy of the seed. If only the `project` row were removed, `file`/`edge` rows would name a missing project. `seedProjects` throws in that case (`parse-seed.ts:54`). Pin the behaviour in D2: "a `file` or `edge` row whose `project_id` names no `project` row is a malformed line".

### 6. Contradictions inside the change

- **Improvable (factual).** Design D3.5 says "two `new` on one line (`task-api`)". In the frozen data, `ts-21` (`new InMemoryTaskRepository(`) and `ts-22` (`new TaskService(`) are on lines 12 and 13 of `registerDb` in `src/plugins/db.ts` (`fixtures/annotations/task-api.callsites.json:380-418`). They share a symbol, not a line. The synthetic scenario ("same line of one TypeScript method") is still valid. Correct D3.5 to "two `new` in one symbol (`ts-21`, `ts-22` in `registerDb`)".
- **Improvable.** Design → Risks says "the count of false positives is a lower bound". That is not true under D3. A `none` site's scope includes:
  - every edge whose source is an enclosing symbol, including the whole class;
  - every file-level edge of `site.file`.

  A correct edge from an *unannotated* call with the same called name in that scope (for example another `->save(` in the same method, or a module-level call) is "the hit of no site", so it becomes a false positive. The count can therefore err in both directions. Fix Risks and the spec's report limitation: "attribution by called name can miss a wrong edge with another name, and can count as false positive a correct edge of an unannotated call with the same name in the same scope; the false-positive count is therefore approximate in both directions".
- The rest is consistent. Proposal, design D3–D7 and the spec agree on scope, hit, called name, false positive, measures, rounding, JSON layout, texts and exit codes.

### 7. Contradictions with the project

- `openspec/specs/graph-annotations/spec.md` → "Frozen annotations and agreement report": the change keeps its freeze premise and adds no delta. Consistent.
- `docs/project-context.md:628-630`: the base branch `final-project-CRN` matches tasks 0.1, 5.6 and 11.1.
- `readme.md:894` says "dos agentes … de modelos distintos". The spec's limitation now says "two different models of one family (`claude-opus-5-5`, `claude-sonnet-5-5`)". Consistent.
- The autonomous merge in 11.9 is covered by `docs/adr/20261020-kit-autonomous-mode.md`, as run 1 found.
- `scripts/*.mjs` imports only `node:` built-ins and sibling `.mjs` files (wiring test), with typing through `.d.mts`. Consistent.

**Clean.**

### 8. Contrast with the real code

- `checkFreeze(report, root)` takes the report text and returns the problems listed above (`scripts/annotation-agreement.mjs:452-474`). D5 reads the report first and names it on failure. Consistent, apart from the prefix for the no-hash message (point 3).
- `roundRatio` (`scripts/annotation-agreement.mjs:274-277`) is not exported. D4 reimplements its integer formula. Consistent.
- `seedProjects(...).edgeCount` counts `INSERT INTO edge` rows per project (`parse-seed.ts:80-81`), not the `project.edge_count` column, so the D2 parity test compares like with like. Consistent.
- The seed puts one statement per line. `symbol` rows hold `start_line`/`end_line` and signatures with commas and parentheses inside quotes (`seeds/graph-dump.sql:62-63`). `edge` rows carry `project_id`, `kind`, `resolution` and `extractor` (`seeds/graph-dump.sql:184`). The D2 reader and D6 (`hit.extractor`) match this shape.
- `selection.json` holds per-fixture `construction`/`ids` rows. For `acme-shop` the ids add up to the 50 sites. `task-api` has a `reexport` row with no ids. Under the spec ("one row per construction … in its order"), that row prints with zeros. The rule decides it, so this is not a defect, but D8 could mention it. Improvable.
- README Table 2 headers (``Aristas `exact` ``, ``Aristas `heuristic` ``) and row labels (`PHP/Laravel`, `TypeScript`) match `readme.md:887-890`.

No duplicated abstraction. **Clean** apart from the improvable notes.

### 9. Task size

Every task fits one agent turn. The run-1 split of 5.4/5.5 is in place.

- **Improvable (ordering).** Task 5.3 adds a README link to `docs/measurements/graph-quality.md`, but that file is only created in 5.5. Between the two tasks, `tests/unit/docs/guides.spec.ts` (README links) fails, while 6.1/P8 promise it stays green. Either create the report file in 5.3 with its headings, or add the link in 5.5.

### 10. Mandatory steps

- Step 0 is first and verifies `feature/dis-79-measure-graph` from `final-project-CRN` (0.1–0.4).
- Steps 6–11 are present, in order and labelled `(MANDATORY)`. Steps 8, 9 and 11 say `AGENT MUST EXECUTE`. Step 7 names its report file and the template.
- Mutating tasks restore state:
  - 5.2 points the test at a changed copy, then restores it;
  - 7.6 and 8.3 check the hashes and run `node scripts/dev-processes.mjs stop`;
  - 8.2 uses scratchpad copies and deletes them.
- The PowerShell check is the agent's (8.1, `-NoProfile`, no `$env:`).
- 6.2 and 11.8 give 26 scenarios and ten requirements. That matches the spec: 2 + 3 + 1 + 11 + 2 + 2 + 1 + 2 + 1 + 1 = 26.

**Clean.**

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Freeze check before measuring | A frozen annotation file was modified | 1.3 |
| | The agreement report is missing | 1.3 |
| The graph is read from the seed | The seed reader agrees with the CLI's seed parser | 2.2 |
| | A project of the annotations is not in the seed | 2.3 |
| | A malformed seed line is an error | 2.4 |
| Annotation files are complete | An annotation file has 49 sites | 2.1 |
| Site matching and attribution | An edge from the enclosing symbol to the annotated target is a hit | 3.1 |
| | An edge from the site's file is in scope | 3.1 |
| | A positive site without a matching edge is a miss | 3.1 |
| | An edge with the called name to another target is a false positive | 3.2 |
| | A none site with an attributed edge is a false positive | 3.2 |
| | A none site without an attributed edge is a true negative | 3.2 |
| | The called name of a route action, an array callable and a snake_case read | 3.2 |
| | Two sites in one symbol do not count each other's hit as a false positive | 3.3 |
| | An edge of another kind or another project does not count | 3.3 |
| | A source symbol whose range ends before the site is out of scope | 3.3 |
| | Of two hits the one with the expected resolution is recorded | 3.3 |
| Measures per project | Measures of a synthetic project | 3.4 |
| | Undefined measures are null | 3.4 |
| Measurement output and CLI | The measurement is deterministic | 3.5 |
| | An unknown argument is a usage error | 1.1, 1.2 |
| Committed measurement matches the repository | The committed JSON is the current measurement | 5.1, 5.2 |
| Published Table 2 | The README table agrees with the measurement | 5.3 |
| | A TypeScript figure below PHP is explained | 5.3 |
| Measurement report | The report agrees with the measurement | 5.4, 5.5 |
| The frozen sources are not modified | The frozen sources still match their hashes | 5.2, 5.6 |

No empty row. Docs-only tasks without a requirement are acceptable: 10.1 (row 29, README tree), 10.2, 10.3 and 10.4. **Clean.**

---

### Corrections to apply

#### `specs/graph-quality/spec.md`

1. **"Published Table 2"** (B1, blocking).
   - Replace "The introduction of «Mediciones que se publicarán» SHALL NOT mark Table 2 as pending." with: "The first paragraph after `#### Mediciones que se publicarán` SHALL NOT start with `*(pendiente`, SHALL contain `npm run measure:graph` and SHALL NOT contain `Las dos tablas se rellenan`; the pending state of Table 1 SHALL be stated in that paragraph only through a sentence naming `DIS-81`."
   - In "The README table agrees with the measurement", replace "and the introduction of «Mediciones que se publicarán» does not say *(pendiente)* of Table 2" with: "and the first paragraph after `#### Mediciones que se publicarán` does not start with `*(pendiente`, contains `npm run measure:graph`, does not contain `Las dos tablas se rellenan`, and names `DIS-81` for Table 1".
   - Add (improvable): "Percentages are always written with one decimal: `formatRatio(26, 26)` is `100,0 % (26/26)`."
2. **"Site matching and attribution"** (improvable, ticket M3). Change the definition to: "An *attributed* edge SHALL be an edge of the scope whose target is the site's annotated target, or a symbol whose last name segment (after the last `::`) is a called name of the site."
3. **"Measurement output and CLI"** (improvable). In "An unknown argument is a usage error", change the WHEN to: "the command runs with `--verbose`, again with `--root` and no value, and again with `--root a --root b`".
4. **"Freeze check before measuring"** (improvable). Append: "A problem that concerns the report itself (unreadable, or `the report records no SHA-256 hash`) SHALL be written prefixed `docs/measurements/annotation-agreement.md: `." Extend "The agreement report is missing" with: "and a copy whose report has no `## Hashes SHA-256` row gives one stderr line naming the report".
5. **"The graph is read from the seed"** (improvable).
   - Append: "A `file`, `symbol` or `edge` row that names no `project` or `file` row of the seed is a malformed line."
   - Extend "A malformed seed line is an error" with: "and a copy without `seeds/graph-dump.sql` exits 1 with the stderr line `seeds/graph-dump.sql: the file cannot be read`".
6. **"Annotation files are complete"** (improvable). Append: "An annotation file that cannot be read or parsed as JSON is a problem naming the file."
7. **"Measurement report"** (improvable). Replace the first limitation with: "attribution by called name can miss a wrong edge whose target has another name, and can count as a false positive a correct edge of an unannotated call with the same name in the same scope, so the false-positive count is approximate in both directions".

#### `design.md`

- D3: the attributed-edge definition of correction 2. D3.5: replace "two `new` on one line (`task-api`)" with "two `new` in one symbol (`ts-21`, `ts-22` in `registerDb`, `src/plugins/db.ts:12-13`)".
- D2: a child row naming no `project`/`file` row is a malformed line (correction 5).
- D5: the report-prefix rule of correction 4.
- D7: "always one decimal: `formatRatio(26, 26)` → `100,0 % (26/26)`"; the intro predicate of correction 1.
- D8: a construction of `selection.json` with no ids (the `reexport` row of `task-api`) prints a row of zeros.
- Risks: replace "the count of false positives is a lower bound" with the two-way wording of correction 7.
- Follow-ups: add a table "spec audit run 2" with B1 (destination A) and each improvable item taken (destination A).

#### `tasks.md`

- 1.1: add the `['--root', 'a', '--root', 'b']` case (exit 2).
- 1.3: add the report-with-no-hash case and the report prefix.
- 2.1: add an annotation file that is not valid JSON (in-memory, one problem naming the file).
- 2.3: also an `edge` row of an unknown project is a malformed line.
- 3.4: add `formatRatio(26, 26) === '100,0 % (26/26)'`.
- 5.3: replace the intro assertion with the three assertions of correction 1. Write the intro so it starts without `*(pendiente`, names `npm run measure:graph`, and marks only Table 1 as pending with `DIS-81`. Either add the link to `docs/measurements/graph-quality.md` in 5.5, or create the report file with its headings in 5.3, so `tests/unit/docs/guides.spec.ts` never goes red.
- 6.2 / 11.8: keep 26 if the new cases extend existing scenarios. If a scenario is added, update the count.

#### Linear

- **DIS-79**, `[enhanced]` part, under "Decisiones añadidas tras la auditoría de spec", never inside `[original]`. Add, in Spanish, marked as the agent's text:
  "*(Texto del agente, corrección 2, ejecución autónoma, 2026-11-03.)*
  - La entrada de «Mediciones que se publicarán» deja de estar pendiente para la Tabla 2: no empieza por `*(pendiente`, cita `npm run measure:graph`, ya no dice «Las dos tablas se rellenan» y nombra DIS-81 solo para la Tabla 1.
  - Los porcentajes de la Tabla 2 llevan siempre una decimal (`100,0 % (26/26)`).
  - Una arista atribuida es la que llega al destino anotado o la que acaba en el nombre llamado (M3).
  - Los falsos positivos por nombre llamado son aproximados en los dos sentidos: puede faltar una arista errónea con otro nombre y puede contar una arista correcta de una llamada no anotada con el mismo nombre. Se declara en `## Limitaciones`.
  - `--root` repetido da código 2.
  - Un informe sin hashes, una semilla ausente o un fichero de anotación que no es JSON dan código 1 con el fichero nombrado."
- **DIS-79**, a comment in Spanish, marked as the agent's text, summarizing run 2: one blocking finding (B1), corrected in the change, plus the improvable items applied. No new issue.

---

## Resolution of run 2

*Agent's text, correction round 2 of the autonomous run (2026-11-03). Run 2 asked no question of the
author; every finding is decided by the agent as lead engineer (`docs/AUTONOMOUS-RUN.md` §6) and
recorded in `design.md` → Follow-ups, table "spec audit run 2", destination A. `openspec validate
graph-quality-measurement --strict` passes; the spec keeps 10 requirements and 26 scenarios (the new
cases extend existing scenarios), so tasks 6.2 and 11.8 are unchanged.*

| Finding | Resolution | Where |
|---|---|---|
| B1 intro predicate not testable | Fixed: the first paragraph after `#### Mediciones que se publicarán` does not start with `*(pendiente`, contains `npm run measure:graph`, does not contain `Las dos tablas se rellenan`, and states Table 1 as pending only through a sentence naming `DIS-81`; the scenario "The README table agrees with the measurement" asserts the four conditions. | spec "Published Table 2"; design D7; tasks 5.3 (R2-B1) |
| Improvable: attributed edge lacks the M3 target clause | Fixed: an attributed edge reaches the annotated target or ends in a called name. | spec "Site matching and attribution"; proposal; design D3.4 (R2-I1) |
| Improvable: `--root` twice has no scenario | Fixed: added to the WHEN of "An unknown argument is a usage error". | spec; tasks 1.1 (R2-I2) |
| Improvable: report with no hash, and the report prefix | Fixed: problems about the report itself are prefixed `docs/measurements/annotation-agreement.md: `; the no-hash case extends "The agreement report is missing". | spec "Freeze check before measuring"; design D5; tasks 1.3 (R2-I3) |
| Improvable: unreadable seed has no scenario | Fixed: the exact line `seeds/graph-dump.sql: the file cannot be read` is in the requirement and in "A malformed seed line is an error". | spec; tasks 2.4 (R2-I4) |
| Improvable: `formatRatio` for whole percentages | Fixed: always one decimal, `formatRatio(26, 26)` is `100,0 % (26/26)`; the agreement line keeps "no trailing `,0`" because it copies `agreement.json`. | spec "Published Table 2"; design D7; tasks 3.4 (R2-I5) |
| Improvable: annotation file not valid JSON | Fixed: a file that cannot be read or parsed is a problem naming the file, exit 1. | spec "Annotation files are complete"; design D5; tasks 2.1 (R2-I6) |
| Improvable: child rows of an unknown project | Fixed: a `file`, `symbol` or `edge` row naming no `project` or `file` row is a malformed line. | spec "The graph is read from the seed"; design D2; tasks 2.3 (R2-I7) |
| Improvable: D3.5 "two `new` on one line" | Fixed: `ts-21` and `ts-22` are two `new` in one symbol (`registerDb`, `src/plugins/db.ts:12-13`), checked in `fixtures/annotations/task-api.callsites.json`. The synthetic scenario stays. | design D3.5 (R2-I8) |
| Improvable: "lower bound" is false | Fixed: the false-positive count is approximate in both directions, in Risks and in the report limitation. | design Risks; spec "Measurement report" (R2-I9) |
| Improvable: `reexport` row without ids | Fixed: D8 says it prints a row of zeros. | design D8 (R2-I10) |
| Improvable: README link added before the report exists | Fixed: the link is added in 5.5, together with the report, so `tests/unit/docs/guides.spec.ts` never goes red; the link assertion of 5.3 stays red until then. | tasks 5.3, 5.5 (R2-I11) |
| Linear `[enhanced]` and comment | Done: the run-2 decisions are appended to the `[enhanced]` part of DIS-79 (never `[original]`) and a Spanish comment summarises the round. No new issue. | Linear DIS-79 |
