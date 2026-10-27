# Manual Interface Testing Report

- Date: 2026-10-27
- Change: ts-analyzer-structure
- Step: 7 Manual Interface Testing, 8 End-to-End Testing

## Interface

The change adds no HTTP endpoint, CLI command or job. Its interface is
`createTypeScriptAnalyzer().analyze`. It was exercised directly with a throwaway script in the session
scratchpad (`manual-ts-analyzer.mts`, outside the repository), over the 38 files listed by
`git -C fixtures/task-api ls-files`, plus an error-case input.

## Commands executed

- `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/manual-ts-analyzer.mts` from the repository root
- `git status --short fixtures/` (empty)
- `node scripts/dev-processes.mjs stop`

## Outputs: task-api (7.1)

- input files 38; files by kind: `source` 25, `test` 6, `doc` 2, `config` 5
- symbols by kind: `class` 7, `interface` 7, `function` 24, `method` 26
- edges: `imports/exact` 54, `extends/exact` 2, `implements/exact` 1, `tested_by/exact` 3, `describes/heuristic` 2
- diagnostics: none
- `src/domain/errors.ts`: `class DomainError 6-15`, `method DomainError::constructor 7-14`,
  `class TaskNotFoundError 17-21`, `method TaskNotFoundError::constructor 18-20`,
  `class IllegalStatusTransitionError 23-27`, `method IllegalStatusTransitionError::constructor 24-26`
- `tested_by`: `src/domain/task-status.ts` to `tests/unit/task-status.test.ts`, `src/services/task.filters.ts`
  to `tests/unit/task.filters.test.ts`, `src/services/task.service.ts` to `tests/unit/task.service.test.ts`

All of it matches the spec scenarios "The task-api files are classified", "Every class, interface and
function of task-api is listed", "The task-api errors and repository have exact spans", "The structural
edges of task-api" and "The unit tests of task-api cover their files".

## Outputs: error cases (7.2)

Input: an unparsable `tsconfig.json` (`{ "compilerOptions": `), `src/broken.ts` with a syntax error,
`src/ok.ts`, and `src/dup.ts` twice.

- the call resolved; symbols: `src/dup.ts class First` and `src/ok.ts class Ok`
- diagnostics, by path: `src/broken.ts` line 1 `Parameter declaration expected.`; `src/dup.ts`
  `duplicate path "src/dup.ts"; kept the first`; `tsconfig.json` line 1 `Expression expected.`

## State (7.3)

No state to restore: no database, the fixture is read-only. `git status --short fixtures/` is empty and
the dev processes were stopped.

## End-to-end (8.1)

Not applicable: no user interface reaches the analyzer until DIS-32 wires it into the CLI.

## Outcome

- Status: PASS
- Blocking issues: none
