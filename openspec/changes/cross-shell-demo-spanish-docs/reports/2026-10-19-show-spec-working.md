# Show Spec Working Report

- Date: 2026-10-19
- Change: cross-shell-demo-spanish-docs (DIS-102)
- Step: 19.4 — `/show-spec-working`
- Commit exercised: `b23658e` (HEAD of `origin/feature/DIS-102-cross-shell-demo-spanish-docs`)

A fresh run on the final commit, in a new clone, complementing the step 15 (`c129278`) and step 16
(`c129278`) evidence. Between `c129278` and `b23658e` only documentation and reports changed
(`git diff --stat c129278 b23658e -- scripts packages package.json Makefile docker-compose.yml .env.example`
is empty), so the step 15 and 16 results still describe the code; this run re-exercises the real
interface on the final commit anyway. Paths are relative to the agent's scratchpad (`<scratchpad>`);
the OS user name is masked.

## Setup

- `git -c core.longpaths=true clone -b feature/DIS-102-cross-shell-demo-spanish-docs https://github.com/DisTinta/AI4Devs-finalproject.git ssw-102`
  → `b23658e`; no `node_modules`; `docker compose config --format json` → `name` = `ssw-102`.
- `.env`: `cp .env.example .env`, then the scripted line-anchored edit of design D11/A14
  (`POSTGRES_PORT=55436` and the `DATABASE_URL` port; 2 lines, file never printed; 0 CR).
- Shells: Bash tool (GNU bash 5.2, MINGW64) and PowerShell tool (PowerShell 7.6.6, `npm` →
  `npm.ps1`). Node v24.11.1, npm 11.19.0, Docker Compose v5.5.1.
- `DATABASE_URL` and `PORT` unset in both shells (`unset`, `Remove-Item Env:`).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The .env grammar of .env.example is read; Lines that do not match are ignored… | `npx vitest run tests/unit/scripts/env.spec.ts` (in the targeted run) | passed | yes | Targeted run |
| Values of .env fill only the variables the environment lacks | Real CLI: `DATABASE_URL=…wrong-password… npm run --silent cli -- projects` with `.env` holding the right URL | `DATABASE_UNAVAILABLE`, exit 1; the URL is not printed (`grep -c wrong-password` → 0) | yes (the shell wins) | E5 |
| Without .env the environment is unchanged | `.env` moved aside, `npm run --silent cli -- projects` | `MISSING_CONFIG`, exit 1, no warning line | yes | E5 |
| An unreadable .env is skipped with a warning | `.env` replaced by a directory, `npm run --silent cli -- projects` and `npm run --silent demo:ask -- …` | exactly one `warning: .env not read (EISDIR)` per process, then `MISSING_CONFIG` / `HTTP 200` | yes (one line, code in parentheses, at most once per process) | E5 |
| The loaded .env is the repository root's; The test suite never reads .env | unit tests; real CLI with `CODEMIND_SKIP_DOTENV=1` | passed; `MISSING_CONFIG` with `.env` present | yes | Targeted run, E5 |
| The guide's scripts load .env and the quality scripts do not | `wiring.spec.ts`; the npm echo lines of the run (`tsx --import=./scripts/load-env.mjs …`, `node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts`) | passed; echo lines as specified | yes | E2 |
| A guide command reads DATABASE_URL from .env | `npm run --silent cli -- projects`, no `DATABASE_URL`, Bash and PowerShell | `acme-shop  a794456d-…  php/laravel  174 nodes · 170 edges …`, exit 0 in both; without `.env`, `MISSING_CONFIG`, exit 1 | yes | E3, E6 |
| Up runs the start sequence in order | `npm run up` before `npm install` (Bash) | five `[up]` lines in order, 4 migrations, `1 project loaded`, web on 5173, API on 3000 | yes | E2 |
| Up needs npm to start it | `node scripts/up.mjs` | `[up] run it with npm run up`, exit 1, no step | yes | E1 |
| Up with Docker unavailable fails naming its first step | `DOCKER_HOST=tcp://127.0.0.1:1 npm run up` (Bash; PowerShell in step 15.5) | `[up] docker compose up -d --wait`, the `failed with exit code 1` line, no `npm install`, exit 1, `node_modules` still absent | yes | E1 |
| Up stops at the first failing step; Ctrl+C stops up…; A step that cannot start stops up | `up.spec.ts` (runner doubles) | passed | yes (doubles; Ctrl+C cannot be sent to a detached native process, design D11) | Targeted run |
| The startup scripts need no installed dependency | `npm run up` in a clone with no `node_modules` reached `npm install` | yes; `wiring.spec.ts` passed | yes | E2 |
| Down keeps the data volume | `npm run down` | container and network removed, exit 0, `ssw-102_pgdata` still listed | yes | E7 |
| Make delegates to the npm commands | `wiring.spec.ts`; `make up` / `make down` run in step 15.6 | passed | yes | Targeted run, step 15 report |
| The Postgres port follows POSTGRES_PORT | `npm run up` with `POSTGRES_PORT=55436` while the author's container holds 5432 | Postgres published on 55436, migrations and seed through the `.env` URL | yes | E2 |
| An answered question prints its status and summary | `npm run --silent demo:ask -- a794456d-… "¿Cómo se calcula el precio final de un pedido?"` (Bash and PowerShell) | `HTTP 200`, `statements: 4`, `evidence: 4`, `usage` with `cacheHit: true`, exit 0 in both | yes; the accented question reached the API intact (a mangled one is not a cache hit) | E3, E6 |
| An UNKNOWN answer prints its reason | free question about ShippingService (Bash and PowerShell) | `HTTP 200`, `{ answer: "UNKNOWN", reason: "llm-required", message: … }`, exit 0 | yes | E3, E6 |
| An error status prints the error body | unknown project id | `HTTP 404`, the `PROJECT_NOT_FOUND` body indented, exit 1 | yes | E3 |
| An unreachable API is reported | `PORT=1 npm run --silent demo:ask -- …` | `demo:ask: the API is not reachable at http://127.0.0.1:1 (start it with npm run up)`, exit 1, stdout empty | yes | E3 |
| demo:ask reads PORT from .env | `demo-ask.spec.ts`; real `PORT=abc` | `demo:ask: PORT must be a port number`, exit 2 | yes | Targeted run, E3 |
| Missing arguments are a usage error | one argument, three arguments (Bash; one argument in PowerShell) | the usage line, exit 2 | yes | E3, E6 |
| An excerpt prints exactly the cited lines | `npm run --silent demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44` (Bash and PowerShell) | 29 lines, first `class PriceCalculator`, stderr empty, exit 0; `cmp` with `sed -n 16,44p` of the fixture: identical | yes | E4, E6 |
| Paths outside the project are refused | `../task-api/package.json:1-1`, an absolute path (MSYS and Windows forms), `app/../../acme-shop/../../package.json:1-1`, `app\..\..\task-api\package.json:1-1`; projects `..` and `.` | `… is outside fixtures/acme-shop` / `unknown project ..` / `unknown project .`, exit 1, stdout empty | yes | E4 |
| A missing file or a range past its end is reported | `app/Nope.php:1-2`, `app/Services:1-2`, `…PriceCalculator.php:16-9999` | `not found in fixtures/acme-shop` ×2, `has 44 lines`, exit 1, stdout empty | yes | E4 |
| A malformed citation is a usage error | no range, `0-3`, `9-3`, `a-b`, only `acme-shop` | the usage line, exit 2 | yes | E4 |
| The web walkthrough names what each screen shows (review half) | screenshots of the running pages against the wireframes and `Recorrido por la web` | every element present in the described order | yes | Screenshots |
| API status on Screen 1 (modified hint) | only the web running (`npm -w packages/web run dev`) | alert «La API de CODEMIND no está disponible. … Arráncala con npm run up y pulsa Reintentar.», `<code>npm run up</code>`, no «listo» | yes | Screenshot 3 |
| The published weights…; The confidence document states its limits | `confidence-doc.spec.ts` | passed | yes | Targeted run |
| The demo guide has no Bash-only command; …ordered for a first-time reader; Links to the guides' sections resolve | `guides.spec.ts` | passed | yes | Targeted run |
| Comprobar la instalación | `npm run --silent verify` | `acme-shop: 3/3 golden answers match`, exit 0 | yes | E8 |

Targeted run: `npx vitest run tests/unit/scripts tests/unit/docs tests/unit/knowledge/confidence-doc.spec.ts packages/web/src/pages/ProjectPickerPage.test.tsx --reporter=verbose`
→ 8 files, 45 tests passed; every `#### Scenario:` name of the three deltas appears among them except
the recorded checks (demonstrated above and in the step 15–16 reports).

## Evidence

E1 — before any `npm install` (Bash):

```text
$ node scripts/up.mjs
[up] run it with npm run up
exit 1
$ DOCKER_HOST=tcp://127.0.0.1:1 npm run up
> codemind@0.0.1 up
> node scripts/up.mjs
[up] docker compose up -d --wait
error during connect: Get "http://127.0.0.1:1/_ping": dial tcp 127.0.0.1:1: connectex: No connection could be made because the target machine actively refused it.
[up] "docker compose up -d --wait" failed with exit code 1
exit 1
still no node_modules
```

E2 — `npm run up` (Bash, background; colour codes and blank lines removed, `npm install` warnings cut):

```text
> codemind@0.0.1 up
> node scripts/up.mjs
[up] docker compose up -d --wait
 Volume ssw-102_pgdata Created … Container ssw-102-postgres-1 Healthy
[up] npm install
added 609 packages, and audited 619 packages in 1m
[up] npm run db:migrate
> tsx --import=./scripts/load-env.mjs packages/adapters/store-postgres/src/migrate.ts up
### MIGRATION 0001_graph-l1 (UP) ### … ### MIGRATION 0004_query-log-verification (UP) ###
[up] npm run db:seed
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
[up] npm run dev
[0] > node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts
[1]   ➜  Local:   http://localhost:5173/
[0] {"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}
```

E3 — demo helpers and CLI (Bash; `latencyMs` changes on every run):

```text
$ npm run --silent demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"
HTTP 200
{ "statements": 4, "evidence": 4, "usage": { …, "latencyMs": 59, "cacheHit": true, … } }
exit 0
$ npm run --silent demo:ask -- a794456d-… "¿Qué hace ShippingService con los pedidos internacionales?"
HTTP 200
{ "answer": "UNKNOWN", "reason": "llm-required", "message": "evaluation mode (cache-only): set LLM_* to enable free-form asks" }
exit 0
$ npm run --silent demo:ask -- 00000000-0000-0000-0000-000000000000 "…"
HTTP 404
{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }
exit 1
$ npm run --silent demo:ask -- solo-un-argumento        → usage: npm run demo:ask -- <projectId> "<question>"   exit 2
$ npm run --silent demo:ask -- a b c                    → same, exit 2
$ PORT=abc npm run --silent demo:ask -- a794456d-… x    → demo:ask: PORT must be a port number   exit 2
$ PORT=1 npm run --silent demo:ask -- a794456d-… x      → demo:ask: the API is not reachable at http://127.0.0.1:1 (start it with npm run up)   exit 1
$ npm run --silent cli -- projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
exit 0
```

(The JSON bodies above are folded onto one line here; the command printed them indented with two
spaces.)

E4 — `demo:excerpt` (Bash; stdout line count, stderr, exit):

```text
acme-shop app/Services/PriceCalculator.php:16-44          → 29 lines, first "class PriceCalculator", stderr empty, exit 0 (cmp with the fixture's lines 16-44: identical)
acme-shop ../task-api/package.json:1-1                    → demo:excerpt: ../task-api/package.json is outside fixtures/acme-shop   exit 1
acme-shop <clone>/package.json:1-1 (MSYS absolute)        → … is outside fixtures/acme-shop   exit 1
acme-shop C:/…/fixtures/acme-shop/app/Services/PriceCalculator.php:1-1 (Windows absolute, inside the fixture) → … is outside fixtures/acme-shop   exit 1
acme-shop app/../../acme-shop/../../package.json:1-1      → … is outside fixtures/acme-shop   exit 1
acme-shop app\..\..\task-api\package.json:1-1             → … is outside fixtures/acme-shop   exit 1
.. package.json:1-1                                       → demo:excerpt: unknown project ..   exit 1
. package.json:1-1                                        → demo:excerpt: unknown project .    exit 1
acme-shop app/Nope.php:1-2                                → demo:excerpt: app/Nope.php not found in fixtures/acme-shop   exit 1
acme-shop app/Services:1-2                                → demo:excerpt: app/Services not found in fixtures/acme-shop   exit 1
acme-shop app/Services/PriceCalculator.php:16-9999        → demo:excerpt: app/Services/PriceCalculator.php has 44 lines   exit 1
acme-shop …PriceCalculator.php:0-3 | :9-3 | :a-b | (no range) ; only acme-shop → usage: npm run demo:excerpt -- <project> <path>:<start>-<end>   exit 2 (each)
```

Every refusal had empty stdout. Two Windows-only probes were also run: `C:app/Services/PriceCalculator.php:1-1`
(a drive-relative path) and `APP/SERVICES/PRICECALCULATOR.PHP:1-1` (another case) each printed the
fixture's line 1 with exit 0: both resolve inside `fixtures/acme-shop` on a case-insensitive Windows
file system, so the confinement holds (see the adversarial review).

E5 — `.env` states (Bash, `DATABASE_URL` unset):

```text
## no .env
$ npm run --silent cli -- projects
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit 1
## .env is a directory
$ npm run --silent cli -- projects
warning: .env not read (EISDIR)
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit 1
$ npm run --silent demo:ask -- a794456d-… "¿Cómo se calcula el precio final de un pedido?"
warning: .env not read (EISDIR)
HTTP 200 …
exit 0
.env restored (file)
## shell DATABASE_URL beats .env
exit 1
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
0        ← grep -c wrong-password of the output
## CODEMIND_SKIP_DOTENV=1
$ npm run --silent cli -- projects
{"error":{"code":"MISSING_CONFIG",…}}
exit 1
```

E6 — PowerShell 7.6.6 (`npm.ps1`), same clone, same running system:

```text
> npm run --silent cli -- projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
exit 0
> npm run --silent demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"
exit 0
HTTP 200  "statements": 4, "evidence": 4, "cacheHit": true
> npm run --silent demo:ask -- a794456d-… "¿Qué hace ShippingService con los pedidos internacionales?"
HTTP 200 { "answer": "UNKNOWN", "reason": "llm-required", … }   exit 0
> npm run --silent demo:ask -- solo-un-argumento
usage: npm run demo:ask -- <projectId> "<question>"   exit 2
> npm run --silent demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44
exit 0; lines 29; first: class PriceCalculator
> npm run --silent demo:excerpt -- acme-shop ../task-api/package.json:1-1
demo:excerpt: ../task-api/package.json is outside fixtures/acme-shop   exit 1
> npm run --silent cli -- ask acme-shop "¿Cómo se gestionan los reembolsos de un pedido?"
UNKNOWN (no-anchor)   exit 0
```

E7 — stop (Bash): the `up` process tree stopped with `taskkill /T /F` (Ctrl+C cannot reach a detached
native process, design D11); ports 3000 and 5173 free. Then:

```text
$ npm run down
> docker compose down
 Container ssw-102-postgres-1 Removed
 Network ssw-102_default Removed
exit 0
ssw-102_pgdata         ← docker volume ls: the volume stays
```

E8 — `npm run --silent verify` (before the stop):

```text
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
exit 0
```

Screenshots (browser-automation skill, headless Chromium, 1280×900, compared with
`images/pantalla-1-seleccion.svg` and `images/pantalla-2-consulta.svg`):

1. [`./2026-10-19-ssw-screen-1-api-up.png`](./2026-10-19-ssw-screen-1-api-up.png) — header, «Elige un
   proyecto para explorar», the acme-shop card (53 ficheros, 121 símbolos, 170 aristas, 32 commits),
   «✓ indexado», «listo», «Explorar proyecto →», the indexing hint. Same layout and order as the
   wireframe (one card instead of the wireframe's examples: the documented deviation).
2. [`./2026-10-19-ssw-screen-2-answer.png`](./2026-10-19-ssw-screen-2-answer.png) — after
   «Explorar proyecto» and the first suggested question: project bar, field, «Prueba:» with the three
   golden questions, «RESPUESTA» with four statements («HECHO»/«verificado» ×2,
   «INFERIDO»/«sin verificar» ×2, «Evidencia: ev-n»), «EVIDENCIA» with ev-1 expanded
   (`aria-expanded="true"`, the 29 lines), the usage panel «Confianza 0.78 · 0 tokens · $0 · 49 ms»,
   «ahorro 100 % vs bruto», «caché ✓», «7 123 tokens sin selección de contexto → 0 con CODEMIND».
   No console error; one `ERR_ABORTED` on `/health` is the check Screen 1 cancels when the page is left
   ("Leaving Screen 1 cancels a pending check").
3. [`./2026-10-19-ssw-screen-1-api-down.png`](./2026-10-19-ssw-screen-1-api-down.png) — after
   `npm run down`, only `npm -w packages/web run dev`: the card without «listo» and the alert
   «La API de CODEMIND no está disponible. Puedes ver los proyectos, pero no preguntar hasta que
   vuelva. Arráncala con npm run up y pulsa Reintentar.» with `<code>npm run up</code>` and
   «Reintentar». The console error is the Vite proxy's 500 for `/health` while the API is down
   (expected).

The «Hace falta un modelo de lenguaje» and «Sin respuesta verificada» screens are not re-captured: the
same API answers produced them in step 16 (`./2026-10-19-16-screen-2-llm-required.png`,
`./2026-10-19-16-screen-2-unknown.png`) and E3/E6 show the API still returns `llm-required` and
`no-anchor` for those questions on `b23658e`.

## State

- Before: the author's `codemind` project `codemind-postgres-1` healthy on 5432 with `codemind_pgdata`;
  counts project 1, claim 0, query_log 3, cache_entry 3 / `sum(hit_count)` 0 (step 14 baseline); no
  `ssw-102` container or volume; ports 3000 and 5173 free.
- After: the same counts (`1|0|3|3|0`), `codemind_pgdata` present; no `ssw-102` container or volume;
  ports 3000 and 5173 free.
- Restored: yes — dev servers stopped by process tree (`up` and the web-only Vite), `docker compose -p
  ssw-102 down -v` (the clone's own project only, never `-v` on `codemind`), the clone moved to
  `<scratchpad>/trash/ssw-102-ssw` (no `rm -rf`). The author's database was never a target of this
  run. `C:/Users/<user>/Desktop/~`: not present, not touched.

## Not demonstrated

- The Ctrl+C end (`[up] stopped (Ctrl+C)`, exit 130) on a real console: the agent's tools start `npm
  run up` detached, so no console Ctrl+C can be delivered (design D11); covered by the runner-double
  test "Ctrl+C stops up without a failure line".
- Windows PowerShell 5.1 (only PowerShell 7.6.6 was exercised; design Risks).

## Handoff

The change is **demonstrably working** on its final commit: every scenario of the three deltas was
exercised through the real commands in Bash and (for the shell-sensitive ones) PowerShell, or through
its passing scenario test where the scenario is defined on doubles; the two recorded web states were
captured and match the wireframes and the guide. No screenshot was written at the repository root
(all three are under `openspec/changes/cross-shell-demo-spanish-docs/reports/`).
