## MODIFIED Requirements

### Requirement: One command starts the system

`npm run up` SHALL load `.env` (as in "Loading .env into a process", by default the repository root's
file) into the environment it gives every step, and then run, from the repository root and in this
order, each with the standard input, output and error of `up`: `docker compose up -d --wait`, `npm install`,
`npm run db:migrate`, `npm run db:seed`, `node fixtures/build-history.mjs acme-shop`,
`node fixtures/build-history.mjs task-api` and `npm run dev`.
Before each step it SHALL print one line `[up] <command>` to stdout. The npm steps SHALL run the npm
that started `up` (the `npm_execpath` npm gives its scripts, run by the same Node executable), never
through a shell; `npm_execpath` SHALL be read from the environment `up` was started with, before
`.env` is loaded, so a line of `.env` never names it; when it is not set there or is empty, `up` SHALL
run no step, write `[up] run it with npm run up` to stderr and exit `1`. The two fixture history steps
SHALL run `fixtures/build-history.mjs` with the argument `acme-shop` and then with the argument
`task-api`, with the same Node executable, never through a shell, every time `up` runs (each build is
deterministic: its `HEAD` is the `indexed_commit` of its project in the seed `seeds/graph-dump.sql`),
and each in a process that does not end on SIGINT before the builder has finished, so a Ctrl+C during
either step never leaves the fixture's tracked files modified; a step's own exit code after a Ctrl+C is
not specified, and `up` reports the stop as for any step. When a
step exits with a code other than `0`, `up` SHALL run no further step, write
`[up] "<command>" failed with exit code <n>` to stderr and exit with that code; when a step ends by
a signal, the line SHALL be `[up] "<command>" failed (<signal>)` and the exit code `1`; when a step
cannot be started, the line SHALL be `[up] "<command>" could not start (<error code>)` (`unknown`
when the error has no code) and the exit
code `1`. When every step exits `0`, `up` SHALL exit `0`. While a step runs, `up` SHALL NOT end on
SIGINT itself (the step receives the console's Ctrl+C on its own); when `up` has received SIGINT and
the running step then ends, whatever its code or signal, `up` SHALL run no further step, write
`[up] stopped (Ctrl+C)` to stderr instead of a failure line and exit `130`. `up` and the `.env` loader SHALL import only
Node built-in modules and files of `scripts/`, so `npm run up` works before `npm install`. Building
either fixture history SHALL change neither the seed's fingerprints nor the answers of evaluation mode
(a fixture's `.git` is ignored by git and is not a fingerprint input).

#### Scenario: Up runs the start sequence in order

- **GIVEN** a step runner double that records each call and returns exit code `0`, an injected
  environment with `npm_execpath` set and without `CODEMIND_SKIP_DOTENV` or `POSTGRES_PORT`, and a
  `.env` file given to `up` with `POSTGRES_PORT=5433`
- **WHEN** `up` runs
- **THEN** the runner received, in order, `docker compose up -d --wait`, then the Node executable with
  `npm_execpath` and `install`, `run db:migrate` and `run db:seed`, then the Node executable with the
  arguments `--import`, `./scripts/defer-ctrl-c.mjs`, `fixtures/build-history.mjs`, `acme-shop`, then the
  Node executable with the arguments `--import`, `./scripts/defer-ctrl-c.mjs`,
  `fixtures/build-history.mjs`, `task-api`, then the Node executable with `npm_execpath` and `run dev`;
  each from the repository root, with inherited standard streams, without a shell and with
  `POSTGRES_PORT` = `5433` in its environment
- **AND** stdout holds the seven `[up] <command>` lines in that order (the fifth is
  `[up] node fixtures/build-history.mjs acme-shop` and the sixth
  `[up] node fixtures/build-history.mjs task-api`), each printed before its step started, and `up`
  exits `0`

#### Scenario: Up ignores an npm_execpath of .env

- **GIVEN** an environment without `npm_execpath` and a `.env` file given to `up` with
  `npm_execpath=/tmp/not-npm.js`
- **WHEN** `up` runs
- **THEN** the runner received no call, stderr is exactly `[up] run it with npm run up`, and `up` exits `1`

#### Scenario: Up stops at the first failing step

- **GIVEN** a step runner double whose `npm install` call returns exit code `3`
- **WHEN** `up` runs
- **THEN** the runner received exactly two calls, `docker compose up -d --wait` and `npm install`
- **AND** stderr holds `[up] "npm install" failed with exit code 3`, and `up` exits `3`
- **AND** with a double whose first call ends by the signal `SIGINT`, the runner received one call,
  stderr holds `[up] "docker compose up -d --wait" failed (SIGINT)` and `up` exits `1`

#### Scenario: Ctrl+C stops up without a failure line

- **GIVEN** a step runner double whose `npm run dev` call ends with exit code `3221225786` after `up`
  received SIGINT while that call was running
- **WHEN** `up` runs
- **THEN** the runner received the seven calls, stderr holds `[up] stopped (Ctrl+C)` and no line with
  `failed`, and `up` exits `130`

#### Scenario: The history step finishes its work before ending on Ctrl+C

- **GIVEN** a Node process started the way `up` starts the fixture history step, running instead a
  script that receives SIGINT while it works and, after that, writes a marker file and then returns
  or, in a second run, calls `process.exit(1)`
- **WHEN** the process ends
- **THEN** the marker file exists (the work finished after SIGINT) and the process was not ended by a
  signal: it exits with the script's own code (`0` when the script returns, `1` when it calls
  `process.exit(1)` after the SIGINT)
- **AND** the same process without SIGINT exits `0`

#### Scenario: A step that cannot start stops up

- **GIVEN** a step runner double whose first call fails to start with the error code `ENOENT`
- **WHEN** `up` runs
- **THEN** the runner received exactly one call, stderr holds
  `[up] "docker compose up -d --wait" could not start (ENOENT)`, and `up` exits `1`

#### Scenario: Up needs npm to start it

- **GIVEN** an environment without `npm_execpath`
- **WHEN** `up` runs
- **THEN** the runner received no call, stderr holds `[up] run it with npm run up`, and `up` exits `1`

#### Scenario: The startup scripts need no installed dependency

- **WHEN** the import specifiers of every `.mjs` file of `scripts/` are read
- **THEN** each one is a Node built-in module (`node:` prefix) or a relative path to a file of
  `scripts/`

#### Scenario: Up with Docker unavailable fails naming its first step

- **GIVEN** a clone where Docker cannot be reached (`DOCKER_HOST` pointing at a closed local port)
- **WHEN** `npm run up` runs in PowerShell and in Bash
- **THEN** each prints `[up] docker compose up -d --wait`, then
  `[up] "docker compose up -d --wait" failed with exit code <n>` with `n` other than `0`, runs no
  `npm install`, and the command exits with a code other than `0`

#### Scenario: Up builds the fixture history the seed indexed

- **GIVEN** a clean clone of the change's branch without `fixtures/acme-shop/.git` nor
  `fixtures/task-api/.git`, with its own Compose project name and a free `POSTGRES_PORT`
- **WHEN** `npm run up` runs (a recorded check), is stopped (Ctrl+C, or by ending its process tree
  where the tool cannot send Ctrl+C) once the API listens, and runs a second time
- **THEN** each run prints `[up] node fixtures/build-history.mjs acme-shop` after `[up] npm run db:seed`,
  then `[up] node fixtures/build-history.mjs task-api`, both before `[up] npm run dev`, and both steps
  exit `0`
- **AND** after each run `git -C fixtures/acme-shop rev-parse HEAD` is
  `4f028db4d51a3321031f3a24b3f36240410ed38c` and `git -C fixtures/task-api rev-parse HEAD` is
  `83397076ae519d2cd8dc43af627e4efacae6ca21` (the `indexed_commit` of each project in
  `seeds/graph-dump.sql`), `git status --porcelain` of the clone is empty, `npm run verify` exits `0`,
  and `git hash-object` of `seeds/graph-dump.sql`, `seeds/cache/acme-shop.json`,
  `seeds/cache/task-api.json` and `fixtures/build-history.mjs` is the one of the branch
