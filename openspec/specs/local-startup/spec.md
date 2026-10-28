# local-startup Specification

## Purpose

Lets an evaluator who clones CODEMIND on Windows, macOS or Linux start, stop and demonstrate the
system locally with the same commands in PowerShell and in Bash: the repository's `.env` is read by
the commands of the guide without exporting anything by hand, one command starts everything, and the
demo, deployment and testing guides are written in Spanish with steps that run as-is in either shell.

## Requirements

### Requirement: The .env file grammar

The startup tooling SHALL read `.env` as UTF-8 text, dropping a leading byte-order mark, splitting it
into lines on LF and removing a trailing CR from each line. Each line SHALL be read as follows:

- a line holding only spaces and tabs, or whose first character other than a space or tab is `#`, is
  ignored;
- an assignment is optional spaces or tabs, a key matching `[A-Za-z_][A-Za-z0-9_]*`, optional spaces or
  tabs, `=`, and the raw value: the rest of the line with its leading and trailing spaces and tabs
  removed;
- when the raw value starts with `"` or `'` and that same quote appears again later in it, the value
  is the text between the opening quote and that next occurrence, taken verbatim (no escape sequence),
  and whatever follows the closing quote is ignored;
- otherwise the value is the text after `=` up to the first `#` preceded, in that text, by a space or
  a tab (so a `#` right after `=` and a blank starts a comment too), with its leading and trailing
  spaces and tabs removed; an opening quote without its closing one is part of the value;
- `$NAME` and `${NAME}` are kept literally (no expansion), and an empty value is the empty string;
- any other line (no `=`, a key that does not match, `export KEY=value`) is ignored;
- when a key is assigned more than once, the last assignment wins.

#### Scenario: The .env grammar of .env.example is read

- **GIVEN** a file with the lines `# comment`, `   # indented comment`, an empty line,
  `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind`, `PORT=`,
  `LLM_MODEL=qwen2.5-coder # inline comment`, `HOST = 127.0.0.1`, `A="quoted # not a comment"`,
  `B='single'  # after`, `C=a#b` and `D=${HOME}/x`
- **WHEN** it is parsed
- **THEN** the result is exactly `{ DATABASE_URL: "postgresql://codemind:codemind@localhost:5432/codemind",
  PORT: "", LLM_MODEL: "qwen2.5-coder", HOST: "127.0.0.1", A: "quoted # not a comment", B: "single",
  C: "a#b", D: "${HOME}/x" }`

#### Scenario: Lines that do not match are ignored and the last assignment wins

- **GIVEN** a file starting with a byte-order mark, with CRLF line endings and the lines `not a line`,
  `1BAD=x`, `export E=y`, `=z`, `F="open`, `G=1` and `G=2`
- **WHEN** it is parsed
- **THEN** the result is exactly `{ F: "\"open", G: "2" }`

#### Scenario: A comment after an empty value leaves the value empty

- **GIVEN** a file with the lines `E= # set it here`, `H=<tab># after a tab` and `I=#kept`
- **WHEN** it is parsed
- **THEN** the result is exactly `{ E: "", H: "", I: "#kept" }`

### Requirement: Loading .env into a process

Loading `.env` SHALL read, by default, the file `.env` at the root of the repository (the directory
that holds `scripts/`), located from the loader's own file and never from the working directory; the
commands that load it themselves (`up`, `demo:ask`) SHALL accept another path only from their tests. For each key
it parses, it SHALL set the process environment variable only when the environment does not already
hold that key; a key that is present, even with an empty value, SHALL keep its value. When the file
does not exist, loading SHALL change nothing and print nothing. When the file exists but cannot be
read, loading SHALL change nothing and write exactly one line to stderr that starts with
`warning: .env not read (` followed by the error code (`unknown` when the error has none) and `)`.
Loading SHALL never print a key or a
value. When the environment the file is loaded into holds `CODEMIND_SKIP_DOTENV` with the value `1`,
loading SHALL not read the file and SHALL change nothing; any other value, or its absence, loads
normally. The test suite SHALL run with `CODEMIND_SKIP_DOTENV` set to `1`, so neither
a test nor a process a test starts reads the `.env` of whoever runs the suite.

#### Scenario: Values of .env fill only the variables the environment lacks

- **GIVEN** an environment with `DATABASE_URL` = `from-env` and `PORT` = `` (empty), and a file with
  `DATABASE_URL=from-file`, `PORT=4000` and `LLM_MODEL=m`
- **WHEN** the file is loaded into that environment
- **THEN** `DATABASE_URL` is `from-env`, `PORT` is `` and `LLM_MODEL` is `m`, and nothing was printed

#### Scenario: Without .env the environment is unchanged

- **GIVEN** an environment and a path where no file exists
- **WHEN** that path is loaded into the environment
- **THEN** the environment equals what it was before, and nothing was written to stdout or stderr

#### Scenario: An unreadable .env is skipped with a warning

- **GIVEN** an environment and a path that is a directory
- **WHEN** that path is loaded into the environment
- **THEN** the environment equals what it was before, and stderr received exactly one line, which
  starts with `warning: .env not read (` and ends with `)`

#### Scenario: The loaded .env is the repository root's

- **WHEN** the path the loader reads is computed
- **THEN** it is the `.env` file of the repository root, the parent directory of `scripts/`

#### Scenario: Any other value of the skip switch loads .env

- **GIVEN** a file with `DATABASE_URL=from-file`
- **WHEN** it is loaded into an environment whose `CODEMIND_SKIP_DOTENV` is `0`, `true`, empty or ` 1`
- **THEN** each time `DATABASE_URL` becomes `from-file`

#### Scenario: The test suite never reads .env

- **WHEN** a test of the suite reads its environment
- **THEN** `CODEMIND_SKIP_DOTENV` is `1`
- **AND** loading a file with `DATABASE_URL=from-file` into an environment where
  `CODEMIND_SKIP_DOTENV` is `1` leaves the environment unchanged

### Requirement: Which commands load .env

The root npm scripts `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build` and
`seed:build` SHALL load `.env` before their program starts, keeping their current program and
arguments; the API's `dev` script SHALL load it before the API starts, without changing
`packages/api/dev-register.mjs`; `up` and `demo:ask` SHALL load it themselves before doing anything
else. The scripts `test`, `test:a11y`, `test:mutation`, `test:mutation:full`, `lint`,
`lint:architecture`, `typecheck` and `docs:coverage` SHALL NOT load it. Product code SHALL keep
reading its configuration from the process environment only: no file under `packages/*/src` SHALL
import from `scripts/` or name `load-env` or `.env` in an import specifier. The root `package.json`
SHALL declare `engines.node` = `>=22.12`, and no file of `scripts/` SHALL use `process.loadEnvFile`,
`util.parseEnv` or `--env-file`. When run as entry modules, `up` and `demo:ask` SHALL pass the repository root's `.env`
path (`DOTENV_PATH` of `scripts/env.mjs`) as their `.env` path, and loading `.env` SHALL print its
warning at most once per process.

#### Scenario: The guide's scripts load .env and the quality scripts do not

- **WHEN** the root `package.json` and `packages/api/package.json` are read as JSON
- **THEN** each of `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build` and
  `seed:build` is `tsx --import=./scripts/load-env.mjs` followed by the program and arguments it has
  today
- **AND** the API's `dev` is `node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts`
- **AND** `up` is `node scripts/up.mjs`, `demo:ask` is `node scripts/demo-ask.mjs` and `demo:excerpt`
  is `node scripts/demo-excerpt.mjs`
- **AND** none of `test`, `test:a11y`, `test:mutation`, `test:mutation:full`, `lint`,
  `lint:architecture`, `typecheck` and `docs:coverage` contains `load-env`, and
  `packages/api/dev-register.mjs` does not contain `load-env`
- **AND** `engines.node` is `>=22.12`
- **AND** `scripts/up.mjs` and `scripts/demo-ask.mjs` import `DOTENV_PATH` from `./env.mjs`, pass it in
  the call of their entry guard and do not import `./load-env.mjs`, `scripts/demo-excerpt.mjs` imports
  neither `./env.mjs` nor `./load-env.mjs`, and no source text of `scripts/` contains
  `process.loadEnvFile`, `parseEnv` imported from `node:util`, or `--env-file`
- **AND** no file under `packages/*/src` has an import specifier containing `scripts/`, `load-env` or
  `.env`

#### Scenario: A guide command reads DATABASE_URL from .env

- **GIVEN** a clean clone, `.env` copied from `.env.example`, no `DATABASE_URL` in the environment and
  the system started with `npm run up`
- **WHEN** `npm run cli -- projects` runs in a new PowerShell terminal and in a new Bash terminal
- **THEN** each lists `acme-shop` and exits `0`
- **AND** in a clone without `.env` and without `DATABASE_URL`, `npm run cli -- projects` fails with
  `MISSING_CONFIG` on stderr and exit `1`, as before this change

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

### Requirement: Stopping the system and the Makefile

`npm run down` SHALL run `docker compose down`, never with `-v` or `--volumes`, so the data volume
stays. The `Makefile` SHALL keep the targets `up`, `down`, `logs` and `ps`: `up` SHALL run
`npm run up`, `down` SHALL run `npm run down`, `logs` SHALL run `docker compose logs -f` and `ps`
SHALL run `docker compose ps`; it SHALL neither include `.env` nor export variables, so the
environment wins over `.env` through `make` exactly as through `npm`.

#### Scenario: Down keeps the data volume

- **WHEN** the root `package.json` is read as JSON
- **THEN** its `down` script is exactly `docker compose down`

#### Scenario: Make delegates to the npm commands

- **WHEN** the `Makefile` is read
- **THEN** the recipe of `up` is the single command `npm run up`, that of `down` is `npm run down`,
  that of `logs` is `docker compose logs -f` and that of `ps` is `docker compose ps`
- **AND** it has no `include` line and no `export` line

### Requirement: Configurable Postgres port

`docker-compose.yml` SHALL publish the `postgres` service's port 5432 on the host port given by
`POSTGRES_PORT`, and on 5432 when `POSTGRES_PORT` is unset or empty. `.env.example` SHALL define
`POSTGRES_PORT=5432` next to a `DATABASE_URL` that uses the same port, with a comment saying that both
change together.

#### Scenario: The Postgres port follows POSTGRES_PORT

- **WHEN** `docker-compose.yml` is read as YAML and `.env.example` is parsed with the `.env` grammar
- **THEN** the only port entry of the `postgres` service is `${POSTGRES_PORT:-5432}:5432`
- **AND** `.env.example` sets `POSTGRES_PORT` to `5432` and its `DATABASE_URL` is a URL whose port is
  `5432`

### Requirement: The demo question helper

`npm run demo:ask -- <projectId> "<question>"` SHALL load `.env`, then send `POST
/api/projects/<projectId>/ask` (the id percent-encoded as a path segment) to
`http://127.0.0.1:<PORT>`, where `<PORT>` is the `PORT` variable trimmed of spaces, or `3000` when it
is unset or blank (as the API reads it), with the JSON body `{"question": <question>}` encoded as
UTF-8 and the header `content-type: application/json; charset=utf-8`. A `PORT` that, once trimmed, is not made of decimal digits only with a value from 1 to 65535
SHALL write `demo:ask: PORT must be a port number` to stderr and exit `2` without
sending any request. It SHALL print the line `HTTP <status>` and then a JSON document indented with two
spaces, chosen in this order: for a `2xx` response whose JSON body has `answer` equal to `"UNKNOWN"`,
its `answer`, `reason` and, when present, `message`; for any other `2xx` response whose JSON body has
a `statements` array, `{ statements: <its length>, evidence: <length of evidence, 0 when absent>,
usage }` (`usage` as the body holds it, left out when the body has none); for any other response, the body as it came (JSON indented with two spaces when it parses, as
text otherwise). It SHALL exit `0` for a `2xx` status and `1` for any other. It SHALL set no time
limit on the request (a live model can take minutes on a CPU; Ctrl+C stops it): it SHALL send it with
`node:http`, never with Node's `fetch`, which stops waiting after 300 s. When the API cannot be reached it SHALL write
`demo:ask: the API is not reachable at http://127.0.0.1:<PORT> (start it with npm run up)` to stderr
and exit `1`. When the status arrived but the body cannot be read (the connection dropped), it SHALL
write `demo:ask: the answer of the API at http://127.0.0.1:<PORT> could not be read` to stderr, print
nothing to stdout and exit `1`. With fewer or more than two arguments it SHALL write
`usage: npm run demo:ask -- <projectId> "<question>"` to stderr and exit `2`, without sending any
request; so SHALL a project id of `.` or `..`, which the URL would drop as a dot segment.

#### Scenario: An answered question prints its status and summary

- **GIVEN** a local HTTP server on a free port, set as `PORT`, that answers `200` with an answered
  body of four statements, four evidence items and a `usage` object
- **WHEN** `demo:ask` runs with `a794456d-6d1b-5b55-a360-13fec83dc7bc` and
  `¿Cómo se calcula el precio final de un pedido?`
- **THEN** the server received one `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`
  with the header `content-type: application/json; charset=utf-8`, whose body, decoded as UTF-8 JSON,
  is `{"question":"¿Cómo se calcula el precio final de un pedido?"}`
- **AND** stdout is `HTTP 200`, a line break and `{ statements: 4, evidence: 4, usage }` as JSON
  indented with two spaces, and `demo:ask` exits `0`

#### Scenario: An UNKNOWN answer prints its reason

- **GIVEN** the server answering `200` with `{ "answer": "UNKNOWN", "reason": "llm-required",
  "message": "evaluation mode (cache-only): set LLM_* to enable free-form asks", "statements": [],
  "evidence": [] }`
- **WHEN** `demo:ask` runs with a project id and a question
- **THEN** stdout is `HTTP 200` and `{ answer: "UNKNOWN", reason: "llm-required", message: "evaluation
  mode (cache-only): set LLM_* to enable free-form asks" }` as JSON indented with two spaces, and
  `demo:ask` exits `0`

#### Scenario: An error status prints the error body

- **GIVEN** the server answering `404` with
  `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`
- **WHEN** `demo:ask` runs with a project id and a question
- **THEN** stdout is `HTTP 404` and that body as JSON indented with two spaces, and `demo:ask`
  exits `1`

#### Scenario: An unreachable API is reported

- **GIVEN** `PORT` set to a free port where nothing listens
- **WHEN** `demo:ask` runs with a project id and a question
- **THEN** stderr is `demo:ask: the API is not reachable at http://127.0.0.1:<PORT> (start it with npm
  run up)` with that port, stdout is empty, and `demo:ask` exits `1`

#### Scenario: demo:ask reads PORT from .env

- **GIVEN** the local server on a free port, an injected environment without `PORT` and without
  `CODEMIND_SKIP_DOTENV`, and a `.env` file given to `demo:ask` with `PORT=<that port>`
- **WHEN** `demo:ask` runs with a project id and a question
- **THEN** the server received the request and `demo:ask` exits `0`
- **AND** with `PORT=abc` in the injected environment, stderr is `demo:ask: PORT must be a port
  number`, no request was sent and `demo:ask` exits `2`

#### Scenario: PORT is read as the API reads it

- **GIVEN** a request double that records the address of every request
- **WHEN** `demo:ask` runs with `PORT` unset, empty, `  `, ` 4000 `, `65535` and `1`, and then with `0`,
  `65536`, `-1` and `3e3`
- **THEN** the first six exit `0` and were sent to the ports `3000`, `3000`, `3000`, `4000`, `65535` and
  `1`, and the last four exit `2` without any request

#### Scenario: Only a 2xx answer is summarised

- **GIVEN** a server answering `409` with `{"statements":[1,2],"error":{"code":"X"}}`, and another
  answering `200` with `{"statements":[1],"evidence":[]}`
- **WHEN** `demo:ask` runs against each
- **THEN** the first prints `HTTP 409` and that body indented with two spaces and exits `1`, and the
  second prints `HTTP 200` and `{ statements: 1, evidence: 0 }` (no `usage`) and exits `0`

#### Scenario: A slow answer is waited for

- **GIVEN** a server that answers `200` after a delay
- **WHEN** `demo:ask` runs against it
- **THEN** it prints `HTTP 200` and exits `0`
- **AND** the source of `scripts/demo-ask.mjs` imports from `node:http` and does not call `fetch`

#### Scenario: A dot project id is a usage error

- **WHEN** `demo:ask` runs with the project id `.`, and then with `..`, and a question
- **THEN** each time stderr is `usage: npm run demo:ask -- <projectId> "<question>"`, no request was
  sent, and `demo:ask` exits `2`

#### Scenario: An answer that cannot be read is reported

- **GIVEN** a request double whose response has status `200` and whose body cannot be read, and `PORT`
  set; and then a real server that sends the headers and part of the body and drops the connection
- **WHEN** `demo:ask` runs with a project id and a question
- **THEN** each time stderr is `demo:ask: the answer of the API at http://127.0.0.1:<PORT> could not be
  read` with that port, stdout is empty, and `demo:ask` exits `1`

#### Scenario: Missing arguments are a usage error

- **WHEN** `demo:ask` runs with only a project id, and then with three arguments
- **THEN** each time stderr is `usage: npm run demo:ask -- <projectId> "<question>"`, no request was
  sent, and `demo:ask` exits `2`

### Requirement: The demo excerpt helper

`npm run demo:excerpt -- <project> <path>:<start>-<end>` SHALL print lines `start` to `end` (both
included, counted from 1) of the file `<path>` of `fixtures/<project>`, each followed by a line feed
and nothing else, and exit `0`. `<project>` SHALL name a directory directly under `fixtures/`;
otherwise it SHALL write `demo:excerpt: unknown project <project>` to stderr and exit `1`. A `<path>`
that is absolute or that resolves, links included, outside `fixtures/<project>` SHALL be refused with
`demo:excerpt: <path> is outside fixtures/<project>` on stderr and exit `1`, without reading it; a
path leaves the project only through a `..` segment, so a file whose name starts with `..` (such as
`..notes.txt`) is inside it. A
link that leads nowhere is a missing file. A missing file SHALL give `demo:excerpt: <path> not found in fixtures/<project>` and exit `1`; an `end`
beyond the file's last line SHALL give `demo:excerpt: <path> has <n> lines` and exit `1`. A number of
arguments other than two, a citation not of the form `<path>:<start>-<end>` with decimal integers, a
`start` below 1 or an `end` below `start` SHALL write
`usage: npm run demo:excerpt -- <project> <path>:<start>-<end>` to stderr and exit `2`. The file's
lines are its UTF-8 text split on LF, each with a trailing CR removed; a final LF does not start a
line, and `<n>` is that number of lines. `<project>` SHALL equal the name of a directory entry of
`fixtures/` other than `.` and `..`. A `<path>` that names a directory SHALL give
`demo:excerpt: <path> not found in fixtures/<project>` and exit `1`. The checks SHALL run in this
order, the first failing one deciding the message: arguments and citation (exit `2`), project,
outside, missing, range.

#### Scenario: An excerpt prints exactly the cited lines

- **WHEN** `demo:excerpt` runs with `acme-shop` and `app/Services/PriceCalculator.php:16-44`
- **THEN** stdout is lines 16 to 44 of `fixtures/acme-shop/app/Services/PriceCalculator.php`, each
  followed by a line feed (29 lines, the first `class PriceCalculator`), stderr is empty and it
  exits `0`

#### Scenario: Paths outside the project are refused

- **WHEN** `demo:excerpt` runs with `acme-shop` and each of `../task-api/package.json:1-1`, an absolute
  path to a file of the repository with `:1-1`, and `app/../../acme-shop/../../package.json:1-1`; and
  then with the project `..` and `package.json:1-1`
- **THEN** the first three each write `demo:excerpt: <path> is outside fixtures/acme-shop` and exit `1`
- **AND** the last writes `demo:excerpt: unknown project ..` and exits `1`, and so does the project `.`
  (`demo:excerpt: unknown project .`)

#### Scenario: A link that leads out of the project is refused

- **GIVEN** a fixtures directory whose project `demo` holds a directory link `link` to a folder outside
  it that has `secret.txt`
- **WHEN** `demo:excerpt` runs with `demo` and `link/secret.txt:1-1`
- **THEN** stderr is `demo:excerpt: link/secret.txt is outside fixtures/demo`, stdout is empty and it
  exits `1`

#### Scenario: A file whose name starts with two dots is inside the project

- **GIVEN** a fixtures directory whose project `demo` holds a file `..notes.txt` with the lines `first`
  and `second`
- **WHEN** `demo:excerpt` runs with `demo` and `..notes.txt:1-2`
- **THEN** stdout is `first`, a line feed, `second` and a line feed, stderr is empty and it exits `0`

#### Scenario: A missing file or a range past its end is reported

- **WHEN** `demo:excerpt` runs with `acme-shop` and `app/Nope.php:1-2`, then with `app/Services:1-2`
  (a directory), and then with `app/Services/PriceCalculator.php:16-9999`
- **THEN** the first two write `demo:excerpt: app/Nope.php not found in fixtures/acme-shop` and
  `demo:excerpt: app/Services not found in fixtures/acme-shop`, and the third
  `demo:excerpt: app/Services/PriceCalculator.php has <n> lines` with the file's number of lines as
  defined above, each with exit `1` and stdout empty

#### Scenario: A malformed citation is a usage error

- **WHEN** `demo:excerpt` runs with `acme-shop` and each of `app/Services/PriceCalculator.php`,
  `app/Services/PriceCalculator.php:0-3`, `app/Services/PriceCalculator.php:9-3` and
  `app/Services/PriceCalculator.php:a-b`, and then with only `acme-shop`
- **THEN** each writes `usage: npm run demo:excerpt -- <project> <path>:<start>-<end>` and exits `2`

### Requirement: The demo guide runs the same in PowerShell and Bash

`docs/DEMO.md` SHALL be written in Spanish, with commands, pasted output, identifiers, error codes
and paths verbatim. Its level-2 headings SHALL include, in this order, `Antes de empezar`, the steps
`Paso 0 — …` to `Paso 6 — …` numbered consecutively (step 0 starts the system and steps 1 to 6 are
the six steps of `readme.md` §1.3), `Comprobar la instalación`, `Recorrido por la web` and
`Probar con un modelo real` and `Parar el sistema`. Every fenced block SHALL have the info string `shell` (a command that runs as-is
in PowerShell and in Bash), `text` (output), or `powershell` or `bash` (a shell-specific variant, only
when no common command exists); a `powershell` block and a `bash` block SHALL always come as an
adjacent pair. No `shell` block SHALL contain `export `, `$env:`, `ask_api`, `sed `, `$?`, `&&`, `||`,
`$(`, `make `, any other `$` (PowerShell expands it even inside double quotes), a line starting with a
variable assignment (`^[A-Za-z_][A-Za-z0-9_]*=`) or a line ending in `\` or in a backtick. `Antes de empezar` SHALL say how to check that
Docker is running (`docker info`), the Node version (`node -v`, 20.11 or later) and the Git version
(`git --version`), how to recognise that port 5432 is taken (`Paso 0` stops at its first step and
`docker compose` reports `port is already allocated` when another container holds it, or `Ports are
not available` when another program does; with a local PostgreSQL already on 5432, `npm run
db:migrate` can instead fail with `password authentication failed for user "codemind"`) and what to do
then (`POSTGRES_PORT` with
the matching `DATABASE_URL`, edited in `.env` with a text editor, not with a shell redirection), and
copy `.env` with the `shell` command `cp .env.example .env`; `Paso 0` SHALL start
the system with the `shell` command `npm run up`. The questions to the API SHALL be sent with
`npm run demo:ask` and the excerpt of step 2 shown with `npm run demo:excerpt`.

`Recorrido por la web` SHALL describe, in numbered steps and consistent with the wireframes
(`images/pantalla-1-seleccion.svg`, `images/pantalla-2-consulta.svg`) and the real pages, what Screen
1 and Screen 2 show: the acme-shop card with its counts, «indexado» and «listo», and «Explorar
proyecto»; the suggested golden questions; the statement badges «HECHO» and «INFERIDO»; the evidence
that expands; the usage panel with «Confianza»; the «Sin respuesta verificada» state of an
`UNKNOWN`; the notice «Hace falta un modelo de lenguaje»; and the notice of an unavailable API with
«Reintentar», with the command that shows it.

`Probar con un modelo real` SHALL say, in Spanish:

- that `npm run up` builds the fixture history (`fixtures/acme-shop/.git`) that live answers read,
  and give, for whoever starts the system without `up`, the `shell` command
  `node fixtures/build-history.mjs acme-shop`;
- Ollama, with a GPU or on CPU: the `shell` command `ollama pull qwen2.5-coder`; the server started
  with a context of 16384 tokens through `OLLAMA_CONTEXT_LENGTH=16384`, as an adjacent `powershell` /
  `bash` pair (the only shell-specific pair of the section); the `.env` lines
  `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen2.5-coder` and `LLM_API_KEY` empty, written
  in the text (lines of a file edited with a text editor, never a `shell` block nor a shell
  redirection); on CPU, `LLM_TIMEOUT_MS=1200000` (accepted up to `3600000`) and the CPU times of
  `readme.md`'s times table; what to do when Ollama already runs as a desktop app or a system service (quit it before
  starting the server with the variable, or give the variable to that service as Ollama's
  documentation says), and on which system the pair was verified;
- a hosted OpenAI-compatible API: `LLM_BASE_URL` (the provider's base URL, without `?` or `#`; the
  client appends `/chat/completions`), `LLM_API_KEY`, `LLM_MODEL` (the id the provider gives) and
  `DAILY_BUDGET_USD` left empty, marked «no verificado»;
- Claude through Anthropic's OpenAI-compatible endpoint: `LLM_BASE_URL=https://api.anthropic.com/v1`,
  a model id from Anthropic's model list, `DAILY_BUDGET_USD` left empty, links to the official pages,
  and these limits from Anthropic's documentation: the layer is presented for testing and comparing,
  not for production; a key of several workspaces needs the `anthropic-workspace-id` header, which the
  client does not send; `max_tokens` is not sent and how the layer treats that is not checked; it has
  no embeddings, which `ask` does not need; marked «no verificado»;
- that after editing `.env` the reader stops `npm run up` with Ctrl+C and starts it again, so the API
  and the web use the model, while `npm run cli` reads `.env` on every run;
- a free question through the CLI (`npm run cli -- ask acme-shop "¿Qué hace DiscountService?"`) and
  through the API (`npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Qué hace DiscountService?"`), with
  the literal project id and question in the `shell` blocks (no `<…>` placeholder: PowerShell
  reserves `<`).

No API key, real or made up, SHALL appear in the guide. Its pasted output SHALL come from the Ollama
path run on a clean clone of the branch (one shell is enough; the hosted and Claude paths paste no
output), and `Cómo se capturó` SHALL state that capture (model, context, timeout, shell, date).

The output pasted in the other sections of the guide SHALL come from a run of the guide, literally,
on a clean clone of the branch, in PowerShell and in Bash (the clone's absolute path, which changes
per clone and uses the system's separator, is written `<repo>`, as rule (b) of `Cómo se capturó`
says), except for the stop with Ctrl+C: `Parar el sistema` SHALL paste no
output for it and SHALL state in its text that `npm run up` then ends with `[up] stopped (Ctrl+C)`
and exit code `130`, possibly followed (depending on the npm version) by npm's own lines with `code 130`,
which are the expected end and not a failure; the output
it pastes is that of `npm run down`.

#### Scenario: The demo guide has no Bash-only command

- **WHEN** `docs/DEMO.md` is read
- **THEN** every fenced block's info string is `shell`, `text`, `powershell` or `bash`
- **AND** every `powershell` block is next to a `bash` block and every `bash` block next to a
  `powershell` block, with only text between them
- **AND** no `shell` block contains `export `, `$env:`, `ask_api`, `sed `, `$?`, `&&`, `||`, `$(`,
  `make ` or any `$`, nor a line starting with `NAME=` (`^[A-Za-z_][A-Za-z0-9_]*=`), nor a line ending
  in `\` or in a backtick

#### Scenario: The demo guide is ordered for a first-time reader

- **WHEN** the level-2 headings of `docs/DEMO.md` are read
- **THEN** they include, in this order, `Antes de empezar`, seven headings starting `Paso 0 — ` to
  `Paso 6 — `, `Comprobar la instalación`, `Recorrido por la web`, `Probar con un modelo real` and
  `Parar el sistema`
- **AND** `Antes de empezar` contains `docker info`, `node -v`, `git --version`, `POSTGRES_PORT`,
  `port is already allocated`, `Ports are not available`, `password authentication failed` and a
  `shell` block holding `cp .env.example .env`, and `Paso 0` a `shell` block holding `npm run up`
- **AND** a `shell` block holds `npm run demo:ask --` and another `npm run demo:excerpt --`
- **AND** `Parar el sistema` contains `[up] stopped (Ctrl+C)` and `130` in its text and a `shell` block
  holding `npm run down`

#### Scenario: The web walkthrough names what each screen shows

- **WHEN** the `Recorrido por la web` section of `docs/DEMO.md` is read
- **THEN** it has numbered steps and contains «Explorar proyecto», «indexado», «listo», «HECHO»,
  «INFERIDO», «Confianza», «Sin respuesta verificada», «Hace falta un modelo de lenguaje» and
  «Reintentar»
- **AND** a review against the two wireframes and screenshots of the running pages finds every element
  it describes on the page, in the order the page shows it

#### Scenario: The guide was followed on a clean clone in both shells

- **GIVEN** a clone of the change's branch in a new folder, with its own Compose project name and a
  free `POSTGRES_PORT`
- **WHEN** every command of `docs/DEMO.md` outside `Probar con un modelo real` is run literally with
  PowerShell and with Bash
- **THEN** each command gives the output and exit code the guide shows, apart from the fields the guide
  lists as changing on every run or with the clone's folder, and the accented questions reach the API intact in both shells
- **AND** the pasted output is that of this run, and the pull request body records the run

#### Scenario: The real-model section says how to try each model

- **WHEN** the `Probar con un modelo real` section of `docs/DEMO.md` is read
- **THEN** it has a `shell` block holding `node fixtures/build-history.mjs acme-shop` and another holding
  `ollama pull qwen2.5-coder`
- **AND** it has exactly one `powershell` / `bash` pair, and both blocks of the pair contain
  `OLLAMA_CONTEXT_LENGTH` and `16384`
- **AND** its text contains `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen2.5-coder`,
  `LLM_API_KEY`, `LLM_TIMEOUT_MS=1200000`, `3600000`, `DAILY_BUDGET_USD`,
  `https://api.anthropic.com/v1`, `https://platform.claude.com/docs/en/api/openai-sdk`,
  `anthropic-workspace-id`, `max_tokens`, `Ctrl+C`, `npm run up`, `npm run cli -- ask acme-shop` and
  `npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc`, and «no verificado» at least twice
- **AND** no text of the guide matches the shape of an API key (`sk-` followed by ten or more letters,
  digits, `-` or `_`)

#### Scenario: The Ollama path was followed on a clean clone

- **GIVEN** a clean clone of the change's branch with its own Compose project name and a free
  `POSTGRES_PORT`, and Ollama on CPU only with `OLLAMA_CONTEXT_LENGTH=16384` and `qwen2.5-coder`
- **WHEN** the steps of `Probar con un modelo real` for Ollama are followed (a recorded check) with
  `LLM_TIMEOUT_MS=1200000`, and `npm run cli -- ask acme-shop "¿Qué hace DiscountService?"` and the same
  question through `npm run demo:ask` are run
- **THEN** neither ends with `SOURCE_UNAVAILABLE` nor with `LLM_UNAVAILABLE`: each ends with an answer
  or an `UNKNOWN` decided by the model, and the measured duration of each is recorded in the change's
  report

### Requirement: The deployment and testing guides in Spanish

`docs/DEPLOYMENT.md` and `docs/TESTING.md` SHALL be written in Spanish, with the same meaning and
figures as before, and commands, pasted output, identifiers, error codes and paths verbatim.
`docs/DEPLOYMENT.md` SHALL give `npm run up` and `npm run down` as the way to start and stop the
system in any shell and `make up` / `make down` as their equivalent for Git Bash or WSL, and its
`MISSING_CONFIG` row SHALL tell the reader to copy `.env.example` to `.env` (or set the variable).
Where a command of these guides needs a variable that `.env` does not provide (the integration tests'
`DATABASE_URL`, since the test suite never reads `.env`), they SHALL show a `bash` and a `powershell`
variant side by side, labelled; the PowerShell variant SHALL say that the variable stays set for the
rest of that terminal session and beats `.env`, and how to remove it (`Remove-Item Env:DATABASE_URL`)
or to open a new terminal before running the demo; the integration database URL SHALL use the same
port as the `DATABASE_URL` of `.env` (`POSTGRES_PORT`). No sentence of `readme.md`, `docs/project-context.md`, `.env.example`
or the four guides SHALL say that the npm scripts do not read `.env`, or that `DATABASE_URL` must be
exported before a command that now loads `.env`. Every link from `readme.md`, `docs/project-context.md`
or the four guides to a section of one of the four guides SHALL point to a heading that exists.

#### Scenario: Links to the guides' sections resolve

- **WHEN** every Markdown link of `readme.md`, `docs/project-context.md`, `docs/DEMO.md`,
  `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md` and `docs/TESTING.md` whose target is one of the four
  guides with a `#fragment`, or a bare `#fragment` inside one of the four guides, is resolved
- **THEN** each fragment equals the GitHub anchor of a heading of the target document (heading and
  fragment in NFC; lower case; characters other than Unicode letters `\p{L}`, digits `\p{N}`, spaces,
  `-` and `_` removed; each space turned into `-`)

#### Scenario: The guides are in Spanish and say that .env is read

- **WHEN** `docs/DEPLOYMENT.md` and `docs/TESTING.md` are reviewed against their previous English
  version, and `readme.md`, `docs/project-context.md`, `.env.example` and the four guides are
  searched, case-insensitively and ignoring backticks, for `export DATABASE_URL`, `export (it|them)`,
  `DATABASE_URL. exported`, `(do|does) not (read|load) .env`, `do not load`, `no (leen|cargan) .env`,
  `npm scripts directly`, `PowerShell` and `make up`
- **THEN** both guides are in Spanish with the same sections, figures, commands and output as before,
  `docs/DEPLOYMENT.md` gives `npm run up` / `npm run down` and `make up` / `make down` as described,
  the integration tests' `DATABASE_URL` appears as a labelled `bash` / `powershell` pair, and every
  hit is reviewed: none is a sentence that is no longer true, and `make up` appears only as the Git
  Bash/WSL alternative or in text that stays true because `make up` runs `npm run up`
- **AND** `docs/project-context.md` lines 38, 62, 191, 227 and 1180–1181 (numbering of base `368dc38`)
  say that the guide's npm scripts read `.env` and that `npm run up` starts the system in any shell
- **AND** `readme.md` §1.2, §1.4 and §2.4 give `npm run up` as the start command, and the start block of
  §1.4 contains no `&&`

### Requirement: CI runs on the supported Node baseline

Every step that installs Node in the repository's CI workflows (`.github/workflows/ci.yml` and
`.github/workflows/frontend.yml`) SHALL request Node `22`, the same major as the `engines.node` floor of
the root `package.json`. No workflow SHALL request Node 20 or an unpinned version.

#### Scenario: Every CI job installs Node 22

- **GIVEN** `.github/workflows/ci.yml` and `.github/workflows/frontend.yml`, read as YAML
- **WHEN** every step of every job that uses `actions/setup-node` is collected
- **THEN** there is at least one such step in each file, and each one has `with.node-version` equal to
  the string `'22'`
- **AND** `22` is the major of the lower bound of `engines.node` in the root `package.json`

### Requirement: A clean install reports no high or critical advisory

On a clean clone with a Node version that satisfies the root `engines.node`, installing the locked dependencies SHALL leave no
`npm audit` advisory of severity high or critical. Any remaining advisory of lower severity SHALL have
no published fix at the time of the change and SHALL be listed, with its destination, in the change's
design.

#### Scenario: npm audit on a clean clone

- **GIVEN** a clean clone of the branch and Node 22.12 or later
- **WHEN** `npm ci` runs and then `npm audit --audit-level=high`
- **THEN** `npm audit --audit-level=high` exits `0`
- **AND** `npm audit` prints `found 0 vulnerabilities`, or every advisory it lists is low or moderate,
  `npm audit --json` reports `fixAvailable: false` for it, and it appears in the design's Follow-ups
  with its destination
