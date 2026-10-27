# Show spec working: ts-calls-exact

- Date: 2026-10-27
- Change: ts-calls-exact (DIS-31), PR #75
- Run by: agent, review step of an autonomous run (agent's text)

The change adds no HTTP endpoint, CLI command or job: its interface is
`createTypeScriptAnalyzer().analyze` (DIS-32 wires it into the CLI). It was exercised directly with a
throwaway script in the session scratchpad (`demo-calls.mts`, not versioned), run from the repository
root in Git Bash:

`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/demo-calls.mts`

The script reads the 38 tracked files of `fixtures/task-api` (`git -C fixtures/task-api ls-files`),
analyses them twice (the second time with the input reversed), validates the result with
`validateGraph`, and then analyses the inline inputs of four scenarios of the spec plus a call to a
package function.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The calls of task-api | `analyze` over the 38 tracked files | 37 `calls` edges, all `exact/ts-compiler`, the exact list of the scenario | Yes | task-api output below |
| What the compiler cannot resolve has no calls edge | same run | no edge from `src/controllers/tasks.controller.ts`; `applyFilters` → only `matchesSearch`; no `TasksController::constructor` symbol; diagnostics `[]` | Yes | task-api output below |
| Compiler-resolved call forms | inline input of the scenario | the five edges of the scenario | Yes | scenario output below |
| Only a constructor declared in the class itself is a target | inline input of the scenario | `f` → `A::constructor`, `V::constructor` (line 4), `pick` | Yes | scenario output below |
| A callee typed by a function's type is not that function (error case) | inline input of the scenario | no edge, diagnostics `[]` | Yes | scenario output below |
| A file with a syntax error neither originates nor receives calls (error case) | inline input of the scenario | no edge, one diagnostic for `src/broken.ts` | Yes | scenario output below |
| Analysis contract: order of the inputs does not affect the result | task-api analysed with the input reversed | `reversed input equal: true` | Yes | task-api output below |
| Analysis contract: valid graph | `validateGraph` of the task-api result | 0 violations | Yes | task-api output below |
| A call to a package function (error case, `import { z } from 'zod'`) | inline input | no edge, no diagnostic | Yes (target outside the input) | scenario output below |

The other scenarios of "TypeScript calls" (overloads, abstract and interface methods, type errors,
callbacks, references, call sites outside a symbol, dropped duplicates) are pinned by
`tests/unit/analyzers/typescript/calls.spec.ts` (green, see the verify-against-spec report) and were
also probed through the same interface by the adversarial review (report of the same date).

## Evidence

task-api:

```
tracked files 38
calls 37; resolutions ["exact/ts-compiler"]
  src/app.ts buildApp -> registerDb
  src/app.ts buildApp -> registerErrorHandler
  src/app.ts buildApp -> registerRoutes
  src/domain/errors.ts IllegalStatusTransitionError::constructor -> DomainError::constructor
  src/domain/errors.ts TaskNotFoundError::constructor -> DomainError::constructor
  src/plugins/db.ts registerDb -> InMemoryTaskRepository::constructor
  src/plugins/db.ts registerDb -> TaskService::constructor
  src/repositories/in-memory-task.repository.ts InMemoryTaskRepository::list -> buildPage
  src/repositories/in-memory-task.repository.ts InMemoryTaskRepository::list -> applyFilters
  src/repositories/in-memory-task.repository.ts InMemoryTaskRepository::list -> sortTasks
  src/routes/health.routes.ts healthRoutes -> HealthController::check
  src/routes/index.ts registerRoutes -> healthRoutes
  src/routes/index.ts registerRoutes -> taskRoutes
  src/routes/tasks.routes.ts taskRoutes -> TasksController::create
  src/routes/tasks.routes.ts taskRoutes -> TasksController::getById
  src/routes/tasks.routes.ts taskRoutes -> TasksController::list
  src/routes/tasks.routes.ts taskRoutes -> TasksController::remove
  src/routes/tasks.routes.ts taskRoutes -> TasksController::update
  src/server.ts main -> buildApp
  src/server.ts main -> loadEnv
  src/services/task.filters.ts applyFilters -> matchesSearch
  src/services/task.filters.ts compareBy -> priorityRank
  src/services/task.filters.ts compareBy -> compareNullableDate
  src/services/task.filters.ts sortTasks -> compareBy
  src/services/task.service.ts TaskService::create -> TaskRepository::create
  src/services/task.service.ts TaskService::create -> newId
  src/services/task.service.ts TaskService::delete -> TaskNotFoundError::constructor
  src/services/task.service.ts TaskService::delete -> TaskRepository::delete
  src/services/task.service.ts TaskService::get -> TaskNotFoundError::constructor
  src/services/task.service.ts TaskService::get -> TaskRepository::findById
  src/services/task.service.ts TaskService::list -> TaskRepository::list
  src/services/task.service.ts TaskService::update -> IllegalStatusTransitionError::constructor
  src/services/task.service.ts TaskService::update -> canTransition
  src/services/task.service.ts TaskService::update -> TaskRepository::update
  src/services/task.service.ts TaskService::update -> TaskService::get
  src/services/task.service.ts TaskService::update -> pruneUndefined
  tests/helpers/build-app.ts buildTestApp -> buildApp
diagnostics []
reversed input equal: true
graph violations 0
TasksController::constructor symbol exists: false
```

The 8 batch sites of `fixtures/README.md` with a target in the input are present (sites 1-6, 8, 9);
sites 7 and 10 have no edge, as the oracle now says.

Inline scenarios:

```
Compiler-resolved call forms: calls=["Child::again@2 -> Base::hello@1","Child::constructor@2 -> Base::constructor@1","Child::run@2 -> Base::constructor@1","Child::run@2 -> Base::hello@1","Child::run@2 -> helper@2"] diagnostics=[]
Only a constructor declared in the class itself is a target: calls=["f@6 -> A::constructor@1","f@6 -> V::constructor@4","f@6 -> pick@5"] diagnostics=[]
A callee typed by a function type (error case): calls=[] diagnostics=[]
A file with a syntax error (error case): calls=[] diagnostics=[{"path":"src/broken.ts","message":"Parameter declaration expected.","line":3}]
A call to a package function (error case): calls=[] diagnostics=[]
```

## State

- Before: `git status --short fixtures/` empty.
- After: `git status --short fixtures/` empty.
- Restored: yes, nothing to restore (no database, no write; the fixture is read-only input).

## Not demonstrated

- No browser UI or CLI reaches the analyzer until DIS-32; nothing else is missing.

## Handoff

The change is demonstrably working: the real interface produces exactly the edges and the absences
the scenarios state, on task-api and on the inline inputs, including the error cases. No screenshot
was taken and none was left at the repository root.
