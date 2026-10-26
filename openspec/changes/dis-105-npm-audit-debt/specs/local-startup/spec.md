## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: CI runs on the supported Node baseline

Every step that installs Node in the repository's CI workflows (`.github/workflows/ci.yml` and
`.github/workflows/frontend.yml`) SHALL request Node `22`, the same major as the `engines.node` floor of
the root `package.json`. No workflow SHALL request Node 20 or an unpinned version.

#### Scenario: Every CI job installs Node 22

- **GIVEN** `.github/workflows/ci.yml` and `.github/workflows/frontend.yml`, read as YAML
- **WHEN** every step of every job that uses `actions/setup-node` is collected
- **THEN** there is at least one such step in each file, and each one has `with.node-version` equal to
  the string `'22'`

### Requirement: A clean install reports no high or critical advisory

On a clean clone with a supported Node version, installing the locked dependencies SHALL leave no
`npm audit` advisory of severity high or critical. Any remaining advisory of lower severity SHALL have
no published fix at the time of the change and SHALL be listed, with its destination, in the change's
design.

#### Scenario: npm audit on a clean clone

- **GIVEN** a clean clone of the branch and Node 22.12 or later
- **WHEN** `npm ci` runs and then `npm audit --audit-level=high`
- **THEN** `npm audit --audit-level=high` exits `0`
- **AND** `npm audit` prints `found 0 vulnerabilities`, or every advisory it lists is low or moderate
  and appears in the design's Follow-ups with its destination
