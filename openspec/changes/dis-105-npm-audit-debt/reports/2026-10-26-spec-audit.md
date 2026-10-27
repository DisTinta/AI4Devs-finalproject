CHANGES REQUIRED

# Spec audit: dis-105-npm-audit-debt (DIS-105)

- Date: 2026-10-26
- Change: `openspec/changes/dis-105-npm-audit-debt/` (`proposal.md`, `design.md`, `specs/local-startup/spec.md`, `specs/project-picker/spec.md`, `tasks.md`)
- Ticket: DIS-105, loaded from Linear with its two comments. **DIS-105 has no parent** (`parentId: null`), so no acceptance criteria are inherited. The sub-issue's own five acceptance criteria (`[enhanced]`) are used as the reference for points 1, 2 and 11.
- Project sources read: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (l.94, l.427, l.1089, l.1429), `docs/AUTONOMOUS-RUN.md` §2, `docs/adr/README.md`, `docs/DEMO.md`, the main specs `openspec/specs/local-startup`, `project-picker`, `web-foundation` and `seed-build`, plus the real code: `package.json`, `vitest.config.ts`, `vitest.stryker.config.ts`, `stryker.config.json`, `.github/workflows/ci.yml`, `.github/workflows/frontend.yml`, `tests/unit/scripts/wiring.spec.ts`, `tests/unit/web/vite-config.spec.ts` and `tests/unit/docs/guides.spec.ts`.

## Questions for the author

- **Q1 (scope, D10).** The ticket does not ask to change product code. The proposal changes the Screen 1 hint («Node 20+» → «Node 22+»), its `project-picker` requirement and its test. Do you accept this added scope? If you do, should the hint say «Node 22.12+» to match `engines.node` `>=22.12`? A visitor on Node 22.0–22.11 reads «Node 22+» and still cannot install.
- **Q2 (engines range).** Vitest 5 accepts `^22.12 || ^24 || >=26`, but `engines.node` `>=22.12` (ticket AC5) also allows Node 23.x and 25.x, which Vitest 5 refuses. Keep `>=22.12` as the ticket says, or use `^22.12 || ^24 || >=26`? Design D2 calls `>=22.12` "Vitest's floor", but it is not the same range.
- **Q3 (an inherited prohibition).** The modified requirement "Which commands load .env" still forbids `process.loadEnvFile`, `util.parseEnv` and `--env-file` in `scripts/`. The existing test gives the reason at `tests/unit/scripts/wiring.spec.ts:111`: "no Node .env API that the supported versions lack". Every Node ≥22.12 has those APIs, so that reason no longer holds. Should the prohibition stay, with a new stated reason, or go? The change does not have to decide this, but the design has to say why the prohibition is kept.

---

## 1. Scope against the ticket

Everything follows from DIS-105 except the items below. List them so the author can confirm or cut them:

| Item | Where | Assessment | Severity |
|---|---|---|---|
| Screen 1 hint «Node 22+», with its `project-picker` delta and test (D10) | proposal → What Changes; design D10; `specs/project-picker/spec.md`; tasks 5.5, 5.6, 9.1 | Not in the ticket. It follows from D2, but it is product code and a product spec. See Q1. | improvable (author decision) |
| New requirement "CI runs on the supported Node baseline" and new spec `tests/unit/ci/node-baseline.spec.ts` (D11) | `specs/local-startup/spec.md`; tasks 5.1, 5.2 | It turns ticket AC5 ("la CI usa `node-version: '22'` en todos los jobs") into a test. Within scope. | — |
| `docs/DEPLOYMENT.md`, `docs/backend-standards.md` | proposal → What Changes; task 10.3 | Follows from AC5 ("docs … piden Node 22.12"). Within scope. | — |
| `zod` / `markdown-it` (D1) | proposal, design D1 | Already recorded in the ticket's `[enhanced]` D1. Within scope. | — |

No widening to a parent story (there is no parent).

## 2. Inherited acceptance criteria

There is no parent issue, so nothing is inherited. The sub-issue's own criteria are covered as follows:

- **AC1 (no advisories).** Requirement "A clean install reports no high or critical advisory". **Weakened, blocking.** The ticket only allows a remaining advisory when it has no published fix ("un aviso nuevo sin arreglo publicado"). The scenario "npm audit on a clean clone" accepts any low or moderate advisory as long as it appears in Follow-ups, even when a fix exists. The requirement's own MUST clause ("SHALL have no published fix") has no check in the scenario. See point 3.
- **AC2 (quality unchanged).** This is a verification criterion, not behaviour. It is covered by tasks 0.4, 7.3 and 11.1 (file counts, mutation ≥ 80). Acceptable, but task 6.2 should list it as a recorded check. Improvable.
- **AC3 (per-file environments).** Covered by the unchanged `web-foundation` → "Component test environment", the `seed-build` scenario "The time zone does not change the file", and tasks 4.1, 4.2 and 4.5. Its clause "`vitest.stryker.config.ts` sigue excluyendo exactamente las rutas de hoy" is **not fully verified**: task 4.2 checks only `--project node`. See point 8. Blocking.
- **AC4 (web still starts).** Covered by the existing `web-foundation` proxy scenario (`openspec/specs/web-foundation/spec.md` ~l.235–240) and task 8.2.
- **AC5 (old Node rejected).** Covered by the modified "Which commands load .env" (engines), the new CI requirement, and tasks 10.2 and 10.3 (guides).

## 3. Missing scenarios

- **Blocking.** `local-startup` → "A clean install reports no high or critical advisory": the clause "Any remaining advisory of lower severity SHALL have no published fix at the time of the change" has no check in "npm audit on a clean clone". Add a THEN clause that pins it (see Corrections).
- **Improvable.** `local-startup` → "CI runs on the supported Node baseline": the clause "the same major as the `engines.node` floor of the root `package.json`" is not checked. The scenario hard-codes `'22'`. Add an AND clause that compares with the major of `engines.node`.
- **Improvable.** The requirement says "On a clean clone with a supported Node version". "Supported" is defined only in the scenario ("Node 22.12 or later"). Write "with a Node version that satisfies `engines.node`" in the requirement.

## 4. Ambiguity

None of the listed words appears in the requirements or scenarios. The only matches are `fast-uri` (a package name, fine) and design D5: "This is **safer** for the transaction-per-test harness". Improvable. Proposed wording: "With `sequence.hooks: 'stack'` the hooks of one suite run one after another in declaration order (`afterEach` in reverse), so a `beforeEach` declared after `useTransactionPerTest()` runs inside the open transaction instead of racing it (`docs/project-context.md` l.427–434)."

## 5. Open decisions

1. **Blocking: which output replaces `Paso 0`.** `docs/DEMO.md` → `Paso 0` (l.104–197) is the full output of `npm run up` in a fresh clone. It includes the `npm install` lines, the `install-scripts` warnings and the Vite banner `VITE v5.4.21 ready in …`, which Vite 8 also changes. Task 8.1 runs `npm ci` first and then "capture[s] the full `npm install` output". After `npm ci`, the `npm install` inside `npm run up` (task 8.2) no longer prints a fresh install. The task also leaves open:
   - which command is captured;
   - in which terminals (the `Cómo se capturó` table, l.14–23, says PowerShell 7 and Git Bash);
   - which rows of that table change (date, commit, Node/npm, terminals).

   Fix it in task 8.1 and 10.2 (see Corrections).
2. **Blocking: how the `node` project excludes the other two sets (design D8).** "Vitest's default include, minus the two sets above" does not say how. It could be a `test.exclude` on the `node` project, but then it must be stated whether that array is concatenated with or replaces the inherited root `exclude` (`fixtures/**`, `node_modules/**`, `.stryker-tmp/**`) under `extends: true`. A test that counts files will pin the result. Fix it in design D8 by naming the `exclude` of each project and the expected merge behaviour, and add a check to task 4.5: the sum of the per-project file lists equals the 0.4 total, and no file appears in two projects.
3. **Improvable.** Task 12.2 says "raise `timeout-minutes` with its reason" but not to what value. Fix the number in the design Risks (for example 60).

## 6. Contradictions inside the change

1. **Blocking: phase 2 is never committed before it is checked from a clean clone.** Design D6 and the Migration Plan put phase 2 in "further commits". In `tasks.md` the only phase 2 commit is 11.1, which comes **after** 8.1 ("push the branch, clone it… `npm ci`, `npm audit --audit-level=high`") and 9.1 (hint «Node 22+» in the clone). As written, the clean clone holds only the phase 1 commit (1.3), so the scenario "npm audit on a clean clone" and the e2e check would run against the wrong tree. Add a phase 2 commit task (explicit paths) before step 8. 11.1 then only commits the documentation and report changes.
2. **Blocking: the e2e step runs after the environment is torn down.** Task 8.3 stops the dev servers and runs `docker compose -p <clone> down -v`. Task 9.1 then uses "the 8.2 clone" with the services running, and has no restoration step of its own. Either move the restoration to the end of step 9 (8.3 → "keep the clone running for 9.1"; new 9.2 = restore and document), or have 9.1 start and restore its own run.
3. **Improvable: the RED in 5.3 is not a real red.** Task 3.2 already sets `engines.node` to `>=22.12`. So 5.3 ("See it fail if 3.2 has not set engines yet, or confirm it fails against the base value") cannot fail, and 5.4 says "if not already set". Remove `engines.node` from 3.2 and leave it to 5.4.
4. **Improvable.** Task 5.1 calls "Every CI job installs Node 22" a requirement (`local-startup` → "Every CI job installs Node 22"). It is the scenario. The requirement is "CI runs on the supported Node baseline".
5. **Improvable.** Design D2 says `>=22.12` is "Vitest's floor", but Vitest 5's range excludes 23.x and 25.x (Q2).

## 7. Contradictions with the project

1. **Improvable.** `docs/project-context.md` l.1089–1090 ("Vitest 1.6 worker threads ignore `process.env.TZ`, so … runs in the `forks` pool (`poolMatchGlobs`)") becomes stale. `poolMatchGlobs` disappears, and the mechanism becomes the `seed-build` project. Task 10.4 names only l.94 and l.427.
2. **Improvable, with a migration risk.** `docs/project-context.md` l.1428–1430 and the comment at `tests/unit/analyzers/php/parser-load.spec.ts:20` describe Vitest 1.6 mock semantics ("`mockClear` keeps queued `…Once` values; `mockReset` drops the default implementation"). Later Vitest majors changed `mockReset` semantics (it restores the original implementation). The tests may then still pass while asserting something else. Add this to design → Risks and to task 2.1, and extend task 10.4 to l.1428–1430.
3. **Improvable.** `docs/adr/20260928-node-pg-migrate-sql-migrations.md:34` says "Node ≥ 20.11; CI uses Node 20". The new ADR `docs/adr/20261026-node-22-baseline.md` should say that it supersedes that context line. `docs/adr/README.md` needs a new index row. Task 10.1 mentions neither.
4. **Improvable.** `tests/unit/scripts/wiring.spec.ts:111` has the comment "engines unchanged, no Node .env API that the supported versions lack". After this change it is false on both counts. Task 5.3 says "nothing else touched". Allow the comment edit, and resolve the reason for the prohibition (Q3).
5. Clean: the delta's modified requirements match `openspec/specs/local-startup/spec.md` l.110–152 and `openspec/specs/project-picker/spec.md` l.187–201 exactly, except for the intended values. `web-foundation` is unchanged and declared as such. Rule 8 (the "why" in ADR/PR) and the agent merge in task 12.7 are allowed by `docs/AUTONOMOUS-RUN.md` §2 (table l.131–133).

## 8. Contrast with the real code

1. **Blocking: `frontend.yml` excludes integration tests from the CLI.** `.github/workflows/frontend.yml:63` runs `npx vitest run --exclude 'tests/integration/**'` with `CI` set and no `DATABASE_URL`. The `seed-build` project of design D8 includes only `tests/integration/cli/seed-build.spec.ts`. If the CLI `--exclude` does not reach that inline project, the Frontend job loads a spec that throws on import (`tests/integration/helpers/db.ts`, the DATABASE_URL gate) and turns red. Neither the design nor the tasks mention this caller. Fix:
   - design D8: state how the CLI `--exclude` applies to projects;
   - task 4.5: add the check `CI=1 npx vitest run --exclude 'tests/integration/**' --reporter=verbose`, with `DATABASE_URL` unset, lists no file under `tests/integration/`. The same goes for `ci.yml:147` (`npx vitest run --no-file-parallelism tests/harness/…`): the file filter must still select only those four files.
2. **Blocking: the Stryker exclusions are checked on one project only.** `vitest.stryker.config.ts:12–33` adds `exclude` (including `packages/web/**` and `tests/a11y/**`) through `mergeConfig` at the root. The `dom` project's `include` is exactly `packages/web/**/*.test.tsx` and `tests/a11y/**`. Task 4.2 checks only `--project node`, so a leak into `dom` (jsdom loaded into the Stryker dry run, DIS-58 D25) would go unnoticed. Change 4.2 to list the files of **every** project under `--config vitest.stryker.config.ts` and confirm that none of the 11 excluded globs appears. Also add a Risk: whether `@stryker-mutator/vitest-runner` 10 supports `test.projects` at all is not shown; check it in 2.1.
3. Clean: `tests/unit/ci/verify-job.spec.ts` exists and already parses `ci.yml` with `yaml`, so the D11 pattern is real. No test asserts `node-version` today, so there is no duplication. `tests/unit/web/vite-config.spec.ts` asserts only the proxy, which is consistent with task 4.4. `tests/unit/docs/guides.spec.ts:175` only requires a `Paso 0 — ` heading, so recapturing the output does not break it. The CI mutation cache key (`ci.yml:254`) includes `package-lock.json` and both Vitest configs, as the design says.

## 9. Task size

- **Improvable.** 2.1 has eleven migration guides (Vitest 2–5, Vite 6–8, plugin-react 5–6, Stryker 9–10) in one task. Split it into 2.1 Vitest, 2.2 Vite and plugin-react, 2.3 Stryker.
- **Improvable.** 7.3 chains lint, typecheck, lint:architecture, docs:coverage, the full suite, `test:mutation:full` (tens of minutes) and `verify`. Split the mutation run into its own task (7.4) and renumber.
- **Improvable.** 12.6 is an open loop ("until no Blocker or Major"). This is the standard wording, so it is acceptable.

## 10. Mandatory steps

- Step 0 comes first and is labelled; the branch name `feature/dis-105-npm-audit-debt` follows the convention.
- Sections 6, 7, 8, 9, 10 and 12 are present, with their labels and `AGENT MUST EXECUTE` where required. Pre-merge Review is last and in the right order.
- The step 7 report path is named, and 7.1/7.4 capture and restore the database state.
- **Blocking:** the e2e step has no restoration and runs after the 8.3 teardown (6.2 above).
- **Improvable:** manual interface testing must exercise error cases. The second half of "A guide command reads DATABASE_URL from .env" (clone without `.env` → `MISSING_CONFIG`, exit `1`) is not in 8.2.
- **Improvable:** 9.1 links its screenshot from the step 8 report, which 8.3 has already closed. Give step 9 its own report, or write the step 8 report after 9.

## 11. Traceability

| Requirement | Scenario | Task(s) | Status |
|---|---|---|---|
| local-startup → Which commands load .env (MODIFIED) | The guide's scripts load .env and the quality scripts do not | 5.3, 5.4 | OK (5.3 RED is not real: 6.3) |
| local-startup → Which commands load .env (MODIFIED) | A guide command reads DATABASE_URL from .env | 8.2 | **Partial**: the error half (`MISSING_CONFIG`, exit 1) has no task |
| local-startup → CI runs on the supported Node baseline (ADDED) | Every CI job installs Node 22 | 5.1, 5.2 | OK |
| local-startup → A clean install reports no high or critical advisory (ADDED) | npm audit on a clean clone | 1.1, 3.2–3.4, 8.1 | **Hole**: 8.1 clones a branch without the phase 2 commit (6.1); the "no published fix" clause is unchecked (3) |
| project-picker → Indexing a repository of one's own is a hint, not a control (MODIFIED) | The indexing hint is text, not a control | 5.5, 5.6, 9.1 | OK (9.1 ordering: 6.2) |
| web-foundation → Component test environment (unchanged, verified) | Rendered output does not leak between tests | 4.1, 4.5 | OK |
| seed-build (unchanged, verified) | The time zone does not change the file | 4.1, 4.5 | OK |
| Ticket AC3: Stryker exclusions unchanged (no requirement) | — (recorded check) | 4.2 | **Partial**: only `--project node` is checked (8.2) |
| Ticket AC2: quality unchanged (no requirement) | — (recorded check) | 0.4, 7.3, 11.1 | OK; add to the 6.2 mapping |

No row is empty. The holes above are blocking through findings 3, 6.1 and 8.2.

---

## Corrections to apply

### `openspec/changes/dis-105-npm-audit-debt/specs/local-startup/spec.md`

- Requirement "A clean install reports no high or critical advisory", first sentence. Replace "On a clean clone with a supported Node version" with "On a clean clone with a Node version that satisfies the root `engines.node`".
- Scenario "npm audit on a clean clone". Replace the last AND with:
  "- **AND** `npm audit` prints `found 0 vulnerabilities`, or every advisory it lists is low or moderate, `npm audit --json` reports `fixAvailable: false` for it, and it appears in the design's Follow-ups with its destination"
- Scenario "Every CI job installs Node 22". Add:
  "- **AND** `22` is the major of the lower bound of `engines.node` in the root `package.json`"
- (After Q2) If the author picks `^22.12 || ^24 || >=26`, change `>=22.12` in the modified requirement and in its scenario ("**AND** `engines.node` is …").

### `openspec/changes/dis-105-npm-audit-debt/specs/project-picker/spec.md`

- After Q1: keep «Node 22+», change it to «Node 22.12+» in both the requirement and the scenario, or drop the delta if the author cuts D10.

### `openspec/changes/dis-105-npm-audit-debt/design.md`

- D2: replace "(Vitest's floor, which also covers Vite 8 and plugin-react 6)" with the range the author picks in Q2, and say explicitly that Node 23 and 25 are or are not accepted.
- D5: replace "This is safer for the transaction-per-test harness" with the wording in point 4.
- D8: add a paragraph:
  - "Each project's `include`/`exclude`: `dom` include [...]; `seed-build` include [...]; `node` exclude = root `exclude` + the `dom` and `seed-build` globs. Under `extends: true`, [state whether arrays are concatenated or replaced]."
  - "CLI filters (`--exclude 'tests/integration/**'` in `.github/workflows/frontend.yml:63`, the file list in `.github/workflows/ci.yml:147`) MUST still apply to every project; checked in task 4.5."
- D8, `vitest.stryker.config.ts` paragraph: replace "a dry run lists no excluded file" with "listing the files of every project under `--config vitest.stryker.config.ts` shows none of the 11 excluded globs".
- D12: add "the comment at `tests/unit/scripts/wiring.spec.ts:111` is updated with the assertion". Add the outcome of Q3: why the `process.loadEnvFile` / `util.parseEnv` / `--env-file` prohibition is kept.
- Risks: add
  - "[Mock semantics changed after Vitest 1.6] (`mockReset` restores the original implementation) → `tests/unit/analyzers/php/parser-load.spec.ts` and `docs/project-context.md` l.1428–1430 are re-checked against the migration notes."
  - "[`@stryker-mutator/vitest-runner` 10 and `test.projects`] → support confirmed in 2.x before editing; otherwise `vitest.stryker.config.ts` flattens to a single project."
- Risks, mutation timeout: name the value to raise `timeout-minutes` to (for example 60).

### `openspec/changes/dis-105-npm-audit-debt/tasks.md`

- 2.1: split into 2.1 Vitest 2–5 (including mock semantics and `projects` + CLI filters), 2.2 Vite 6–8 and plugin-react 5–6, 2.3 Stryker 9–10 (including `test.projects` support in the vitest-runner).
- 3.2: remove "`engines.node` to `>=22.12`". 5.3: drop "if 3.2 has not set engines yet, or confirm it fails against the base value", so it reads "See it fail". 5.3: allow updating the comment at l.111. 5.4: drop "(if not already set in 3.2)".
- 4.2: replace "`--project node`" with "for every project (`dom`, `seed-build`, `node`)", ending with "none of the 11 excluded globs of `vitest.stryker.config.ts` is listed".
- 4.5: add
  - "`CI=1 npx vitest run --exclude 'tests/integration/**' --reporter=verbose` with `DATABASE_URL` unset lists no file under `tests/integration/` (Frontend job, `frontend.yml:63`)";
  - "the `ci.yml:147` command runs exactly its four `tests/harness/` files";
  - "no file belongs to two projects".
- 5.1: change "(`local-startup` → "Every CI job installs Node 22")" to "(`local-startup` → "CI runs on the supported Node baseline", scenario "Every CI job installs Node 22")".
- New task before step 6 (for example 5.7): "Commit phase 2 (dependency bumps, config migration, Node 22, hint) with explicit paths; message naming DIS-105 phase 2". 11.1 then commits only the docs, reports and the pending changes.
- 6.2: add "AC2 (quality unchanged) → recorded checks 0.4, 7.3, 11.1".
- 7.3: move `npm run test:mutation:full` to its own task and renumber.
- 8.1: "In a fresh clone of the pushed branch (with the 5.7 commit), run `npm run up` first (no prior `npm ci`) and capture its whole output up to the API/Vite start lines for `Paso 0`, in PowerShell 7 and in Git Bash as `docs/DEMO.md` → `Cómo se capturó` states; then `npm audit --audit-level=high` (exit `0`) and `npm audit`."
- 8.2: add "error half: in a clone without `.env` and without `DATABASE_URL`, `npm run cli -- projects` fails with `MISSING_CONFIG` on stderr and exit `1`".
- 8.3: change to "Keep the clone running for step 9; document every command and output in `reports/YYYY-MM-DD-8-manual-interface-testing.md`".
- 9: add 9.2 "Restore: stop the dev servers by process tree, `docker compose -p <clone> down -v` for the clone only, the author's database untouched; document it in `reports/YYYY-MM-DD-9-end-to-end.md`, which links the screenshot".
- 10.1: add "`docs/adr/README.md` index row; the ADR says it supersedes the Node line of `docs/adr/20260928-node-pg-migrate-sql-migrations.md:34`".
- 10.2: add "`Cómo se capturó` rows: date, commit, terminals, Node/npm (Node 22.12 or later; CI on Node 22); the Vite banner of `Paso 0` comes from the new capture".
- 10.4: add l.1089–1090 (`forks` via the `seed-build` project instead of `poolMatchGlobs`) and l.1428–1430 (mock semantics of the new Vitest).

### `openspec/changes/dis-105-npm-audit-debt/proposal.md`

- Impact → Existing tests that change: add "the comment at `tests/unit/scripts/wiring.spec.ts:111`".
- Modified Capabilities: follow the outcome of Q1 and Q2.

### Linear DIS-105 (Spanish; the `[original]` block is not touched)

Add a comment:

> **Auditoría de la especificación (spec-auditor, 26-10-2026): CAMBIOS NECESARIOS.** Preguntas para la autora:
>
> 1. ¿Se acepta cambiar el aviso de la pantalla 1 a «Node 22+» (D10, fuera del texto del ticket)? ¿O debería decir «Node 22.12+», como `engines.node`?
> 2. `engines.node` `>=22.12` admite Node 23 y 25, que Vitest 5 rechaza (`^22.12 || ^24 || >=26`). ¿Se mantiene `>=22.12` (CA5) o se usa el rango de Vitest?
> 3. Con Node ≥22.12, todas las versiones admitidas tienen `process.loadEnvFile` y `util.parseEnv`. ¿Se mantiene la prohibición en `scripts/`, y con qué motivo?
>
> Correcciones en el cambio:
>
> - commit de la fase 2 antes de la prueba en un clon limpio;
> - restauración del entorno después del paso e2e;
> - comprobar que `--exclude 'tests/integration/**'` de `frontend.yml` y las exclusiones de Stryker llegan a todos los proyectos de `test.projects`;
> - el escenario de `npm audit` exige que un aviso restante no tenga arreglo publicado (CA1);
> - la captura del `Paso 0` sale de un `npm run up` en un clon nuevo.

---

## Resolution of run 1

Correction round 1 of 5, 2026-10-27, autonomous run (agent's text, as lead engineer). Every decision is also in `design.md` → Follow-ups with its destination. `openspec validate dis-105-npm-audit-debt --strict` passes after the edits.

### Questions for the author

| Question | Outcome |
|---|---|
| Q1 (hint scope) | **Decided by the agent.** The added scope is kept (a false «Node 20+» on Screen 1 would contradict AC5); the hint says «Node 22.12+», the `engines.node` floor. Updated in the `project-picker` delta, proposal, design D10, tasks 5.5, 5.6, 9.1. Destination A. |
| Q2 (engines range) | **Decided by the agent.** `engines.node` stays `>=22.12` (ticket AC5, the asserted value). D2 now says it is the lower bound of Vitest 5's range, not the range, and that Node 23 and 25 are accepted by `engines` but are out-of-support odd releases that Vitest 5 does not list; npm only warns on a mismatch; guides ask for an LTS line. Destination D. |
| Q3 (inherited prohibition) | **Decided by the agent.** The prohibition stays with a new reason: `scripts/env.mjs` is the single `.env` reader (the specified grammar, the `CODEMIND_SKIP_DOTENV` switch, one warning per process). Design D12 states it; the comments at `wiring.spec.ts:111` and in `scripts/env.mjs` are rewritten (tasks 5.3, 5.4). Destination D. |

### Findings

| Finding | Severity | Resolution |
|---|---|---|
| 1. Hint scope (D10) | improvable | Decided by the agent (Q1). |
| 2. AC1 weakened: "no published fix" unchecked | blocking | Fixed: the scenario "npm audit on a clean clone" now requires `fixAvailable: false` from `npm audit --json`; tasks 3.4 and 8.1 record it. |
| 2. AC2 not in the 6.2 mapping | improvable | Fixed: task 6.2 maps AC2 to 0.4, 7.3, 7.4 and AC3 Stryker exclusions to 4.2. |
| 2. AC3 Stryker exclusions checked on one project | blocking | Fixed: task 4.2 lists the files of every project under the Stryker config; design D8 says the same. |
| 3. "No published fix" clause without a check | blocking | Fixed (same as AC1). |
| 3. CI scenario does not compare with `engines.node` | improvable | Fixed: AND clause added to "Every CI job installs Node 22"; task 5.1 checks it. |
| 3. "Supported" undefined in the requirement | improvable | Fixed: "a Node version that satisfies the root `engines.node`". |
| 4. "safer" in D5 | improvable | Fixed with the proposed wording. |
| 5.1 Which output replaces `Paso 0` | blocking | Fixed: task 8.1 runs `npm run up` first in a fresh clone of the pushed branch, captures in PowerShell 7 and Git Bash; task 10.2 names the `Cómo se capturó` rows and the Vite banner. |
| 5.2 How the `node` project excludes the other sets | blocking | Fixed: design D8 names each project's `include`/`exclude`; the `node` project restates the root globs so the result does not depend on concatenation versus replacement; task 4.5 checks the sum and that no file is in two projects. |
| 5.3 `timeout-minutes` value | improvable | Fixed: 40 → 60 in design Risks and task 12.2. |
| 6.1 Phase 2 not committed before the clean clone | blocking | Fixed: new task 5.7 commits and pushes phase 2 code; 11.1 commits only docs, ADR and reports; Migration Plan updated. |
| 6.2 e2e after the teardown | blocking | Fixed: 8.3 keeps the clone running; new 9.2 restores and writes the step 9 report. |
| 6.3 RED in 5.3 not real | improvable | Fixed: `engines.node` removed from 3.2, left to 5.4. |
| 6.4 Requirement vs scenario name in 5.1 | improvable | Fixed. |
| 6.5 D2 "Vitest's floor" | improvable | Fixed (Q2). |
| 7.1 `project-context.md` seed-build note | improvable | Fixed: task 10.4 names it; the line is now l.1101–1102 after the base merge. |
| 7.2 Mock semantics after Vitest 1.6 | improvable | Fixed: design Risks; task 2.1 checks it; new task 4.7 names `tests/unit/analyzers/php/parser-load.spec.ts` as an existing test that changes (comment, code only if it fails); task 10.4 names `project-context.md` l.1444–1445 (shifted from l.1428–1430). |
| 7.3 ADR supersedes the node-pg-migrate Node line; index row | improvable | Fixed in task 10.1. |
| 7.4 Comment at `wiring.spec.ts:111` | improvable | Fixed: task 5.3 allows and specifies it; proposal Impact and design D12 name it (Q3). |
| 8.1 `frontend.yml` CLI `--exclude` across projects | blocking | Fixed: design D8 requires CLI filters to reach every project, with a fallback through `/opsx:update`; task 4.5 checks the Frontend command with `CI=1` and no `DATABASE_URL`, and the `ci.yml:147` hook-timing file list. |
| 8.2 Stryker exclusions on one project; runner support | blocking | Fixed: task 4.2 covers every project; design Risks and task 2.3 confirm `test.projects` support in the vitest-runner 10. The report said 11 excluded globs; `vitest.stryker.config.ts` has nine, so the artifacts say nine. |
| 9. Task 2.1 too large | improvable | Fixed: split into 2.1 Vitest, 2.2 Vite and plugin-react, 2.3 Stryker. |
| 9. Task 7.3 chains the mutation run | improvable | Fixed: mutation is task 7.4; the state check is 7.5. |
| 9. Task 12.6 open loop | improvable | Rejected: the report itself accepts the standard wording; unchanged. |
| 10. Manual testing without the error half | improvable | Fixed: task 8.2 runs the `MISSING_CONFIG` exit `1` half. |
| 10. Screenshot linked from a closed step 8 report | improvable | Fixed: step 9 has its own report (9.2), which links the screenshot. |
| Linear comment suggested by the report | — | Replaced by the correction-round comment on DIS-105 with the decisions above. |
