## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-102 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `cross-shell-demo-spanish-docs` and the branch `feature/DIS-102-cross-shell-demo-spanish-docs`
- [x] 0.2 Feature branch `feature/DIS-102-cross-shell-demo-spanish-docs` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/cross-shell-demo-spanish-docs/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, merge it before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; nothing under `.claude/` is ever staged (explicit paths only)
- [ ] 0.4 Baseline: run `npx vitest run` once (with `DATABASE_URL` pointing at the integration database, as `docs/TESTING.md` says) and record the totals for the step 14 report; record `node -v`, `npm -v`, `docker compose version`; in the author's local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM claim`, `SELECT count(*) FROM query_log`, `SELECT count(*), sum(hit_count) FROM cache_entry` and `docker volume ls` (the `codemind_pgdata` volume), restored or re-checked in 15.8; record `git hash-object .env` of the working tree if it exists (without printing the file) for the 14.5 comparison

## 1. `.env` grammar (TDD, design D2) — `local-startup` → "The .env file grammar"

- [x] 1.1 RED: create `tests/unit/scripts/env.spec.ts` with "The .env grammar of .env.example is read" (parser fed an in-memory string). See it fail (module missing)
- [x] 1.2 GREEN: `scripts/env.mjs` with `parseEnv(text)` (TSDoc/JSDoc, only `node:` imports) and `scripts/env.d.mts`; LF line endings on every new file (`grep -c $'\r'`, fixed with `sed -i 's/\r$//'`)
- [x] 1.3 RED → GREEN: "Lines that do not match are ignored and the last assignment wins"

## 2. Loading `.env` (TDD, design D3, D12) — `local-startup` → "Loading .env into a process"

- [ ] 2.1 RED → GREEN, one at a time in `env.spec.ts`, on temporary files of `os.tmpdir()` (never the real `.env`) and plain-object environments without `CODEMIND_SKIP_DOTENV` (the switch is read from the target environment, design A1), with recording stderr doubles: "Values of .env fill only the variables the environment lacks", "Without .env the environment is unchanged", "An unreadable .env is skipped with a warning" (a temporary directory as the path); `loadEnvFile(path, env, stderr)` in `scripts/env.mjs`
- [ ] 2.2 RED → GREEN: "The loaded .env is the repository root's": `DOTENV_PATH` exported by `scripts/env.mjs` (and its `.d.mts`); `scripts/load-env.mjs` is the preload that loads it on import (design D3, A23); the test imports `DOTENV_PATH` from `scripts/env.mjs` only
- [ ] 2.3 RED → GREEN: "The test suite never reads .env": `vitest.config.ts` `test.env: { CODEMIND_SKIP_DOTENV: '1' }` with a comment citing design D12; confirm `vitest.stryker.config.ts` inherits it (`mergeConfig`)

## 3. Wiring the npm scripts (TDD, design D4) — `local-startup` → "Which commands load .env"

- [ ] 3.1 RED: create `tests/unit/scripts/wiring.spec.ts` with "The guide's scripts load .env and the quality scripts do not" (`package.json` files read with `JSON.parse`; `engines.node`; the `.env` imports of `scripts/up.mjs`, `demo-ask.mjs` and `demo-excerpt.mjs` and the forbidden Node APIs read from their source text; no import specifier of `packages/*/src` naming `scripts/`, `load-env` or `.env`; the entry guards of `up.mjs` and `demo-ask.mjs` passing `DOTENV_PATH` are added in 4.1 and 6.1). See it fail
- [ ] 3.2 GREEN: in the root `package.json`, prefix `--import ./scripts/load-env.mjs` to `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build` and `seed:build` (arguments otherwise unchanged); add `up`, `down`, `demo:ask`, `demo:excerpt` (the last three pointing at files created in steps 4, 6 and 7); `packages/api/package.json` `dev` per the scenario; `packages/api/dev-register.mjs` untouched; `package-lock.json` unchanged (`git diff --exit-code package-lock.json`)

## 4. `npm run up` (TDD, design D5) — `local-startup` → "One command starts the system"

- [ ] 4.1 RED: create `tests/unit/scripts/up.spec.ts` with "Up runs the start sequence in order" (a recording runner double, a temporary `.env` with `POSTGRES_PORT=5433` passed as `dotenvPath`, `npm_execpath` set in the injected environment and no `CODEMIND_SKIP_DOTENV`); add to `wiring.spec.ts` the assertion that `scripts/up.mjs` imports `DOTENV_PATH` from `./env.mjs`, passes it in its entry guard and does not import `./load-env.mjs`. See both fail
- [ ] 4.2 GREEN: `scripts/up.mjs` (`runUp`, `cwd` defaulting to the root resolved from the module, the default `spawn` runner, the entry guard) and `scripts/up.d.mts`; the 4.1 wiring assertion green
- [ ] 4.3 RED → GREEN, one at a time: "Up stops at the first failing step" (exit code and signal cases), "Ctrl+C stops up without a failure line" (an `onInterrupt` double fired while the `npm run dev` call runs), "A step that cannot start stops up", "Up needs npm to start it"
- [ ] 4.4 RED → GREEN in `wiring.spec.ts`: "The startup scripts need no installed dependency" (import specifiers of every `scripts/*.mjs` read from the source text)

## 5. Stop, Makefile and Postgres port (TDD, design D6, D7) — `local-startup` → "Stopping the system and the Makefile", "Configurable Postgres port"

- [ ] 5.1 RED → GREEN in `wiring.spec.ts`: "Down keeps the data volume" (root `down` = `docker compose down`)
- [ ] 5.2 RED → GREEN: "Make delegates to the npm commands": rewrite the `Makefile` (recipes, no `include`/`export`, header comment in English); keep tab-indented recipes
- [ ] 5.3 RED → GREEN: "The Postgres port follows POSTGRES_PORT": `docker-compose.yml` ports entry; `.env.example` gains `POSTGRES_PORT=5432` above `DATABASE_URL` with its comment, edited with a line-anchored script (the agent's Read tool is denied on `.env*`; design → Risks) and checked with `git diff --stat .env.example`; if the edit is blocked, follow the Risks fallback and record it

## 6. `demo:ask` (TDD, design D8) — `local-startup` → "The demo question helper"

- [ ] 6.1 RED: create `tests/unit/scripts/demo-ask.spec.ts` with "An answered question prints its status and summary" (`node:http` server on port 0 passed as `PORT` in the injected environment; the request path and the UTF-8 body recorded); add the same `DOTENV_PATH` wiring assertion for `scripts/demo-ask.mjs`. See both fail
- [ ] 6.2 GREEN: `scripts/demo-ask.mjs` (`runDemoAsk` calls `loadEnvFile(dotenvPath, env, stderr)` first, `dotenvPath` defaulting to `DOTENV_PATH` of `./env.mjs`, design D4, A2; `PORT` read as the API reads it, A21; `globalThis.fetch`; entry guard) and `scripts/demo-ask.d.mts`; the 6.1 wiring assertion green
- [ ] 6.3 RED → GREEN, one at a time: "An UNKNOWN answer prints its reason", "An error status prints the error body", "An unreachable API is reported" (a port taken and released, as `freePort` in `tests/integration/api/dev-script.spec.ts`), "demo:ask reads PORT from .env" (a temporary `.env` passed as `dotenvPath`), "Missing arguments are a usage error"

## 7. `demo:excerpt` (TDD, design D8) — `local-startup` → "The demo excerpt helper"

- [ ] 7.1 RED: create `tests/unit/scripts/demo-excerpt.spec.ts` with "An excerpt prints exactly the cited lines" (expected lines read from the fixture file itself). See it fail
- [ ] 7.2 GREEN: `scripts/demo-excerpt.mjs` (`runDemoExcerpt`, entry guard, no `.env`) and `scripts/demo-excerpt.d.mts`
- [ ] 7.3 RED → GREEN, one at a time: "Paths outside the project are refused", "A missing file or a range past its end is reported", "A malformed citation is a usage error"

## 8. Screen 1's start hint (design D13) — `project-picker` → "API status on Screen 1"

- [ ] 8.1 Update `packages/web/src/pages/ProjectPickerPage.test.tsx` "A failed retry keeps the alert" to the modified requirement's text (`Arráncala con npm run up y pulsa Reintentar.`) in the same commit as the code; see it fail (RED)
- [ ] 8.2 GREEN: `packages/web/src/pages/ProjectPickerPage.tsx` shows `<code>npm run up</code>`; `npx vitest run packages/web tests/a11y` green; `grep -rn "make up" packages/web/src` finds nothing

## 9. `docs/CONFIDENCE.md` in Spanish (design D9) — `confidence-score` → "Published weights"

- [ ] 9.1 Update `tests/unit/knowledge/confidence-doc.spec.ts` to the modified requirement (Spanish sections, header cells, the eight statements; headings, section lookup and statements normalised to NFC on both sides; test names unchanged); see it fail against the English document (RED)
- [ ] 9.2 GREEN: translate `docs/CONFIDENCE.md` (same meaning, figures, table values, development questions, model and report path; numbers with a decimal point); `npx vitest run tests/unit/knowledge/confidence-doc.spec.ts` green; commit doc, test and nothing else together

## 10. `docs/DEPLOYMENT.md` and `docs/TESTING.md` in Spanish (design D10, D14) — `local-startup` → "The deployment and testing guides in Spanish"

- [ ] 10.1 Translate `docs/DEPLOYMENT.md`: `npm run up` / `npm run down` as the start/stop in any shell, `make up` / `make down` as the Git Bash/WSL equivalent, the step table of `up` (with `--wait`), `POSTGRES_PORT`, the `MISSING_CONFIG` row («copia `.env.example` a `.env` o define la variable»), the indexing section without "export them or use make", headings `Verificar una instalación` and `Indexar un repositorio (CLI)`; commands and pasted output verbatim
- [ ] 10.2 Translate `docs/TESTING.md`: the integration-database step as a labelled `bash` / `powershell` pair (D14; the PowerShell variant's session persistence and `Remove-Item Env:DATABASE_URL`; the test URL's port follows `.env`), the smoke check without `export`, `**Carreras conocidas.**`, the link to `DEPLOYMENT.md` → `Verificar una instalación`; the `CODEMIND_SKIP_DOTENV` switch explained in one sentence (D12)

## 11. `docs/DEMO.md` rewritten (design D8, D11, D15) — `local-startup` → "The demo guide runs the same in PowerShell and Bash"

- [ ] 11.1 RED: create `tests/unit/docs/guides.spec.ts` (forbidden forms including any `$` and lines starting with `NAME=`; the `Parar el sistema` assertion) with "The demo guide has no Bash-only command", "The demo guide is ordered for a first-time reader" and "The web walkthrough names what each screen shows" (its automatable part). See them fail against the English guide
- [ ] 11.2 Rewrite the first half of `docs/DEMO.md` in Spanish: `Cómo se capturó` (date, commit, machine, both shells, Node/npm, evaluation mode, the edits made to pasted output), `Antes de empezar` (`docker info`, `node -v`, `git --version`, how to recognise `port is already allocated` and change `POSTGRES_PORT` with the matching `DATABASE_URL` in `.env` with a text editor, `cp .env.example .env`) and `Paso 0 — Arrancar el sistema` (`npm run up`, a second terminal for the rest). Output blocks hold placeholders marked `[pendiente de la prueba desde cero]` until step 16 replaces them
- [ ] 11.2b Rewrite the second half: `Paso 1`…`Paso 6` as in `readme.md` §1.3 with `npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "…"` and `npm run demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44`, the expected exit codes stated in the text, `Comprobar la instalación` and `Parar el sistema` (Ctrl+C stated in text: `[up] stopped (Ctrl+C)` and then npm's `code 130` lines are the expected end; pasted output only for `npm run down`; the volume stays); the two structural scenarios of 11.1 green
- [ ] 11.3 Write `Recorrido por la web` from the wireframes (open `images/pantalla-1-seleccion.svg` and `images/pantalla-2-consulta.svg`) and the real pages (`packages/web/src/pages/ProjectPickerPage.tsx`, `AskPage.tsx` and their components): Screen 1 card, counts, «indexado»/«listo», «Explorar proyecto», the indexing hint; Screen 2 suggested golden questions, «HECHO»/«INFERIDO» with «verificado»/«sin verificar», evidence that expands (click, Enter, Space), the usage panel («Confianza», tokens, cost, latency, savings, cache), «Sin respuesta verificada» (a question that names nothing in the code), «Hace falta un modelo de lenguaje» (a free question in evaluation mode), and the unavailable-API alert with «Reintentar», shown by running only the web (`npm -w packages/web run dev`); deviations from the wireframes (data the seed lacks, Entrega 3 items) stated in the text; 11.1 green
- [ ] 11.4 RED → GREEN in `guides.spec.ts`: "Links to the guides' sections resolve" (GitHub slug rule of the scenario)

## 12. References to the guides and to `.env` (design D10)

- [ ] 12.1 `readme.md` §0, §1.2 (l. 147), §1.3, §1.4 (the start block as a `shell` block without `&&`: `git clone …` and `cd …` on two lines, then `npm run up`; start command `npm run up` with `make up` as the Git Bash/WSL alternative, `cp .env.example .env`, `POSTGRES_PORT` in the variables table, the start output excerpt and the DEMO step references) §2.4 (l. 658, 690), and every link to the renamed headings; `grep -n "make up\|export DATABASE_URL\|no leen\|do not read" readme.md` reviewed line by line
- [ ] 12.2 `docs/project-context.md`: Closed decision 1 (l. 38, evaluators start with `npm run up`, `make up` as alternative), l. 62 (`DATABASE_URL` from `.env`), l. 191 ("npm scripts do not load: export it"), l. 227 (native PowerShell), l. 1180–1181 ("does not read `.env`") — numbering of base `368dc38` —, Commands (`up`, `down`, `demo:ask`, `demo:excerpt`, the `.env` preload of the D4 scripts), Testing (`CODEMIND_SKIP_DOTENV`, D12), the `Known races` reference → `Carreras conocidas`, and the language exception of design D18 («Language exception, evaluator guides (DIS-102, author decision 2026-10-19): `docs/DEMO.md`, `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md` and `docs/TESTING.md` are written in Spanish, like `readme.md`; commands, pasted output, identifiers, error codes and paths stay verbatim. Every other document follows `base-standards.md` §2.»); `.env.example` comments that say npm scripts do not read `.env` (scripted edit, as 5.3)
- [ ] 12.3 `npx vitest run tests/unit/docs tests/unit/scripts tests/unit/knowledge/confidence-doc.spec.ts` green

## 13. Review and Update Existing Tests (MANDATORY)

- [ ] 13.1 Identify the tests affected: `grep -rn "CONFIDENCE.md\|make up\|db:migrate\|db:rollback\|npm.*run.*dev\|dev-register" tests packages/web/src`, plus every type error of `npm run typecheck`
- [ ] 13.2 Only the two tests that follow a modified requirement change (`confidence-doc.spec.ts`, task 9.1; "A failed retry keeps the alert", task 8.1); `migrations.spec.ts`, `dev-script.spec.ts` and every other test stay untouched; if another must change, stop and record why in the step 14 report, never weakening it
- [ ] 13.3 Confirm each `#### Scenario:` of the `local-startup` delta maps to a test with exactly the same name (grep each title in `tests/`), except the recorded checks "A guide command reads DATABASE_URL from .env" and "Up with Docker unavailable fails naming its first step" (15.4, 15.5), "The guide was followed on a clean clone in both shells" (16.3) and "The guides are in Spanish and say that .env is read" (17.1), and the review half of "The web walkthrough names what each screen shows" (16.4)

## 14. Run Tests and Verify Data State (MANDATORY)

- [ ] 14.1 Capture the pre-test baseline: the 0.4 indicators
- [ ] 14.2 Run the targeted tests: `npx vitest run tests/unit/scripts tests/unit/docs tests/unit/knowledge/confidence-doc.spec.ts packages/web/src/pages/ProjectPickerPage.test.tsx`
- [ ] 14.3 Run the required broader suite and gates: `npx vitest run` (integration database as in 0.4; D12 is shown only in the scratchpad clone of step 15, with its own `.env` and its own database, by `npx vitest run tests/integration/store/migrations.spec.ts` there; never in the working tree, where a D12 bug would roll back the author's database (design A11); the author's database counts unchanged), `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run test:a11y`, `npm run test:mutation` (score ≥ 80; `scripts/` is not in its scope); `npm run verify` on the seeded database (fingerprints unchanged)
- [ ] 14.4 Run `/privacy-ethics-check` over the diff (`.env` never printed, the loader prints no key or value, `demo:excerpt` confinement, no volume removed); record the result
- [ ] 14.5 Verify the post-test state: same 0.4 counts; no temporary `.env`, `.env` copies or `.stryker-tmp/` left; the author's `.env` (if any) unchanged (compare its `git hash-object` before and after without printing it). Restore and document if not
- [ ] 14.6 Create `openspec/changes/cross-shell-demo-spanish-docs/reports/YYYY-MM-DD-14-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6 (baseline, totals, Stryker score, privacy check, "no dependency installed: no npm package check needed")
- [ ] 14.7 Mark complete only after the tests pass and the report exists

## 15. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 15.1 Preconditions: Docker running; the author's `codemind` project untouched (`docker compose -p codemind ps` recorded); a scratchpad clone of the branch into a folder named `manual-15` (`git clone <repo> manual-15`; design D11: the folder name is the Compose project), checked with `docker compose config --format json` (its `name`) to be a project other than `codemind` before any `npm run up`; its `.env` is `cp .env.example .env` plus the scripted port edit of design D11 (A14, A19)
- [ ] 15.2 In the clone with the Bash tool and with the PowerShell tool: `npm run up` before any `npm install` (no `node_modules`) with `POSTGRES_PORT` free: the five `[up]` lines, `1 project loaded`, API and web listening; then stop the dev servers (process tree) and record the output
- [ ] 15.3 `npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"` (exit `0`, `HTTP 200`, `cacheHit: true`), a free question (`HTTP 200` `UNKNOWN` `llm-required`), an unknown id (`HTTP 404`, exit `1`), the API stopped (stderr message, exit `1`), one argument (exit `2`); `npm run demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44` (29 lines) and `../task-api/package.json:1-1` (exit `1`); in both shells
- [ ] 15.4 Recorded check "A guide command reads DATABASE_URL from .env": in a new terminal of each shell, without `DATABASE_URL` in the environment, `npm run cli -- projects` lists `acme-shop` (exit `0`); with `.env` moved aside, `MISSING_CONFIG` and exit `1`; `.env` put back
- [ ] 15.5 Recorded check "Up with Docker unavailable fails naming its first step" with `DOCKER_HOST=tcp://127.0.0.1:1` for that one command in each shell (design D17): the `[up]` failure line, no `npm install`, exit ≠ `0`; in PowerShell set and remove it in one line (`$env:DOCKER_HOST='tcp://127.0.0.1:1'; npm run up; Remove-Item Env:DOCKER_HOST`)
- [ ] 15.6 `npm run down` keeps the clone's volume (`docker volume ls`); `make up` from Git Bash in the clone reaches `[up] docker compose up -d --wait` and the rest of the sequence, `make down` stops it
- [ ] 15.7 `npm run db:migrate` with `DATABASE_URL` set in the shell to a URL with a wrong password while `.env` holds the right one: the shell's value wins (`db:migrate` fails for that URL, without printing it, and the clone's database is not migrated by it)
- [ ] 15.8 Restore: stop every dev server the agent started, `docker compose -p manual-15 down -v` for the clone's own project only (never `-v` on `codemind`), move the clone folders out of the scratchpad's working area without `rm -rf`; re-check the 0.4 indicators and `codemind_pgdata`; `C:/Users/cristina/Desktop/~` untouched
- [ ] 15.9 Document every command, exit code and output in `openspec/changes/cross-shell-demo-spanish-docs/reports/YYYY-MM-DD-15-manual-interface-testing.md` (mask the OS user name in paths), with the restoration of 15.8

## 16. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 16.1 Push the branch (`gh auth switch -u DisTinta`; `git -c credential.helper='!gh auth git-credential' push`) so the clean clone takes `origin/feature/DIS-102-cross-shell-demo-spanish-docs`
- [ ] 16.2 Clean clone `e2e-bash` in the scratchpad: follow `docs/DEMO.md` literally from `Antes de empezar` to `Parar el sistema` with the Bash tool (the "port taken" branch with a free `POSTGRES_PORT`), `npm run up` in the background and the other steps in a second shell; the "port taken" `.env` edit done as design D11 (scripted, UTF-8 without BOM, LF, never read or printed), recorded as the one deviation; record every output and exit code
- [ ] 16.2b Clean clone `e2e-pwsh`, after 16.2 is stopped: the same with the PowerShell tool (record `$PSVersionTable.PSVersion`)
- [ ] 16.3 Recorded check "The guide was followed on a clean clone in both shells": compare every output and exit code with the guide (ignoring only the fields it lists as changing; the Ctrl+C stop is not compared, design D11), check the accented questions reached the API intact in both shells; paste the real output into `docs/DEMO.md` replacing the 11.2 placeholders, update `Cómo se capturó`; if a command needed a shell-specific variant, add the labelled pair and note it for the PR; `guides.spec.ts` still green
- [ ] 16.4 Web walkthrough: with the clone's `npm run up` running, take screenshots of Screen 1 (API up; API down with only the web running), Screen 2 (a golden question answered with evidence expanded and the usage panel; a free question → «Hace falta un modelo de lenguaje»; a no-anchor question → «Sin respuesta verificada») with the browser-automation skill, save them as `reports/YYYY-MM-DD-16-<scenario>.png`, and review `Recorrido por la web` against them and the two wireframes (the review half of "The web walkthrough names what each screen shows"); fix the text where it differs
- [ ] 16.5 Restore as 15.8 (dev servers stopped, `docker compose -p e2e-bash down -v` and `-p e2e-pwsh`, clones moved aside)
- [ ] 16.6 Document both runs (shell, PowerShell version, commands, outputs, differences found and how the guide was adjusted) in `openspec/changes/cross-shell-demo-spanish-docs/reports/YYYY-MM-DD-16-clean-clone-run.md`, linking the screenshots

## 17. Update Technical Documentation (MANDATORY)

- [ ] 17.1 Recorded check "The guides are in Spanish and say that .env is read": review `docs/DEPLOYMENT.md` and `docs/TESTING.md` against their English version at the base commit (`git show 368dc38:docs/…`) section by section (same sections, figures, commands, output), and run the searches of the scenario (case-insensitive, backticks ignored) over `readme.md`, `docs/project-context.md`, the four guides and `.env.example` (counts only for `.env.example`), reviewing every hit; record the result in the step 14 report as an addendum
- [ ] 17.2 No ADR: the decisions are reversible and local to the start-up tooling (design D2–D18); confirm with the `adr-new` criteria and record "not warranted" in the step 14 report
- [ ] 17.3 Run `/update-docs` (with the D18 language exception of `docs/project-context.md` in force) and confirm the docs gate passes. Add the relevant AI prompts of DIS-102 to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 18. Pull request preparation

- [ ] 18.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-102 Enhanced D1–D11 and design D12–D18, A1–A18; the scripted `.env` edit of the clean-clone run as its one deviation), the clean-clone run of step 16 in both shells (which PowerShell, any shell-specific variant), "no dependency added, `package-lock.json` unchanged, no migration", and the two tests that follow modified requirements

## 19. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 19.1 Open the pull request against `feature/entrega-2-CRN` (authorised by ADR `20261016-autonomous-workflow-run-entrega-2`; cited by branch and name if it is not yet in the base branch; `gh` on the DisTinta account)
- [ ] 19.2 Set DIS-102 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 19.3 Confirm the PR's CI is green (`quality`, `verify`, `mutation`, `secrets`, `Frontend`); link the run in an addendum to the step 14 report
- [ ] 19.4 Run `/show-spec-working` (may reuse the step 15 and 16 evidence and screenshots); report `openspec/changes/cross-shell-demo-spanish-docs/reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 19.5 Run `/verify-against-spec`; report `openspec/changes/cross-shell-demo-spanish-docs/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 19.6 Run `/adversarial-review`; report `openspec/changes/cross-shell-demo-spanish-docs/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 19.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 19.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 19.9 `/opsx:archive`, and commit the archive to the same pull request; the agent merges only after the archive commit and with CI green (ADR `20261016-autonomous-workflow-run-entrega-2`, DIS-102 within the run as recorded in Enhanced; otherwise stop before the merge and leave DIS-102 In Review)
