# Deployment

## What deployment means here

Codemind has **no public server**. Deploying it means a reproducible artifact: the same Docker
Compose file that whoever evaluates the project runs locally, plus a CI pipeline that checks on
every push that the artifact still works, `npm run verify` included. The hosted target (image
registry, own server, TLS proxy, mandatory LLM API) was dropped for the evaluation on 5 Sep 2026:
cost, domain, and a single point of failure (`readme.md` §2.4).

| Environment | How it starts | What it is for |
|---|---|---|
| Local | `make up`: Docker and Node | Trying the system and the CLI. The only evidence that it works; it depends on no server of the author |
| CI | GitHub Actions with Postgres in a service container | Keeping the artifact from breaking on each push: same migrations, same seed, same `verify` |

## Requirements

- **Docker** with Compose, for PostgreSQL 16 with pgvector.
- **Node 20.11 or later** and npm.
- **GNU make and a Bash shell** for `make up`: on Windows, Git Bash or WSL. In PowerShell, run the
  `npm` scripts of the table below one by one.
- **Git 2.45.1 or later** (or 2.43.4 / 2.44.1) only to index a repository of your own (see
  [Indexing a repository](#indexing-a-repository-cli)); the sample is already indexed.
- No LLM account: without `LLM_*` the system runs in evaluation mode, answering from the cache.

## Local environment

```bash
cp .env.example .env
make up
```

The `Makefile` loads `.env` and exports its variables to every step, then runs:

| Step | What it does |
|---|---|
| `docker compose up -d` | Starts the `postgres` service (`pgvector/pgvector:pg16`, user, password and database `codemind`, port `5432`, data in the `pgdata` volume) |
| `npm install` | Installs the workspaces |
| `npm run db:migrate` | Applies the migrations of `packages/adapters/store-postgres/migrations` |
| `npm run db:seed` | Loads the pre-built graph of the sample (`seeds/graph-dump.sql`) and its golden answers (`seeds/cache/`) |
| `npm run dev` | Starts the API on `127.0.0.1:3000` and the web on `localhost:5173`, and stays in the foreground |

`make down` stops and removes the container (the volume stays), `make logs` follows its log and
`make ps` shows its state. `docs/DEMO.md` step 0 has the real output of `make up`, and the
environment variables are described in `readme.md` §1.4.

## Continuous integration

Two workflows run on every pull request (`.github/workflows/`). `CI` also runs on pushes to `main`
and to the delivery branches (`feature/entrega-*`, `final-project-*`); `Frontend`, on pushes to `main`.

| Workflow → job | What it runs | Notes |
|---|---|---|
| `CI` → `scope` | Decides whether `quality`, `verify` and `mutation` run | A push to an open PR that only touches `docs/`, `openspec/` or `*.md` skips them when all three were green on the previous head |
| `CI` → `quality` | `npm ci`, `npm run lint`, `npm run typecheck`, `npx depcruise --config .dependency-cruiser.cjs packages`, migrations up, down and up again, `npx vitest run` | Postgres service with its own `test` database; the migrations and tests run only when runtime files changed |
| `CI` → `verify` | `npm run db:migrate`, `npm run db:seed`, `npm run verify` | Postgres service with its own `verify` database, never the `test` one; no `LLM_*` |
| `CI` → `mutation` | `npm run test:mutation` (incremental) on pull requests, `npm run test:mutation:full` on pushes | No database; fails under a mutation score of 80; only when `packages/core`, `packages/cli`, `packages/api`, `tests` or their configuration changed |
| `CI` → `secrets` | gitleaks 8.30.1 over the working tree and the commits of the event | Always runs, also on documentation-only pushes |
| `Frontend` → `frontend` | `npm run lint`, `npm run typecheck`, `npx vitest run --exclude 'tests/integration/**'`, `npm run test:a11y` | Only when front-end files changed; `test:a11y` is not defined yet and the step prints a warning (see `docs/TESTING.md`) |

`docs/TESTING.md` explains each level of tests these jobs run.

## Verifying an installation

```bash
npm run verify; echo "exit: $?"
```

Output on the database of `docs/DEMO.md` (2026-10-17, commit `b9026be`):

```text

> codemind@0.0.1 verify
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts

✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
exit: 0
```

It needs only `DATABASE_URL` of a database where `npm run db:seed` loaded the seed, and never calls
a model. It exits `0` only when every golden answer matches. When it fails:

| Code (stderr) | Meaning | What to do |
|---|---|---|
| `MISSING_CONFIG` | `DATABASE_URL` is not set | Export it (see `docs/DEMO.md` step 0) |
| `DATABASE_UNAVAILABLE` | The database cannot be reached | Check that the container runs (`make ps`) and the URL |
| `SEED_NOT_LOADED` | The database does not hold the current seed | `npm run db:seed` |
| `FINGERPRINT_MISMATCH` | The seed or the golden answers no longer match the code (`details.reason` is `seed` or `golden`) | Not fixable on an installation: the author regenerates them with `npm run seed:build` and then `npm run cache:build` (`reason: seed`), or only `npm run cache:build` (`reason: golden`), and commits them |
| `GOLDEN_MISSING` | A seed project has no golden answers | The author runs `npm run cache:build` |

A `✗` line with exit `1` and no error code is a structural mismatch: the lines under it name each
difference. `INVALID_SEED` (an unreadable seed or golden file) and `INTERNAL` are the remaining
codes; the full contract is in `docs/project-context.md` → Commands, and the decision to fail
on a stale fingerprint in `docs/adr/20261017-stale-fingerprint-fails-verify.md`.

## Secrets

Only through environment variables. `.env` is in `.gitignore` and `.env.example` holds no real
value; no key lives in the repository. There is no hosting secret store because there is no public
deployment. In CI the jobs use the throwaway passwords of their service containers, the `verify`
job sets no `LLM_*`, and the `secrets` job scans every pull request and push with gitleaks.

## Indexing a repository (CLI)

Indexing runs from the CLI, `npm run cli -- index <path> --name <name> --language php` (DIS-86). It
needs three environment variables; plain `npm` scripts do not read `.env`, so export them or use
`make` (which includes and exports `.env`):

| Variable | Required | Meaning |
|---|---|---|
| `ALLOWED_REPOS_DIR` | yes, to index | The only directory repositories are indexed from; `<path>` is absolute inside it or relative to it. Empty or unset disables indexing (fixtures-only mode, exit `1`, `INDEXING_DISABLED`). |
| `AUTHOR_HASH_SALT` | yes | Keys the pseudonymisation of commit authors. Never commit a value; changing it changes every stored `author_hash`. |
| `DATABASE_URL` | yes | PostgreSQL the graph is saved to. Never printed: a refused connection is reported as `DATABASE_UNAVAILABLE`. |

**`ALLOWED_REPOS_DIR` must be writable only by the user that runs Codemind, and must hold only
trusted repositories.** The path is confined lexically and again on its real path before reading,
but git resolves it again when it reads. Someone who can write inside that directory could swap a
directory of a repository path for a link in between, or make git read objects from outside the
directory through a `.git` file (`gitdir:`) or `objects/info/alternates`. Codemind only reads Git
objects and never executes anything from an indexed repository, so the reach is reading another
repository the Codemind user can already read. This residual risk is accepted rather than closed in
code (DIS-86 design D7); revisit it before indexing repositories uploaded by untrusted parties.

Exit codes: `0` success, `1` a domain, configuration or runtime error, `2` a usage error. Errors are
one JSON line on stderr, `{"error":{"code","message","details"}}`; stdout carries only the report.

## Running the API

`npm run dev` (or `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`)
starts the API (DIS-76). It needs `DATABASE_URL`; `PORT`, `HOST`, `RATE_LIMIT_MAX` and
`RATE_LIMIT_WINDOW_MS` are optional (see `.env.example` and `readme.md` §2.5). A start-up failure is
one JSON line on stderr and exit `1`.

**The API has no authentication.** It listens on `127.0.0.1` by default; `HOST=0.0.0.0` exposes it to
the network, which is an explicit decision of whoever runs it.

**The rate limit keys on the socket's address** (`trustProxy` is off, so `X-Forwarded-For` is
ignored and cannot be spoofed). Behind a reverse proxy every client therefore shares the proxy's
address and one counter. The counter is in memory, per process: several processes do not share it,
and a restart resets it. `/health` and `/docs` are neither limited nor counted.
