## Context

`measure-graph` (DIS-79) will compare the `calls` edges of each analyzer with a reference of 50 call
sites per language. `fixtures/README.md` § "Table 2 seed" holds the format of the first batch and 22
control rows (12 PHP for `acme-shop`, 10 TypeScript for `task-api`); the README answers are in that
file, so anyone who reads it is no longer blind. On 2026-10-27 the author replaced human annotation
with a panel of agents: two annotators of different models, blind to each other, a tie-break by a
third agent, and a hash freeze before measuring. The autonomous workflow (`autonomous-sdd`,
`runPanel`) runs that panel between two halves of the apply: `apply-prepare` does the tasks before
the group **Panel** of `tasks.md`; the panelists read that group; `panel-record` (Sonnet) commits
their outputs and runs the agreement tasks of the group; `panel-resolve` (Opus) writes the
resolution; `apply-finish` does the tasks after the group.

Constraints: no change to `packages/**`; the fixtures' code is read-only; JSON files are stored with
LF (`.gitattributes`: `* text=auto eol=lf`), so a SHA-256 is stable across Windows and Linux; the
script follows the `scripts/demo-excerpt.mjs` pattern (ESM `.mjs`, typed `.d.mts`, pure functions
plus a thin CLI, TSDoc).

## Goals / Non-Goals

**Goals:** a blind, reproducible, frozen reference of 100 call sites in format 1; agreement figures
that anyone can recompute from committed files; a README that states how the reference was made.

**Non-Goals:** `measure-graph` and Table 2 (DIS-79); fixing analyzers; editing the 22 control rows;
a hook guarding `fixtures/annotations/`; any model call from repository code.

## Decisions

Decisions D1–D12 come from the enrich step (Linear DIS-80, description "[enhanced]", agent's text);
P1–P8 are taken in this proposal (agent's text, lead engineer in an autonomous run).

**D1 — Format 1 is fixed here.** Final file per fixture:
`{ "fixture", "language", "formatVersion": 1, "sites": [ { "id", "control", "site": {"file","line"}, "form", "call", "source": {"symbol"} | {"file"}, "target": {"file","symbol"} | null, "expected": "exact"|"heuristic"|"none", "reason", "decidedBy": "agreement"|"tiebreak" } ] }`.
Endpoints mirror `EdgeEndpoint` (file or symbol); symbol names follow the analyzers (`Class::method`,
a function by its name; PHP constructors `Class::__construct`, TypeScript `Class::constructor`);
paths are relative to the fixture root. `form` is `call`, `new`, `read` or `reference`, an addition
of this proposal (P1), told to DIS-79 by comment. *Matching key for DIS-79 (agent's text, spec audit
run 1):* a site matches an emitted `calls` edge when the edge's target has the site's `target.file`
and `target.symbol`, and the site's `site.file` + `site.line` lie inside the span of the edge's
source symbol; source names are not compared, because for routes the PHP analyzer's source is a
`route` symbol spanning the whole statement (`docs/project-context.md:1431-1437`) while format 1
records `source: { "file": "routes/..." }`.

**D2 — Criterion of `expected`, written before any judgement** (copied verbatim into the Panel group).
The resolution a static analyzer **should** give when it reads only the fixture's own source files
(no `vendor/`, no `node_modules/`, no standard-library or package declarations):
- `exact` — the target is fixed by declarations inside the fixture: a declared or inferred type of
  the receiver declared in the fixture, an explicit import or `use`, an explicit class name
  (`X::m()`, `new X(...)`, `[X::class, 'm']`), or a reference to a declared function or method.
- `heuristic` — the target is reached only by applying a known framework convention to fixture
  code: a Laravel facade (through its accessor and the container binding), a binding by string in
  the container, `__call` / `__callStatic`, an Eloquent attribute or relation
  read through `__get` (target: the declared accessor or relation method), a route action written as
  a string (`'Controller@method'`), `dispatch(new Job)` → `Job::handle`, `event(new E)` → the
  listener's `handle` registered in `EventServiceProvider::$listen`.
- `none` — the target is outside the fixture's code (PHP or framework functions, `vendor`,
  `node_modules`, the standard library, Zod, Fastify), or it is only reachable through a receiver
  whose type is declared outside the fixture (a package or the standard library) and no convention
  of the `heuristic` list applies, or it cannot be determined statically.
  `expected` is `none` exactly when `target` is `null`.
- When a call names a method that is not declared and is served by a magic method, `target` is the
  symbol that exists in the code (the `__call`, the accessor). When a call can reach several
  symbols, `target` is the one declared first in the code and the reason names the others.
- `form: reference` sites are judged as the call the reference stands for: the target is the
  function or method it names.

*Additions of spec audit run 1 (agent's text, decided as lead engineer), copied into the Panel group:*
- Precedence: the `heuristic` list wins over `none` when one of its conventions applies to fixture
  code (for example `event(new E)` or a job dispatch), even if the outer call is a framework function.
- `X::dispatch(...)` (also `dispatchSync`, `dispatchIf`, `dispatchUnless`, `dispatchAfterResponse`)
  on a fixture class that uses `Dispatchable` and declares `handle` → `heuristic`, target
  `X::handle`; `dispatch(new X(...))` likewise.
- `new X(...)` where `X` declares no constructor (neither itself nor a fixture parent) → `none`: no
  symbol exists to target.
- A method inherited from a fixture class → the symbol of the class that declares it
  (`Parent::m`).
- "Declared first", when a call can reach several symbols: first in the registration list when
  there is one (the `$listen` array, a container binding), otherwise by file path, then line.
- A `form: read` site is judged as the access `__get` serves: a declared accessor
  (`get{Studly}Attribute`) or relation method → `heuristic` with that target; a plain column with no
  declared accessor or relation → `none`.

**D3 — Unit = one call expression, one property read served by `__get`, or one reference passed as
an argument.** 50 sites per language including the controls (12 + 38, 10 + 40). A `read` site and a
route action passed as a `reference` (array callable or `'Controller@method'` string) are each one
site; for a route, the framework call on the same line (`Route::get(`) is a different site. When a
README row describes two edges (task-api row 3), the control site is the call that leaves the row's
source symbol (`TaskService::update` → `this.get(`), and its control target is that call's target
(`TaskService::get`, `exact`); the other call may be a new site.

**D4 — Sources (allowlist).** A panelist may read only: `fixtures/acme-shop/{app,routes,config,database}/**`
and `fixtures/acme-shop/composer.json`; `fixtures/task-api/src/**`, `fixtures/task-api/package.json`
and `fixtures/task-api/tsconfig.json`; the two `*.sites.json`; `openspec/changes/callsite-annotations/tasks.md`
(the Panel group); and the **description** of Linear DIS-80. Everything else is forbidden, in
particular `fixtures/README.md` and the fixtures' `README.md`, `docs/` and `tests/` (they describe
traps and expected edges), `fixtures/annotations/**`, the rest of `docs/measurements/**`,
`docs/project-context.md` and every other repository doc, `packages/**`, `tests/**`, `seeds/**`,
the rest of `openspec/**`, `prompts.md`, and the **comments** of DIS-80 and of every other ticket
(a comment from DIS-31 on DIS-80 states two control answers: P2). The resolver may also read
`panelist-1.json`, `panelist-2.json` and `agreement.json` (`agreement.json` is the list of
disagreement ids between the two panel outputs, not a measurement of the graph; the resolver may
instead derive the same ids from the two panel outputs). Each output declares what it read in
`sourcesRead`, one entry per **file** (a repository-relative path) or the literal
`linear:DIS-80/description`; a directory or a glob is rejected, and so is any path outside the
allowlist of its role.

**D5 — Selection** by the preparation (apply, not a panelist), from application code only (PHP
`app/**`, `routes/**`; TypeScript `src/**`), covering every hard construction the fixture has: in
PHP the seven "Analyzer traps" (facade, container binding, `__call`, Eloquent magic attribute,
string route, job, event) with at least 2 new sites each where the fixture has 2 or more instances,
plus framework and PHP built-in calls; in TypeScript calls to imported functions, interface
methods, `new`, method references and callbacks (`.map`, `.filter`, `register(plugin)`), calls
through `index.ts` re-exports, standard library, Zod and Fastify calls. *Construction rows (agent's
text, spec audit run 1), each with a minimum of 2 new sites, or every remaining instance outside the
controls when fewer than 2 remain:* PHP — facade, container binding by string, `__call` /
`__callStatic`, Eloquent attribute or relation read (`read`), string route action, array route
action, job dispatch, event, PHP or framework function; TypeScript — imported function, interface
method, `new`, method reference, callback, call through an `index.ts` re-export, standard library,
Zod, Fastify. One more row per fixture, "other call" (no minimum), takes every remaining site, so
every site belongs to exactly one row. The count per construction goes in the report's selection
table (construction, instances in application code, control ids, new ids), written after the panel
(never in the site list, so as not to hint answers).
The order of the new sites is file path then line, so it carries no hint either.

**D6 — Measures.** Agreement = same `expected` and same `target` (`file` and `symbol`); percent =
agreed / n × 100, one decimal (half away from zero, as in the spec). Cohen's kappa over `expected`
with three categories: p_o = sites with the same `expected` / n, p_e = Σ_k (a_k / n)(b_k / n),
κ = (p_o − p_e) / (1 − p_e), three decimals (half away from zero);
undefined (`null`) when p_e = 1. Per panelist and language, the same against the control reference
(n = 12 / 10), kappa flagged indicative.

**D7 — Deterministic merge** by the script (agreed → common answer + panelist 1's reason,
`agreement`; disagreement → resolution, `tiebreak`); nobody edits the final files.

**D8 — Models.** Panelist 1 Opus, panelist 2 Sonnet, resolver Opus in a fresh context that sees only
the disagreement ids (from `agreement.json`), both answers and the fixture code. The report names
models and date and says "dos agentes anotadores independientes de modelos distintos"; never
"anotación humana" or "a mano".

**D9 — The control does not move.** The README rows stay as they are; a final annotation that
differs from a control row is listed as a discrepancy in the report and as a Follow-up (destination
C) for the author.

**D10 — Script with tests**, so figures are reproducible. `scripts/annotation-agreement.mjs`
exports pure functions (`validateOutput`, `agreement`, `cohenKappa`, `mergeAnnotations`, `sha256`,
`checkFreeze` — compares the hashes a report records with the files) and a CLI
`node scripts/annotation-agreement.mjs <agreement|merge|hashes> [--root <dir>]` with three commands,
all with repository-relative fixed paths resolved under `--root` (for tests, like `fixturesRoot` in
`demo-excerpt`). Exit codes (spec "Agreement CLI"): `0` success; `1` validation or merge failure,
every problem on stderr, no file written; `2` usage error (missing or unknown command, unknown
option), following the project convention (`docs/project-context.md:78-88`,
`scripts/demo-excerpt.mjs:15-16`).
- `agreement` — validates `panelist-1.json` and `panelist-2.json` against the site lists, the
  fixtures and the allowlist; on any error prints every problem and exits 1 without writing;
  otherwise writes `docs/measurements/annotation/agreement.json`.
- `merge` — validates `resolution.json` (exactly the disagreement ids), then writes the two
  `fixtures/annotations/*.callsites.json`; exits 1 writing nothing on error.
- `hashes` — prints `<sha256>  <path>` for the nine frozen files (two site lists, `control.json`,
  `panelist-1.json`, `panelist-2.json`, `resolution.json`, `agreement.json`, two annotation files),
  in that order. The report records them in a table under the heading `## Hashes SHA-256`, one row
  `| <repository path> | <64 hex> |` per file, which `checkFreeze` parses.
`resolution.json` exists even when there is no disagreement (empty `sites`), so the set of frozen
files is always the same.
No npm script is added (P5). It reads JSON and fixture text only: no graph, no database, no network.

**D11 — Freeze by test**, `tests/unit/docs/annotation-freeze.spec.ts`, not by hook.

**D12 — Documentation.** `fixtures/README.md` § "Table 2 seed": the sentences "the remainder is
pending" and the "38 pending" / "40 pending" headings become a pointer to `fixtures/annotations/`
and the report; the section title and its first sentence stop saying "hand-annotated" for the 50
sites (the 22 control rows stay described as written by hand; agent's decision, spec audit run 1,
so that the README does not keep a false claim); the 22 rows are untouched. Nothing else in the
file changes. `README.md` §2.6: "anotados a mano" → "anotados por dos
agentes independientes"; in the limitations, the annotation stops being the author's (the Table 1
questions stay hers).

**P1 — `form` field.** A site says whether it is a `call`, a `new`, a `read` (property read served
by `__get`) or a `reference` (including PHP array callables and route action strings), and `call` is
the text up to the opening parenthesis, the receiver and property name, or the reference (spec
"Call-site lists"). Without it, a reference passed as an
argument (`app.post(..., controller.create)`, control `ts-08`) and the call that receives it are the
same line and could be annotated as different things. `form` restates what the text already shows,
so it gives no hint. It is carried into format 1 (additive for DIS-79).

**P2 — Ticket comments are forbidden to the panel.** The workflow tells each panelist to read the
ticket; the comment from DIS-31 on DIS-80 gives the answer of `ts-07` and `ts-10`. The Panel group
restricts the ticket to its description; `sourcesRead` must not list comments.

**P3 — Control reference before the panel.** `control.json` is transcribed in the preparation and
committed before the panel, so its commit precedes every judgement and its hash is in the report.
Panelists may not read it (D4). Without it the per-panelist control agreement would need a
transcription made after seeing the outputs.

**P4 — Citations are machine-checked.** A citation is `<path>:<line>` with the path relative to the
fixture root of the site (`app/<Dir>/<File>.php:<line>`, `src/<dir>/<file>.ts:<line>`); the
regular expression is `([A-Za-z0-9_./-]+\.(php|ts)):([0-9]+)`. At least one citation per answer
must name an existing file of that fixture and a line within it.

**P5 — No npm script.** The CLI runs three times in this change, by agents; `node scripts/annotation-agreement.mjs <command>`
works the same in PowerShell and Bash, so no wrapper is needed.

**P6 — Report language.** `docs/measurements/annotation-agreement.md` is written in Spanish, like
README §2.6 that cites it; JSON stays in English keys.

**P7 — No PowerShell check is planned.** Hashes are computed by the script (Node), identical on both
shells; nothing in this change is a command the author runs in PowerShell (destination D).

**P8 — No ADR, no Stryker.** The decisions are local to the measurement data; `scripts/` is outside
the Stryker `mutate` globs.

## Risks / Trade-offs

- **A panelist reads a forbidden source anyway.** `sourcesRead` is self-declared; the allowlist check
  catches a declared read, not a hidden one. Mitigation: the Panel group lists the allowlist and the
  forbidden paths explicitly; the report states the limitation.
- **Two models of the same family are not independent annotators in the human sense.** The report
  says so in its limitations; kappa is reported, not interpreted beyond its value.
- **The criterion leaves corner cases** (a call on a parameter typed by an interface in the fixture
  vs. a Fastify instance). D2 settles the cases known from DIS-31 (types declared outside the
  fixture → `none` unless a listed convention applies); other cases are disagreements, and the
  tie-break justifies them with `file:line`.
- **A control row may be judged differently from the README** (D9): listed, never forced.
- **The criterion names construction classes that some control rows use** (array route action,
  string route action, facade, `__call`). That is the rule the ticket asks to write before judging,
  not an answer: it names no site, file, line or target, and the panelist still has to find which
  construction each site is and where its target lives.
- **TypeScript has fewer hard constructions** than PHP: the report gives, per language, the number
  of sites per `expected` value, and TypeScript is expected to have fewer `heuristic` sites than PHP;
  that is the expected contrast of Table 2, not a selection bias.
- **Criterion contamination.** The criterion (D2 and its audit additions) was written by an agent
  that had read the README control, and the workflow's run notes given to every panelist name
  `fixtures/README.md` as the location of the control. Mitigation: the README stays forbidden and
  the criterion names classes of construction, never sites; the report states both facts in its
  limitations.

## Migration Plan

None: new files only. Rollback = revert the PR (the frozen files have no consumer until DIS-79).

## Open Questions

None open: every choice is recorded above and below as the agent's decision.

## Follow-ups

Decisions of the enrich step (Linear DIS-80, D1–D12) and of this proposal (P1–P8), with their
destination (`docs/project-context.md` → Tracking deferred findings). *Agent's text: decided as lead
engineer in an autonomous run, without the author.* The spec audit and the pre-merge reviews add
their findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| D1 | Format 1 of `fixtures/annotations/*.callsites.json` is fixed here; DIS-79 consumes it | **A** — this change; **B** — comment on DIS-79 (enrich step, 2026-10-28) |
| D2 | Written criterion of `exact` / `heuristic` / `none` before any annotation | **A** — this change (Panel group) |
| D3 | 50 sites per language including the 22 controls; unit = one call expression | **A** — this change |
| D4 | Allowlist of sources for panelists and resolver | **A** — this change (Panel group, validation) |
| D5 | Selection by the preparation, covering the fixture's hard constructions | **A** — this change |
| D6 | Agreement = same `expected` and `target`; kappa over `expected`; control kappa indicative | **A** — this change |
| D7 | Final files generated by the script, never edited by hand | **A** — this change |
| D8 | Opus / Sonnet panelists, Opus resolver; the README and report never say "human" or "a mano" | **A** — this change |
| D9 | The 22 control rows are not edited; discrepancies go to the report and to the author | **A** — this change (report); **C** — Spanish checklist comment on DIS-80 for any discrepancy found |
| D10 | `scripts/annotation-agreement.mjs` with tests instead of hand-computed kappa | **A** — this change |
| D11 | Freeze by test; a hook guarding `fixtures/annotations/` is not added | **D** — accepted |
| D12 | `fixtures/README.md` pointer and `README.md` §2.6 wording | **A** — this change |
| P1 | `form` field in sites and in format 1 | **A** — this change; **B** — comment on DIS-79 (propose step) |
| P2 | Ticket comments are forbidden to panelists (a DIS-31 comment gives two control answers) | **A** — this change (Panel group) |
| P3 | `control.json` transcribed and committed before the panel | **A** — this change |
| P4 | Citations machine-checked (`path:line` relative to the fixture root) | **A** — this change |
| P5 | No npm script for the agreement CLI | **D** — accepted |
| P6 | Report in Spanish | **D** — accepted |
| P7 | No PowerShell check planned | **D** — accepted |
| P8 | No ADR, no Stryker run | **D** — accepted |

*Spec audit run 1 (2026-10-28) — resolution by the agent, as lead engineer, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| Q1 | Parent DIS-53 still says "anotación humana" / "por la autora"; DIS-80 records the author's decision of 2026-10-27 to use two annotator agents. Decided: the sub-issue supersedes the parent on this point (it is the author's later, explicit decision); this change follows DIS-80 | **A** — this change (D8, D12); **B** — Spanish comment on DIS-53 |
| B1 | Site model could not represent property reads (`read`) nor route actions; `form` gains `read`, `reference` covers array callables and route action strings, chained calls start at the member operator | **A** — spec "Call-site lists", D1, D3, P1, Panel group; **B** — comment on DIS-79 (`form: "read"`) |
| B2 | Criterion gaps: static `X::dispatch`, `heuristic` over `none` precedence, `new` with no constructor, inherited methods, "declared first" ordering, `read` sites | **A** — D2 additions and Panel group criterion |
| B3 | Control target of ts-03 undefined and targets not tested: the control target is the target of the control call (rule in the spec and D3 only, never in `tasks.md` or the ticket description); the control test checks targets | **A** — spec "Control reference", D3, task 2.1 |
| B4 | Validation list incomplete: `none`⇔`null`, unknown `expected`, no citation, missing fields, missing target file, `target.symbol` last segment, resolver allowlist, `sourcesRead` entry format | **A** — spec "Panel output validation" (5 new scenarios), D4, task 1.1 |
| B5 | Selection coverage of hard constructions had no requirement: minimum per construction row, table in the report | **A** — spec "Call-site lists", D5, tasks 2.2a/2.2b, 6.1 |
| B6 | Control discrepancies were not tested | **A** — spec scenario "The report lists every control discrepancy", task 6.1 |
| B7 | CLI contract (commands, `--root`, exit codes 0/1/2) moved into the spec | **A** — spec "Agreement CLI", D10, tasks 1.1, 9.2 |
| I1 | § "Table 2 seed" title: included in D12 (the README must not keep "hand-annotated" for the 50 sites); 8.3 and 11.1 aligned | **A** — D12, tasks 8.3, 11.1 |
| I2 | Freeze before `measure-graph` checked in step 8 (`scripts/measure-graph.mjs` absent at the freeze commit) | **A** — spec, task 8.3 |
| I3 | Ambiguous "many TS sites" replaced by counts per `expected` value | **A** — Risks |
| I4 | Example citation `app/Services/TaxService.php:21` replaced by a neutral placeholder | **A** — P4, Panel group |
| I5 | Resolver prompt forbids "measurement output": `agreement.json` is the disagreement id list, or the resolver derives the ids itself | **A** — D4, task 4.4 |
| I6 | DIS-79 matching key: target `file` + `symbol`, site inside the edge source's span | **A** — D1; **B** — comment on DIS-79 |
| I7 | Chained calls spread over several lines | **A** — spec "Call-site lists" |
| I8 | `isProject` of `demo-excerpt` sees `fixtures/annotations` | **D** — accepted, task 7.1 already reviews it |
| I9 | Task 2.2 split into 2.2a (PHP) and 2.2b (TS) | **A** — tasks.md |
| I10 | Rounding moved into the spec | **A** — spec "Agreement measures" |
| I11 | Criterion contamination (author of the criterion read the control; run notes name the README) | **A** — Risks, task 6.2 limitations |
| I12 | `target.symbol` checked: its last segment must appear in `target.file` | **A** — spec "Panel output validation" |
