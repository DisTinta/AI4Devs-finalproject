## Context

See `proposal.md` → Why for the motivation and the author's decisions P1–P5. Current state:

- `packages/cli/src/index.ts` delegates `index` and `projects` to `runIndexCommand` /
  `runProjectsCommand(process.argv.slice(2), io)` before the global `commander` program; `ask` is a
  stub on that global program.
- `packages/cli/src/commands/projects.ts` is the template of a command: a fresh `Command` with
  `exitOverride` and `configureOutput` to the injected streams, `CliError` / `DatabaseUnavailable`
  from `packages/cli/src/compose-index.ts`, one `{"error":{…}}` line through `toTerminalSafeJson`,
  never touching `process`, returning the exit code.
- `explain(dependencies, request)` (`packages/core/src/explain/explain.ts`) returns an
  `ExplainAnswer` (`answered` with `persisted`, or `unknown` with `reason`) and never logs: its
  `events` are for the transport. It validates the request with `parseExplainRequest` (exported).
- `createPostgresStore({ pool })` commits each write on its own pooled connection;
  `llmConfigFromEnv` / `createLlm` live in `@codemind/adapter-llm`, which the CLI does not depend on
  yet; `withDailyBudget` (core) is applied by the composition root.
- `terminalSafeText` (`packages/cli/src/safe-json.ts`) quotes and escapes a whole value when it holds
  any C0 control (tab and line feed included) or a terminal-unsafe character; `createLogger(sink)`
  (`packages/cli/src/logger.ts`) writes one terminal-safe JSON line per call.

Constraint: only test → cli. No change to core, ports, adapters or api (ticket §3); if one turns out
to be needed, stop and reopen the decision with the author.

## Goals / Non-Goals

**Goals:**

- One command file, `packages/cli/src/commands/ask.ts`, testable without a database through seams,
  with its formatting in pure exported functions.
- A fixed check order so that every configuration and usage error happens before any connection.
- No connection held in a transaction while the model answers (P2).

**Non-Goals:**

- No shared "command kit" refactor of `projects.ts` / `index-repository.ts`: `ask` copies the
  pattern; extracting it is not asked for.
- No new `StorePort` method (such as a lookup by name): the listing is enough (D4).
- No end-to-end browser test: the change has no browser UI.

## Decisions

### D1 — `runAskCommand(argv, deps)` mirrors `runProjectsCommand`

`runAskCommand(argv: string[], deps: AskCommandDeps): Promise<number>`. `AskCommandDeps`:

- `env`, `stdout`, `stderr` (as `projects`);
- `openStore?: (databaseUrl: string) => Promise<OpenedStore>`, `OpenedStore = { store: StorePort;
  close(): Promise<void> }`; default in D3;
- `createLlm?: (config: LlmConfig) => LlmPort`; default `createLlm` of `@codemind/adapter-llm`;
- `source?: SourceTreePort`; default `createGitSourceTree()`;
- `explain?: typeof explain`; default core's `explain` (lets unit tests return stale statements,
  prior claims, `persisted: false` and failures directly);
- `now?: () => Date`; default the system clock.

`workspaceRoot` is not a seam: `REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))`
(from `packages/cli/src/commands/` in `src` or in `dist`, the repository root), like
`DEFAULT_REPO_ROOT` of `seed-build.ts`. The integration test stores an absolute `root_path`, which
does not depend on it.

Alternative: one `ports` factory as `index` has. Rejected: `ask` needs the store before the model
(the budget wraps the model over the store), so separate seams are simpler.

### D2 — Check order

1. `parseArguments` (fresh `Command('codemind ask')`, `.argument('<project>')`,
   `.argument('<question>')`, `allowExcessArguments(false)`, `exitOverride`, `configureOutput`);
   `--help`/`--version` → `0`.
2. Question: `parseExplainRequest({ projectId: '', question })` (core only checks `projectId` is a
   string); `InvalidExplainRequest` → `INVALID_EXPLAIN_REQUEST`, exit `2`, `details.field`.
3. `DATABASE_URL` trimmed → `MISSING_CONFIG`.
4. `llmConfigFromEnv(env)` → `LLM_CONFIG_INVALID` (read before the database, ticket §3).
5. `openStore(databaseUrl)` → `DATABASE_UNAVAILABLE`.
6. Resolve the name (D4) → `PROJECT_NOT_FOUND`.
7. `llm = cfg.mode === 'live' && cfg.dailyBudgetUsd !== undefined ? withDailyBudget(createLlm(cfg),
   { store, dailyBudgetUsd: cfg.dailyBudgetUsd }) : createLlm(cfg)` (the pattern documented in
   `packages/core/src/llm/budget.ts`).
8. `explain({ store, source, llm, workspaceRoot: REPO_ROOT, now }, { projectId, question })`.
9. Print (D5), write events (D7), return `0`.

Steps 5–9 run in `try { … } finally { await close().catch(() => undefined) }`.

`explain` validates the question again; harmless, and it keeps the CLI's early check aligned with
core's rule instead of copying it.

### D3 — Default `openStore`: a pool and a probe (P2)

```
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS, application_name: 'codemind-ask' });
pool.on('error', () => undefined);
try { (await pool.connect()).release(); }
catch { await pool.end().catch(() => undefined); throw new DatabaseUnavailable(); }
return { store: createPostgresStore({ pool }), close: () => pool.end() };
```

The probe's message never carries the driver's text (it names host and port). Any `pg` error after
the probe is not `DatabaseUnavailable`: it maps to `INTERNAL` (D6). The `error` listener keeps an
idle client's error from crashing the process. `application_name` makes the command's sessions
observable, so the integration test can check none is left (`pg_stat_activity`, polled briefly
because a backend ends asynchronously after `pool.end()`). `application_name` is an addition to P2
for observability only: `pg` merges the parsed `connectionString` over the explicit options, so a
`DATABASE_URL` carrying its own `application_name` wins; the test's `DATABASE_URL` has none.
`CONNECTION_TIMEOUT_MS` (10 s) is exported from `compose-index.ts` and reused, not copied.

Alternative: `defaultOpenTransaction` as `projects`. Rejected by the author (P2).

### D4 — Name resolution through `listProjects`

`(await store.listProjects()).find((project) => project.name === name)`: exact equality (P1), no
trim, no case folding; none → `CliError('PROJECT_NOT_FOUND', 1, 'project not found')`. The listing is
small (samples plus the user's projects). Alternative: a `getProjectByName` port method. Rejected:
it changes core and the adapters for no measurable gain.

### D5 — Formatting in pure functions

Exported from `ask.ts`, each returning the full text with its final line feed:

- `formatAnswer(answer: AnsweredExplain): string`
- `formatUnknown(answer: UnknownExplain): string` — `UNKNOWN (<reason>)` plus `message` when present.

Helpers (exported for the unit tests of the format, ticket §3 Done):

- `safeLines(text: string): string[]` — drop one trailing `\n` (or `\r\n`), `split(/\r?\n/)`, each
  line `replaceAll('\t', '  ')` then `terminalSafeText`. Tabs are expanded before escaping because
  `terminalSafeText` quotes any value holding a C0 control, tab included (P4). Used for the answer,
  statement texts and prior-claim texts (spec "Ask answer output", item 1).
- `excerptLines(excerpt: string): string[]` — the same split (one trailing break dropped), keep the
  first `MAX_EXCERPT_LINES = 5`, escape each kept line as `safeLines` does, append `… (+k lines)`
  when `k > 0` (the cut happens before escaping, ticket §3).

The layout is the spec's (`specs/cli-ask/spec.md` → "Ask answer output"); indentation constants: 3
spaces under a numbered item, 4 under an evidence span. A statement's `evidenceIds` are looked up in a
`Map` of `answer.evidence` by `id`; the evidence section deduplicates by `fileId:startLine:endLine`
in first-appearance order (a stored answer has one evidence entry per citation, so two statements
citing the same span would otherwise print it twice). An id missing from the map is skipped (it
cannot happen with `explain`'s answer; skipping keeps the formatter total). Prior claims reuse the
statement printer with their displayed `type` and `(no text)` for `null`; their spans are listed on
their `evidence:` line only, without excerpts, to keep the answer's evidence section about the answer.

### D6 — Error mapping in one function

`toFailure(error): CliFailure` (the existing type of `compose-index.ts`), messages built by the CLI:

| Error | Code | Exit | Message | Details |
|---|---|---|---|---|
| `CliError` | its code | its exit | its message | its details |
| `InvalidExplainRequest` | `INVALID_EXPLAIN_REQUEST` | 2 | `invalid question` | `{ field }` |
| `LlmConfigError` without `modelVariable` | `LLM_CONFIG_INVALID` | 1 | `<variable> is missing or invalid; see .env.example` | `{ variable }` |
| `LlmConfigError` with `modelVariable` | `LLM_CONFIG_INVALID` | 1 | `<variable> is set but <modelVariable> has no price in COST_TABLE; see .env.example` | `{ variable, modelVariable }` |
| `DatabaseUnavailable` | `DATABASE_UNAVAILABLE` | 1 | `cannot connect to the database` | `{}` |
| `ProjectNotFound` | `PROJECT_NOT_FOUND` | 1 | `project not found` | `{}` |
| `SourceUnavailable` | `SOURCE_UNAVAILABLE` | 1 | `the project's source cannot be read` | `{ reason, path? }` |
| `LlmUnavailable` | `LLM_UNAVAILABLE` | 1 | `the language model is unavailable` | `{ reason, status?, expected?, received?, systemCode? }` |
| `BudgetExhausted` | `BUDGET_EXHAUSTED` | 1 | `the daily LLM budget is exhausted` | `{ spentUsd, dailyBudgetUsd, resetsAt }` |
| anything else | `INTERNAL` | 1 | `unexpected error` | `{}` |

`USAGE` messages are fixed per `commander` error code and never copy `commander`'s message, which
quotes the offending argument (a question starting with `-` would be echoed):
`commander.missingArgument` → `missing argument`; `commander.excessArguments` → `too many arguments`;
`commander.unknownOption` → `unknown option`; any other code → `invalid usage`.
`commander.helpDisplayed` and `commander.version` exit `0`. Task 0.5 confirms these codes against
`commander` 12 with Context7.

`BUDGET_EXHAUSTED` is an error with exit `1` (ticket criterion 4). `docs/backend-standards.md` §8
describes degrading to cache-only with a warning; that waits for DIS-21's cache, as there is no cache
to degrade to yet.

`ProjectNotFound` from
`explain` (project deleted between steps 6 and 8) maps like the name miss. `InvalidStoreQuery`,
`ClaimWriteFailed` thrown outside `explain`'s catch, `RangeError` and every `pg` error are `INTERNAL`.

### D7 — Events after the answer

`for (const event of answer.events) logger.info({ ...event })` with `createLogger(deps.stderr)`, after
stdout is written. The events are closed types without question or model text (`explain` spec,
"Explain events and logging"); `toTerminalSafeJson` escapes them anyway.

### D8 — Wiring

- `packages/cli/package.json`: `"@codemind/adapter-llm": "*"`; then `npm install` to refresh the
  workspace link and `package-lock.json`.
- `packages/cli/tsconfig.json`: reference `{ "path": "../adapters/llm" }`.
- `packages/cli/tsconfig.run.json`: `"@codemind/adapter-llm": ["../adapters/llm/src/index.ts"]`.
- `packages/cli/src/index.ts`: `else if (process.argv[2] === 'ask') process.exitCode = await
  runAskCommand(process.argv.slice(2), io);`; the global `ask` entry stays without action, described
  "Ask a question about a project (see `codemind ask --help`)", like `projects`.

### D9 — Test placement

- `tests/unit/cli/ask-command.spec.ts`: argument, configuration, resolution, format, terminal-safety,
  failure and connection-closing cases, with a fake `openStore` over
  `createInMemoryStore({ projects: [acme-shop], … })` (`tests/support/in-memory-store.ts`, `close`
  recorded; its project ids are fresh UUIDs, so the id case uses `projectIds[0]`),
  `createScriptedLlm` (`tests/support/scripted-llm.ts`; its call count is `requests.length`),
  `createInMemorySourceTree` and, for stale statements, prior claims, the request check and thrown
  errors, a fake `explain`. Every run checks `close` was called once when `openStore` was called.
  The claim-write failure is `failClaimWrite: { claim: 0, evidence: 0 }`. The budget scenario wraps
  the store as `{ ...store, sumCostSince: async () => 2 }` (the double's own throws "not
  implemented") and sets an `LLM_MODEL` priced in `COST_TABLE`, or `llmConfigFromEnv` fails first.
- `tests/integration/cli/ask-command.spec.ts` (`describeWithDatabase`, `useTransactionPerTest`):
  `fixtures/acme-shop` copied without `.git` to a temporary directory, its history built there with
  `buildOne` (byte-for-byte deterministic, so `HEAD` equals the seed's `indexed_commit`; the test
  asserts it first); inside the harness transaction `DELETE FROM project`, `loadSeed`, and
  `UPDATE project SET root_path = <temp copy>`; `openStore` returns
  `createPostgresStore({ transaction: db() })` with a no-op `close`. The script picks spans by path
  and lines; the heuristic span is found by building the pack of Q1 first, as
  `tests/integration/explain/explain.spec.ts` does. Two cases use the default `openStore`: the
  unreachable URL, and an unknown project on the real `DATABASE_URL` followed by the
  `pg_stat_activity` check of D3.
- The unsaved-answer and terminal-safety scenarios run in the unit file (in-memory store with its
  claim-write failure hook; scripted output with `\u001b[2J`), where the input can hold what the seed
  cannot. A span's path comes from the store's graph, so the path holding `\u001b[2J` is a file path
  of the in-memory graph (`graph.files[].path`) with a symbol the question anchors on; the source
  double is keyed by that same path and its content holds `\u001b[2J` on one line.

Each `#### Scenario:` of the delta maps to one `it` named after it.

## Risks / Trade-offs

- [The model's answer and excerpts are untrusted text on a terminal] → line-by-line
  `terminalSafeText` on every printed value (D5), tested with ESC in each field.
- [A `pg` error after the probe could carry repository text] → mapped to `INTERNAL` with a fixed
  message; the original is never printed (D6).
- [`commander` messages quote arguments] → fixed `USAGE` messages (D6); tested with a sentinel option.
- [Listing every project per `ask`] → negligible at this size; revisit with a port method if the list
  grows (D4).
- [The integration test depends on the deterministic history builder] → the test asserts the built
  `HEAD` equals the seed's `indexed_commit` before asking, so a drift fails loudly, not as a wrong
  answer.
- [`pg_stat_activity` lags behind `pool.end()`] → poll for up to 2 s before failing.
- [`LlmConfig` holds `apiKey`] → the composition root never logs, serialises or prints the config
  (DIS-29 handoff note); errors carry only variable names; a scenario checks a sentinel key never
  reaches an output.
- [Parallel integration files (`ask-command.spec.ts`, `projects-command.spec.ts`) both
  `DELETE FROM project` and `loadSeed` with the fixed seed id] → they wait on each other's row locks
  inside their transactions; slower, not failing.
- [`.claude/sdd-harness.env` has a local, uncommitted `KIT_PROTECT_SPECS="0"`] → not part of this
  change; never staged.

## Migration Plan

No schema change. Rollback: revert the commits; `ask` returns to its stub and the CLI drops the
`adapter-llm` dependency.

## Follow-ups

Every finding of the pre-merge review gets an A/B/C/D destination here.

- **D — accepted, no change here** (spec audit m10): an `LLM_API_KEY` holding characters invalid in
  an HTTP header makes the request fail as `LlmUnavailable('network')` (DIS-29 handoff note). The
  error carries no key text, so `ask` prints `LLM_UNAVAILABLE` safely; a clearer message needs an
  adapter change, out of this change's scope (only test → cli).
