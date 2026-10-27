# Manual Interface Testing Report

- Date: 2026-10-27
- Change: ts-calls-exact
- Step: 6. Manual Interface Testing (agent's report, autonomous run)

## Interface
The change adds no HTTP endpoint, CLI command or job: its interface is `createTypeScriptAnalyzer().analyze`. It was exercised directly with a throwaway script in the session scratchpad (`manual-calls.ts`, not versioned) run from the repository root:

`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/manual-calls.ts`

The script reads the 38 tracked files of `fixtures/task-api` (`git -C fixtures/task-api ls-files`), analyses them, prints every `calls` edge as `source -> target`, the count of edges by kind and resolution, and the diagnostics. It then analyses an inline input.

## 6.1 Success path: task-api
- `tracked files 38`
- 37 `calls` edges, listed below as `file#symbol`; counts: `calls/exact` 37, `describes/heuristic` 2 (core, doc mentions), `extends/exact` 2, `implements/exact` 1, `imports/exact` 54, `tested_by/exact` 3; diagnostics `[]`.
- The 8 batch sites of `fixtures/README.md` with a target in the input are present: `TaskService::create -> newId` (1), `TaskService::update -> canTransition` (2), `TaskService::update -> TaskService::get` and `TaskService::get -> TaskNotFoundError::constructor` (3), `InMemoryTaskRepository::list -> applyFilters`, `-> sortTasks`, `-> buildPage` (4-6), `taskRoutes -> TasksController::create` (8), `TaskService::get -> TaskRepository::findById` (9).
- Sites 7 and 10 are absent: no edge has its source in `src/controllers/tasks.controller.ts`, and `applyFilters` has only `-> matchesSearch`.

Edges (one per line):

```
buildApp -> registerDb | registerErrorHandler | registerRoutes
IllegalStatusTransitionError::constructor -> DomainError::constructor
TaskNotFoundError::constructor -> DomainError::constructor
registerDb -> InMemoryTaskRepository::constructor | TaskService::constructor
InMemoryTaskRepository::list -> buildPage | applyFilters | sortTasks
healthRoutes -> HealthController::check
registerRoutes -> healthRoutes | taskRoutes
taskRoutes -> TasksController::create | getById | list | remove | update
main -> buildApp | loadEnv
applyFilters -> matchesSearch
compareBy -> priorityRank | compareNullableDate
sortTasks -> compareBy
TaskService::create -> TaskRepository::create | newId
TaskService::delete -> TaskNotFoundError::constructor | TaskRepository::delete
TaskService::get -> TaskNotFoundError::constructor | TaskRepository::findById
TaskService::list -> TaskRepository::list
TaskService::update -> IllegalStatusTransitionError::constructor | canTransition | TaskRepository::update | TaskService::get | pruneUndefined
buildTestApp -> buildApp
```

## 6.2 Error cases
Input: `src/a.ts` (`helper`), `src/broken.ts` (a call to `helper` plus `export class X { run( }`) and `src/z.ts` (`import { z } from 'zod'; z.string()`).
- Result: no edge at all (counts `[]`); diagnostics exactly one: `{"path":"src/broken.ts","message":"Parameter declaration expected.","line":3}`.
- The call from the file with a syntax error produces no `calls` edge, and the call to a package function resolves to nothing and is not a diagnostic.

## 6.3 State
- No state to restore (no database, fixture read-only): `git status --short fixtures/task-api` is empty.
- `node scripts/dev-processes.mjs stop` run at the end of the step.

## 7. End-to-end
- Not applicable: no user interface reaches the analyzer until DIS-32 wires it into the CLI.

## Outcome
- Status: PASS
- Blocking issues: none
