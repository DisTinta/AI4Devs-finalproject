# Manual Interface Testing Report

- Date: 2026-10-28
- Change: task-api-seed-golden
- Step: 9, Manual Interface Testing (Git Bash, database seeded with `npm run db:seed`)

*Agent's text: autonomous run, without the author.*

## 9.1 Success path

`npm run cli -- projects` (exit `0`):

```
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z sample
```

`npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"` (evaluation mode, answered from the cache, exit `0`):

```
La función buildPage convierte los resultados paginados en un objeto Page.

statements:
1. [FACT] La función buildPage toma cuatro parámetros: items, total, page y pageSize.
   evidence: src/domain/pagination.ts:13-21
2. [FACT] La función buildPage devuelve un objeto Page con las propiedades items, total, page, pageSize y pageCount.
   evidence: src/domain/pagination.ts:13-21

evidence:
src/domain/pagination.ts:13-21
    export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
      return {
        items,
        total,
        page,
    … (+4 lines)
```

`npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"` (evaluation mode, exit `0`): `UNKNOWN (no-anchor)`, never an answer.

`npm run cli -- ask task-api "¿Cómo valida taskRoutes las peticiones entrantes?"` (the new Q1 text, exit `0`): answered from the cache with five statements and evidence from `src/routes/tasks.routes.ts`, `src/controllers/tasks.controller.ts` and `src/services/task.service.ts`.

## 9.2 Mutating operation, restored

`ALLOWED_REPOS_DIR=<repo>/fixtures npm run cli -- index task-api --name dis32-manual-ts --language typescript` (history of task-api already rebuilt): exit `0`, report:

```
Indexed project a55604f0-1aff-4ffd-8699-ff0dc3ddbc82
  commit:      83397076ae519d2cd8dc43af627e4efacae6ca21
  framework:   fastify (detected)
  files:       38 (0 deleted)
  symbols:     64
  commits:     28
  edges:       100 total / 97 exact / 3 heuristic
  redactions:  1 in files, 0 in commit messages
  skipped:     0
  diagnostics: 0
```

The project was then deleted (`DELETE 1`); the database holds again `acme-shop:true,task-api:true`.

## 9.3 Error cases

- `index … --language cobol`: `{"error":{"code":"UNSUPPORTED_LANGUAGE","message":"cobol: not supported","details":{"allowed":["php","typescript"]}}}`
- `npm run cache:build -- Q1`: `USAGE`, `golden question ids need --project <name>`, `allowed` `["acme-shop","task-api"]`
- `npm run cache:build -- --project nope`: `USAGE`, `unknown golden project`
- `npm run cache:build -- --project task-api Q4`: `USAGE`, `unknown or repeated golden question id`, `allowed` `["Q1","Q2","Q3"]`
- `git status --short seeds/` is empty afterwards.
- `AUTHOR_HASH_SALT= npm run seed:build`: `{"error":{"code":"MISSING_CONFIG","message":"AUTHOR_HASH_SALT is not set","details":{"variable":"AUTHOR_HASH_SALT"}}}`; the seed and the constant are unchanged (`git status --short seeds/ packages/web/src/data` empty).

## 9.4 PowerShell half (destination C)

The author runs, in a new PowerShell terminal, `npm run db:seed`, `npm run verify` and `npm run cli -- ask task-api "¿Cómo valida taskRoutes las peticiones entrantes?"` as `docs/DEMO.md` writes them (design Follow-ups E12, SA16; checklist in the Spanish comment on DIS-32). The agent ran the same commands in Git Bash: `npm run db:seed` printed `2 projects loaded` and the two project lines; `npm run verify` printed the six `✓` lines and both `3/3` lines and exited `0`; the `ask` is the last command of 9.1.

## 9.5 Processes

`node scripts/dev-processes.mjs stop` was run after the end-to-end step; no process of the repository is left.

## Outcome

- Status: PASS
- Blocking issues: none
