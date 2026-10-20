## MODIFIED Requirements

### Requirement: One command starts the system

`npm run up` SHALL load `.env` (as in "Loading .env into a process", by default the repository root's
file) into the environment it gives every step, and then run, from the repository root and in this
order, each with the standard input, output and error of `up`: `docker compose up -d --wait`, `npm install`,
`npm run db:migrate`, `npm run db:seed`, `node fixtures/build-history.mjs acme-shop` and `npm run dev`.
Before each step it SHALL print one line `[up] <command>` to stdout. The npm steps SHALL run the npm
that started `up` (the `npm_execpath` npm gives its scripts, run by the same Node executable), never
through a shell; `npm_execpath` SHALL be read from the environment `up` was started with, before
`.env` is loaded, so a line of `.env` never names it; when it is not set there or is empty, `up` SHALL
run no step, write `[up] run it with npm run up` to stderr and exit `1`. The fixture history step
SHALL run `fixtures/build-history.mjs` with the argument `acme-shop` with the same Node executable,
never through a shell, every time `up` runs (the build is deterministic: its `HEAD` is the
`indexed_commit` of the seed `seeds/graph-dump.sql`), and in a process that does not end on SIGINT
before the builder has finished, so a Ctrl+C during the step never leaves the fixture's tracked files
modified; that process then exits `130` if it received SIGINT. When a
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
the fixture history SHALL change neither the seed's fingerprints nor the answers of evaluation mode.

#### Scenario: Up runs the start sequence in order

- **GIVEN** a step runner double that records each call and returns exit code `0`, an injected
  environment with `npm_execpath` set and without `CODEMIND_SKIP_DOTENV` or `POSTGRES_PORT`, and a
  `.env` file given to `up` with `POSTGRES_PORT=5433`
- **WHEN** `up` runs
- **THEN** the runner received, in order, `docker compose up -d --wait`, then the Node executable with
  `npm_execpath` and `install`, `run db:migrate` and `run db:seed`, then the Node executable with the
  arguments that run `fixtures/build-history.mjs acme-shop` in a process that defers SIGINT, then the
  Node executable with `npm_execpath` and `run dev`; each from the repository root, with inherited
  standard streams, without a shell and with `POSTGRES_PORT` = `5433` in its environment
- **AND** stdout holds the six `[up] <command>` lines in that order (the fifth is
  `[up] node fixtures/build-history.mjs acme-shop`), each printed before its step started, and `up`
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
- **THEN** the runner received the six calls, stderr holds `[up] stopped (Ctrl+C)` and no line with
  `failed`, and `up` exits `130`

#### Scenario: The history step finishes its work before ending on Ctrl+C

- **GIVEN** a Node process started the way `up` starts the fixture history step, running instead a
  script that receives SIGINT while it works and, after that, writes a marker file and returns
- **WHEN** the process ends
- **THEN** the marker file exists (the work finished after SIGINT) and the exit code is `130`
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

- **GIVEN** a clean clone of the change's branch without `fixtures/acme-shop/.git`, with its own
  Compose project name and a free `POSTGRES_PORT`
- **WHEN** `npm run up` runs (a recorded check), is stopped with Ctrl+C once the API listens, and
  runs a second time
- **THEN** each run prints `[up] node fixtures/build-history.mjs acme-shop` after `[up] npm run db:seed`
  and before `[up] npm run dev`, and that step exits `0`
- **AND** after each run `git -C fixtures/acme-shop rev-parse HEAD` is
  `4f028db4d51a3321031f3a24b3f36240410ed38c` (the `indexed_commit` of `seeds/graph-dump.sql`),
  `git status --porcelain` of the clone is empty, and `npm run verify` exits `0`

### Requirement: The demo guide runs the same in PowerShell and Bash

`docs/DEMO.md` SHALL be written in Spanish, with commands, pasted output, identifiers, error codes
and paths verbatim. Its level-2 headings SHALL include, in this order, `Antes de empezar`, the steps
`Paso 0 — …` to `Paso 6 — …` numbered consecutively (step 0 starts the system and steps 1 to 6 are
the six steps of `readme.md` §1.3), `Comprobar la instalación`, `Recorrido por la web`,
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
  redirection); on CPU, `LLM_TIMEOUT_MS=1200000` (accepted up to `3600000`) and the time a CPU answer
  takes;
- a hosted OpenAI-compatible API: `LLM_BASE_URL` (the provider's base URL, without `?` or `#`; the
  client appends `/chat/completions`), `LLM_API_KEY`, `LLM_MODEL` (the id the provider gives) and
  `DAILY_BUDGET_USD` left empty, marked «no verificado»;
- Claude through Anthropic's OpenAI-compatible endpoint: `LLM_BASE_URL=https://api.anthropic.com/v1`,
  a model id from Anthropic's model list, the limits Anthropic's documentation states for that
  endpoint that matter to this client, `DAILY_BUDGET_USD` left empty, and links to the official
  pages, marked «no verificado»;
- that after editing `.env` the reader stops `npm run up` with Ctrl+C and starts it again, so the API
  and the web use the model, while `npm run cli` reads `.env` on every run;
- a free question through the CLI (`npm run cli -- ask acme-shop "…"`) and through the API
  (`npm run demo:ask -- <projectId> "…"`).

No API key, real or made up, SHALL appear in the guide. Its pasted output SHALL come from the Ollama
path run on a clean clone of the branch (one shell is enough; the hosted and Claude paths paste no
output).

The output pasted in the other sections of the guide SHALL come from a run of the guide, literally,
on a clean clone of the branch, in PowerShell and in Bash, except for the stop with Ctrl+C: `Parar el sistema` SHALL paste no
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
  lists as changing on every run, and the accented questions reach the API intact in both shells
- **AND** the pasted output is that of this run, and the pull request body records the run

#### Scenario: The real-model section says how to try each model

- **WHEN** the `Probar con un modelo real` section of `docs/DEMO.md` is read
- **THEN** it has a `shell` block holding `node fixtures/build-history.mjs acme-shop` and another holding
  `ollama pull qwen2.5-coder`
- **AND** it has exactly one `powershell` / `bash` pair, and both blocks of the pair contain
  `OLLAMA_CONTEXT_LENGTH` and `16384`
- **AND** its text contains `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen2.5-coder`,
  `LLM_API_KEY`, `LLM_TIMEOUT_MS=1200000`, `3600000`, `DAILY_BUDGET_USD`,
  `https://api.anthropic.com/v1`, `Ctrl+C`, `npm run up`, `npm run cli -- ask acme-shop` and
  `npm run demo:ask --`, and «no verificado» at least twice
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
