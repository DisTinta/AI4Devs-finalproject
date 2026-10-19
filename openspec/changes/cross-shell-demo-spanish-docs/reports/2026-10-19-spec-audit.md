# Spec audit — cross-shell-demo-spanish-docs (DIS-102)

- Date: 2026-10-19
- Auditor: spec-auditor subagent (headless `claude -p --agent spec-auditor`, read-only tools)

## Run 1

Verdict line as returned:

CHANGES REQUIRED

**Decisions to record.** This is an autonomous run under ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`, so these are not questions for the author. The agent decides each one as lead engineer and writes it into the DIS-102 Enhanced description (in Spanish) and the change's artifacts.

- **R1. Screen 1 hint change (D13).** The ticket's "Fuera de alcance" excludes product changes beyond loading `.env`. The change edits one web string. Keep it: Screen 1 should not give a hint that PowerShell users cannot run. Record it as a narrowing of the non-goal, because today it is recorded nowhere in Linear.
- **R2. Spanish guides vs. English-only rule.** `docs/base-standards.md` §2 (l. 41–43) says all documentation is English-only, and `docs/documentation-standards.md:42` says "Update each affected file in English". The author's [original] asks for the four guides in Spanish. Record a project exception in `docs/project-context.md`. Do not put it in `base-standards.md`: that file is kit doctrine and gets replaced on update (`project-context.md` l. 8–9).
- **R3. Ctrl+C on `npm run up`.** The guide stops the system with Ctrl+C, which ends the step `npm run dev`. The spec does not say what `up` prints or which code it exits with in that case. Pick a behaviour (one proposal is in the corrections below).

---

### 1. Scope against the ticket

DIS-102 has no parent (confirmed: no `parentId`, no relations, no comments). So the ticket alone sets the scope.

| Item | Source | Assessment |
|---|---|---|
| `.env` loader, `up`/`down`, `Makefile`, `POSTGRES_PORT`, `demo:ask`/`demo:excerpt`, the 4 docs in Spanish, CONFIDENCE delta | Ticket D1–D11 | In scope |
| `CODEMIND_SKIP_DOTENV` + `vitest.config.ts` (design D12) | Follows from AC B ("`npm test`… no cargan `.env`") and from protecting `migrations.spec.ts` | In scope, but **not in the ticket**. Proposal l. 26 and design l. 61–62 say D12–D17 are "also recorded in the ticket's Enhanced description". The Linear description contains only D1–D11. **Blocking** under ADR §88 ("every decision it takes is written … in the ticket's Enhanced description"). |
| `project-picker` delta + `ProjectPickerPage.tsx` string (D13) | Not in the ticket; the ticket's "Fuera de alcance" says the opposite | **Blocking until recorded** (R1). Justified by AC C (the walkthrough shows the API-down notice), so record it rather than cut it. |
| `demo:excerpt` not loading `.env` (design D4) | Ticket D4 says "los ayudantes de demo" load it | Harmless refinement. Record it with D12–D17. |
| D14 (labelled shell variants in TESTING.md), D15 (fence info strings), D16 (`guides.spec.ts`), D17 (`DOCKER_HOST` trick) | Derived from AC C/D/A | In scope. Record them. |

No other invented scope.

### 2. Inherited acceptance criteria

There is no parent, so nothing is inherited. I checked the ticket's own criteria A–E against the requirements instead:

- **Missing (blocking):** AC B, 4th bullet: "La versión mínima de Node del proyecto (`engines`, `>=20.11`) se respeta". No requirement or scenario pins `engines.node` or forbids `process.loadEnvFile`/`util.parseEnv`/`--env-file`. Only proposal l. 28 and design D2 mention it.
- **Covered:**
  - AC A: start sequence, works before `npm install`, Docker down, `down` keeps the volume, `make up` still works.
  - AC B: `.env` read by the guide scripts, precedence, no `.env`, quality scripts skip it.
  - AC C: same command in both shells, prerequisites step, web walkthrough, ordered steps.
  - AC D: four docs in Spanish, links, the CONFIDENCE test.
  - AC E: the clean-clone run recorded in the PR.
- **Partially covered (improvable):** AC D lists links in "prompts.md … specs". The link scenario covers only `readme.md`, `docs/project-context.md` and the four guides. A grep shows `prompts.md` and `openspec/specs/` have no `#fragment` links into the four guides, so nothing is lost. Say so in the design (D10) so the gap is not mistaken for an oversight.

### 3. Missing scenarios

| # | MUST clause without a scenario | Severity |
|---|---|---|
| 3.1 | "Which commands load .env": "`up` and `demo:ask` SHALL load it themselves". The wiring scenario only checks that `package.json` says `node scripts/up.mjs` / `node scripts/demo-ask.mjs`. Nothing checks that either script loads `.env`. No `demo:ask` scenario reads a value from `.env`. | Blocking |
| 3.2 | "One command starts the system": "`npm run up` SHALL load `.env`". The scenario "Up runs the start sequence in order" tries to cover it with a temporary `.env`, but the design gives `runUp` no way to receive that file (see 6.1). As designed, it cannot be tested. | Blocking |
| 3.3 | "Which commands load .env": "Product code SHALL keep reading its configuration from the process environment only". The only check is that `dev-register.mjs` has no `load-env`. Nothing asserts that `packages/*/src` never imports `scripts/` or reads `.env`. | Improvable |
| 3.4 | "The deployment and testing guides in Spanish": "No sentence … SHALL say that the npm scripts do not read `.env`…". The search terms in "The guides are in Spanish and say that .env is read" (`export DATABASE_URL`, `do not read .env`, `no leen .env`, `Export it`) miss stale sentences that exist today (listed below). The recorded check would pass with them still there. | Blocking |

Stale sentences the searches miss:
- `docs/project-context.md:191` "npm scripts do not load: export it"
- `docs/project-context.md:1181` "does not read `.env`"
- `docs/project-context.md:62` "`DATABASE_URL` exported (`make up` exports `.env`)"
- `docs/project-context.md:227` "in native PowerShell run the `npm` scripts directly"
- `docs/DEPLOYMENT.md:109` "plain `npm` scripts do not read `.env`" (the backticks defeat the literal search)
- `docs/DEPLOYMENT.md:20–21`
- `docs/TESTING.md:29` ("never the one `make up` seeded")

### 4. Ambiguity

- `proposal.md:45`: "numbered **short** steps". "Short" is not measured anywhere; the spec only requires consecutive numbering. **Improvable.** Either drop "short", or define it (e.g. "each `Paso` holds at most two `shell` blocks and its prose is at most 8 lines").
- The ticket [original] asks for steps "lo más claros y fáciles posibles". That block is immutable. The spec makes it measurable through the ordering, fence and walkthrough scenarios, so nothing more is needed.
- No other occurrence of fast / easy / secure / efficient / many / appropriate / robust.

### 5. Open decisions

| # | Decision left to the implementer | Where to fix it | Severity |
|---|---|---|---|
| 5.1 | Which environment `CODEMIND_SKIP_DOTENV` is read from: the **target** `env` given to `loadEnvFile`, or `process.env`. Under Vitest, `process.env` always has the switch set. If `loadEnvFile` reads `process.env`, every loading test of task 2.1 becomes a no-op and fails. The second half of "The test suite never reads .env" implies the target env. | Requirement "Loading .env into a process" | Blocking |
| 5.2 | Ctrl+C during step 5 (R3). Node's default SIGINT handler kills `up` before its child exits. On Windows the child usually exits with code `3221225786`, not a signal. The spec gives neither the message nor the exit code, and the guide's pasted output depends on both. | Requirement "One command starts the system" + a new scenario | Blocking |
| 5.3 | `demo:ask`: how it tells an UNKNOWN reply from an answered one. An UNKNOWN reply also has `"statements": []` (`openspec/specs/http-ask/spec.md:167`). The spec does not fix the order of checks, or what happens with a `2xx` body that is not JSON. | Requirement "The demo question helper" | Blocking |
| 5.4 | `demo:excerpt`: what counts as a "line". Does a final LF start an extra empty line? Is a CR before the LF dropped? The scenario pins `has <n> lines` "with the file's line count". | Requirement "The demo excerpt helper" | Blocking |
| 5.5 | `demo:ask` has no request time limit (a hung API hangs the demo). A non-numeric `PORT` is unspecified. | Same requirement | Improvable |
| 5.6 | `demo:excerpt`: (a) project `.` resolves to `fixtures/` itself. State that `<project>` must equal the name of a directory entry of `fixtures/`, excluding `.` and `..`. (b) A `<path>` that is a directory has no error message. (c) Order of checks when several fail (usage → project → outside → missing → range). | Same requirement | Improvable |
| 5.7 | The slug rule in "Links to the guides' sections resolve" says "letters, digits". State Unicode letters/digits (`\p{L}`, `\p{N}`) and NFC normalisation. Otherwise `#verificar-una-instalación` may be resolved inconsistently. | That scenario | Improvable |
| 5.8 | "Antes de empezar" says what to do when 5432 is taken, but not how the reader finds out. Name the signal, e.g. step 0 fails with Compose's `port is already allocated` / `Bind for 0.0.0.0:5432 failed`. Also say to edit `.env` with a text editor: PowerShell 5.1 redirection writes UTF-16, which the UTF-8 grammar cannot read. | DEMO requirement, design D15 | Improvable |

### 6. Contradictions inside the change

- **6.1 (blocking).** Design D4 (l. 97) says "`up` and `demo:ask` import `./load-env.mjs` first", so `.env` is loaded as a side effect on import, from `DOTENV_PATH`, and skipped under Vitest. Design D5 defines `runUp({ env, run, stdout, stderr, cwd })` with no `.env` path. The scenario "Up runs the start sequence in order" needs "a `.env` file with `POSTGRES_PORT=5433`" to reach the steps' environment. That scenario cannot be implemented with this design. The same gap exists for `runDemoAsk`.
- **6.2 (blocking).** Proposal l. 57 and design l. 62 / D13 l. 208 say D12–D17 and the D13 narrowing are "recorded in the ticket's Enhanced description". Linear does not have them (see point 1).
- Proposal, design and specs otherwise agree. The task list follows the design.

### 7. Contradictions with the project

- **7.1 (blocking).** `docs/base-standards.md` §2 (l. 41–43: documentation English-only) and `docs/documentation-standards.md:42` conflict with the Spanish guides. No exception is recorded (R2). Task 17.3's `/update-docs` would apply the English rule.
- **7.2 (blocking, folded into 3.4).** `docs/project-context.md` l. 38 (Closed decision 1: "Evaluators run `make up`"), l. 62, 191, 227 and 1180–1181 contradict the new behaviour. Task 12.2 names only "Commands, Testing, Known races" and generic sentences.
- **7.3 (clean).**
  - `openspec/specs/test-db-isolation/spec.md` → "Existing store test helpers keep their API" (existing store specs pass without edits) agrees with D12.
  - `verify-smoke` l. 6 / 224 and `seed-load` l. 5 mention `make up`. That is still true because it delegates; no edit needed.
  - `confidence-score` delta: the rest of "Published weights" is copied unchanged, and the scenarios get stricter (header cells, `—`).
  - `project-picker` delta: the requirement is copied unchanged except the hint; 9 of 9 scenarios are kept.
  - ADR autonomous run: present in this tree. It covers the agent opening and merging the PR (tasks 19.1, 19.9), which overrides `docs/openspec-tasks-mandatory-steps.md` §3 ("the agent never merges").

### 8. Contrast with the real code

All claims the design makes about the code hold:

- `tests/integration/store/support.ts:32` copies `{ ...process.env }`, and `migrations.spec.ts:268` runs `db:rollback` without `DATABASE_URL`. The D12 danger is real and correctly described.
- `tests/integration/api/dev-script.spec.ts:58,82` spread `process.env`, so they inherit the switch. Its `dev-register.mjs` spawn (l. 85) is unaffected by the separate preload.
- Vitest is 1.6.1, and `test.env` exists (`node_modules/vitest/dist/reporters-w_64AS5f.d.ts:2493`, "assigned to `process.env` before running tests").
- `eslint.config.mjs:25–28` declares only `console` and `process` as globals. `typescript-eslint` recommended covers `*.mts`, so the `.d.mts` files parse.
- The entry-guard pattern exists at `packages/cli/src/seed-load.ts:224`.
- `ProjectPickerPage.tsx:46` and `ProjectPickerPage.test.tsx:362–365` (full text pinned).
- `confidence-doc.spec.ts:23–29`, `:47`, `:67`, `:70` are the exact places D9 changes.
- `Makefile:7–10`, `docker-compose.yml:9`, `DEPLOYMENT.md:23,88,109`, `TESTING.md:91`.
- `CONFIDENCE_WEIGHTS` (`confidence.ts:54–61`) uses `1.0` / `1.5`, matching the "decimal point" rule.

There is no existing `.env` parser or `dotenv` use anywhere outside `node_modules`, so nothing is duplicated.

Improvable: `confidence-doc.spec.ts:24` looks for `\n## ${heading}\n`. If an editor saves `Límites` in NFD form, the test fails without a clear reason. Normalise both sides to NFC in the updated test (task 9.1).

### 9. Task size

- **16.2 (improvable).** Two full clean-clone runs (each with `npm install`, `up`, the whole guide) in two shells, in one task. Split it: 16.2a Bash clone, 16.2b PowerShell clone.
- **11.2 + 11.3 (improvable).** The whole DEMO rewrite plus the walkthrough. Split 11.2 into "skeleton + Antes de empezar + Paso 0" and "Pasos 1–6 + Comprobar + Parar".
- Every other task fits in one turn.

### 10. Mandatory steps

- Step 0 is first and labelled "(MANDATORY - FIRST STEP)". The branch is `feature/DIS-102-cross-shell-demo-spanish-docs`. 0.1 sets the Linear state first, as the project requires.
- Steps 13, 14, 15, 16 (if applicable), 17 and 19 are present and labelled. "AGENT MUST EXECUTE" is on 15, 16 and 19. Pre-merge review is last, with the three checks in order and the archive commit before the merge.
- The report paths follow the template. Restoration is covered: 14.5, 15.4 (`.env` put back), 15.8, 16.5. Screenshots go in `reports/`.
- **Blocking: 14.3.** It proposes to prove D12 by running `migrations.spec.ts` "while a `.env` exists: the author's, if the working tree has one". If D12 had a bug, "DATABASE_URL is missing on rollback" would run `db:rollback` against the database in the author's `.env`. That drops migration `0004` and the `verify_*` columns of `query_log`. Run the demonstration only in the scratchpad clone, against the clone's own database. The unit scenario of task 2.3 already proves the switch.
- **Improvable.** 16.1 and 19.1 switch `gh` to DisTinta but never switch back to Cristina-JumpMath.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| The .env file grammar | The .env grammar of .env.example is read | 1.1, 1.2 |
| | Lines that do not match are ignored and the last assignment wins | 1.3 |
| Loading .env into a process | Values of .env fill only the variables the environment lacks | 2.1 |
| | Without .env the environment is unchanged | 2.1 |
| | An unreadable .env is skipped with a warning | 2.1 |
| | The loaded .env is the repository root's | 2.2 |
| | The test suite never reads .env | 2.3 |
| Which commands load .env | The guide's scripts load .env and the quality scripts do not | 3.1, 3.2 |
| | A guide command reads DATABASE_URL from .env (recorded) | 15.4 |
| | **— (no scenario): `up`/`demo:ask` load .env themselves** | **— HOLE (blocking, 3.1)** |
| | **— (no scenario): `engines` stays `>=20.11` (ticket AC B)** | **— HOLE (blocking, point 2)** |
| One command starts the system | Up runs the start sequence in order | 4.1, 4.2 (**not implementable as designed**, 6.1) |
| | Up stops at the first failing step | 4.3 |
| | A step that cannot start stops up | 4.3 |
| | Up needs npm to start it | 4.3 |
| | The startup scripts need no installed dependency | 4.4 |
| | Up with Docker unavailable fails naming its first step (recorded) | 15.5 |
| | **— (no scenario): Ctrl+C stop of `up`** | **— HOLE (blocking, 5.2)** |
| Stopping the system and the Makefile | Down keeps the data volume | 5.1, 15.6 |
| | Make delegates to the npm commands | 5.2, 15.6 |
| Configurable Postgres port | The Postgres port follows POSTGRES_PORT | 5.3 |
| The demo question helper | An answered question prints its status and summary | 6.1, 6.2 |
| | An UNKNOWN answer prints its reason | 6.3 |
| | An error status prints the error body | 6.3 |
| | An unreachable API is reported | 6.3 |
| | Missing arguments are a usage error | 6.3 |
| The demo excerpt helper | An excerpt prints exactly the cited lines | 7.1, 7.2 |
| | Paths outside the project are refused | 7.3 |
| | A missing file or a range past its end is reported | 7.3 |
| | A malformed citation is a usage error | 7.3 |
| The demo guide runs the same in PowerShell and Bash | The demo guide has no Bash-only command | 11.1, 11.2 |
| | The demo guide is ordered for a first-time reader | 11.1, 11.2 |
| | The web walkthrough names what each screen shows | 11.1, 11.3, 16.4 |
| | The guide was followed on a clean clone in both shells (recorded) | 16.2, 16.3, 18.1 |
| The deployment and testing guides in Spanish | Links to the guides' sections resolve | 11.4, 10.1, 10.2, 12.1, 12.2 |
| | The guides are in Spanish and say that .env is read (recorded) | 10.1, 10.2, 12.1, 12.2, 17.1 (**search terms insufficient**, 3.4) |
| confidence-score → Published weights | The published weights are the code's weights | 9.1, 9.2 |
| | The confidence document states its limits | 9.1, 9.2 |
| project-picker → API status on Screen 1 | A failed retry keeps the alert | 8.1, 8.2 |
| | The other 8 scenarios (unchanged text) | 8.2 (`npx vitest run packages/web tests/a11y`) |

Three empty rows, all blocking.

---

### Corrections to apply

#### `openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md`

1. **Requirement "Loading .env into a process"** (5.1). Replace "When the environment variable `CODEMIND_SKIP_DOTENV` is `1`, loading SHALL not read the file and SHALL change nothing;" with:
   > When the environment the file is loaded into holds `CODEMIND_SKIP_DOTENV` with the value `1`, loading SHALL not read the file and SHALL change nothing; any other value, or its absence, loads normally;
2. **Requirement "One command starts the system"** (6.1, 3.2). Replace the first sentence with:
   > `npm run up` SHALL load `.env` (as in "Loading .env into a process", by default the repository root's file) into the environment it gives every step, and then run, …

   Then append (5.2), or record another choice:
   > While a step runs, `up` SHALL not end on SIGINT itself; when it has received SIGINT and the running step then ends, whatever its code or signal, `up` SHALL run no further step, write `[up] stopped (Ctrl+C)` to stderr and exit `130`.

   Add this scenario:
   > #### Scenario: Ctrl+C stops up without a failure line
   > - **GIVEN** a step runner double whose `npm run dev` call ends with code `3221225786` after `up` received SIGINT
   > - **WHEN** `up` runs
   > - **THEN** stderr holds `[up] stopped (Ctrl+C)` and no `failed` line, and `up` exits `130`
3. **Scenario "Up runs the start sequence in order", GIVEN.** Change it to:
   > a step runner double…, `npm_execpath` set, an injected environment without `CODEMIND_SKIP_DOTENV`, and a `.env` file given to `up` with `POSTGRES_PORT=5433`
4. **Requirement "Which commands load .env"** (point 2). Append:
   > The root `package.json` SHALL keep `engines.node` = `>=20.11`, and no file of `scripts/` SHALL use `process.loadEnvFile`, `util.parseEnv` or `--env-file`.

   **Scenario "The guide's scripts load .env and the quality scripts do not"** (3.1). Add:
   > - **AND** `engines.node` is `>=20.11`
   > - **AND** `scripts/up.mjs` and `scripts/demo-ask.mjs` load `.env` (they import `./env.mjs` or `./load-env.mjs`), `scripts/demo-excerpt.mjs` imports neither, and no source text of `scripts/` contains `loadEnvFile(` from `node:process`, `parseEnv` from `node:util` or `--env-file`
5. **Requirement "The demo question helper"** (5.3). Replace the "for a `2xx` response with statements … as text when it is not JSON)" clause with:
   > for a `2xx` response whose JSON body has `answer` equal to `"UNKNOWN"`, its `answer`, `reason` and, when present, `message`; for any other `2xx` response whose JSON body has a `statements` array, `{ statements: <its length>, evidence: <length of evidence, 0 when absent>, usage }`; for any other response, the body as it came (JSON indented with two spaces when it parses, as text otherwise).

   Add this scenario (3.1):
   > #### Scenario: demo:ask reads PORT from .env
   > - **GIVEN** the local server on a free port, an injected environment without `PORT` and without `CODEMIND_SKIP_DOTENV`, and a `.env` file given to `demo:ask` with `PORT=<that port>`
   > - **WHEN** `demo:ask` runs with a project id and a question
   > - **THEN** the server received the request and `demo:ask` exits `0`
6. **Requirement "The demo excerpt helper"** (5.4, 5.6). Append:
   > The file's lines are its UTF-8 text split on LF, each with a trailing CR removed; a final LF does not start a line; `<n>` is that number. `<project>` SHALL equal the name of a directory entry of `fixtures/` other than `.` and `..`. A `<path>` that names a directory SHALL give `demo:excerpt: <path> not found in fixtures/<project>` and exit `1`. Checks run in this order: arguments and citation (exit `2`), project, outside, missing, range.
7. **Scenario "Links to the guides' sections resolve"** (5.7). Replace "characters other than letters, digits, spaces, `-` and `_` removed" with:
   > characters other than Unicode letters (`\p{L}`), digits (`\p{N}`), spaces, `-` and `_` removed, both sides in NFC
8. **Scenario "The guides are in Spanish and say that .env is read"** (3.4). Replace the WHEN search list with:
   > searched, case-insensitively and ignoring backticks, for `export DATABASE_URL`, `export (it|them)`, `DATABASE_URL. exported`, `(do|does) not (read|load) .env`, `no (leen|cargan) .env`, `run the npm scripts directly` and `make up` (each `make up` hit reviewed: allowed only as the Git Bash/WSL alternative)

   Add to THEN:
   > and `docs/project-context.md` l. 38, 62, 191, 227 and 1180–1181 (base `368dc38` numbering) say that the guide's npm scripts read `.env`
9. **Requirement "The demo guide runs the same in PowerShell and Bash"** (5.8, improvable). Add:
   > `Antes de empezar` SHALL name the message `docker compose` prints when the port is taken (`port is already allocated`) and tell the reader to edit `.env` with a text editor.

#### `openspec/changes/cross-shell-demo-spanish-docs/design.md`

- **D4.** Replace "`up` and `demo:ask` import `./load-env.mjs` first" with:
  > `up` and `demo:ask` call `loadEnvFile(dotenvPath, env, stderr)` at the start of `runUp`/`runDemoAsk`, with `dotenvPath` defaulting to `DOTENV_PATH` from `./load-env.mjs` (imported for the constant only; its import side effect is a no-op under the test switch)
- **D5.** Change the signature to `runUp({ env, dotenvPath, run, stdout, stderr, cwd, onInterrupt })`. Describe the SIGINT handling of requirement item 2 (listener installed while a step runs; the injected `onInterrupt` lets the test fire it).
- **D8.** Signature `runDemoAsk(args, { env, dotenvPath, fetch, stdout, stderr })`. Add the 5.3/5.4/5.6 rules. Optionally add a request time limit (e.g. `AbortSignal.timeout(30_000)`, reported like an unreachable API).
- **D2.** Add a line: "`engines` stays `>=20.11`; pinned by `wiring.spec.ts` (`local-startup` → "Which commands load .env")."
- **D10.** Add: "`prompts.md` and `openspec/specs/` hold no `#fragment` link to the four guides (checked during the spec audit), so they need no anchor update."
- **New D18 "Spanish guides are a project language exception"** (R2): record it and point to the `docs/project-context.md` line below.
- **D12–D17 and D13.** Change "also recorded in the ticket's Enhanced description" to a statement that is true only after the Linear update below is done.

#### `openspec/changes/cross-shell-demo-spanish-docs/proposal.md`

- l. 45: drop "short", or replace it with the measurable definition from point 4.
- Impact → Changed: add the `docs/project-context.md` language-exception line.

#### `openspec/changes/cross-shell-demo-spanish-docs/tasks.md`

- **2.1:** add "the skip switch is read from the target `env`, so these tests pass plain objects without `CODEMIND_SKIP_DOTENV`".
- **4.1:** pass `dotenvPath` (temporary file) and an env without the switch.
- **4.3:** add "Ctrl+C stops up without a failure line".
- **3.1/4.4:** add the `engines` and per-script `.env`-import assertions.
- **6.3:** add "demo:ask reads PORT from .env".
- **12.2:** list `docs/project-context.md` l. 38, 62, 191, 227 and 1180–1181 explicitly, and add the language-exception line (R2):
  > - **Language exception, evaluator guides (DIS-102, author decision 2026-10-19):** `docs/DEMO.md`, `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md` and `docs/TESTING.md` are written in Spanish, like `readme.md`; commands, pasted output, identifiers, error codes and paths stay verbatim. Every other document follows `base-standards.md` §2.
- **14.3:** replace "the author's, if the working tree has one (never read, printed or changed), otherwise the clone's of step 15" with:
  > only in the scratchpad clone of step 15, with its own `.env` and database (never in the working tree, where a D12 bug would roll back the author's database)
- **16.1 and 19.1:** append "then `gh auth switch -u Cristina-JumpMath`".
- **Improvable:** split 16.2 into 16.2a (Bash clone) and 16.2b (PowerShell clone); split 11.2 into skeleton + Paso 0 / Pasos 1–6 + closing sections.
- **9.1 (improvable):** normalise the headings and the section lookup to NFC in `confidence-doc.spec.ts`.

#### Linear DIS-102

Do not touch `[original]`. Add to the **Enhanced** description, after D11, in Spanish:

> **D12. La suite de tests nunca lee `.env`.** `vitest.config.ts` fija `test.env: { CODEMIND_SKIP_DOTENV: '1' }`; los procesos que lanzan los tests lo heredan y `loadEnvFile` no lee el fichero cuando el entorno de destino tiene ese valor. Sin esto, `migrations.spec.ts` ejecutaría `db:rollback` contra la base de datos del `.env` de quien corre la suite.
> **D13. El aviso de API caída de la Pantalla 1 dice `npm run up`.** Estrecha el «Fuera de alcance» («cambiar comportamiento del producto») en una sola cadena: «Arráncala con npm run up y pulsa Reintentar.». Motivo: el recorrido por la web (criterio C) muestra ese aviso y `make up` no existe en PowerShell. Delta MODIFIED de `project-picker` → «API status on Screen 1».
> **D14.** En `docs/TESTING.md` la base de datos de integración se muestra como pareja etiquetada `bash` / `powershell` (los tests no leen `.env`).
> **D15.** Bloques de `docs/DEMO.md`: `shell` (común a los dos shells), `text` (salida), `powershell`/`bash` solo en parejas adyacentes; lo comprueba `tests/unit/docs/guides.spec.ts`.
> **D16.** Tests de los scripts en `tests/unit/scripts/` con declaraciones `.d.mts`; `scripts/` fuera de Stryker.
> **D17.** «Docker parado» se comprueba con `DOCKER_HOST=tcp://127.0.0.1:1` en el clon, sin parar Docker Desktop.
> **Refinamiento de D4.** `demo:excerpt` no carga `.env` porque no lee ninguna variable.
> **D18.** Los cuatro documentos en español son una excepción de idioma registrada en `docs/project-context.md`; el resto de la documentación sigue en inglés.
> **D19 (auditoría de la spec).** El interruptor `CODEMIND_SKIP_DOTENV` se lee del entorno de destino; `up` y `demo:ask` reciben la ruta del `.env` (por defecto la de la raíz); Ctrl+C durante `npm run dev` termina `up` con `[up] stopped (Ctrl+C)` y código 130; `engines` sigue en `>=20.11` y lo fija un test.

---


### Resolution of run 1

Folded with `/opsx:update` on 2026-10-19 (agent as lead engineer, ADR
`20261016-autonomous-workflow-run-entrega-2`); every decision is recorded in the DIS-102 Enhanced
description and in `design.md` → "Spec-audit amendments (run 1)".

| Finding | Resolution |
|---|---|
| R1, 1, 6.2 — D12–D17 and D13 not in Linear | Recorded in the Enhanced description (section «Decisiones añadidas en el propose») while the audit ran; the non-goal now names the D13 exception. |
| R2, 7.1 — Spanish guides vs. English-only docs rule | Design D18 (A10): language exception written once in `docs/project-context.md` (task 12.2); `/update-docs` runs with it (17.3). |
| R3, 5.2 — Ctrl+C on `up` | Adopted: `[up] stopped (Ctrl+C)`, exit `130`; new scenario "Ctrl+C stops up without a failure line"; design D5 (A3); task 4.3. |
| 2 — `engines` not pinned | Requirement "Which commands load .env" pins `engines.node` and forbids `process.loadEnvFile`/`util.parseEnv`/`--env-file`; wiring scenario extended; task 3.1 (A7). |
| 3.1 — `up`/`demo:ask` loading `.env` untested | Wiring scenario checks their `.env` imports; new scenario "demo:ask reads PORT from .env"; tasks 3.1, 6.3. |
| 3.2, 6.1 — no way to give `up` a `.env` | `dotenvPath` injected in `runUp`/`runDemoAsk` (spec, design D4/D5/D8, A2); scenario GIVEN updated; task 4.1. |
| 3.3 — product code never loads `.env` | Requirement and wiring scenario: no import specifier of `packages/*/src` names `scripts/`, `load-env` or `.env` (A7). |
| 3.4, 7.2 — stale sentences missed by the searches | Search list widened (case-insensitive, backticks ignored, every hit reviewed); `docs/project-context.md` l. 38, 62, 191, 227, 1180–1181 named in the scenario and in task 12.2; design D10 lists DEPLOYMENT/TESTING lines (A6). |
| 4 — "short steps" | Dropped from the proposal ("numbered steps in order"). |
| 5.1 — switch read from which env | Target environment (spec, design D3, A1; task 2.1). |
| 5.3 — `demo:ask` classification | `UNKNOWN` first, then `statements` array, then raw body; non-JSON `2xx` printed as text (A4). |
| 5.4, 5.6 — excerpt lines, project `.`, directory path, order | Spec defines lines, project entry rule (`.` and `..` refused), directory = not found, check order; scenarios extended (A5). |
| 5.5 — time limit and non-numeric `PORT` | `PORT` outside 1–65535 → exit `2` with `demo:ask: PORT must be a port number`; no time limit, by decision (live model on CPU can take minutes; Ctrl+C stops it) (A4). |
| 5.7 — slug rule | Unicode letters/digits and NFC (A8). |
| 5.8 — how to notice port taken; editing `.env` | `Antes de empezar` names `port is already allocated` and says to edit `.env` with a text editor; scenario checks the string (A9); task 11.2. |
| 2 (partial) — links in `prompts.md`/specs | Design D10 states they hold no `#fragment` link into the four guides. |
| 8 — NFC in `confidence-doc.spec.ts` | Task 9.1 (A12). |
| 9 — task size | 11.2 split into 11.2/11.2b; 16.2 into 16.2/16.2b. |
| 10 — 14.3 risk to the author's database | 14.3 runs the `.env` demonstration only in the scratchpad clone (A11). |
| 10 — `gh` switch back to Cristina-JumpMath | Rejected: the author allowed DisTinta to stay the active account for this run (2026-10-18). |

## Run 2

Verdict line as returned:

CHANGES REQUIRED

**Decisions to record.** This is an autonomous run under ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`. The agent takes each decision below as lead engineer and writes it, in Spanish, into the DIS-102 Enhanced description and into the change's artifacts.

- **R4. How the guide's "stop" output is obtained (blocking, points 5 and 6).** Two statements conflict:
  - `local-startup` says "The output pasted in the guide SHALL come from a run of the guide, literally".
  - Design D11 runs `npm run up` **in the background**. An agent tool cannot send a console Ctrl+C to a background process (on Windows in particular). D11 instead stops the servers with `taskkill /T`, which never produces `[up] stopped (Ctrl+C)`.
  - After `up` exits `130`, npm itself prints its lifecycle error lines (`npm error Lifecycle script \`up\` failed…`, `npm error code 130`). A first-time reader will take that for a failure.

  Proposed decision: `Parar el sistema` pastes no output for the Ctrl+C step. Its text names what the reader will see (`[up] stopped (Ctrl+C)` followed by npm's `code 130` lines) and says this is the expected end. The pasted output of that section is only `npm run down`. The Ctrl+C behaviour is proven by the unit scenario "Ctrl+C stops up without a failure line". If the agent can send SIGINT to the process group in the Bash clone (`kill -INT -<pgid>`), it records that output in the step 16 report, not in the guide.
- **R5. How the clean-clone run performs the "port taken" `.env` edit (blocking, point 5).** Three facts collide:
  - The guide tells the reader to edit `.env` "with a text editor, not with a shell redirection" (A9).
  - Criterion E and D11 say the guide is followed "literally".
  - The agent has no text editor, and design → Risks records that its Read tool is denied on `.env*`. That is a path pattern, so it also matches the clone's `.env`.

  Proposed decision: in each clone the edit is a scripted, line-anchored replacement of the `POSTGRES_PORT=` line and of the port in `DATABASE_URL=`. It writes UTF-8 without BOM and LF line endings, and the agent never reads or prints the file. Record it as the one stated deviation from "literally", in D11, in tasks 16.2/16.2b and in the PR body.
- **R6. DIS-102 and the scope of the ADR (improvable, decision to record).** The ADR's Context names twelve tickets (DIS-76 … DIS-101); DIS-102 is not among them. Tasks 19.1 and 19.9 rely on the ADR for the agent to open and **merge** the PR. Without the ADR, `docs/openspec-tasks-mandatory-steps.md` §3 step 5 applies ("The agent never merges"). The caller states the run is authorised, so record the basis once: proposal → Why, and one sentence in Enhanced saying DIS-102 joined the run on 2026-10-19 at the author's request. If that basis cannot be stated, 19.9 stops at "ready to merge" and the ticket goes to In Review.

---

### Findings of run 2

#### Resolutions of run 1: do they hold?

| Run-1 finding | Holds? | Evidence |
|---|---|---|
| R1 / 1 / 6.2: D12–D17 and D13 in Linear | Yes | Enhanced → «Decisiones añadidas en el propose» holds D12–D17, the D4 refinement and the fixed formats. «Fuera de alcance» names the D13 exception. |
| R2 / 7.1: language exception | Yes | Enhanced D18, design D18, task 12.2 (exact line), task 17.3. |
| R3 / 5.2: Ctrl+C | Yes, in the spec | Requirement plus scenario "Ctrl+C stops up without a failure line", design D5 (A3), task 4.3. Its consequence for the guide is new (R4). |
| 2: `engines` | Yes | Requirement "Which commands load .env" and the wiring scenario (`engines.node`, forbidden APIs); task 3.1. |
| 3.1 / 3.2 / 6.1: `.env` reaching `up`/`demo:ask` | Yes | `dotenvPath` in the spec, D4/D5/D8 and tasks 4.1/6.3. A residual gap is in 3.2 below. |
| 3.3: product code never loads `.env` | Yes | Requirement and wiring scenario, last AND. |
| 3.4 / 7.2: stale sentences | Mostly | The search list is wider and the `project-context.md` lines are named. The readme hits outside §0/§1.3/§1.4 have no task (see 7.2 below). |
| 4: "short" | Yes in the change; **not in Linear** | Enhanced AC C still says «Pasos numerados, cortos y en orden» (see 4.1 below). |
| 5.1, 5.3–5.8 | Yes | Spec l. 57–59, 249–261, 326–332, 453, 376–381; design A1, A4, A5, A8, A9. |
| 8: NFC | Yes | Task 9.1. |
| 9: task size | Yes | 11.2/11.2b and 16.2/16.2b. |
| 10: 14.3 | Yes | Task 14.3 and A11. |
| 10: `gh` switch back | Rejected and recorded | A12, in Linear and in the design. |

---

#### 1. Scope against the ticket

DIS-102 has no parent: no `parentId`, no relations, no comments. The ticket alone bounds the change.

- Everything in the proposal, the specs and the tasks traces to D1–D18, A1–A12 or criteria A–E of the Enhanced description. No invented scope.
- **1.1 (improvable).** Design D11 refines the Linear D11 in two ways the ticket does not record:
  - **two** clones (`e2e-bash`, `e2e-pwsh`) whose folder names give each its own Compose project, instead of one clone with a `-p <nombre>` project;
  - `docker compose -p <clone> down -v` on the clones' own projects, where Linear says `docker compose -p <nombre> down`.

  Both are harmless, but the ADR asks for every decision to be recorded. Add them to Enhanced.
- **1.2 (improvable).** Linear lists A1–A9, A11 and A12, but not A10. In the design, A10 is D18, which Linear does hold. Add the line "A10 = D18" so the two lists match one to one.

#### 2. Inherited acceptance criteria

There is no parent, so nothing is inherited. Checked against the ticket's own criteria A–E:

- **A.** Covered: the start sequence, `up` working before `npm install`, the Docker-down case, `down` keeping the volume and `make up` still working (15.6).
- **B.** Covered: `.env` read by the guide scripts, precedence, the no-`.env` case, the quality scripts skipping it, and `engines`.
- **C.** Covered by "The demo guide …" (three scenarios) and the clean-clone run.
- **D.** Covered: the Spanish guides, the links, `confidence-doc.spec.ts`.
- **E.** Covered by "The guide was followed on a clean clone in both shells".

No missing criterion. AC A says "the documented start command (the same text in PowerShell and Bash)". That command is also documented in `readme.md` §1.4 and §1.2, which point 7.2 covers.

#### 3. Missing scenarios

- **3.1 Clean for the MUST clauses.** Every MUST/SHALL clause of the three deltas has a scenario.
- **3.2 (improvable).** In "Which commands load .env", the clause "`up` and `demo:ask` SHALL load it themselves" is proven only partly:
  - the behaviour scenarios pass an explicit `dotenvPath`;
  - the wiring scenario checks only that the modules *import* `./env.mjs` or `./load-env.mjs`.

  If `runUp` or `runDemoAsk` defaulted `dotenvPath` to `undefined`, every test would pass and nothing would load `.env` in real use. The recorded checks would not show it either: Compose reads `.env` by itself, the `db:*` steps preload it themselves, and the demo uses the default `PORT`. Fix: the entry guard of each module passes `dotenvPath: DOTENV_PATH` explicitly, and the wiring scenario asserts it from the source text: "`scripts/up.mjs` and `scripts/demo-ask.mjs` name `DOTENV_PATH` in the call of their entry guard".
- **3.3 (improvable).** In "The demo guide runs the same in PowerShell and Bash", the forbidden-construct list is the test that makes criterion C checkable. It misses two Bash-only forms that a `shell` block could still hold:
  - a variable assignment or environment prefix (`ACME=…`, `DATABASE_URL=… npm test`; the old guide used `ACME=`);
  - a `$NAME` expansion (`"$ACME"`).

  Both break in PowerShell. Add to the requirement and to the scenario: "no line that starts with `NAME=` (`^[A-Za-z_][A-Za-z0-9_]*=`), and no `$` outside the quoted questions" (the questions hold no `$`).

#### 4. Ambiguity

- **4.1 (improvable, Linear only).** Enhanced → criterion C says «Pasos numerados, **cortos** y en orden». The user story says «en **pocos** minutos». The change dropped "short", but the ticket still carries both words. Correct the Enhanced part (never `[original]`).
- `tasks.md:3` says "a short comment in Spanish". This is a Linear note, not behaviour, so it is not a defect.
- No occurrence of fast / easy / secure / efficient / many / appropriate / robust in `proposal.md`, `design.md`, the specs or `tasks.md`.

#### 5. Open decisions

| # | Decision left to the implementer | Where to fix it | Severity |
|---|---|---|---|
| 5.1 | R4: what `Parar el sistema` shows for Ctrl+C, and how that output relates to "pasted output SHALL come from a run". `up` runs in the background in the clean-clone run, and npm adds `code 130` lines after `up` exits. | `local-startup` → "The demo guide runs the same…" (requirement and "ordered" scenario); design D11; tasks 11.2b, 16.3 | Blocking |
| 5.2 | R5: how the agent performs the guide's "edit `.env` with a text editor" step in the clones, given the `.env*` permission denial and "literally". | Design D11; tasks 16.2, 16.2b; PR body (18.1) | Blocking |
| 5.3 | `docs/TESTING.md`, PowerShell variant `$env:DATABASE_URL='…/codemind_test'; npm test` (D14). The variable stays for the whole PowerShell session. Since the environment beats `.env` (D3), every later `npm run cli`, `verify` or `up` in that terminal silently uses the **test** database. The Bash variant is per-command. The guide must say how to undo it. A `codemind_test` URL hard-coded to port 5432 must also follow `POSTGRES_PORT`. | `local-startup` → "The deployment and testing guides in Spanish"; design D14; task 10.2 | Improvable |

#### 6. Contradictions inside the change

- **6.1 (blocking, same as 5.1).** The requirement "The output pasted in the guide SHALL come from a run of the guide, literally" conflicts with design D11, where `npm run up` runs in the background and the agent stops it with `taskkill /T`. With that procedure, the stop sequence cannot be captured.
- **6.2 (improvable).** Some cross-references point at the old decision range:
  - task 18.1 cites "design D12–D17" and task 17.2 "design D2–D17"; D18 and A1–A12 exist now;
  - in `design.md`, D18 comes before D17 (cosmetic).
- Otherwise the proposal, the design, the three deltas and the tasks agree.

#### 7. Contradictions with the project

- **7.1 Clean.**
  - `confidence-score` delta: the requirement is copied in full with the language change; the scenarios are stricter (exact order, header cells, `—`).
  - `project-picker` delta: copied word for word except the hint (checked against `openspec/specs/project-picker/spec.md:84–105`); all nine scenarios kept.
  - `verify-smoke` (l. 6, 224) and `seed-load` (l. 5) still say `make up` truthfully.
  - D18 is placed in `docs/project-context.md`, consistent with l. 8–9/14.
  - `test-db-isolation` agrees with D12.
- **7.2 (improvable).** `readme.md` hits outside the sections that task 12.1 and design D10 name (§0, §1.3, §1.4):
  - l. 147 (§1.2: «se levanta con `make up`»);
  - l. 658 and l. 690 (§2.4 diagram and table: «Local — `make up`»).

  These present `make up` as *the* start command, contrary to criterion A. l. 1084 and l. 1672 are history and stay true. The 17.1 search would flag l. 147, 658 and 690, but no task fixes them.

  In addition, the documented start block (`readme.md:298–302`) uses `git clone … && cd …`. `&&` does not exist in Windows PowerShell 5.1, and design D15 forbids it for exactly that reason.

  Fix: widen 12.1 and D10 to §1.2 l. 147 and §2.4 l. 658/690. Split l. 299 into two lines (`git clone …` then `cd AI4Devs-finalproject`) inside a `shell` block, and make `npm run up` the third command.
- **7.3 (improvable, R6).** ADR scope against tasks 19.1/19.9; see the decisions to record.

#### 8. Contrast with the real code

Every design claim checked holds:

- **D12 risk:**
  - `tests/integration/store/support.ts:32` copies `{ ...process.env }` and `migrations.spec.ts:268` runs `db:rollback` with `DATABASE_URL: undefined`;
  - `dev-script.spec.ts:58` and `:82` spread `process.env`, so they inherit the switch;
  - every other `env: {…}` under `tests/` is passed in-process to `run()`/`build()` helpers, not to a spawned npm script, so no spawn loses the switch;
  - `migrations.spec.ts:301` runs `npx tsx` directly, with no preload;
  - `vitest.config.ts` has no `globalSetup` (only `setupFiles`, l. 41), so `test.env` reaches every place that spawns. The forks pool for `seed-build.spec.ts` (l. 33) also receives `test.env`.
- **Config files and scripts:**
  - `package.json:24–30`: the seven scripts are as quoted; `engines` is at l. 5–7;
  - `packages/api/package.json:8` (`dev`);
  - `Makefile:7–10` (include/export) and l. 1–6 (a Spanish header, which D6 rewrites in English);
  - `docker-compose.yml:9` (`"5432:5432"`).
- **Screen 1 and the confidence test:** `ProjectPickerPage.tsx:46` (`<code>make up</code>`) and `ProjectPickerPage.test.tsx:364` (whole text). `confidence-doc.spec.ts:24`, `47`, `67`, `70–80` are the places D9 changes.
- **Fixture:** line 16 of `fixtures/acme-shop/app/Services/PriceCalculator.php` is `class PriceCalculator`, and lines 16–44 are 29 lines, as the scenario says (`docs/DEMO.md:250–278`).
- **No duplicated abstraction:** no `.env` parser and no `dotenv` use exist outside `node_modules`. The LLM config reader (`packages/adapters/llm/src/config.ts:96`) treats blank values as absent, so the empty `LLM_*=` keys that `.env.example` now feeds into `npm run cli` keep evaluation mode. Design → Risks (last bullet) holds.

#### 9. Task size

Clean. 11.2/11.2b and 16.2/16.2b are split. 10.1, 10.2, 11.3 and 12.2 each fit in one turn.

#### 10. Mandatory steps

- Step 0 is first and labelled; the branch is `feature/DIS-102-cross-shell-demo-spanish-docs`; 0.1 sets the Linear state first.
- Steps 13, 14, 15, 16, 17 and 19 are present and labelled; "AGENT MUST EXECUTE" appears on 15, 16 and 19. Pre-merge is last, with the three checks in order and the archive commit before the merge.
- Restoration is covered: 14.5, 15.4 (`.env` put back), 15.8, 16.5. Screenshots go in `reports/`.
- **Improvable (R6):** the agent's merge in 19.9 needs the ADR scope recorded. Otherwise it reverts to "the author merges".
- **Improvable:** 16.2/16.2b do not say how the guide's `.env` edit is performed (R5).

#### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| The .env file grammar | The .env grammar of .env.example is read | 1.1, 1.2 |
| | Lines that do not match are ignored and the last assignment wins | 1.3 |
| Loading .env into a process | Values of .env fill only the variables the environment lacks | 2.1 |
| | Without .env the environment is unchanged | 2.1 |
| | An unreadable .env is skipped with a warning | 2.1 |
| | The loaded .env is the repository root's | 2.2 |
| | The test suite never reads .env | 2.3 |
| Which commands load .env | The guide's scripts load .env and the quality scripts do not | 3.1, 3.2 (default `dotenvPath` wiring: improvable, 3.2) |
| | A guide command reads DATABASE_URL from .env (recorded) | 15.4 |
| One command starts the system | Up runs the start sequence in order | 4.1, 4.2 |
| | Up stops at the first failing step | 4.3 |
| | Ctrl+C stops up without a failure line | 4.3 |
| | A step that cannot start stops up | 4.3 |
| | Up needs npm to start it | 4.3 |
| | The startup scripts need no installed dependency | 4.4 |
| | Up with Docker unavailable fails naming its first step (recorded) | 15.5 |
| Stopping the system and the Makefile | Down keeps the data volume | 5.1, 15.6 |
| | Make delegates to the npm commands | 5.2, 15.6 |
| Configurable Postgres port | The Postgres port follows POSTGRES_PORT | 5.3 |
| The demo question helper | An answered question prints its status and summary | 6.1, 6.2 |
| | An UNKNOWN answer prints its reason | 6.3 |
| | An error status prints the error body | 6.3 |
| | An unreachable API is reported | 6.3 |
| | demo:ask reads PORT from .env | 6.3 |
| | Missing arguments are a usage error | 6.3 |
| The demo excerpt helper | An excerpt prints exactly the cited lines | 7.1, 7.2 |
| | Paths outside the project are refused | 7.3 |
| | A missing file or a range past its end is reported | 7.3 |
| | A malformed citation is a usage error | 7.3 |
| The demo guide runs the same in PowerShell and Bash | The demo guide has no Bash-only command | 11.1, 11.2, 11.2b |
| | The demo guide is ordered for a first-time reader | 11.1, 11.2, 11.2b |
| | The web walkthrough names what each screen shows | 11.1, 11.3, 16.4 |
| | The guide was followed on a clean clone in both shells (recorded) | 16.2, 16.2b, 16.3, 18.1 (stop sequence: blocking, 5.1) |
| The deployment and testing guides in Spanish | Links to the guides' sections resolve | 11.4, 10.1, 10.2, 12.1, 12.2 |
| | The guides are in Spanish and say that .env is read (recorded) | 10.1, 10.2, 12.1, 12.2, 17.1 |
| confidence-score → Published weights | The published weights are the code's weights | 9.1, 9.2 |
| | The confidence document states its limits | 9.1, 9.2 |
| project-picker → API status on Screen 1 | A failed retry keeps the alert | 8.1, 8.2 |
| | The other eight scenarios (text unchanged) | 8.2 |

No empty row. The blocking items are 5.1/6.1 and 5.2.

---

#### Corrections to apply

##### `openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md`

1. **Requirement "The demo guide runs the same in PowerShell and Bash"** (5.1). Replace the paragraph "The output pasted in the guide SHALL come from a run of the guide, literally, on a clean clone of the branch, in PowerShell and in Bash." with:
   > The output pasted in the guide SHALL come from a run of the guide, literally, on a clean clone of the branch, in PowerShell and in Bash, except for the stop with Ctrl+C: `Parar el sistema` SHALL paste no output for it and SHALL state in its text that `npm run up` then ends with `[up] stopped (Ctrl+C)` followed by npm's own lines with `code 130`, which are the expected end and not a failure; the output it pastes is that of `npm run down`.

   Append to the scenario "The demo guide is ordered for a first-time reader":
   > - **AND** `Parar el sistema` contains `[up] stopped (Ctrl+C)` and `130` in its text and a `shell` block holding `npm run down`
2. **Same requirement and scenario "The demo guide has no Bash-only command"** (3.3). After "`make ` or a line ending in `\` or in a backtick", add:
   > , a line starting with a variable assignment (`^[A-Za-z_][A-Za-z0-9_]*=`), or a `$` outside a double-quoted argument
3. **Requirement "Which commands load .env"** (3.2). Append:
   > When run as entry modules, `up` and `demo:ask` SHALL pass the repository root's `.env` path (`DOTENV_PATH` of `scripts/load-env.mjs`) as their `.env` path.

   Scenario "The guide's scripts load .env and the quality scripts do not": change the AND about `scripts/up.mjs` to:
   > - **AND** `scripts/up.mjs` and `scripts/demo-ask.mjs` import `DOTENV_PATH` from `./load-env.mjs` and pass it in the call of their entry guard, `scripts/demo-excerpt.mjs` imports neither `./env.mjs` nor `./load-env.mjs`, and no source text of `scripts/` contains `process.loadEnvFile`, `parseEnv` imported from `node:util`, or `--env-file`
4. **Requirement "The deployment and testing guides in Spanish"** (5.3). After "they SHALL show a `bash` and a `powershell` variant side by side, labelled", add:
   > ; the PowerShell variant SHALL say that the variable stays set for the rest of that terminal session and beats `.env`, and how to remove it (`Remove-Item Env:DATABASE_URL`) or to use a new terminal before running the demo; the integration database URL SHALL use the same port as `DATABASE_URL` of `.env` (`POSTGRES_PORT`)
5. **Scenario "The guides are in Spanish and say that .env is read"** (7.2). Append to THEN:
   > - **AND** `readme.md` §1.2, §1.4 and §2.4 give `npm run up` as the start command, and the start block of §1.4 contains no `&&`

##### `openspec/changes/cross-shell-demo-spanish-docs/design.md`

- **D11** (R4, R5, 1.1). Append:
  > The guide's "port taken" step ("edit `.env` with a text editor") is performed in each clone by a scripted, line-anchored replacement of the `POSTGRES_PORT=` line and of the port in `DATABASE_URL=`, writing UTF-8 without BOM and LF, without reading or printing the file (the agent has no editor and its Read tool is denied on `.env*`); it is the one stated deviation from "literally", recorded in the step 16 report and in the PR body. `npm run up` runs in the background and is stopped by process tree, so the Ctrl+C end is not captured: `Parar el sistema` states it in text (`[up] stopped (Ctrl+C)`, npm's `code 130` lines) and pastes only `npm run down` (R4); in the Bash clone the agent may send `kill -INT` to the process group and record that output in the step 16 report.
- **D14** (5.3). Append:
  > The PowerShell variant notes that `$env:DATABASE_URL` persists for the session and beats `.env` (D3), so the reader removes it (`Remove-Item Env:DATABASE_URL`) or opens a new terminal before the demo; the `codemind_test` URL uses the port of `.env`'s `DATABASE_URL`.
- **D10** (7.2). Change "`readme.md` §0 (l. 19), §1.3 (l. 185, 279), §1.4 (l. 301–316, 391–395, variables table l. 436–441)" to:
  > `readme.md` §0 (l. 19, 75), §1.2 (l. 147), §1.3 (l. 185, 279), §1.4 (l. 298–316 — the start block without `&&`: `git clone …` and `cd …` on two lines in a `shell` block —, 391–395, 407, variables table l. 436–441) and §2.4 (l. 658, 690); l. 1084 and l. 1672 are history and stay
- **D4 / D5 / D8** (3.2). Add: "the entry guard passes `dotenvPath: DOTENV_PATH` explicitly; `wiring.spec.ts` checks it".
- **Context / Decisions** (R6). Add one sentence:
  > DIS-102 was opened on 2026-10-19, after the ADR's list of twelve tickets, and runs under the same ADR by the author's request of that date (recorded in DIS-102 Enhanced); without that record, task 19.9 stops before the merge.
- **Spec-audit amendments.** Add a "run 2" list: A13 (R4), A14 (R5), A15 (3.2), A16 (3.3), A17 (5.3), A18 (7.2). Optionally move D18 after D17.

##### `openspec/changes/cross-shell-demo-spanish-docs/proposal.md`

- Why, 2nd paragraph (R6). After "(ADR `20261016-autonomous-workflow-run-entrega-2`)", add: "which DIS-102 joined on 2026-10-19, after the ADR's ticket list".

##### `openspec/changes/cross-shell-demo-spanish-docs/tasks.md`

- **3.1:** add "the entry guards pass `DOTENV_PATH` (source text)".
- **10.2:** add "the PowerShell variant's session persistence and `Remove-Item Env:DATABASE_URL`; the test URL's port follows `.env`".
- **11.1:** add the two new forbidden forms (assignment line, `$` outside a quoted argument), and the `Parar el sistema` assertion.
- **11.2b:** `Parar el sistema`: Ctrl+C stated in text (`[up] stopped (Ctrl+C)`, npm's `code 130` lines expected), pasted output only for `npm run down`.
- **12.1:** extend to §1.2 l. 147 and §2.4 l. 658/690, and split l. 299 (`git clone` / `cd`) into a `shell` block without `&&`.
- **16.2 and 16.2b:** add "the 'port taken' edit as design D11 (scripted, UTF-8 without BOM, LF, never read or printed), recorded as the one deviation".
- **16.3:** "the stop with Ctrl+C is not compared (design D11)".
- **17.2:** "design D2–D18". **18.1:** "design D12–D18 and A1–A18"; add the R5 deviation.
- **19.9:** "(DIS-102 within the ADR's run as recorded in Enhanced; otherwise stop before the merge and leave DIS-102 In Review)".

##### Linear DIS-102

Do not touch `[original]`. In the **Enhanced** part, in Spanish:

- Criterion C, 4th bullet: replace «Pasos numerados, cortos y en orden, para alguien que no conoce el proyecto.» with «Pasos numerados y en orden, para alguien que no conoce el proyecto; cada paso, un comando o una pareja etiquetada.»
- User story: replace «para comprobar en pocos minutos que…» with «para comprobar, siguiendo `docs/DEMO.md` de principio a fin, que…».
- After A12, add a section «Enmiendas de la auditoría de la spec (ejecución 2, 19-10-2026)»:
  > * **A10.** Es la decisión D18 (excepción de idioma).
  > * **Ámbito del ADR.** DIS-102 se abrió el 19-10-2026, después de la lista de doce tickets del ADR `20261016-autonomous-workflow-run-entrega-2`, y entra en la misma ejecución autónoma a petición de la autora de esa fecha; el agente abre el PR y lo fusiona solo tras el commit de `/opsx:archive` y con la CI en verde.
  > * **Precisión de D11.** Dos clones (`e2e-bash`, `e2e-pwsh`), uno por shell y uno tras otro; el nombre de la carpeta da a cada uno su proyecto de Compose, y al terminar se ejecuta `docker compose -p <clon> down -v` solo sobre el proyecto del clon (nunca `-v` sobre `codemind`).
  > * **A13.** `Parar el sistema` no pega salida del Ctrl+C: el texto dice que `npm run up` termina con `[up] stopped (Ctrl+C)` y después con las líneas de npm con `code 130`, y que es el final esperado; solo se pega la salida de `npm run down`. En la prueba E, `npm run up` corre en segundo plano y se para por árbol de procesos.
  > * **A14.** En los clones, el paso «edita `.env` con un editor de texto» se hace con un reemplazo por guion de las líneas `POSTGRES_PORT=` y del puerto de `DATABASE_URL=` (UTF-8 sin BOM, LF, sin leer ni imprimir el fichero); es la única desviación del «al pie de la letra» y se anota en el informe y en el PR.
  > * **A15.** El punto de entrada de `up` y de `demo:ask` pasa `DOTENV_PATH` explícitamente; lo comprueba `wiring.spec.ts`.
  > * **A16.** Un bloque `shell` de la guía tampoco puede tener una línea que empiece por una asignación (`NOMBRE=`) ni un `$` fuera de un argumento entre comillas dobles.
  > * **A17.** En `docs/TESTING.md`, la variante de PowerShell avisa de que `$env:DATABASE_URL` sigue en la sesión y gana a `.env`, y dice cómo quitarla (`Remove-Item Env:DATABASE_URL`) o que se abra un terminal nuevo antes de la demo; la URL de la base de datos de tests usa el puerto del `DATABASE_URL` de `.env`.
  > * **A18.** `readme.md` §1.2 (l. 147) y §2.4 (l. 658, 690) también pasan a `npm run up`; el bloque de arranque de §1.4 se escribe sin `&&` (`git clone …` y `cd …` en dos líneas).

### Resolution of run 2

| Finding | Resolution |
|---|---|
| R4, 5.1, 6.1 — Ctrl+C output vs. "pasted from a run" | Adopted: `Parar el sistema` pastes no Ctrl+C output, states `[up] stopped (Ctrl+C)` and npm's `code 130` lines as the expected end, pastes only `npm run down`; requirement, "ordered" scenario, design D11 (A13), tasks 11.2b, 16.3. |
| R5, 5.2 — the clones' `.env` edit | Adopted: scripted line-anchored replacement (UTF-8 without BOM, LF, never read or printed), the one stated deviation; design D11 (A14), tasks 16.2/16.2b, 18.1. |
| R6, 7.3 — DIS-102 and the ADR's ticket list | Recorded in proposal → Why, design → Context and Linear Enhanced: DIS-102 joined the run on 2026-10-19 by the author's request (she launched this workflow run); task 19.9 stops before the merge without that record. |
| 1.1 — D11 refinements not in Linear | Recorded in Enhanced (two clones, `down -v` only on the clones' own projects). |
| 1.2 — A10 missing in Linear | Recorded: A10 = D18. |
| 3.2 — default `dotenvPath` could stay `undefined` | Entry guards pass `DOTENV_PATH`; requirement and wiring scenario check it (A15); task 3.1. |
| 3.3 — assignment lines and `$` expansions | Forbidden in `shell` blocks; `$` forbidden altogether since PowerShell expands it inside double quotes too (A16); task 11.1. |
| 4.1 — "cortos", "en pocos minutos" in Enhanced | Enhanced criterion C and user story reworded (never `[original]`). |
| 5.3 — PowerShell `$env:` persists in the session | TESTING requirement, design D14 (A17), task 10.2. |
| 6.2 — stale cross-references, D18 order | Tasks 17.2 and 18.1 cite D2–D18 / A1–A18; D18 moved after D17. |
| 7.2 — readme §1.2, §2.4 and `&&` in the start block | Design D10 and task 12.1 widened; scenario requires §1.2/§1.4/§2.4 and no `&&` (A18). |

## Run 3

Verdict line as returned:

APPROVED

**Decisions to record.** None of the findings is blocking. This run is autonomous under ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`, which is present in this tree. The agent can fold in the minor points below as lead engineer. No question needs the author.

- **R7 (decision to record, improvable).** Name the step-15 scratchpad clone and its Compose project explicitly. It must not be `codemind`. See 5.1.

---

### Resolutions of runs 1 and 2: do they hold?

| Earlier finding | Holds? | Evidence |
|---|---|---|
| Run 1 R1/R2/R3, D12–D18 in Linear | Yes | Enhanced holds D12–D17 («Decisiones añadidas en el propose»), D18 and A1–A9, A11, A12 (run 1), and A10, A13–A18 (run 2). |
| Run 1: `engines`, `.env` loading of `up`/`demo:ask`, product code never loads `.env` | Yes | `local-startup` → "Which commands load .env" l. 101–106 and the wiring scenario l. 120–126. |
| Run 1: switch read from the target env; `dotenvPath` injectable | Yes | Spec l. 51, 57–59; design D3, D4 (A1, A2); tasks 2.1, 4.1, 6.3. |
| Run 1: Ctrl+C on `up` | Yes | Spec l. 150–153; scenario l. 177–183; design D5 (A3); task 4.3. |
| Run 1: `demo:ask` / `demo:excerpt` rules | Yes | Spec l. 251–263 and l. 328–334 (A4, A5). |
| Run 1: stale sentences, anchors with NFC, `port is already allocated` | Yes | Spec l. 468–483 and l. 464–466; design D10 (A6, A8, A9). |
| Run 1: 14.3 risk to the author's database | Yes | Task 14.3 runs the demonstration only in the clone (A11). |
| Run 2 R4: Ctrl+C output vs. "pasted from a run" | Yes | Spec l. 396–400 and the "ordered" scenario l. 421–422; design D11 (A13); tasks 11.2b, 16.3. |
| Run 2 R5: the clones' `.env` edit | Yes | Design D11 l. 221–225 (A14); tasks 16.2, 18.1. Step 15 does not cite it (see 5.1). |
| Run 2 R6: ADR scope | Yes | Proposal l. 13–15, design → Context l. 43–46, Enhanced «Ámbito del ADR», task 19.9. |
| Run 2: `DOTENV_PATH` in the entry guards (A15) | Yes | Spec l. 105–106 and l. 121–122; task 3.1. Which task adds that assertion is ambiguous (see 9.1). |
| Run 2: `$` and assignment lines (A16) | Yes | Spec l. 377–379 and l. 408–410; task 11.1. |
| Run 2: PowerShell `$env:` persistence (A17) | Yes | Spec l. 451–454; design D14; task 10.2. |
| Run 2: readme §1.2, §2.4 and `&&` (A18) | Yes | Design D10; task 12.1; scenario l. 482–483. Checked: `readme.md:147`, `:299`, `:658`, `:690`. |
| Run 2: "cortos" and "en pocos minutos" in Linear | Yes | Enhanced criterion C and the user story are reworded; `[original]` is untouched. |
| Run 2: stale cross-references, order of D18 | Partly | Tasks 17.2 and 18.1 are fixed, and D18 now follows D17. `design.md:67` still says "A1–A12" (see 6.1). |

---

### 1. Scope against the ticket

DIS-102 has no parent: no relations and no comments (checked again). The ticket alone bounds the change.

- Every item of the proposal, the three deltas and the tasks traces to D1–D18, A1–A18 or criteria A–E of the Enhanced description. **There is no invented scope.**
- **1.1 (improvable, Linear only).** Enhanced → «Contexto técnico» is stale in two places:
  - "Delta specs: `local-startup` (ADDED) y `confidence-score` (MODIFIED)" omits the `project-picker` MODIFIED delta, which D13 adds.
  - "`readme.md` §0/§1.3/§1.4" omits §1.2 and §2.4, which A18 adds.

  The decisions themselves are recorded, so only this summary block is out of date.

### 2. Inherited acceptance criteria

There is no parent, so nothing is inherited. Checked against the ticket's own criteria instead:

- **A:** `up` sequence, before `npm install`, Docker down, `down` keeps the volume, `make up` → covered.
- **B:** `.env` read, precedence, no `.env`, quality scripts, `engines` → covered.
- **C:** one command per step, prerequisites, web walkthrough, ordered steps, accents → covered.
- **D:** four documents in Spanish, links (D10 records that `prompts.md` and the specs hold no `#fragment` link into the guides), the CONFIDENCE test → covered.
- **E:** the recorded clean-clone run → covered.

**Clean.**

### 3. Missing scenarios

**Clean.** Every SHALL clause of `local-startup`, of `confidence-score` → "Published weights" and of `project-picker` → "API status on Screen 1" has a scenario.

### 4. Ambiguity

**Clean.** None of fast / easy / secure / efficient / many / appropriate / robust / short appears in `proposal.md`, `design.md`, the three deltas or `tasks.md`. The remaining "a short comment" at `tasks.md:3` is a note in Linear, not behaviour. Linear criterion C and the user story were reworded in run 2.

### 5. Open decisions

| # | What the implementer would decide alone | Where to fix it | Severity |
|---|---|---|---|
| 5.1 | **The step-15 clone's folder name, and so its Compose project.** Task 15.1 says "a scratchpad clone of the branch … never the working tree's compose project". The branch is pushed only in 16.1, so the step-15 clone comes from the local repository. `git clone <path to Codemind>` with no target creates a folder `Codemind`, and Compose names that project `codemind` (the author's). `npm run up` there would recreate the author's container with the clone's `POSTGRES_PORT`, and `db:seed` would reload her sample data. Task 15.8's `down -v` is forbidden on `codemind` by text, but no step checks for it. Step 15 also does not say how the clone's `.env` is created and its port changed (A14 is cited only in 16.2). | Task 15.1 (and 15.2) | Improvable (high priority: protects the author's data) |
| 5.2 | **The message that tells the reader the port is taken.** `Antes de empezar` names only `port is already allocated`. Compose prints that when **another container** holds the port. When a **native process** holds it (a Windows Postgres service is the usual case), Docker Desktop reports `Ports are not available: exposing port TCP 0.0.0.0:5432 …`. With a native Postgres bound only to loopback, `Paso 0` can even pass its first step and then fail at `npm run db:migrate` with `password authentication failed for user "codemind"`. A first-time reader on Windows would not recognise either case. | `local-startup` → "The demo guide runs the same…" (requirement l. 381–383); task 11.2 | Improvable |
| 5.3 | **How `demo:ask` reads `PORT`.** The spec says "a decimal integer from 1 to 65535". The API's own reader (`packages/api/src/composition.ts:56–68`) trims the value, treats blank as the default, and accepts digits only (so `03000` is valid). With `PORT=" "` set in the shell, the API listens on 3000 while `demo:ask` exits `2`. | Requirement "The demo question helper" l. 250–253 | Improvable |
| 5.4 | **The default `cwd` of `runUp`.** The scenario says "each from the repository root", but D5 does not say whether the default `cwd` is `process.cwd()` or the root resolved from the module. A test run from the root passes either way. | Design D5 | Improvable |

### 6. Contradictions inside the change

- **6.1 (improvable).** `design.md:66–68` says "adds D12–D18 and the spec-audit amendments (A1–A12, end of this section)". The section now holds A1–A18.
- **6.2 (improvable).** Task 6.2 says `runDemoAsk` "loads `.env` through `./load-env.mjs`". That reads as relying on the module's import side effect, which design D4 and A2 rule out: `runDemoAsk` calls `loadEnvFile(dotenvPath, env, stderr)`, and `./load-env.mjs` is imported only for `DOTENV_PATH`.
- **6.3 (improvable).** A side effect of D4 and A15: `up.mjs` and `demo-ask.mjs` import `./load-env.mjs`, which loads `.env` on import, and then they call `loadEnvFile` again. With an unreadable `.env` the warning is printed **twice**. The requirement "Loading .env into a process" says exactly one line per load, so this does not break the spec, but a reader sees two identical lines. Record it as accepted in D4, or skip the explicit call when it would load the same path into `process.env` that the import already loaded.
- **6.4 (improvable).** Proposal → Impact → New files lists `tests/unit/scripts/*.spec.ts` but not `tests/unit/docs/guides.spec.ts` (design D16, task 11.1).

Apart from these, the proposal, the design, the three deltas and the tasks agree.

### 7. Contradictions with the project

**Clean.**

- **No duplication.** No main spec under `openspec/specs/` already defines local start-up or `.env` loading. `verify-smoke` (l. 6, 224) and `seed-load` (l. 5) still say `make up` truthfully, because `make up` now runs `npm run up`. `cli-ask` l. 322 (`DATABASE_URL is not set`) is unchanged by the loader.
- **The `confidence-score` delta** keeps the whole requirement of `openspec/specs/confidence-score/spec.md:158–189`. It adds the language, the header cells and `—`, and pins the exact section order. That is stricter than the main spec, and `confidence-doc.spec.ts:70` already asserts the exact order.
- **The `project-picker` delta** matches `openspec/specs/project-picker/spec.md:84–105` word for word, except «npm run up». All nine scenarios are kept.
- **D18 vs `docs/base-standards.md` §2.** Placing the exception in `docs/project-context.md` is consistent with that file's role.
- **ADR.** `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` (§ Decision: "§99: the agent merges, only after the `/opsx:archive` commit and with CI green") covers tasks 19.1 and 19.9. DIS-102's joining of the run is recorded in Enhanced.
- **`docs/project-context.md` hits outside the lines task 12.2 names:**
  - l. 155 and 872 are Bash-prefixed CI/dev commands that stay true.
  - l. 621, 1053, 1055 and 1066–1067 mention `make up` in statements that stay true.

  The scenario's "`make up` … every hit reviewed" rule covers all of them.

### 8. Contrast with the real code

Every design claim I re-checked holds:

- **Root scripts:** `package.json:24–30` (the seven `tsx` scripts), `:5–7` (`engines`), `:20` (`dev` through `concurrently`).
- **API `dev`:** `packages/api/package.json:8`.
- **`Makefile`:** l. 7–10 (`include`/`export`), l. 15–20 (`up`, with no `--wait`).
- **`docker-compose.yml:9`:** fixed `"5432:5432"`.
- **Test configuration:**
  - `vitest.config.ts` has no `test.env` and no `globalSetup`.
  - `vitest.stryker.config.ts:12` uses `mergeConfig(base, …)`, so it would inherit `test.env`.
  - `stryker.config.json` has no `ignorePatterns`, so `scripts/` and `fixtures/` reach the sandbox for the new unit tests.
- **The D12 danger is real:**
  - `tests/integration/store/support.ts:32` copies `{ ...process.env }`;
  - `migrations.spec.ts:257/268/280` run `npm run --silent db:migrate|db:rollback` without `DATABASE_URL`;
  - `:301` runs `npx tsx` directly, with no preload.
- **`dev-script.spec.ts`:** `:58` and `:82` spread `process.env`, and the spawn at `:85` of `dev-register.mjs` is untouched by the separate preload.
- **`ProjectPickerPage.tsx:46`** is `<code>make up</code>`; `ProjectPickerPage.test.tsx:364` pins the whole text. The other `make up` hits under `packages/` and `tests/` are comments only.
- **`confidence-doc.spec.ts`:** `:24`, `:47`, `:67`, `:70–80` are exactly the places D9 changes.
- **No fingerprint input changes:**
  - `packages/cli/src/seed/fingerprint.ts:27–45` reads `package-lock.json` (parser versions only), `packages/core/src/knowledge` and the fixtures, never the root `package.json`, `scripts/` or `docs/`;
  - the TSDoc of `confidence.ts` is not edited.
- **Empty values in `.env.example`:** `PORT=`, `HOST=` and the `RATE_LIMIT_*` keys, now fed to the API's `dev`, keep their defaults (`composition.ts:56–68`). `make up` already exported them.
- **No duplicate abstraction:** there is no `.env` parser and no `dotenv` use outside `node_modules`.

**Clean**, apart from the alignment in 5.3.

### 9. Task size

- **9.1 (improvable, ordering rather than size).** Task 3.1 writes the wiring test "with … the entry guards of `up.mjs` and `demo-ask.mjs` passing `DOTENV_PATH` … once they exist in steps 4 and 6". No task in step 4 or 6 says when those assertions are added (RED) and turned green, so 3.2 "GREEN" cannot be fully green. State it in 4.1/4.2 and 6.1/6.2.
- Every other task fits in one agent turn. 11.2/11.2b and 16.2/16.2b are split.

### 10. Mandatory steps

- Step 0 is first and labelled "(MANDATORY - FIRST STEP)". The branch is `feature/DIS-102-cross-shell-demo-spanish-docs`, created from `feature/entrega-2-CRN`. 0.1 sets the Linear state first.
- Steps 13, 14, 15, 16, 17 and 19 are present and labelled. "AGENT MUST EXECUTE" appears on 15, 16 and 19. Report paths follow the template, and screenshots go in `reports/`. Pre-merge review is last, with the three checks in order and the archive commit before the merge. The agent's merge is authorised by the ADR and the Enhanced record.
- **Restoration:** 14.5, 15.4 (`.env` put back), 15.8 and 16.5.
- **10.1 (improvable).** 14.5 compares "the author's `.env` … `git hash-object` before and after", but no task records the "before". Add it to 0.4.
- **10.2 (improvable).** In 15.5, setting `DOCKER_HOST` in PowerShell (`$env:DOCKER_HOST=…`) persists in the tool's session. Every later `docker` command in that session would then fail or point at the closed port. Remove it in the same command.

### 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| The .env file grammar | The .env grammar of .env.example is read | 1.1, 1.2 |
| | Lines that do not match are ignored and the last assignment wins | 1.3 |
| Loading .env into a process | Values of .env fill only the variables the environment lacks | 2.1 |
| | Without .env the environment is unchanged | 2.1 |
| | An unreadable .env is skipped with a warning | 2.1 |
| | The loaded .env is the repository root's | 2.2 |
| | The test suite never reads .env | 2.3 |
| Which commands load .env | The guide's scripts load .env and the quality scripts do not | 3.1, 3.2 (entry-guard part: 4.x/6.x, see 9.1) |
| | A guide command reads DATABASE_URL from .env (recorded) | 15.4 |
| One command starts the system | Up runs the start sequence in order | 4.1, 4.2 |
| | Up stops at the first failing step | 4.3 |
| | Ctrl+C stops up without a failure line | 4.3 |
| | A step that cannot start stops up | 4.3 |
| | Up needs npm to start it | 4.3 |
| | The startup scripts need no installed dependency | 4.4 |
| | Up with Docker unavailable fails naming its first step (recorded) | 15.5 |
| Stopping the system and the Makefile | Down keeps the data volume | 5.1, 15.6 |
| | Make delegates to the npm commands | 5.2, 15.6 |
| Configurable Postgres port | The Postgres port follows POSTGRES_PORT | 5.3 |
| The demo question helper | An answered question prints its status and summary | 6.1, 6.2 |
| | An UNKNOWN answer prints its reason | 6.3 |
| | An error status prints the error body | 6.3 |
| | An unreachable API is reported | 6.3 |
| | demo:ask reads PORT from .env | 6.3 |
| | Missing arguments are a usage error | 6.3 |
| The demo excerpt helper | An excerpt prints exactly the cited lines | 7.1, 7.2 |
| | Paths outside the project are refused | 7.3 |
| | A missing file or a range past its end is reported | 7.3 |
| | A malformed citation is a usage error | 7.3 |
| The demo guide runs the same in PowerShell and Bash | The demo guide has no Bash-only command | 11.1, 11.2, 11.2b |
| | The demo guide is ordered for a first-time reader | 11.1, 11.2, 11.2b |
| | The web walkthrough names what each screen shows | 11.1, 11.3, 16.4 |
| | The guide was followed on a clean clone in both shells (recorded) | 16.2, 16.2b, 16.3, 18.1 |
| The deployment and testing guides in Spanish | Links to the guides' sections resolve | 10.1, 10.2, 11.4, 12.1, 12.2 |
| | The guides are in Spanish and say that .env is read (recorded) | 10.1, 10.2, 12.1, 12.2, 17.1 |
| confidence-score → Published weights | The published weights are the code's weights | 9.1, 9.2 |
| | The confidence document states its limits | 9.1, 9.2 |
| project-picker → API status on Screen 1 | A failed retry keeps the alert | 8.1, 8.2 |
| | The other eight scenarios (text unchanged) | 8.2 (`npx vitest run packages/web tests/a11y`) |

**No empty row.**

---

### Corrections to apply

All of these are improvable. The change can go to apply without them, but they are cheap to fold in now.

#### `openspec/changes/cross-shell-demo-spanish-docs/tasks.md`

- **0.4.** Append:
  > ; record `git hash-object .env` of the working tree (without printing the file) for the 14.5 comparison
- **4.1 / 4.2.** Append to 4.1:
  > ; add to `wiring.spec.ts` the assertion that `scripts/up.mjs` imports `DOTENV_PATH` from `./load-env.mjs` and passes it in its entry guard (RED)

  Append to 4.2: "(that assertion GREEN)".
- **6.1 / 6.2.** Make the same addition for `scripts/demo-ask.mjs`. In 6.2, replace "loads `.env` through `./load-env.mjs`" with:
  > calls `loadEnvFile(dotenvPath, env, stderr)` first, `dotenvPath` defaulting to `DOTENV_PATH` imported from `./load-env.mjs` (design D4, A2)
- **3.1.** Replace "once they exist in steps 4 and 6" with:
  > (added in 4.1 and 6.1)
- **15.1.** Replace "a scratchpad clone of the branch for the commands that start containers (design D11), never the working tree's compose project" with:
  > a scratchpad clone of the branch into a folder named `manual-15` (`git clone <repo> manual-15`; design D11: the folder name is the Compose project), checked with `docker compose ls` / `docker compose config --format json` to be a project other than `codemind` before any `npm run up`; its `.env` is `cp .env.example .env` plus the scripted port edit of design D11 (A14)
- **15.5.** Append:
  > ; in PowerShell set and remove it in one line (`$env:DOCKER_HOST='tcp://127.0.0.1:1'; npm run up; Remove-Item Env:DOCKER_HOST`)
- **15.8.** Replace `docker compose -p <clone> down -v` with `docker compose -p manual-15 down -v`.

#### `openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md`

- **Requirement "The demo guide runs the same in PowerShell and Bash"** (5.2). Replace "how to recognise that port 5432 is taken (`docker compose` reports `port is already allocated` and `Paso 0` stops at its first step)" with:
  > how to recognise that port 5432 is taken (`Paso 0` stops at its first step and `docker compose` reports `port is already allocated` when another container holds it, or `Ports are not available` when another program does; with a local PostgreSQL already on 5432, `npm run db:migrate` can instead fail with `password authentication failed for user "codemind"`)

  In the scenario "The demo guide is ordered for a first-time reader", add `Ports are not available` next to `port is already allocated`.
- **Requirement "The demo question helper"** (5.3). Replace "where `<PORT>` is the `PORT` variable or `3000` when it is unset or empty, …. A `PORT` that is not a decimal integer from 1 to 65535" with:
  > where `<PORT>` is the `PORT` variable trimmed of spaces, or `3000` when it is unset or blank (as the API reads it). A `PORT` that, once trimmed, is not made of decimal digits only with a value from 1 to 65535

#### `openspec/changes/cross-shell-demo-spanish-docs/design.md`

- **Decisions intro, l. 67.** Change "A1–A12" to "A1–A18".
- **D4** (6.3). Append:
  > With an unreadable `.env`, `npm run up` and `npm run demo:ask` print the `warning: .env not read (…)` line twice, once from the import side effect of `./load-env.mjs` and once from their own `loadEnvFile` call; accepted, since each load prints one line and the requirement holds.
- **D5** (5.4). After the signature, add:
  > `cwd` defaults to the repository root, resolved from the module (`fileURLToPath(new URL('..', import.meta.url))`), not `process.cwd()`.
- **Spec-audit amendments.** Add a "run 3" list:
  - **A19:** the step-15 clone is `manual-15`;
  - **A20:** `Antes de empezar` names `Ports are not available` and the `password authentication failed` symptom;
  - **A21:** `demo:ask` reads `PORT` as the API does;
  - **A22:** the default `cwd` of `runUp` is the root;
  - **A23:** the double warning is accepted.

#### `openspec/changes/cross-shell-demo-spanish-docs/proposal.md`

- **Impact → New files** (6.4). Add `tests/unit/docs/guides.spec.ts`.

#### Linear DIS-102

Do not touch `[original]`. In the **Enhanced** part, in Spanish:

- **«Contexto técnico».** Replace «Delta specs: `local-startup` (ADDED) y `confidence-score` (MODIFIED «Published weights»)» with:
  > Delta specs: `local-startup` (ADDED), `confidence-score` (MODIFIED «Published weights») y `project-picker` (MODIFIED «API status on Screen 1», D13)

  Replace «`readme.md` §0/§1.3/§1.4» with «`readme.md` §0/§1.2/§1.3/§1.4/§2.4 (A18)».
- After A18, add a section «Enmiendas de la auditoría de la spec (ejecución 3, 19-10-2026)»:
  > * **A19.** El clon de la prueba manual (paso 15) se llama `manual-15`; antes de `npm run up` se comprueba que su proyecto de Compose no es `codemind`, y su `.env` se prepara como en A14.
  > * **A20.** «Antes de empezar» nombra también `Ports are not available` (el puerto lo ocupa otro programa, p. ej. un PostgreSQL instalado en Windows) y el síntoma `password authentication failed for user "codemind"` en `npm run db:migrate`.
  > * **A21.** `demo:ask` lee `PORT` como la API: sin espacios alrededor, en blanco = 3000, solo dígitos entre 1 y 65535.
  > * **A22.** `up` ejecuta sus pasos desde la raíz del repositorio, resuelta desde el propio módulo.
  > * **A23.** Con un `.env` ilegible, `npm run up` y `npm run demo:ask` muestran el aviso dos veces (una por cada carga); se acepta.

### Resolution of run 3

Verdict APPROVED: the apply can start. The minor points were folded anyway with `/opsx:update`:

| Finding | Resolution |
|---|---|
| R7, 5.1 — step-15 clone could take the `codemind` Compose project | Clone `manual-15`, project name checked before any `npm run up`, `.env` prepared as A14; tasks 15.1, 15.8 (A19). |
| 5.2 — other port-taken messages | `Antes de empezar` also names `Ports are not available` and `password authentication failed`; spec and scenario (A20). |
| 5.3 — `PORT` parsing differs from the API | `demo:ask` reads `PORT` as `packages/api/src/composition.ts` does (A21); task 6.2. |
| 5.4 — default `cwd` of `runUp` | Root resolved from the module (A22); design D5, task 4.2. |
| 6.1 — "A1–A12" in the design intro | Now "A1–A22". |
| 6.2 — task 6.2 wording | Rewritten: `runDemoAsk` calls `loadEnvFile` itself. |
| 6.3 — double warning | Resolved instead of accepted: `DOTENV_PATH` moves to `scripts/env.mjs`, `up`/`demo:ask` never import the side-effecting `./load-env.mjs`; spec says the warning prints at most once per process (A23). |
| 6.4 — `guides.spec.ts` missing in Impact | Added to proposal → Impact. |
| 9.1 — when the entry-guard assertions are written | Added as RED in 4.1 and 6.1, GREEN in 4.2 and 6.2; 3.1 points to them. |
| 10.1 — no "before" hash of the author's `.env` | Task 0.4 records `git hash-object .env` (file never printed). |
| 10.2 — `$env:DOCKER_HOST` persists in PowerShell | Task 15.5 sets and removes it in one line. |
| 1.1 — Linear «Contexto técnico» stale | Updated (three deltas; readme §0/§1.2/§1.3/§1.4/§2.4). |

No further run is needed: run 3 returned APPROVED, and its points are folded.
