# Show spec working: dis-105-npm-audit-debt (PR #69)

Agent's report (autonomous run, review step), 2026-10-27. Branch `feature/dis-105-npm-audit-debt` at
`f473bdd`, Windows 11, Git Bash, Node v24.11.1, npm 11.19.0. Author's database container
`codemind-postgres-1` up; the repository `.env` exists (not read by the agent, only used by the scripts).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| local-startup: The guide's scripts load .env and the quality scripts do not | `package.json` files read as JSON with `node -e`; greps over `scripts/` and `packages/*/src` | every script as required; no `load-env` in the 8 quality scripts nor in `dev-register.mjs`; `engines.node` `>=22.12`; no `process.loadEnvFile`, `node:util` or `--env-file` in `scripts/`; no `scripts/`, `load-env` or `.env` import in product code | yes | E1, E2 |
| local-startup: A guide command reads DATABASE_URL from .env (Bash) | `env -u DATABASE_URL npm run cli -- projects` in the repository (which has `.env`) | lists `acme-shop`, exit 0 | yes (Bash half) | E3 |
| local-startup: same scenario, error half | fresh clone of the pushed branch (no `.env`), `env -u DATABASE_URL npm run cli -- projects` | `MISSING_CONFIG` JSON on stderr, exit 1 | yes | E4 |
| local-startup: Every CI job installs Node 22 | both workflows parsed with the `yaml` package, every `actions/setup-node` step collected | 3 steps in `ci.yml` (quality, verify, mutation), 1 in `frontend.yml`, all `"22"`; engines major 22; no other workflow installs Node | yes | E5 |
| local-startup: npm audit on a clean clone | fresh clone, `npm ci`, `npm audit --audit-level=high`, `npm audit --json` | `found 0 vulnerabilities`, exit 0; JSON `vulnerabilities: {}`, all totals 0 (663 deps) | yes | E6 |
| project-picker: The indexing hint is text, not a control | Vite 8 dev server: `GET /src/pages/ProjectPickerPage.tsx`; `vite build` bundle grep | the served module and the production bundle contain «Desde la terminal · requiere Docker, Node 22.12+ y Git 2.45.1+ · por ahora solo PHP»; no «Node 20+» in the bundle | text yes; the "no link/button" half only through the component test | E7 |
| Runtime smoke after the major bumps (Vite 8, plugin-react 6, zod 4.6.7) | `npm run dev` (API + Vite), requests through the Vite proxy | shell 200, `/health` 200 `{"status":"ok"}`, invalid `POST /api/projects/:id/ask` 400 `VALIDATION_ERROR` with the zod 4 issue | n/a (no scenario; regression check) | E8 |

## Evidence

E1, scripts read as JSON:

```
cli => tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts
verify => tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts
db:migrate => tsx --import=./scripts/load-env.mjs packages/adapters/store-postgres/src/migrate.ts up
db:rollback => tsx --import=./scripts/load-env.mjs packages/adapters/store-postgres/src/migrate.ts down
db:seed => tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts
cache:build => tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/cache-build.ts
seed:build => tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-build.ts
up => node scripts/up.mjs
demo:ask => node scripts/demo-ask.mjs
demo:excerpt => node scripts/demo-excerpt.mjs
api dev => node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts
test / test:a11y / test:mutation / test:mutation:full / lint / lint:architecture / typecheck / docs:coverage load-env? false
engines.node => >=22.12
vitest ^4.1.12 stryker ^10.0.0 ^10.0.0 vite ^8.3.4 @types/node ^22.20.5
grep -c load-env packages/api/dev-register.mjs => 0
```

E2: `scripts/up.mjs` and `scripts/demo-ask.mjs` import `DOTENV_PATH, loadEnvFile` from `./env.mjs` and pass
`dotenvPath: DOTENV_PATH` to their entry guard (l.154 and l.173); `scripts/demo-excerpt.mjs` has no match.
`grep -rn -E "process\.loadEnvFile|node:util|--env-file" scripts/` exits 1 (no match). The import grep over
`packages/*/src` and `packages/adapters/*/src` finds nothing.

E3 (Bash, repository with `.env`):

```
DATABASE_URL in env: <unset>
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
EXIT 0
```

E4 (fresh clone, no `.env`):

```
EXIT 1
stderr:
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
```

E5:

```
.github/workflows/ci.yml quality actions/setup-node@v4 "22"
.github/workflows/ci.yml verify actions/setup-node@v4 "22"
.github/workflows/ci.yml mutation actions/setup-node@v4 "22"
.github/workflows/frontend.yml frontend actions/setup-node@v4 "22"
engines major 22
```

`claude-auto-review.yml` and `claude-interactive.yml` have no `setup-node` or `node-version`.

E6 (fresh clone of the pushed branch):

```
added 583 packages, and audited 593 packages in 1m
found 0 vulnerabilities
npm audit --audit-level=high -> found 0 vulnerabilities, AUDIT EXIT 0
{"vulnerabilities":{},"meta":{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0},"deps":663}
```

The same `npm ci` + `npm audit --audit-level=high` in the working copy also printed `found 0 vulnerabilities`, exit 0.

E7: `curl http://localhost:5173/src/pages/ProjectPickerPage.tsx | grep -o "Desde la terminal[^\"]*PHP"` printed
`Desde la terminal · requiere Docker, Node 22.12+ y Git 2.45.1+ · por ahora solo PHP`. `npm run build` in
`packages/web` (tsc + `vite build`) exited 0 (`✓ 50 modules transformed`, `dist/assets/index-CR0ijyXp.js
255.54 kB`); the bundle contains the new line and 0 occurrences of «Node 20+».

E8: `VITE v8.3.4 ready in 822 ms`, `Server listening at http://127.0.0.1:3000`.

```
shell 200
{"status":"ok"}                                   health 200
{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"invalid_type","message":"Invalid input: expected string, received undefined"}]}}}   ask-invalid 400
```

`GET /api/projects` answers 404 `NOT_FOUND`: there is no such route (Screen 1's list is static web data), so
this is expected, not a regression.

## State

- Before: `npm run cli -- projects` lists one project, `acme-shop` (174 nodes, 170 edges); ports 3000 and
  5173 free; `codemind-postgres-1` up.
- After: same single `acme-shop` row, 174 nodes, 170 edges; ports 3000 and 5173 free again (API and Vite
  process trees stopped with `taskkill /T`, `concurrently` exited); container untouched.
- Restored: yes. Nothing was written to the database (the only POST was rejected by validation).
  `packages/web/dist/` was rebuilt by `vite build`; it is git-ignored. The scratchpad clone
  (`review-clone`, outside the repository) was left in the session scratchpad: its recursive delete was
  blocked by the repository's shell policy.

## Not demonstrated

- **PowerShell half of "A guide command reads DATABASE_URL from .env":** the permission classifier denied
  running `npm run cli -- projects` through `powershell.exe`, as in step 8. Only the Bash terminal is
  shown with `.env`; step 8 showed PowerShell 7 with the variable set in the terminal.
- **Screen 1 in a real browser** (the "no link and no button named «Indexar»" half): no Playwright MCP or
  browser tool is available to this session. Covered by the component test
  `packages/web/src/pages/ProjectPickerPage.test.tsx` -> "The indexing hint is text, not a control" and the
  a11y suite, which run in the verification step.
- `npm run up` end to end on a clean clone was not repeated here (step 8 did it in Git Bash).

## Handoff

The change is **demonstrably working** for every scenario on the interfaces available: clean install with
no advisories, Node 22 everywhere in CI, the `.env` wiring unchanged on Node 22.12 tooling, the API and
the Vite 8 web running together, and the new hint served. Two halves remain covered only by tests or by
step 8 (PowerShell, real browser), for lack of permission or tooling, not because of a failure. No
screenshot was taken, so none was left at the repository root.
