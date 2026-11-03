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
