# Clean-Clone Run Report (criterion E)

- Date: 2026-10-19
- Change: cross-shell-demo-spanish-docs (DIS-102)
- Step: 16 — End-to-End Testing: `docs/DEMO.md` followed on a clean clone, once per shell

Paths are relative to the agent's scratchpad (`<scratchpad>`); the OS user name is masked.

## Setup

- 16.1: `gh auth switch -u DisTinta`; `git -c credential.helper='!gh auth git-credential' push -u origin
  feature/DIS-102-cross-shell-demo-spanish-docs` (new branch on GitHub, commit `c129278`).
- Clones of `https://github.com/DisTinta/AI4Devs-finalproject.git`, branch
  `feature/DIS-102-cross-shell-demo-spanish-docs`, commit `c129278`, one after the other:
  `e2e-bash` (Bash tool: GNU bash 5.2.26, MINGW64) and `e2e-pwsh` (PowerShell tool: PowerShell
  **7.6.6**, `npm` resolved to `npm.ps1`). Both with `git -c core.longpaths=true` (design A26). Compose
  project names `e2e-bash` and `e2e-pwsh` (checked with `docker compose config --format json`).
- Machine: Windows 11 Pro, Docker Engine 29.8.1 / Compose v5.5.1, Node v24.11.1, npm 11.19.0,
  Git 2.45.1.windows.1. The author's `codemind-postgres-1` held port 5432 during both runs.

## The run, step by step (both shells)

| Guide step | Command | Bash | PowerShell |
|---|---|---|---|
| Antes de empezar | `docker info` / `node -v` / `git --version` | exit 0 / v24.11.1 / 2.45.1 | same |
| Antes de empezar | `cp .env.example .env` | done with absolute paths (deny rule, A26) | `Copy-Item` with absolute paths; the `cp` alias checked separately (`Get-Alias cp` → `Copy-Item`, a test copy worked) |
| Paso 0, first try | `npm run up` | stopped at its first step: `Bind for 0.0.0.0:5432 failed: port is already allocated`, `[up] "docker compose up -d --wait" failed with exit code 1`, exit 1 | same |
| Antes de empezar, port taken | edit `.env` | scripted line-anchored edit (A14): `POSTGRES_PORT=55434` and the `DATABASE_URL` port | same with `55435` |
| Paso 0 | `npm run up` | five `[up]` lines, 609 packages installed, 4 migrations, `1 project loaded`, web on 5173, API on 3000 | same |
| Paso 0 | `npm run cli -- projects` | `acme-shop …`, exit 0 | identical |
| Paso 1 | `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` | answer, 4 statements, exit 0 | identical |
| Paso 1 | `npm run demo:ask -- a794456d-… "¿Cómo se calcula…?"` | `HTTP 200`, 4/4, `cacheHit: true`, exit 0 | identical (except `latencyMs`) |
| Paso 2 | `npm run demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44` | 29 lines, exit 0 | identical |
| Paso 3 | `npm run cli -- ask acme-shop "¿Cómo se gestionan los reembolsos de un pedido?"` | `UNKNOWN (no-anchor)`, exit 0 | identical |
| Paso 4 | `npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"` | `not implemented — pending Ticket 1/2`, exit 0 | identical |
| Paso 5 | `npm run demo:ask -- …` (same question, then the variant without accents) | `HTTP 200`, `cacheHit: true` both, exit 0 | identical (except `latencyMs`) |
| Paso 6 | `npm run cli -- ask task-api "¿Cómo se calcula…?"` | `PROJECT_NOT_FOUND` on stderr, exit 1 | identical |
| Comprobar la instalación | `npm run verify` | `3/3 golden answers match`, exit 0 | identical |
| Parar el sistema | Ctrl+C, then `npm run down` | `up` stopped by process tree (not Ctrl+C, D11); `npm run down` removed container and network, exit 0, volume kept | same |

## 16.3 — Recorded check “The guide was followed on a clean clone in both shells”

- Every output was saved per command and the two shells' files were compared with `diff` after
  normalising CRLF and `latencyMs`: **0 differing lines** for all eleven commands of steps 0–6, the check
  and `npm run down` (apart from the Compose prefix `e2e-bash` / `e2e-pwsh`, which is the folder name).
- Each output matches the guide apart from the fields the guide lists as changing; the pasted blocks of
  `docs/DEMO.md` are these outputs (PowerShell run for steps 0-projects to `npm run down`, Bash run for
  `npm run up`, both identical), with the edits the guide lists ((a) cut after the start lines, (c) no
  colour codes, (d) `<host>`).
- The accented questions reached the API intact in both shells: the golden question was a cache hit
  (`HTTP 200`, 4 statements) — a mangled question would have been `UNKNOWN (llm-required)` — and the
  CLI echoed `¿Cómo se calcula el precio final de un pedido?` byte for byte.
- No command needed a shell-specific variant: with PowerShell 7.6.6, `npm.ps1` kept `--` and the
  accents. Windows PowerShell 5.1 was not exercised (design Risks).
- Deviations from “literally”: the `.env` port edit was scripted (A14); `cp` ran with absolute paths
  and `git clone` with `core.longpaths` (A26); the Ctrl+C stop was not captured (D11); `npm run up` ran
  in the background with the other steps in a second shell, as the guide says.
- `guides.spec.ts` green after pasting (4 tests).

## Findings that changed the guide or the code

- `tsx --import ./scripts/load-env.mjs --tsconfig …` failed with `node.exe: bad option: --tsconfig`
  (exit 9) when first run by hand on `npm run verify`: fixed with the one-token form
  `--import=./scripts/load-env.mjs` (design A24, spec scenario updated, commit `a5b8094`), before the
  clean clones.
- npm 11.19.0 printed no `npm error` line for a script that exited `1` or `130`: the guide's `Paso 6`
  note no longer mentions them and `Parar el sistema` says they *may* appear (design A25, spec text
  updated).
- npm masks the UUID of `demo:ask` in its echo line as `***`: stated in `Cómo se capturó`.

## 16.4 — Web walkthrough

With the `e2e-bash` system running, screenshots taken with the browser-automation skill (headless
Chromium, 1280×900):

- `./2026-10-19-16-screen-1-api-up.png` — Screen 1: header, title, the acme-shop card (53 ficheros,
  121 símbolos, 170 aristas, 32 commits), «✓ indexado», «listo», «Explorar proyecto →», the indexing hint.
- `./2026-10-19-16-screen-2-answer-evidence-usage.png` — Screen 2 after the first suggested question:
  project bar, field, «Prueba:» with the three golden questions, «RESPUESTA» with four numbered
  statements («HECHO»/«verificado» ×2, «INFERIDO»/«sin verificar» ×2, «Evidencia: ev-n»), «EVIDENCIA»
  with ev-1 expanded (`aria-expanded="true"`, the 29 lines of `PriceCalculator.php:16-44`), and the usage
  panel «Confianza 0.78 · 0 tokens · $0 · 37 ms», «ahorro 100 % vs bruto», «caché ✓», «7 123 tokens sin
  selección de contexto → 0 con CODEMIND».
- `./2026-10-19-16-screen-2-llm-required.png` — a free question («¿Qué hace ShippingService con los
  pedidos internacionales?») → «Hace falta un modelo de lenguaje».
- `./2026-10-19-16-screen-2-unknown.png` — the refunds question → «Sin respuesta verificada», the
  `no-anchor` sentence and «Motivo: no-anchor».
- `./2026-10-19-16-screen-1-api-down.png` — after `npm run down`, only `npm -w packages/web run dev`
  running: the card without «listo» and the alert «La API de CODEMIND no está disponible. … Arráncala
  con npm run up y pulsa Reintentar.» with «Reintentar»; pressing it sent one more check and the alert
  stayed (the Vite proxy answers `/health` with 500 while the API is down).

Review of `Recorrido por la web` against these screenshots and the two wireframes: every element it
describes is on the page in the order the page shows it. Two refinements were made to the text: step 7
now names the «Evidencia: ev-1» line and the highlighted inferred statements, and step 9 quotes the
captured figures. The listed deviations from the wireframes (one card, real counts, no «⟳» or PR
evidence, golden suggestions, indexing as a hint, cache-hit usage figures) hold.

## 16.5 — Restoration

- Dev servers stopped by process tree after each run (and the web-only server); ports 3000 and 5173
  free.
- `docker compose -p e2e-bash down -v` and `docker compose -p e2e-pwsh down -v` (the clones' own
  projects only; never `-v` on `codemind`); both volumes gone.
- Clones moved to `<scratchpad>/trash/` (no `rm -rf`).
- Author's project unchanged: `codemind-postgres-1` healthy, `codemind_pgdata` present, counts as in the
  baseline. `C:/Users/<user>/Desktop/~` never touched.

## Outcome

- Status: PASS
- Blocking issues: none
