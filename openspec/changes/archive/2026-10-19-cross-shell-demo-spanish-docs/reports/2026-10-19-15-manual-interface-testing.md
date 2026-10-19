# Manual Interface Testing Report

- Date: 2026-10-19
- Change: cross-shell-demo-spanish-docs (DIS-102)
- Step: 15 — Manual Interface Testing

Paths are relative to the agent's scratchpad (`<scratchpad>`, under the OS temporary directory); the
OS user name is masked.

## Preconditions (15.1)

- Docker Desktop running (Engine 29.8.1, Compose v5.5.1). The author's project:
  `docker compose -p codemind ps` → `codemind-postgres-1 Up (healthy)` on `5432` (started by the agent
  for the step 14 baseline, see that report).
- Clone: `git -c core.longpaths=true clone -b feature/DIS-102-cross-shell-demo-spanish-docs <local repo> manual-15`
  at commit `c129278`. A first plain `git clone` failed with `Filename too long` on archived reports
  because the scratchpad path is long; the clone was moved to `<scratchpad>/trash/` and redone with
  `core.longpaths` (design A26).
- `docker compose config --format json` → `name` = `manual-15` (not `codemind`) before any `npm run up`.
- `.env`: `cp .env.example .env` (with absolute paths: the agent's `.env` deny rule resolved a relative
  target against the main checkout), then the scripted, line-anchored edit of design D11/A14:
  `POSTGRES_PORT=55433` and the port of `DATABASE_URL` to `55433` (2 lines edited, file never printed).

## 15.2 — `npm run up` before `npm install` (Bash)

`test ! -d node_modules` → no `node_modules`. `npm run up` (background, `DATABASE_URL` and `PORT` unset
in the shell):

```text
[up] docker compose up -d --wait
 … Volume manual-15_pgdata Created … Container manual-15-postgres-1 Healthy
[up] npm install
added 609 packages, and audited 619 packages in 1m
[up] npm run db:migrate
> tsx --import=./scripts/load-env.mjs packages/adapters/store-postgres/src/migrate.ts up
### MIGRATION 0001_graph-l1 (UP) ### … ### MIGRATION 0004_query-log-verification (UP) ###
[up] npm run db:seed
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
[up] npm run dev
[0] > node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts
[1]   ➜  Local:   http://localhost:5173/
[0] {"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}
```

The five `[up]` lines, `1 project loaded`, API and web listening. The PowerShell run before
`npm install` is the clean clone `e2e-pwsh` of step 16 (same result). Stopped by process tree
(`taskkill /T /F`); an MSYS `kill -INT` did not reach the native Node process, so the Ctrl+C end was not
captured (design D11). Ports 3000 and 5173 free afterwards.

## 15.3 — Demo helpers, in Bash and in PowerShell 7.6.6 (`npm.ps1`)

| Command | Bash | PowerShell |
|---|---|---|
| `npm run demo:ask -- a794456d-… "¿Cómo se calcula el precio final de un pedido?"` | `HTTP 200`, 4 statements, 4 evidence, `cacheHit: true`, exit `0` | same, `--` and accents intact |
| `npm run demo:ask -- a794456d-… "¿Qué hace ShippingService con los pedidos internacionales?"` | `HTTP 200`, `UNKNOWN`, `llm-required`, message, exit `0` | — |
| `npm run demo:ask -- 00000000-0000-0000-0000-000000000000 "…"` | `HTTP 404`, `PROJECT_NOT_FOUND` body, exit `1` | same, exit `1` |
| `npm run demo:ask -- …` with the API stopped | `demo:ask: the API is not reachable at http://127.0.0.1:3000 (start it with npm run up)`, exit `1` | same, exit `1` |
| `npm run demo:ask -- solo-un-argumento` | `usage: npm run demo:ask -- <projectId> "<question>"`, exit `2` | same, exit `2` |
| `npm run demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44` | 29 lines, the first `class PriceCalculator`, exit `0` | same (step 16) |
| `npm run demo:excerpt -- acme-shop ../task-api/package.json:1-1` | `demo:excerpt: ../task-api/package.json is outside fixtures/acme-shop`, exit `1` | same, exit `1` |

npm prints the project id of its `> node scripts/demo-ask.mjs …` echo line as `***` (it masks what looks
like a token); the API received the full id (HTTP 200). `docs/DEMO.md` says so.

## 15.4 — Recorded check “A guide command reads DATABASE_URL from .env”

- Bash, `DATABASE_URL` unset: `npm run cli -- projects` → `acme-shop  a794456d-…  php/laravel  174 nodes
  · 170 edges  2024-05-06T09:31:00.000Z sample`, exit `0`.
- PowerShell, `Remove-Item Env:DATABASE_URL`: same line, exit `0`.
- With the clone's `.env` moved aside (to `<scratchpad>`), in each shell:
  `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}`,
  exit `1`. `.env` put back (checked with `Test-Path` / `test -f`).

## 15.5 — Recorded check “Up with Docker unavailable fails naming its first step”

`DOCKER_HOST=tcp://127.0.0.1:1 npm run up` (Bash) and
`$env:DOCKER_HOST='tcp://127.0.0.1:1'; npm run up; Remove-Item Env:DOCKER_HOST` (PowerShell):

```text
[up] docker compose up -d --wait
error during connect: Get "http://127.0.0.1:1/_ping": dial tcp 127.0.0.1:1: connectex: No connection could be made because the target machine actively refused it.
[up] "docker compose up -d --wait" failed with exit code 1
```

No `npm install` line; exit `1` in both shells.

## 15.6 — `npm run down`, `make up`, `make down`

- `npm run down` → container and network removed, exit `0`; `docker volume ls` still lists
  `manual-15_pgdata`.
- `make up` from Git Bash (GNU make from WinGet): `npm run up`, then the five `[up]` lines,
  `1 project loaded` and `Server listening at http://127.0.0.1:3000`. Stopped by process tree.
- `make down` → container and network removed, exit `0`; the volume stays.

## 15.7 — The shell's variable wins over `.env`

With `.env` holding the right URL and the shell holding a URL with a wrong password
(`DATABASE_URL=postgresql://codemind:wrong-password@localhost:55433/codemind npm run db:migrate` in
Bash; `$env:DATABASE_URL='…'; npm run db:migrate` in PowerShell): `Migration up failed: password
authentication failed for user "codemind"`, exit `1` in both. The full output (saved to a file) does not
contain the URL or the password (`grep -c wrong-password` → 0). The clone's database had already been
migrated by `up`, and this command changed nothing.

## D12 demonstration (task 14.3)

In the clone, with its database running and its `.env` present:
`DATABASE_URL=postgresql://codemind:codemind@localhost:55432/codemind_test npx vitest run tests/integration/store/migrations.spec.ts`
→ 18 passed; the clone's own database had 4 rows in `pgmigrations` before and after.
`npm run verify` on the clone's database → `acme-shop: 3/3 golden answers match`, exit `0`.

## 15.8 — Restoration

- Dev servers stopped (process trees of `npm run up` and `make up`); ports 3000 and 5173 free.
- `docker compose -p manual-15 down -v` (the clone's own project only) → `manual-15_pgdata` removed.
- Clone moved to `<scratchpad>/trash/manual-15` (no `rm -rf`).
- Author's project: `codemind-postgres-1` healthy; `codemind_pgdata` present; counts project 1,
  claim 0, query_log 3, cache_entry 3 / `sum(hit_count)` 0 (same as the baseline).
- `C:/Users/<user>/Desktop/~`: not present when checked; never touched.

## Outcome

- Status: PASS
- Blocking issues: none
