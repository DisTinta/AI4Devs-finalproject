# Show Spec Working

- Date: 2026-10-28
- Change: task-api-seed-golden (DIS-32, PR #77, head `8c125f9`)
- Step: 12.3, pre-merge review, run in Git Bash over the local Docker Postgres

*Agent's text: autonomous run (docs/AUTONOMOUS-RUN.md §6), without the author.* The commands below were
run again in this step against the running system; the browser scenarios reuse the screenshots of step
10 (`./2026-10-28-10-end-to-end.md`), which this step did not repeat (the Playwright MCP server is not
available in the step).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| seed-load: The seed is loaded into an empty database (two projects) | `npm run db:seed` | `2 projects loaded` + both project lines, exit `0` | yes | below |
| verify-smoke: Every golden answer matches | `npm run verify` | six `✓` lines, `acme-shop: 3/3 …`, `task-api: 3/3 golden answers match` | yes | below |
| cli-projects: Sample and user projects are listed | `npm run -s cli -- projects` | both samples with ` sample` | yes | below |
| golden-answers: task-api's Q4 is answered UNKNOWN without anchor in evaluation mode | `ask task-api "¿Cómo se autentican los usuarios?"`, `LLM_BASE_URL` and `LLM_API_KEY` empty | `UNKNOWN (no-anchor)`, exit `0` | yes | below |
| golden-answers / ask: a task-api golden question is served from the cache | `ask task-api "¿Qué transiciones de estado son válidas?"`, evaluation mode | answer with evidence from `src/domain/task-status.ts` | yes | below |
| golden-answers: Project arguments are checked before anything else; unknown id | six `cache:build` runs | the four `USAGE` messages of the spec, in its order | yes | below |
| cli-indexing: An unsupported language is a usage error | `index task-api --language cobol` | `UNSUPPORTED_LANGUAGE`, `allowed` `["php","typescript"]`, exit `2` | yes | below |
| cli-indexing: A TypeScript repository is indexed with the TypeScript analyzer | `index task-api --name dis32-review-ts --language typescript` | exit `0`, 38 files, 64 symbols, 100 edges, framework `fastify (detected)` | yes | below |
| project-picker: Screen 1 shows the sample projects; ask-page: suggested questions | browser (step 10) | two cards; task-api's three suggested questions | yes | `./2026-10-28-screen-1-two-cards.png`, `./2026-10-28-screen-2-task-api-suggested.png`, `./2026-10-28-task-api-golden-answer.png`, `./2026-10-28-task-api-unknown.png`, `./2026-10-28-api-unavailable.png` |

## Evidence

```
$ npm run db:seed
2 projects loaded
  acme-shop  php/laravel  174 nodes · 170 edges
  task-api  typescript/fastify  102 nodes · 100 edges

$ npm run verify
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
✓ task-api Q1 ¿Cómo valida taskRoutes las peticiones entrantes?
✓ task-api Q2 ¿Qué hace buildPage con los resultados paginados?
✓ task-api Q3 ¿Qué transiciones de estado son válidas?
acme-shop: 3/3 golden answers match
task-api: 3/3 golden answers match

$ npm run -s cli -- projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z sample

$ LLM_BASE_URL= LLM_API_KEY= npm run -s cli -- ask task-api "¿Cómo se autentican los usuarios?"
UNKNOWN (no-anchor)

$ LLM_BASE_URL= LLM_API_KEY= npm run -s cli -- ask task-api "¿Qué transiciones de estado son válidas?"
Las transiciones de estado válidas son las que están definidas en la constante TRANSITIONS.

statements:
1. [FACT] La función allowedTransitions devuelve las transiciones permitidas desde un estado específico.
   evidence: src/domain/task-status.ts:29-31
2. [FACT] La función canTransition verifica si una transición de estado es válida.
   evidence: src/domain/task-status.ts:25-27
3. [INFERENCE] La función update en el servicio task.service.ts verifica las transiciones de estado antes de actualizar una tarea.
   evidence: src/services/task.service.ts:45-62
…

$ npm run -s cache:build -- Q1
{"error":{"code":"USAGE","message":"golden question ids need --project <name>","details":{"allowed":["acme-shop","task-api"]}}}
$ npm run -s cache:build -- --project nope
{"error":{"code":"USAGE","message":"unknown golden project","details":{"allowed":["acme-shop","task-api"]}}}
$ npm run -s cache:build -- --project
{"error":{"code":"USAGE","message":"usage: npm run cache:build [-- --project <name> [<id>...]]","details":{}}}
$ npm run -s cache:build -- --project=acme-shop
{"error":{"code":"USAGE","message":"usage: npm run cache:build [-- --project <name> [<id>...]]","details":{}}}
$ npm run -s cache:build -- --project task-api Q4
{"error":{"code":"USAGE","message":"unknown or repeated golden question id","details":{"allowed":["Q1","Q2","Q3"]}}}
$ npm run -s cache:build -- --project acme-shop --project task-api
{"error":{"code":"USAGE","message":"usage: npm run cache:build [-- --project <name> [<id>...]]","details":{}}}

$ ALLOWED_REPOS_DIR=<repo>/fixtures npm run -s cli -- index task-api --name dis32-review-cobol --language cobol
{"error":{"code":"UNSUPPORTED_LANGUAGE","message":"cobol: not supported","details":{"allowed":["php","typescript"]}}}
(exit 2)

$ ALLOWED_REPOS_DIR=<repo>/fixtures npm run -s cli -- index task-api --name dis32-review-ts --language typescript
Indexed project 3f164838-f2eb-479d-834d-ecd9a7510c47
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

## State

- Before: projects `acme-shop` (sample) and `task-api` (sample), as listed by `projects` above; `git status --short seeds/ packages/web/src/data` empty.
- After the index run: one more project, `dis32-review-ts`.
- Restored: yes. `DELETE FROM project WHERE name = 'dis32-review-ts'` (`DELETE 1`); `SELECT name, is_sample FROM project` gives `acme-shop | t`, `task-api | t`. No `cache:build` run reached a golden file (`git status --short seeds/` empty).

## Not demonstrated

- `seed:build` and a full `cache:build` were not re-run in this step (an hour of Ollama on CPU); their outputs are recorded in `./2026-10-28-8-test-and-state-verification.md` (6.1, 6.2), and the CI `verify` job checks the committed seed and golden files against the code.
- The PowerShell half of `docs/DEMO.md` stays with the author (design Follow-ups E12, destination C).

## Handoff

The change is demonstrably working: both samples load, `verify` checks six golden answers, task-api is
indexed with the TypeScript analyzer, and the argument and language errors match the spec. No screenshot
was left at the repository root.
