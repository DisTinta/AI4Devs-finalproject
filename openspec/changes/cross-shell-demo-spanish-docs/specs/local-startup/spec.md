## Purpose

Lets an evaluator who clones CODEMIND on Windows, macOS or Linux start, stop and demonstrate the
system locally with the same commands in PowerShell and in Bash: the repository's `.env` is read by
the commands of the guide without exporting anything by hand, one command starts everything, and the
demo, deployment and testing guides are written in Spanish with steps that run as-is in either shell.

## ADDED Requirements

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
- otherwise the value is the raw value up to the first `#` preceded by a space or a tab, with its
  trailing spaces and tabs removed; an opening quote without its closing one is part of the value;
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

### Requirement: Loading .env into a process

Loading `.env` SHALL read the file `.env` at the root of the repository (the directory that holds
`scripts/`), located from the loader's own file and never from the working directory. For each key
it parses, it SHALL set the process environment variable only when the environment does not already
hold that key; a key that is present, even with an empty value, SHALL keep its value. When the file
does not exist, loading SHALL change nothing and print nothing. When the file exists but cannot be
read, loading SHALL change nothing and write exactly one line to stderr that starts with
`warning: .env not read (` followed by the error code and `)`. Loading SHALL never print a key or a
value. When the environment variable `CODEMIND_SKIP_DOTENV` is `1`, loading SHALL not read the file
and SHALL change nothing; the test suite SHALL run with `CODEMIND_SKIP_DOTENV` set to `1`, so neither
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
reading its configuration from the process environment only.

#### Scenario: The guide's scripts load .env and the quality scripts do not

- **WHEN** the root `package.json` and `packages/api/package.json` are read as JSON
- **THEN** each of `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build` and
  `seed:build` is `tsx --import ./scripts/load-env.mjs` followed by the program and arguments it has
  today
- **AND** the API's `dev` is `node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts`
- **AND** `up` is `node scripts/up.mjs`, `demo:ask` is `node scripts/demo-ask.mjs` and `demo:excerpt`
  is `node scripts/demo-excerpt.mjs`
- **AND** none of `test`, `test:a11y`, `test:mutation`, `test:mutation:full`, `lint`,
  `lint:architecture`, `typecheck` and `docs:coverage` contains `load-env`, and
  `packages/api/dev-register.mjs` does not contain `load-env`

#### Scenario: A guide command reads DATABASE_URL from .env

- **GIVEN** a clean clone, `.env` copied from `.env.example`, no `DATABASE_URL` in the environment and
  the system started with `npm run up`
- **WHEN** `npm run cli -- projects` runs in a new PowerShell terminal and in a new Bash terminal
- **THEN** each lists `acme-shop` and exits `0`
- **AND** in a clone without `.env` and without `DATABASE_URL`, `npm run cli -- projects` fails with
  `MISSING_CONFIG` on stderr and exit `1`, as before this change

### Requirement: One command starts the system

`npm run up` SHALL load `.env` and then run, from the repository root and in this order, each with the
standard input, output and error of `up`: `docker compose up -d --wait`, `npm install`,
`npm run db:migrate`, `npm run db:seed` and `npm run dev`. Before each step it SHALL print one line
`[up] <command>` to stdout. The npm steps SHALL run the npm that started `up` (the `npm_execpath` npm
gives its scripts, run by the same Node executable), never through a shell; when `npm_execpath` is
not set, `up` SHALL run no step, write `[up] run it with npm run up` to stderr and exit `1`. When a
step exits with a code other than `0`, `up` SHALL run no further step, write
`[up] "<command>" failed with exit code <n>` to stderr and exit with that code; when a step ends by
a signal, the line SHALL be `[up] "<command>" failed (<signal>)` and the exit code `1`; when a step
cannot be started, the line SHALL be `[up] "<command>" could not start (<error code>)` and the exit
code `1`. When every step exits `0`, `up` SHALL exit `0`. `up` and the `.env` loader SHALL import only
Node built-in modules and files of `scripts/`, so `npm run up` works before `npm install`.

#### Scenario: Up runs the start sequence in order

- **GIVEN** a step runner double that records each call and returns exit code `0`, `npm_execpath`
  set and a `.env` file with `POSTGRES_PORT=5433`
- **WHEN** `up` runs
- **THEN** the runner received, in order, `docker compose up -d --wait`, then the Node executable with
  `npm_execpath` and `install`, `run db:migrate`, `run db:seed` and `run dev`, each from the repository
  root, with inherited standard streams, without a shell and with `POSTGRES_PORT` = `5433` in its
  environment
- **AND** stdout holds the five `[up] <command>` lines in that order, and `up` exits `0`

#### Scenario: Up stops at the first failing step

- **GIVEN** a step runner double whose `npm install` call returns exit code `3`
- **WHEN** `up` runs
- **THEN** the runner received exactly two calls, `docker compose up -d --wait` and `npm install`
- **AND** stderr holds `[up] "npm install" failed with exit code 3`, and `up` exits `3`
- **AND** with a double whose first call ends by the signal `SIGINT`, the runner received one call,
  stderr holds `[up] "docker compose up -d --wait" failed (SIGINT)` and `up` exits `1`

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
`http://127.0.0.1:<PORT>`, where `<PORT>` is the `PORT` variable or `3000` when it is unset or empty,
with the JSON body `{"question": <question>}` encoded as UTF-8. It SHALL print the line
`HTTP <status>` and then, indented with two spaces, a JSON document: for a `2xx` response with
statements, `{ statements: <number of statements>, evidence: <number of evidence items>, usage }`; for a
`2xx` `UNKNOWN` response, its `answer`, `reason` and, when present, `message`; for any other status,
the response body as it came (as text when it is not JSON). It SHALL exit `0` for a `2xx` status and
`1` for any other. When the API cannot be reached it SHALL write
`demo:ask: the API is not reachable at http://127.0.0.1:<PORT> (start it with npm run up)` to stderr
and exit `1`. With fewer or more than two arguments it SHALL write
`usage: npm run demo:ask -- <projectId> "<question>"` to stderr and exit `2`, without sending any
request.

#### Scenario: An answered question prints its status and summary

- **GIVEN** a local HTTP server on a free port, set as `PORT`, that answers `200` with an answered
  body of four statements, four evidence items and a `usage` object
- **WHEN** `demo:ask` runs with `a794456d-6d1b-5b55-a360-13fec83dc7bc` and
  `¿Cómo se calcula el precio final de un pedido?`
- **THEN** the server received one `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`
  whose body, decoded as UTF-8 JSON, is `{"question":"¿Cómo se calcula el precio final de un pedido?"}`
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
`demo:excerpt: <path> is outside fixtures/<project>` on stderr and exit `1`, without reading it. A
missing file SHALL give `demo:excerpt: <path> not found in fixtures/<project>` and exit `1`; an `end`
beyond the file's last line SHALL give `demo:excerpt: <path> has <n> lines` and exit `1`. A number of
arguments other than two, a citation not of the form `<path>:<start>-<end>` with decimal integers, a
`start` below 1 or an `end` below `start` SHALL write
`usage: npm run demo:excerpt -- <project> <path>:<start>-<end>` to stderr and exit `2`.

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
- **AND** the last writes `demo:excerpt: unknown project ..` and exits `1`

#### Scenario: A missing file or a range past its end is reported

- **WHEN** `demo:excerpt` runs with `acme-shop` and `app/Nope.php:1-2`, and then with
  `app/Services/PriceCalculator.php:16-9999`
- **THEN** the first writes `demo:excerpt: app/Nope.php not found in fixtures/acme-shop` and the second
  `demo:excerpt: app/Services/PriceCalculator.php has <n> lines` with the file's line count, each with
  exit `1` and stdout empty

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
`Parar el sistema`. Every fenced block SHALL have the info string `shell` (a command that runs as-is
in PowerShell and in Bash), `text` (output), or `powershell` or `bash` (a shell-specific variant, only
when no common command exists); a `powershell` block and a `bash` block SHALL always come as an
adjacent pair. No `shell` block SHALL contain `export `, `$env:`, `ask_api`, `sed `, `$?`, `&&`, `||`,
`$(`, `make ` or a line ending in `\` or in a backtick. `Antes de empezar` SHALL say how to check that
Docker is running (`docker info`), the Node version (`node -v`, 20.11 or later) and the Git version
(`git --version`), what to do when port 5432 is taken (`POSTGRES_PORT` with the matching
`DATABASE_URL`), and copy `.env` with the `shell` command `cp .env.example .env`; `Paso 0` SHALL start
the system with the `shell` command `npm run up`. The questions to the API SHALL be sent with
`npm run demo:ask` and the excerpt of step 2 shown with `npm run demo:excerpt`.

`Recorrido por la web` SHALL describe, in numbered steps and consistent with the wireframes
(`images/pantalla-1-seleccion.svg`, `images/pantalla-2-consulta.svg`) and the real pages, what Screen
1 and Screen 2 show: the acme-shop card with its counts, «indexado» and «listo», and «Explorar
proyecto»; the suggested golden questions; the statement badges «HECHO» and «INFERIDO»; the evidence
that expands; the usage panel with «Confianza»; the «Sin respuesta verificada» state of an
`UNKNOWN`; the notice «Hace falta un modelo de lenguaje»; and the notice of an unavailable API with
«Reintentar», with the command that shows it.

The output pasted in the guide SHALL come from a run of the guide, literally, on a clean clone of the
branch, in PowerShell and in Bash.

#### Scenario: The demo guide has no Bash-only command

- **WHEN** `docs/DEMO.md` is read
- **THEN** every fenced block's info string is `shell`, `text`, `powershell` or `bash`
- **AND** every `powershell` block is next to a `bash` block and every `bash` block next to a
  `powershell` block, with only text between them
- **AND** no `shell` block contains `export `, `$env:`, `ask_api`, `sed `, `$?`, `&&`, `||`, `$(` or
  `make `, nor a line ending in `\` or in a backtick

#### Scenario: The demo guide is ordered for a first-time reader

- **WHEN** the level-2 headings of `docs/DEMO.md` are read
- **THEN** they include, in this order, `Antes de empezar`, seven headings starting `Paso 0 — ` to
  `Paso 6 — `, `Comprobar la instalación`, `Recorrido por la web` and `Parar el sistema`
- **AND** `Antes de empezar` contains `docker info`, `node -v`, `git --version`, `POSTGRES_PORT` and a
  `shell` block holding `cp .env.example .env`, and `Paso 0` a `shell` block holding `npm run up`
- **AND** a `shell` block holds `npm run demo:ask --` and another `npm run demo:excerpt --`

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
- **WHEN** every command of `docs/DEMO.md` is run literally with PowerShell and with Bash
- **THEN** each command gives the output and exit code the guide shows, apart from the fields the guide
  lists as changing on every run, and the accented questions reach the API intact in both shells
- **AND** the pasted output is that of this run, and the pull request body records the run

### Requirement: The deployment and testing guides in Spanish

`docs/DEPLOYMENT.md` and `docs/TESTING.md` SHALL be written in Spanish, with the same meaning and
figures as before, and commands, pasted output, identifiers, error codes and paths verbatim.
`docs/DEPLOYMENT.md` SHALL give `npm run up` and `npm run down` as the way to start and stop the
system in any shell and `make up` / `make down` as their equivalent for Git Bash or WSL, and its
`MISSING_CONFIG` row SHALL tell the reader to copy `.env.example` to `.env` (or set the variable).
Where a command of these guides needs a variable that `.env` does not provide (the integration tests'
`DATABASE_URL`, since the test suite never reads `.env`), they SHALL show a `bash` and a `powershell`
variant side by side, labelled. No sentence of `readme.md`, `docs/project-context.md`, `.env.example`
or the four guides SHALL say that the npm scripts do not read `.env`, or that `DATABASE_URL` must be
exported before a command that now loads `.env`. Every link from `readme.md`, `docs/project-context.md`
or the four guides to a section of one of the four guides SHALL point to a heading that exists.

#### Scenario: Links to the guides' sections resolve

- **WHEN** every Markdown link of `readme.md`, `docs/project-context.md`, `docs/DEMO.md`,
  `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md` and `docs/TESTING.md` whose target is one of the four
  guides with a `#fragment`, or a bare `#fragment` inside one of the four guides, is resolved
- **THEN** each fragment equals the GitHub anchor of a heading of the target document (lower case,
  characters other than letters, digits, spaces, `-` and `_` removed, spaces turned into `-`)

#### Scenario: The guides are in Spanish and say that .env is read

- **WHEN** `docs/DEPLOYMENT.md` and `docs/TESTING.md` are reviewed against their previous English
  version, and `readme.md`, `docs/project-context.md` and `.env.example` are searched for `export
  DATABASE_URL`, `do not read .env`, `no leen .env` and `Export it`
- **THEN** both guides are in Spanish with the same sections, figures, commands and output as before,
  `docs/DEPLOYMENT.md` gives `npm run up` / `npm run down` and `make up` / `make down` as described,
  the integration tests' `DATABASE_URL` appears as a labelled `bash` / `powershell` pair, and no search
  finds a sentence that is no longer true
