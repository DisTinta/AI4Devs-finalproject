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

*Additions of spec audit run 5 (agent's text, decided as lead engineer), copied word for word into
the Panel group:*
- A call on a receiver whose declared or inferred type is a fixture interface (or a fixture class
  whose method is abstract) targets that type's method: `Interface::m`, `exact`; implementations are
  not targets. "Can reach several symbols" applies only when no declared type fixes one symbol:
  event listeners, container bindings, a union type.
- A member-access chain is judged link by link: when a link before the called method has a type
  known only from a package or the standard library, the call is `none`, even if a later link's type
  is declared or augmented (`declare module`) in the fixture.

**D3 — Unit = one call expression, one property read served by `__get`, or one reference passed as
an argument.** 50 sites per language including the controls (12 + 38, 10 + 40). A `read` site and a
route action passed as a `reference` (array callable or `'Controller@method'` string) are each one
site; for a route, the framework call on the same line (`Route::get(`) is a different site. When a
README row describes two edges (task-api row 3), the control site is the call that leaves the row's
source symbol (`TaskService::update` → `this.get(`), and its control target is that call's target
(`TaskService::get`, `exact`); the other call may be a new site. When a README row's target is a
framework convention with no named symbol (an event's listeners), its control target is the
`handle` method of the listener registered first for that event in the fixture's
`EventServiceProvider::$listen` (*agent's text, spec audit run 4*).

**D4 — Sources (allowlist).** A panelist may read only: `fixtures/acme-shop/{app,routes,config,database}/**`
and `fixtures/acme-shop/composer.json`; `fixtures/task-api/src/**`, `fixtures/task-api/package.json`
and `fixtures/task-api/tsconfig.json`; the two `*.sites.json`; `openspec/changes/callsite-annotations/tasks.md`
(the Panel group); and the **description** of Linear DIS-80. Everything else is forbidden, in
particular `fixtures/README.md` and the fixtures' `README.md`, `docs/` and `tests/` (they describe
traps and expected edges), `fixtures/annotations/**`, `docs/measurements/annotation/control.json`
and `docs/measurements/annotation/selection.json` (the construction of each site hints its answer;
forbidden to the resolver too), the rest of `docs/measurements/**`,
`docs/project-context.md` and every other repository doc, `packages/**`, `tests/**`, `seeds/**`,
the rest of `openspec/**`, `prompts.md`, and the **comments** of DIS-80 and of every other ticket
(a comment from DIS-31 on DIS-80 states two control answers: P2). *Agent's text, spec audit run 3:*
both roles may also read `docs/base-standards.md` (the project `CLAUDE.md` points every agent at it;
it has no fixture or Table 2 content). The resolver may also read
`docs/measurements/annotation/panelist-1.json`, `docs/measurements/annotation/panelist-2.json` and
`docs/AUTONOMOUS-RUN.md` (the contract of its workflow step; no fixture content). The resolver may
**not** read `agreement.json`: it holds each panelist's agreement with the control, and with the
`control: true` flags of the site lists it would tell the resolver which panelist matches the hidden
reference. The resolver derives the disagreement ids from the two panel outputs (D8). Each output declares what it read in
`sourcesRead`, one entry per **file** (a repository-relative path) or the literal
`linear:DIS-80/description`; a directory or a glob is rejected, and so is any path outside the
allowlist of its role. `sourcesRead` is checked by path string, with no existence check: a glob is
an entry containing `*`, `?`, `[` or `{`; a directory is an entry ending with `/`, equal to a
directory named in the allowlist, or existing under the root as a directory. Reason: the hashed
panel outputs list `openspec/changes/callsite-annotations/tasks.md`, which the archive moves, and
`agreement` must stay re-runnable after the archive and on a partial `--root` copy (task 9.1). The
existence checks of cited fixture files and of `target.file` are unchanged (*agent's text, spec
audit run 4*).

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

*Construction labels and record (agent's text, spec audit run 2).* The preparation writes the
construction of every site, before the panel, in `docs/measurements/annotation/selection.json`
(`{ "fixtures": [ { "fixture", "rows": [ { "construction", "instances", "ids" } ] } ] }`) and commits
it with the site lists (task 2.4); the report's selection table is copied from it after the panel, so
the classification is never rebuilt after seeing answers, and it survives the change of agent
between `apply-prepare` and `apply-finish`. Panelists and the resolver may not read it (D4). The
labels, used verbatim in `selection.json`, in the report and by the freeze test, in this order:

| Fixture | Label | Construction | Minimum |
|---|---|---|---|
| acme-shop | `facade` | Laravel facade | yes |
| acme-shop | `container-binding` | container binding by string | yes |
| acme-shop | `magic-call` | `__call` / `__callStatic` | yes |
| acme-shop | `eloquent-read` | Eloquent attribute or relation read (`read`) | yes |
| acme-shop | `string-route` | string route action | yes |
| acme-shop | `array-route` | array route action | yes |
| acme-shop | `job-dispatch` | job dispatch | yes |
| acme-shop | `event` | event dispatch | yes |
| acme-shop | `framework-function` | PHP or framework function | yes |
| acme-shop | `other` | other call | no |
| task-api | `imported-function` | imported function | yes |
| task-api | `interface-method` | interface method | yes |
| task-api | `new` | `new` | yes |
| task-api | `method-reference` | method reference | yes |
| task-api | `callback` | callback | yes |
| task-api | `reexport` | call through an `index.ts` re-export | yes |
| task-api | `stdlib` | standard library | yes |
| task-api | `zod` | Zod | yes |
| task-api | `fastify` | Fastify | yes |
| task-api | `other` | other call | no |

"Minimum" = at least 2 new sites, or every remaining instance outside the controls when fewer than
2 remain (spec "Call-site lists"). `instances` of `other` is the number of its sites (*agent's text,
spec audit run 5*).
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
the disagreement ids, both answers and the fixture code. The resolver derives the disagreement ids
from the two panel outputs (same `expected` and same `target` = agreed); it never reads
`agreement.json`, which holds the control figures (agent's text, spec audit run 3). The report names
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
  otherwise reads `control.json` for the per-panelist control figures and writes
  `docs/measurements/annotation/agreement.json` in the shape fixed by the spec "Agreement measures"
  (`{ languages: [ { fixture, n, agreed, percent, kappa, disagreements, control: [ { panelist, n,
  agreed, percent, kappa, indicative } ] } ] }`; no per-site answer or control result; agent's text,
  spec audit run 3).
- `merge` — validates `resolution.json` (exactly the disagreement ids), then writes the two
  `fixtures/annotations/*.callsites.json`; exits 1 writing nothing on error.
- `hashes` — prints `<sha256>  <path>` for the nine frozen files (two site lists, `control.json`,
  `panelist-1.json`, `panelist-2.json`, `resolution.json`, `agreement.json`, two annotation files),
  in that order, each path repository-relative with forward slashes on every platform. The report records them in a table under the heading `## Hashes SHA-256`, with the
  header row `| Fichero | SHA-256 |` and one row `| <repository path> | <64 hex> |` per file, which
  `checkFreeze` parses, reading only the rows whose second cell is 64 hex characters (*agent's text,
  spec audit run 5*).
`resolution.json` exists even when there is no disagreement (empty `sites`), so the set of frozen
files is always the same.
*Agent's text, spec audit run 2:*
- **Resolution shape:** `{ "resolver": "<model id>", "date", "sourcesRead", "sites" }`, with no
  `panelist` and no `model` field; `sites` holds one `{ id, target, expected, reason }` per
  disagreement. The Panel group uses the same shape.
- **Report sections** (spec "Frozen annotations and agreement report"): `## Selección por
  construcción` (`### acme-shop`, `### task-api`, each `| Construcción | Instancias | Control | Nuevos |`
  with the labels of D5, ids comma-separated or `—`), `## Desacuerdos`
  (`| Id | Panelista 1 | Panelista 2 | Resolución |`, answer cells `<expected> · <file> · <symbol>` or
  `none`, or `Ninguno.`), `## Discrepancias con el control`
  (`| Id | Anotación final | Control | Justificación |`, answer cells as in `## Desacuerdos` — spec
  audit run 3 — or `Ninguna.`) and `## Hashes SHA-256`.
- **`selection.json` is not hashed** (the set stays at nine files): it is committed before the panel
  in task 2.4, it is not an input of DIS-79 nor a panel output, and the freeze test checks that the
  report's selection table equals it, so a later edit fails that test anyway.
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
regular expression is `([A-Za-z0-9_./-]+\.(php|ts)):([0-9]+)`. *Rule (agent's text, spec audit
run 2):* an answer is valid when at least one P4 citation names an existing file of the site's
fixture with a line between 1 and that file's last line; other citations (a framework path, a file
of the other fixture, line `0`, a line beyond the end) are ignored. The lenient rule is chosen
because a `none` reason may legitimately mention a framework path next to the fixture line.

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
| I5 | Resolver prompt forbids "measurement output": `agreement.json` is the disagreement id list, or the resolver derives the ids itself (superseded by R3-B1: the resolver derives the ids itself and never reads `agreement.json`) | **A** — D4, task 4.4 |
| I6 | DIS-79 matching key: target `file` + `symbol`, site inside the edge source's span | **A** — D1; **B** — comment on DIS-79 |
| I7 | Chained calls spread over several lines | **A** — spec "Call-site lists" |
| I8 | `isProject` of `demo-excerpt` sees `fixtures/annotations` | **D** — accepted, task 7.1 already reviews it |
| I9 | Task 2.2 split into 2.2a (PHP) and 2.2b (TS) | **A** — tasks.md |
| I10 | Rounding moved into the spec | **A** — spec "Agreement measures" |
| I11 | Criterion contamination (author of the criterion read the control; run notes name the README) | **A** — Risks, task 6.2 limitations |
| I12 | `target.symbol` checked: its last segment must appear in `target.file` | **A** — spec "Panel output validation" |

*Spec audit run 2 (2026-10-28) — resolution by the agent, as lead engineer, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| R2-B1 | The enhanced D2, D4 and AC 1 of the DIS-80 description (read by panelists) contradicted the Panel group. Decided: the Panel group prevails (stated in its first paragraph), and the enhanced part of the description is aligned at rule level (no site, file, line or control answer; the ts-03 rule stays out; `[original]` untouched) | **A** — Panel group; **B** — DIS-80 description, enhanced part |
| R2-B2 | The per-site construction record lived in the scratchpad and did not reach task 6.2 (different agent). Decided: `docs/measurements/annotation/selection.json`, committed in 2.4 before the panel, forbidden to panelists and resolver; not hashed (nine files stay; reason in D10) | **A** — spec "Call-site lists", D4, D5, D10, tasks 2.2a/2.2b/2.4/6.2, Panel group |
| R2-B3 | Report sections parsed by the freeze tests had no fixed headings, columns or labels. Decided: four fixed sections and columns; construction labels table in D5 | **A** — spec "Frozen annotations and agreement report", D5, D10, tasks 6.1/6.2 |
| R2-B4 | Resolution shape defined two ways. Decided: `{ resolver: <model id>, date, sourcesRead, sites }`, no `panelist`, no `model` | **A** — spec "Panel output validation", D10, Panel group, task 1.1 |
| R2-B5 | Citation rule "at least one" vs. "every". Decided: at least one valid citation (existing file of the site's fixture, line 1..last); other citations ignored | **A** — spec, P4, Panel group, tasks 1.1, 4.3, 9.2 |
| R2-I1 | Task 3.1 wording contradicted the control answers that `control.json`, the spec and D3 hold on purpose. Reworded to the panelist allowlist and the Panel group | **A** — task 3.1 |

*Spec audit run 3 (2026-10-28) — resolution by the agent, as lead engineer, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| R3-B1 | The resolver could read `agreement.json`, which holds each panelist's agreement with the control, breaking the blindness of the tie-break. Decided (preferred correction, narrowest scope): `agreement.json` leaves the resolver allowlist; the resolver derives the disagreement ids from the two panel outputs. The hashed set stays at nine files | **A** — spec "Panel output validation" (allowlist and resolver scenario), D4, D8, Panel group, tasks 1.1, 1.2, 4.4; **B** — enhanced D8 of the DIS-80 description |
| R3-B2 | The workflow step contract sent the resolver to files outside its allowlist. Decided: `docs/base-standards.md` allowed to both roles and `docs/AUTONOMOUS-RUN.md` to the resolver (process documents, no fixture content); a Panel group paragraph limits the resolver's step contract to git and commits (no `design.md`, no Linear comment; every process document read goes in `sourcesRead`) | **A** — spec "Panel output validation", D4, Panel group, tasks 1.1, 1.2 |
| R3-B3 | Enhanced AC 5 of DIS-80 ("cita una línea que no existe") contradicted the lenient citation rule R2-B5. Decided: AC 5 reworded at rule level to "ninguna cita válida; las demás se ignoran" | **B** — DIS-80 description, enhanced part only |
| R3-I1 | File shapes read by the tests were fixed only in tasks. Decided: the spec fixes the shapes of the site lists, `control.json` and `agreement.json` (no per-site answer or control result); D10 says `agreement` reads `control.json` | **A** — spec "Call-site lists", "Control reference", "Agreement measures"; D10 |
| R3-I2 | `source` for calls inside closures, arrow functions or anonymous callbacks was undefined. Decided: anonymous functions are transparent (innermost named function or method, otherwise the file) | **A** — spec "Call-site lists", Panel group input set |
| R3-I3 | Cells of `## Discrepancias con el control` had no format. Decided: same format as `## Desacuerdos` | **A** — spec "Frozen annotations and agreement report", D10 |
| R3-I4 | `panelist` field not checked against its file. Decided: validation rejects a mismatch (cheap check against a swapped file), folded into the existing accepted and incomplete scenarios; scenario count unchanged (28) | **A** — spec "Panel output validation", tasks 1.1, 1.2 |
| R4-B1 | How validation treats a `sourcesRead` entry was undecided; a file-system check would break task 9.1 and re-running `agreement` after the archive. Decided (recommended correction): path-string check with no existence check; glob = contains `*`, `?`, `[` or `{`; directory = ends with `/`, equals an allowlisted directory or exists under the root as a directory | **A** — spec "Panel output validation" (requirement and directory/glob scenario), D4, Panel group output format, tasks 1.1, 1.2 |
| R4-B2 | The control target of an event row (a README row naming listeners, no symbol) was undefined. Decided: the `handle` method of the listener registered first for that event in the fixture's `EventServiceProvider::$listen`; the rule stays out of the DIS-80 description (no site or answer named there) | **A** — spec "Control reference" (rule and scenario), D3, task 2.1 |
| R4-I1 | `hashes` path separator unspecified (Windows `path.join` gives backslashes). Decided: repository-relative path with forward slashes, matching the report table | **A** — spec "Agreement CLI", D10 |
| R4-I2 | Enhanced D1/D3 of DIS-80 lagged the change (no `form` field; unit only "expresión de llamada"). Decided: taken, aligned at rule level, no site or answer named | **B** — DIS-80 description, enhanced part only |

*Spec audit run 5 (2026-10-28) — resolution by the agent, as lead engineer, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| R5-B1 | The criterion did not say which symbol a call on a receiver typed by a fixture interface targets; read literally, the "declared first" tie-break picked the implementation. Decided (recommended correction): the interface (or abstract) method is the target, `exact`; "can reach several symbols" applies only when no declared type fixes one symbol (event listeners, container bindings, a union type). Rule-level, names a construction class, no site | **A** — D2, Panel group criterion; **B** — enhanced D2 of the DIS-80 description |
| R5-I1 | Hashed files written by agents on Windows may carry CRLF in the working tree while CI hashes the LF checkout. Decided: taken; before filling and before re-checking the hash table, `git ls-files --eol` must show `i/lf w/lf` for every hashed file and no file may start with a BOM; a `w/crlf` file is re-checked-out from the index, never edited; an `i/crlf` file or a BOM stops the ticket (a frozen input cannot be edited) | **A** — tasks 6.2, 8.3 |
| R5-I2 | A member-access chain through a package-typed link (`request.server…`, augmented by `declare module` in the fixture) could be read as `exact`. Decided: taken; the chain is judged link by link, a package or standard-library link before the called method makes the call `none` | **A** — D2, Panel group criterion; **B** — enhanced D2 of the DIS-80 description |
| R5-I3 | The site test did not check that the control sites sit in their README row's source. Decided: taken; task 2.1 compares each control site's `source` with its README row's source (the symbol, or `{ "file": "routes/…" }` for the route rows); no new scenario | **A** — task 2.1 |
| R5-I4 | A report describing the control as "escritas a mano" would fail its own scenario. Decided: taken; task 6.2 describes the control as "las 22 filas de control de `fixtures/README.md`, anteriores a este ticket" | **A** — task 6.2 |
| R5-I5 | `instances` of `other` was undefined and the hash table had no fixed header. Decided: taken; `instances` of `other` is its number of sites; the header is `| Fichero | SHA-256 |` and `checkFreeze` reads only rows whose second cell is 64 hex characters | **A** — spec "Call-site lists", "Frozen annotations and agreement report"; D5, D10 |

*Apply, preparation (2026-10-28) — decisions of the agent, as lead engineer, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| AP-1 | Reading of the construction labels of D5 when classifying the sites (recorded in `selection.json`, never in the site lists): `facade` is any Laravel facade call (`Pricing::`, `Log::`, `Route::`); `container-binding` is a call on the container (`->singleton(`, `->make(`); `magic-call` is `CarrierGateway::__call` plus the Eloquent static forwarding (`Order::create(`, `::query(`, `::observe(`); `eloquent-read` is a property read of a model attribute or relation; `framework-function` is a PHP built-in, a Laravel helper or a call on a framework type; `callback` wins over `stdlib`, `zod` and `fastify` when the call receives an inline function; `method-reference` is any function or method passed by name as an argument; `new` is `new` of a fixture class | **A** — `selection.json` |
| AP-2 | The `reexport` row of task-api has 0 instances: the only barrel (`src/schemas/index.ts`) is imported for types and for schema values that are referenced, never called. The row stays with `instances: 0` and no ids, and the minimum rule of the spec (every remaining instance when fewer than 2) holds. Not invented to fill the row | **A** — `selection.json`; **C** — note for the author in the report (limitation: no call goes through a re-export in this fixture) |
| AP-3 | `instances` are counted by the definitions of AP-1 over `app/**`, `routes/**` and `src/**` (comments excluded), by search and reading; they are a record of the selection, not an input of any measure, and the test checks the minimum rule against them | **D** — accepted |
| AP-4 | Where a line holds two calls of the same text (`priorityRank(` in `task.filters.ts:35`), the site is the first on the line; where one line holds a call and a reference (`routes/api.php:12`, `app.ts:31`), they are two sites with different `call` | **A** — site lists |
| AP-5 | The first test of the site lists also checks the selection record (labels and order of D5, ids partition the 50 sites, the minimum per construction); no new scenario, the 28 stay | **A** — task 2.1 |

*Apply, after the panel (2026-10-28) — decisions of the agent, as lead engineer, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| AF-1 | The panel agreed on all 100 sites, also with the control: no disagreement, an empty resolution, no control discrepancy. The report says so without interpreting it and lists, as a limitation, that two models of one family are not independent annotators in the sense of different people. No discrepancy means no Spanish checklist comment on DIS-80 for task 6.4 | **A** — report (`## Desacuerdos`, `## Discrepancias con el control`, limitations) |
| AF-2 | The `reexport` row of task-api has 0 instances (AP-2): the report states it as a limitation for the author, who may want a fixture with a call through a re-export before Table 2 is read | **C** — note for the author in the report and in the Spanish comment on DIS-80 |
| AF-3 | P1 (`form` in format 1) needs no new comment on DIS-79: the comment of spec audit run 1 already lists `form` with `read` and the matching key | **B** — already covered (task 6.4) |
| AF-4 | The scratchpad copy of task 9 was not deleted because the repository policy blocks `rm -rf`; it holds only copies outside the repository | **D** — accepted |
| AF-5 | `origin/final-project-CRN` moved during the ticket (PR #77, DIS-32): merged into the branch before the freeze, as task 0.1 says; it touches `fixtures/README.md` outside the Table 2 section only. The apply ran in the existing worktree `.worktrees/dis-32` (the branch is checked out in the main checkout) and published with a push of `HEAD` to the branch | **D** — accepted |
| AF-6 | `README.md` §2.6 (`readme.md` on disk) and `fixtures/README.md` say the annotation was made by two independent agents, with the control rows described as written by hand in `fixtures/README.md` only; `docs/project-context.md` documents where the reference lives and that it is regenerated only with the `merge` command | **A** — task 11 |
