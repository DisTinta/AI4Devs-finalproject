# Step 8: manual interface testing (DIS-105)

Agent's report (autonomous run), 2026-10-27. Clone of the pushed branch at `4b1435a` (the Vitest 4.1.12 commit) in the session scratchpad, Git Bash, Node v24.11.1, npm 11.19.0.

## Constraints that shaped the run

- Port 3000 was held by a process outside this run (the author's API, answering `/health`). It was recorded and not touched. The clone ran with `POSTGRES_PORT=5433`, its `DATABASE_URL` and `PORT=3001` in the command's environment, and its `packages/web/vite.config.ts` proxy changed to 3001 **in the clone only**. Port 5173 was free.
- A `.env` file cannot be written or copied by the agent (hook deny rule), so the clone had no `.env`. The "reads DATABASE_URL from .env" half of the scenario "A guide command reads DATABASE_URL from .env" was therefore **not** exercised end to end; the variable came from the environment. The `.env` reader itself is covered by the unit tests of `scripts/env.mjs` and `tests/unit/scripts/wiring.spec.ts`, which pass.
- Docker Compose project and volume: `dis105-pwsh` (the clone's folder name; the run was Git Bash). PowerShell 7 `npm run up` was **not** captured: the permission classifier denied that command, and no second clone was made.

## 8.1 Clean clone

`npm run up` (no prior `npm ci`): Compose up, `npm install` (583 packages, `found 0 vulnerabilities`, deprecated: `whatwg-encoding@3.1.1`, `eslint@9.39.5`; install-scripts warning for `esbuild@0.28.2` and `tree-sitter-php@0.24.2`), migrations 0001 to 0004, seed (`1 project loaded`, `acme-shop` 174 nodes, 170 edges), fixture history (32 commits), then `VITE v8.3.4 ready in 1098 ms` on `http://localhost:5173/` and `Server listening at http://127.0.0.1:3001`. The whole output is in `docs/DEMO.md` -> `Paso 0`.

- `npm audit --audit-level=high`: `found 0 vulnerabilities`, exit 0.
- `npm audit --json`: `"vulnerabilities": {}`, totals all 0 (663 dependencies). No remaining advisory, so no `fixAvailable: false` entry.

## 8.2 System up

- `curl http://localhost:5173/` answered 200 (Vite 8) and `curl http://localhost:5173/health` answered 200 with `{"status":"ok"}` through the proxy (to the clone's API on 3001).
- `DATABASE_URL=… npm run cli -- projects` in Git Bash and in PowerShell 7 (variable set in the terminal): both list `acme-shop  a794456d-…  php/laravel  174 nodes · 170 edges  … sample`, exit 0.
- Error half: with `DATABASE_URL` unset and no `.env` in the clone, `npm run cli -- projects` prints `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` on stderr and exits 1. The "move `.env` aside" form was not needed because the clone has none.

## 8.3 Teardown

Done in step 9 (see its report).
