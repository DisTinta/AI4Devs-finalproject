## Why

CM-HU-09 (DIS-29) promises: "Como desarrolladora que va a modificar un módulo, quiero preguntar en
lenguaje natural y recibir afirmaciones marcadas como hecho o inferencia con sus citas, o un `UNKNOWN`
honesto, para entender el comportamiento real sin fiarme de una explicación plausible." DIS-39 built
the `explain` use case in core, but nobody can reach it: `ask <project> <question>` in
`packages/cli/src/index.ts` is still a stub that prints `not implemented — pending Ticket 1/2`. This
is DIS-40 (CM-HU-09.3), whose user story reads: "Como desarrolladora que usa CODEMIND desde la
terminal, quiero ejecutar `npm run cli -- ask <proyecto> "<pregunta>"` y ver la respuesta con cada
afirmación tipada, sus evidencias y la marca `stale`, o `UNKNOWN` con su `reason`, para entender el
código sin abrir la web ni la API y saber qué parte de la respuesta es hecho, inferencia o
información desactualizada."

The decisions below were taken by the author during the refinement of DIS-40 (Linear, `[enhanced]`,
2026-10-13); their rationale is transcribed from there.

- **P1, the project is named, not identified**: `<project>` is only the name, matched exactly
  against the store's project listing. "Debe ser igualdad exacta, sin trim ni
  mayúsculas/minúsculas, porque PROJECT_NAME_TAKEN ya garantiza que el nombre es único. Aceptar
  también el id ampliaría la superficie del comando sin que nadie lo necesite ahora; si verify lo
  pide, se añade entonces."
- **P2, a connection pool, not a transaction**: "Con una transacción, la conexión quedaría idle in
  transaction hasta 120 s, bloqueando un VACUUM y ocupando una conexión. saveClaims ya es atómico en
  su propia conexión cuando trabaja sobre un pool (postgres-store.ts:56)."
- **P3, `UNKNOWN` exits with `0`**: "Es lo que pide PH-08 ("sin código de error propio"), y un
  script puede distinguirlo leyendo la primera línea de stdout."
- **P4, terminal format escaped line by line**: "El escape tiene que hacerse línea a línea; si no, el
  formato no funciona."
- **P5, an unsaved answer is still printed**: "La respuesta es válida aunque no se haya guardado, y
  la nota en stdout avisa a quien lee la terminal mientras el evento JSON sirve a quien lee el log.
  La nota va al final."

## What Changes

- New command `ask <project> <question>` in `packages/cli/src/commands/ask.ts`, run on its own
  `commander` command with injected streams, as `projects` and `index` already are; `index.ts`
  delegates `ask` to it and keeps the global `ask` entry only for `--help`.
- The command resolves the project name to its id through the store's listing (exact match), composes
  the real ports (Postgres store on a pool, git source tree, LLM from `LLM_*` with the daily budget
  when configured) and calls `explain` once with its default budget and hops.
- stdout holds only the answer, in a fixed plain-text format: the answer, the numbered statements with
  `[FACT]`/`[INFERENCE]`, `[stale]` and their cited spans, the evidence section with excerpts cut to
  5 lines, the prior claims when there are any, and `note: claims not saved` when the claims were not
  stored; or `UNKNOWN (<reason>)` with the evaluation-mode message for `llm-required`. Every
  untrusted text is escaped line by line for the terminal.
- stderr holds the answer's events as JSON lines and, on failure, one `{"error":{…}}` line. The
  question never reaches stderr, an error or a log.
- Exit codes: `0` for an answer, an `UNKNOWN` or the help; `2` for usage and an invalid question; `1`
  for configuration, connection, domain and unexpected errors.
- `@codemind/adapter-llm` becomes a dependency of `@codemind/cli` (`package.json`, project reference,
  run-time path).
- Documentation: `docs/project-context.md` stops calling `ask` a stub; `readme.md` §CLI says that in
  Entrega 2, without the answer cache, Q1 in evaluation mode answers `UNKNOWN (llm-required)`.

### Non-goals

- No `--json` output and no `--budget`/`--hops` options: `explain`'s defaults apply; JSON output waits
  until `verify` (CM-HU-14.1) needs it.
- No answer cache (DIS-21): in evaluation mode the sample questions answer `UNKNOWN (llm-required)`
  until then.
- No citation verification or `confidence` (DIS-68, CM-HU-11), no recomputation of stale claims
  (DIS-42), no prompt sanitisation (DIS-41).
- No HTTP `/ask` (CM-HU-12) and no web view.
- `impact` stays a stub.
- No change to core, its ports, the adapters or the `ExplainAnswer` contract; lookup by project id
  is not accepted.

## Capabilities

### New Capabilities

- `cli-ask`: the `ask` command — arguments, project resolution by exact name, composition of the
  ports, the plain-text answer format and its terminal escaping, the event and error lines on
  stderr, and the exit codes.

### Modified Capabilities

None. `explain` keeps its requirements: the command is the transport that writes its events, as the
`explain` spec ("Explain events and logging") already expects.

## Impact

- Code: `packages/cli/src/commands/ask.ts` (new), `packages/cli/src/index.ts`,
  `packages/cli/src/compose-index.ts` (exports `CONNECTION_TIMEOUT_MS`).
- Dependencies: `packages/cli/package.json`, `packages/cli/tsconfig.json`,
  `packages/cli/tsconfig.run.json` gain `@codemind/adapter-llm` (cli → adapter is allowed by
  `.dependency-cruiser.cjs`).
- Tests: `tests/unit/cli/ask-command.spec.ts` and `tests/integration/cli/ask-command.spec.ts` (new).
- Docs: `docs/project-context.md`, `readme.md`.
- Database: the command writes `claim` and `evidence` rows through `explain` (one atomic write per
  answer, on its own pooled connection); no schema change, no migration.
- Privacy and security: the terminal shows repository content (excerpts, paths) and model output, so
  every such text is escaped; the question, the database URL and `LLM_API_KEY` never appear in an
  error or a log line. No personal data is added.
