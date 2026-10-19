## Context

See proposal.md → Why. The state this design starts from (base `368dc38`):

- Root `package.json`: `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build` and
  `seed:build` run `tsx …`; none reads `.env`. `dev` runs `concurrently` over the API's and the web's
  `dev`. `engines.node` is `>=20.11`; CI runs Node `'20'` (`.github/workflows/ci.yml`,
  `frontend.yml`), locally Node 24.11.1.
- `packages/api/package.json` → `dev`: `node --watch --import ./dev-register.mjs src/server.ts`, run
  with cwd `packages/api`. `tests/integration/api/dev-script.spec.ts` spawns that script through
  `npm -w packages/api run dev` (with `DATABASE_URL` set) and spawns `dev-register.mjs` directly with
  `DATABASE_URL: ''`, expecting `INVALID_CONFIG`.
- `Makefile`: `include .env` + `export`, then `up` (`docker compose up -d`, `npm install`,
  `db:migrate`, `db:seed`, `dev`), `down`, `logs`, `ps`. GNU Make only (Git Bash or WSL on Windows).
- `docker-compose.yml`: one `postgres` service (`pgvector/pgvector:pg16`), fixed `"5432:5432"`,
  `pg_isready` healthcheck. Compose reads `.env` of the project directory for substitution by itself,
  and its default project name is the directory's name.
- `.env.example`: per the DIS-102 reality map, empty keys (`PORT=`, `LLM_*=`), indented comments, no
  quotes, `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind`. The agent's Read tool
  is denied on `.env*` by the author's permission settings (see Risks).
- Tests that spawn npm scripts with variables removed from the environment:
  `tests/integration/store/migrations.spec.ts` ("DATABASE_URL is missing on migrate", "… on
  rollback", "… (blank value)") run `npm run --silent db:migrate|db:rollback` through
  `tests/integration/store/support.ts` → `runCommand`, which copies `process.env` and deletes
  `DATABASE_URL`. With a loader in `db:migrate` and a developer `.env`, those processes would read the
  developer's `DATABASE_URL` and, for `db:rollback`, **roll back the developer's database**. This is
  the reason for D12.
- `docs/DEMO.md` (English): Bash `export`, the Bash `ask_api` function, `sed -n '16,44p' …` and
  `; echo "exit: $?"` suffixes. `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` in
  English. `tests/unit/knowledge/confidence-doc.spec.ts` pins the English headings and limit phrases
  of `docs/CONFIDENCE.md` (`openspec/specs/confidence-score/spec.md` → "Published weights").
- Screen 1 (`packages/web/src/pages/ProjectPickerPage.tsx:46`) tells the reader to start the API with
  `make up`; `openspec/specs/project-picker/spec.md` → "API status on Screen 1" pins that text and
  `ProjectPickerPage.test.tsx` ("A failed retry keeps the alert") checks it whole.
- `eslint.config.mjs` lints `.mjs` files with `console` and `process` as the only declared globals;
  any other global (`fetch`, `URL`) must be imported or reached through `globalThis`, as
  `packages/api/dev-register.mjs` imports `URL` from `node:url`.
- `stryker.config.json` mutates only `packages/{core,cli,api}/src`; `docs:coverage` (TypeDoc) and
  `lint:architecture` (dependency-cruiser) look only at `packages/`.
- Fingerprints: the seed fingerprint reads `package-lock.json` and package sources, the answer
  fingerprint a list of `packages/core/src` files. This change touches none of them.

Run authorisation: DIS-102 was opened on 2026-10-19, after the twelve tickets listed in ADR
`20261016-autonomous-workflow-run-entrega-2`, and runs under the same ADR by the author's request of
that date (the workflow run she launched; recorded in DIS-102 Enhanced). Without that record, task
19.9 stops before the merge and leaves DIS-102 In Review.

## Goals / Non-Goals

**Goals:**

- Every command an evaluator types is the same text in PowerShell and Bash, and works on Node 20.11,
  on CI's Node 20 and on Node 24.
- The `.env` logic is pure and unit-tested on temporary files; nothing in the suite can read or act
  on the real `.env`.
- `npm run up` is testable without Docker through an injected step runner.

**Non-Goals:**

- Windows PowerShell 5.1-specific workarounds beyond what the clean-clone run in PowerShell 7 shows
  (see Risks).
- Making the Vite proxy follow `PORT`; any other product change than D13.

## Decisions

The Linear decisions D1–D11 (DIS-102 Enhanced, 2026-10-19) hold; this section gives their technical
shape and adds D12–D18 and the spec-audit amendments (A1–A22, end of this section), all recorded in the
ticket's Enhanced description.

### D1. Through OpenSpec, with three deltas

New capability `local-startup` (`.env`, `up`/`down`, `Makefile`, port, demo helpers, guides) and
two MODIFIED requirements: `confidence-score` → "Published weights" (D9) and `project-picker` → "API
status on Screen 1" (D13). Alternative: a docs-only change with `skip_specs`; rejected because scripts
gain behaviour and two published requirements change.

### D2. A hand-written `.env` parser, no dependency, `engines` unchanged

`scripts/env.mjs` exports `parseEnv(text)` (the grammar of `local-startup` → "The .env file
grammar") and `loadEnvFile(path, env, stderr)` (precedence, absence, unreadable file, skip switch).
Rejected: `process.loadEnvFile` / `util.parseEnv` (Node 20.12.0 and 21.7.0, below `>=20.11`, and their
grammar has changed between releases); `node --env-file` (20.6.0, but fails when the file is missing;
`--env-file-if-exists` is 22.9.0); `dotenv` (a dependency, and a `package-lock.json` change that would
also change the seed fingerprint, for about 30 lines). The grammar is the subset `.env.example` uses
plus matched quotes, so the result is the same on every Node version. `engines` stays `>=20.11`;
`wiring.spec.ts` pins it and checks that no script uses `process.loadEnvFile`, `util.parseEnv` or
`--env-file` (`local-startup` → "Which commands load .env").

### D3. Precedence and location

`Object.hasOwn(env, key)` decides: a present key is never overwritten, even when empty, so a variable
set in the shell (or `KEY=` on purpose) beats `.env`. The path is
`fileURLToPath(new URL('../.env', import.meta.url))` of `scripts/env.mjs`, which exports it as
`DOTENV_PATH`, so the API's `dev` (cwd `packages/api`) reads the same file as the root scripts.
`scripts/load-env.mjs` is the preload only: on import it calls `loadEnvFile(DOTENV_PATH, process.env,
process.stderr)` and exports nothing else of its own. The skip switch (D12) is read from the environment passed to `loadEnvFile`, not from
`process.env`, so the unit tests load into plain objects without the switch while the suite's own
`process.env` keeps it (A1).

### D4. Which commands load `.env`

The seven root scripts become `tsx --import=./scripts/load-env.mjs <today's arguments>`: `tsx`
forwards Node's `--import` (checked on tsx 4.23.13 during the propose: a preload set a variable the
program read), and the child process tsx starts inherits the loaded environment. The flag is written
as one token with `=` (A24): with the space form, tsx 4.23.13 forwards the `--tsconfig` that follows
to Node, which stops with `bad option: --tsconfig` (exit `9`; found during the apply on
`npm run verify`). The API's `dev`
becomes `node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts`:
a separate preload, so `dev-register.mjs` and the test that spawns it directly stay as they are; with
`--watch`, each restart loads `.env` again. `up` and `demo:ask` do not rely on the preload's side
effect: `runUp` and `runDemoAsk` call `loadEnvFile(dotenvPath, env, stderr)` first, with `dotenvPath`
defaulting to `DOTENV_PATH` (imported from `./env.mjs`, never from the side-effecting
`./load-env.mjs`, so an unreadable `.env` warns once, A23), so their tests can give a temporary file
(A2). Their entry
guards pass `dotenvPath: DOTENV_PATH` explicitly, which `wiring.spec.ts` checks in the source text, so
a default left `undefined` cannot pass every test unnoticed (A15). The root
`dev` needs no preload: the API's own `dev` loads it, and the web reads no variable. `demo:excerpt`
reads no variable, so it does not load `.env` (a refinement of the ticket's "the demo helpers": loading
it would do nothing). Quality scripts never load it (`local-startup` → "Which commands load .env").

### D5. `npm run up` = `node scripts/up.mjs`

`scripts/up.mjs` exports `runUp({ env, dotenvPath, run, stdout, stderr, cwd, onInterrupt })`, with
`cwd` defaulting to the repository root resolved from the module
(`fileURLToPath(new URL('..', import.meta.url))`, not `process.cwd()`, A22), and runs it when it is
the entry module (the `process.argv[1]` guard pattern of `packages/cli/src/seed-load.ts`, compared with
`fileURLToPath(import.meta.url)`). `run(command, args, options)` is `child_process.spawn` with
`stdio: 'inherit'`, `shell: false`, resolving `{ code, signal }` on `exit` or `{ error }` on
`error`; tests pass a double. Steps:

| Step | command, args |
|---|---|
| 1 | `docker`, `compose up -d --wait` |
| 2 | `process.execPath`, `[npm_execpath, 'install']` |
| 3 | `process.execPath`, `[npm_execpath, 'run', 'db:migrate']` |
| 4 | `process.execPath`, `[npm_execpath, 'run', 'db:seed']` |
| 5 | `process.execPath`, `[npm_execpath, 'run', 'dev']` |

The `[up]` lines name the command as a person types it (`npm install`, not the Node path). `--wait`
waits for the healthcheck, so a first start never migrates before Postgres accepts connections
(Compose v2.1.1 or later; Docker Desktop ships v2). `npm` is never spawned by name: since Node 20.12.2
(CVE-2024-27980) spawning `npm.cmd` without a shell fails on Windows, and `npm_execpath` (set by npm
for every script it runs, `make up` included since it calls `npm run up`) is the npm-cli.js of the
running npm. Ctrl+C reaches every process of the console. While a step runs, `up` installs a SIGINT
listener (so Node's default handler does not kill `up` before its child ends) and removes it after the
step; when the step then ends, whatever its code (on Windows typically `3221225786`) or signal, `up`
prints `[up] stopped (Ctrl+C)` and exits `130`, the shell convention for an interrupt (A3). The
default `onInterrupt(listener)` subscribes to `process`'s `SIGINT`; tests pass a double that fires the
listener. `npm run down` is the plain script `docker compose down`.

### D6. `Makefile` delegates

`up: npm run up`, `down: npm run down`; `logs` and `ps` unchanged; the `include .env` / `export`
block is removed: `npm run up` loads `.env` itself, and a variable assigned in an included makefile
overrides the same variable of the environment in GNU Make (unless `make -e`), so keeping the include
would give `make up` the opposite precedence of `npm run up`. The header comment is rewritten in
English (code language rule) and says the targets are shortcuts for the npm commands.

### D7. `POSTGRES_PORT`

`ports: - "${POSTGRES_PORT:-5432}:5432"` (`:-` also covers an empty value). `.env.example` gains
`POSTGRES_PORT=5432` right above `DATABASE_URL`, with a comment that the two ports change together.
Compose reads the variable from the shell or from `.env` by itself, and `up` loads `.env` before
calling it, so both paths agree.

### D8. Demo helpers

`scripts/demo-ask.mjs` exports `runDemoAsk(args, { env, dotenvPath, fetch, stdout, stderr })` (entry
guard as D5; the real `fetch` taken from `globalThis`); `scripts/demo-excerpt.mjs` exports
`runDemoExcerpt(args, { fixturesRoot, stdout, stderr })`. Output and errors as in `local-startup` →
"The demo question helper" and "The demo excerpt helper": an `UNKNOWN` body is recognised by
`answer === "UNKNOWN"` before the statements count (an `UNKNOWN` body also has `statements: []`), a
`PORT` outside 1–65535 is a usage error, and there is no request time limit, since a live model can
take minutes on a CPU (`readme.md` §1.4 timings) and Ctrl+C stops the helper (A4). The excerpt's lines
are LF-split with a trailing CR dropped and no extra line after a final LF; the project must be a
directory entry of `fixtures/` other than `.`/`..`; a directory path reads as not found; the checks run
usage → project → outside → missing → range (A5). The excerpt check resolves
`fixtures/<project>` and the file with `path.resolve`, refuses absolute paths and any relative path
that leaves the project directory, and then compares `fs.realpathSync` of both, so a link inside the
fixture cannot lead out. Exit code `2` for usage errors follows the CLI's convention
(`docs/DEPLOYMENT.md`: `2` a usage error). `; echo "exit: $?"` goes from the guide: the text states
the expected exit code instead.

### D9. `CONFIDENCE.md` in Spanish and its requirement

Headings `Fórmula`, `Señales`, `Pesos`, `Límites`; table header `Nombre | Señal | Valor | Motivo`;
names, signals, values and `—` verbatim; values with a decimal point (the test reads them with
`Number`). `confidence-doc.spec.ts` changes in the same commit as the doc: `section(markdown,
'Pesos')`, `section(markdown, 'Límites')`, the expected headings and the eight Spanish statements of
the modified requirement, plus the new header-cell assertion; its two test names stay (they are the
scenario names). This follows the requirement change; it is not a test weakened to pass.

### D10. Translation scope

Only `docs/DEMO.md`, `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md` and `docs/TESTING.md` (author's
decision, 2026-10-19); everything else stays English, `prompts.md` stays Spanish. New anchors: in
`DEPLOYMENT.md` `## Indexar un repositorio (CLI)` (`#indexar-un-repositorio-cli`) and `## Verificar
una instalación`; in `TESTING.md` `**Carreras conocidas.**`. References to update: `docs/DEPLOYMENT.md`
→ `#indexing-a-repository-cli`; `docs/project-context.md` l. 359 (`docs/TESTING.md` → Known races) and
any other section name it cites; `docs/TESTING.md` → `DEPLOYMENT.md` → Verifying an installation;
`readme.md` §0 (l. 19, 75), §1.2 (l. 147), §1.3 (l. 185, 279), §1.4 (l. 298–316 — the start block
without `&&`: `git clone …` and `cd …` on two lines in a `shell` block —, 391–395, 407, variables
table l. 436–441) and §2.4 (l. 658, 690), and `make up` as the main command wherever it is (now
`npm run up`, with `make up` as the Git Bash/WSL alternative); l. 1084 and l. 1672 are history and
stay (A18). The TSDoc in `packages/core/src` cites `docs/CONFIDENCE.md` by file name only and is not
touched (it is also an answer-fingerprint input). `prompts.md` and `openspec/specs/` hold no
`#fragment` link into the four guides (checked during the spec audit), so they need no anchor update;
the `make up` mentions of `openspec/specs/verify-smoke` and `seed-load` stay true because `make up` now
runs `npm run up`. The stale sentences of `docs/project-context.md` are at lines 38, 62, 191, 227 and
1180–1181 of the base, plus `docs/DEPLOYMENT.md` lines 20–21, 109 and `docs/TESTING.md` line 29 (A6).

### D11. The clean-clone run (criterion E)

Two clones of `origin/feature/DIS-102-cross-shell-demo-spanish-docs` in the agent's scratchpad, one
per shell (`e2e-bash`, `e2e-pwsh`), run one after the other: the folder name gives each its own
Compose project, so the author's `codemind` project, container and volume are never touched. The
author's container already holds 5432, so each clone follows the guide's "port taken" branch:
`POSTGRES_PORT` and the port of `DATABASE_URL` changed in the clone's `.env`. `npm run up` runs in the
background (it ends in `npm run dev`); the other steps run in a second shell. Afterwards the agent
stops the dev servers it started (process tree, `taskkill /T` on Windows) and runs `docker compose -p
<clone> down -v` for each clone's own project only (never `-v` on `codemind`), and moves the clone
folders out of the way without `rm -rf`. `C:/Users/<user>/Desktop/~` is never touched. The output
pasted into `docs/DEMO.md` comes from these runs (the PowerShell one for the PowerShell-specific
variants, if any), with the edits the guide lists. If PowerShell's `npm` loses `--` or the accents, the
guide shows labelled `powershell`/`bash` variants and the PR says so.

The guide's "port taken" step ("edit `.env` with a text editor") is performed in each clone by a
scripted, line-anchored replacement of the `POSTGRES_PORT=` line and of the port in `DATABASE_URL=`,
writing UTF-8 without BOM and LF, without reading or printing the file (the agent has no editor and
its Read tool is denied on `.env*`); it is the one stated deviation from "literally", recorded in the
step 16 report and in the PR body (A14). `npm run up` runs in the background and is stopped by process
tree, so the Ctrl+C end is not captured: `Parar el sistema` states it in text (`[up] stopped
(Ctrl+C)`, then npm's `code 130` lines, the expected end) and pastes only `npm run down` (A13); in the
Bash clone the agent may send `kill -INT` to the process group and record that output in the step 16
report.

### D12. The test suite never reads `.env` (agent's decision)

`vitest.config.ts` sets `test.env: { CODEMIND_SKIP_DOTENV: '1' }`; Vitest puts it in each worker's
`process.env`, the processes the tests spawn inherit it through `{ ...process.env }`, and
`vitest.stryker.config.ts` inherits it through `mergeConfig`. `loadEnvFile` returns before reading the
file when the switch is `1`. Why: without it, `migrations.spec.ts` would run `db:rollback` against the
developer's database whenever a `.env` exists, and its "DATABASE_URL is missing" tests would fail; the
rule "never modify an existing test to make the suite pass" forbids editing those specs. Alternatives
rejected: relying on Vitest's own `VITEST` variable (implicit, and undocumented as inherited), or
loading `.env` only when `DATABASE_URL` is unset (still reads the developer's other keys). The switch
is documented in `docs/project-context.md` → Testing; CI has no `.env`, so it changes nothing there.

### D13. Screen 1's start hint says `npm run up` (agent's decision)

The unavailable-API alert said «Arráncala con make up…», a command PowerShell does not have; the demo
walkthrough (criterion C) shows that alert. It becomes «Arráncala con npm run up y pulsa
Reintentar.» (MODIFIED `project-picker` → "API status on Screen 1"; `ProjectPickerPage.test.tsx` "A
failed retry keeps the alert" follows it). This narrows the ticket's "no product change" non-goal by
one string, recorded in the ticket's Enhanced description. Alternative rejected: leave it and explain
in the guide that `make up` means `npm run up` (the screen would keep giving a Bash-only instruction).

### D14. Test-database variable: labelled shell variants (agent's decision)

`npm test` never reads `.env` (D4, D12), so pointing the integration tests at their own database
needs a variable per shell. `docs/TESTING.md` shows it as an adjacent, labelled pair:
`DATABASE_URL=postgresql://…/codemind_test npm test` (Bash) and
`$env:DATABASE_URL='postgresql://…/codemind_test'; npm test` (PowerShell), plus the `createdb` line,
which is the same in both. The PowerShell variant notes that `$env:DATABASE_URL` persists for the
session and beats `.env` (D3), so the reader removes it (`Remove-Item Env:DATABASE_URL`) or opens a
new terminal before the demo; the `codemind_test` URL uses the port of `.env`'s `DATABASE_URL` (A17).
Running the tests is a developer task, not a demo step, so criterion C's
"one command for both shells" is met in `docs/DEMO.md`, and `docs/TESTING.md` uses the "two labelled
variants when unavoidable" clause. The smoke check (`npm run verify`) no longer needs `export`.

### D15. Fence info strings of the guide (agent's decision)

`shell` for commands common to both shells, `text` for output, `powershell`/`bash` only as adjacent
labelled pairs. This makes criterion C checkable by a test (`local-startup` → "The demo guide has no
Bash-only command"): the forbidden constructs are the ones the old guide used plus the ones that differ
between the two shells (`&&`/`||` do not exist in Windows PowerShell 5.1; `$(…)`, `\` and backtick
continuations differ). `cp .env.example .env` is one line because `cp` is an alias of `Copy-Item` in
PowerShell.

### D16. Typed tests over `.mjs` scripts

The tests import `scripts/*.mjs` (Vitest resolves them as ESM). For `npm run typecheck`
(`tests/tsconfig.json`, `moduleResolution: Bundler`) each imported module gets a sibling `.d.mts`
with the exported signatures. Scripts carry JSDoc/TSDoc like `dev-register.mjs`. Tests (new) under
`tests/unit/scripts/`: `env.spec.ts` (grammar, loading, root path, skip switch), `up.spec.ts`
(runner double), `demo-ask.spec.ts` (local `node:http` server on port 0), `demo-excerpt.spec.ts`
(the real `fixtures/acme-shop`, read only), `wiring.spec.ts` (`package.json` files, `Makefile`,
`docker-compose.yml` through `yaml`, `.env.example` through `parseEnv`, imports of `scripts/*.mjs`),
and `tests/unit/docs/guides.spec.ts` (DEMO.md fences, headings, walkthrough labels, and the anchors of
`local-startup` → "Links to the guides' sections resolve", with GitHub's slug rule). Each test is named
after its scenario. `scripts/` stays out of Stryker (as `dev-register.mjs`): the mutation scope is the
product packages.

### D17. Manual checks without stopping the author's Docker

"Up with Docker unavailable" runs with `DOCKER_HOST=tcp://127.0.0.1:1` (a closed port) in the
clone, set per shell for that one check, instead of stopping Docker Desktop, which would stop the
author's other containers.

### D18. The four guides are a recorded language exception (agent's decision)

`docs/base-standards.md` §2 and `docs/documentation-standards.md` say documentation is English. The
author's decision of 2026-10-19 puts the four evaluator guides in Spanish, like `readme.md`. The
exception is written once in `docs/project-context.md` (the project's facts file; `base-standards.md`
is kit doctrine and is replaced on kit updates): `docs/DEMO.md`, `docs/CONFIDENCE.md`,
`docs/DEPLOYMENT.md` and `docs/TESTING.md` are Spanish, with commands, pasted output, identifiers,
error codes and paths verbatim; every other document follows `base-standards.md` §2. `/update-docs`
reads that line before applying the English rule.

### Spec-audit amendments (run 1, 2026-10-19)

- **A1.** The skip switch is read from the target environment (D3).
- **A2.** `up` and `demo:ask` load `.env` through `loadEnvFile` with an injectable `dotenvPath` (D4).
- **A3.** Ctrl+C during a step ends `up` with `[up] stopped (Ctrl+C)` and exit `130` (D5).
- **A4.** `demo:ask` classifies `UNKNOWN` first, validates `PORT`, sets no time limit (D8).
- **A5.** `demo:excerpt` line definition, project rule, directory path and check order (D8).
- **A6.** The stale sentences are listed by line, and the search list of the recorded check is wider
  (D10; `local-startup` → "The guides are in Spanish and say that .env is read").
- **A7.** `engines` and "product code never loads `.env`" are pinned by `wiring.spec.ts` (D2, D4).
- **A8.** The anchor rule uses Unicode letters and digits and NFC on both sides (D16).
- **A9.** `Antes de empezar` names Compose's `port is already allocated` and says to edit `.env` with a
  text editor (Windows PowerShell 5.1 redirection writes UTF-16, which the UTF-8 grammar cannot read).
- **A10.** D18, the language exception.
- **A11.** The D12 demonstration with a real `.env` runs only in the scratchpad clone, never in the
  working tree, where a bug would roll back the author's database (tasks 14.3).
- **A12.** `confidence-doc.spec.ts` normalises headings and section lookup to NFC (task 9.1); tasks
  11.2 and 16.2 are split in two. Rejected: switching `gh` back to Cristina-JumpMath after pushing; the
  author allowed DisTinta to stay active for this run (2026-10-18).

### Spec-audit amendments (run 2, 2026-10-19)

- **A13.** `Parar el sistema` states the Ctrl+C end in text and pastes only `npm run down` (D11).
- **A14.** The clones' "port taken" `.env` edit is scripted and the one stated deviation (D11).
- **A15.** The entry guards of `up` and `demo:ask` pass `DOTENV_PATH`, checked by `wiring.spec.ts`.
- **A16.** `shell` blocks also forbid any `$` and lines starting with a variable assignment.
- **A17.** TESTING's PowerShell variant warns about session persistence and the test URL follows
  `.env`'s port (D14).
- **A18.** `readme.md` §1.2 and §2.4 also move to `npm run up`, and §1.4's start block drops `&&` (D10).
- Recorded: A10 is D18; D11's two clones and their `down -v` on the clones' own projects; the ADR scope
  of DIS-102 (Context).

### Spec-audit amendments (run 3, 2026-10-19, verdict APPROVED; minor points folded)

- **A19.** The step-15 clone is `manual-15`; before any `npm run up` its Compose project is checked not
  to be `codemind`; its `.env` is prepared as A14 (tasks 15.1, 15.8).
- **A20.** `Antes de empezar` also names `Ports are not available` and the `password authentication
  failed` symptom of a native PostgreSQL on 5432.
- **A21.** `demo:ask` reads `PORT` as the API does (`packages/api/src/composition.ts`): trimmed, blank =
  3000, digits only, 1–65535.
- **A22.** `runUp`'s default `cwd` is the root resolved from the module.
- **A23.** `DOTENV_PATH` lives in `scripts/env.mjs`; `up` and `demo:ask` import it from there, so the
  warning of an unreadable `.env` is printed once (instead of accepting a double warning).

### Apply amendments (2026-10-19, agent's decisions during `/opsx:apply`)

- **A24.** The seven root scripts preload with `--import=./scripts/load-env.mjs` (one token), not
  `--import ./scripts/load-env.mjs`: tsx 4.23.13 then forwarded `--tsconfig packages/cli/tsconfig.run.json`
  to Node (`node.exe: bad option: --tsconfig`, exit `9`). The `=` form runs every script (checked with
  `npm run verify`); the spec scenario "The guide's scripts load .env and the quality scripts do not"
  pins it (D4).

## Risks / Trade-offs

- [The agent's Read tool is denied on `.env*`, `.env.example` included] → the apply edits
  `.env.example` with a scripted, line-anchored insertion (above the `DATABASE_URL=` line) and phrase
  replacements of the sentences D10 names, checks them with the `wiring.spec.ts` test and `git diff
  --stat`; if the permission blocks the edit itself, the step stops, the ticket goes to In Review with
  a Spanish comment, and the author makes the `.env.example` edit.
- [PowerShell 5.1 is not exercised; the clean-clone run uses PowerShell 7] → the guide avoids every
  construct that differs (D15), and the PR body says which PowerShell was used.
- [PowerShell's `npm` (npm.ps1) dropping `--` or re-encoding accented arguments] → found by the
  clean-clone run; then the guide shows labelled variants and the PR records it (D11).
- [`tsx` stops forwarding `--import` in a future release] → `wiring.spec.ts` pins the scripts, and the
  clean-clone run exercises them; the fix would be `node --import ./scripts/load-env.mjs
  ./node_modules/tsx/dist/cli.mjs …`.
- [Docker Compose older than v2.1.1 has no `--wait`] → Docker Desktop and current Compose plugins ship
  it; `up` names the failing step and `docs/DEPLOYMENT.md` lists the requirement.
- [A key in a developer's `.env` now reaches commands it did not reach before (`npm run cli` read
  only the shell)] → the same values `make up` already exported; the environment still wins.

## Migration Plan

No data migration. Anyone with a running `make up` keeps working: `make up` now calls `npm run up`.
Rollback is reverting the PR; the `pgdata` volume is never touched.

## Follow-ups

None yet; the pre-merge reviews add their findings here with an A/B/C/D destination.
