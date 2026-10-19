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
