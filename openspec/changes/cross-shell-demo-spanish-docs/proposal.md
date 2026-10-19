## Why

A clean-clone test on 2026-10-19 (Windows, clone of `feature/entrega-2-CRN`) showed that the demo
only works in Bash: `make up` started the system from Git Bash, but in a second PowerShell terminal
`npm run cli -- ask acme-shop "…"` answered `MISSING_CONFIG` (`DATABASE_URL is not set`), because no
`npm run …` script reads `.env` (only the `Makefile` does). `docs/DEMO.md` asks the evaluator to
`export` the variable by hand with Bash syntax, and its `ask_api` helper, `sed -n` excerpt and
`; echo "exit: $?"` suffixes are Bash only. An evaluator on PowerShell stumbles at step 0. The
author also wants the four evaluator-facing documents (`docs/DEMO.md`, `docs/CONFIDENCE.md`,
`docs/DEPLOYMENT.md`, `docs/TESTING.md`) in Spanish, like the readme.

This is DIS-102 (labels `docs`, `dx`; no parent issue in Linear, so the ticket alone bounds the
change). Its decisions D1–D11 were taken by the agent as lead engineer in the autonomous run of
Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-102 Enhanced
description on 2026-10-19; the author's decisions of 2026-10-19 (the four documents in Spanish;
every evaluator step identical in PowerShell and Bash, no manual `export`/`$env:`) frame them.

## What Changes

- **`.env` is read by the guide's npm entry points** (D2–D4). A dependency-free parser and loader in
  `scripts/` load the repository root's `.env` (resolved from the module, not the working directory)
  into the process before `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build`,
  `seed:build`, the API's `dev`, `up` and `demo:ask` start. A variable already present in the
  environment wins, even when empty; without `.env` nothing changes. `test`, `test:a11y`,
  `test:mutation*`, `lint`, `lint:architecture`, `typecheck` and `docs:coverage` never load it, and
  the processes the test suite spawns do not either (the suite sets a skip switch, design D12), so no
  test depends on, or acts on, the `.env` of whoever runs it. Product code (`packages/*/src`) does not
  load it: it keeps reading `process.env`. `engines` stays `>=20.11` (no `process.loadEnvFile`, no
  `--env-file`, no `dotenv`).
- **`npm run up` / `npm run down`** (D5): one cross-shell start command written with Node built-ins
  only, so it runs before `npm install`: `docker compose up -d --wait`, `npm install`,
  `npm run db:migrate`, `npm run db:seed`, `npm run dev`, stopping at the first failing step with its
  exit code and a message naming it. `npm run down` is `docker compose down`, never with `-v`.
- **`Makefile`** (D6): `up` and `down` delegate to `npm run up` / `npm run down`; `include .env` and
  `export` go, so the environment beats `.env` on both paths. `logs` and `ps` stay.
- **Configurable Postgres port** (D7): `docker-compose.yml` publishes `${POSTGRES_PORT:-5432}:5432`
  and `.env.example` documents `POSTGRES_PORT` next to the matching `DATABASE_URL`. Without the
  variable, nothing changes.
- **Cross-shell demo helpers** (D8): `npm run demo:ask -- <projectId> "<question>"` replaces the
  Bash `ask_api` helper (same `HTTP <status>` line and summary), and
  `npm run demo:excerpt -- <project> <path>:<start>-<end>` replaces `sed -n` (confined to
  `fixtures/<project>`).
- **`docs/DEMO.md` rewritten in Spanish and cross-shell** (C): a prerequisites step (Docker running,
  port 5432 free or how to move it, Node and Git versions, copying `.env` with the one line that works
  in both shells), numbered steps in order whose commands run as-is in PowerShell and Bash (labelled
  variants side by side only where unavoidable), a web walkthrough of Screens 1 and 2 consistent with
  the wireframes and the real pages, and the real output of a clean-clone run in both shells (E).
- **`docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` in Spanish** (D9, D10), meaning and
  figures unchanged; commands, pasted output, identifiers, error codes and paths verbatim. Links and
  anchors to their new headings are updated (`readme.md`, `docs/project-context.md`, the four docs),
  and every sentence saying npm scripts do not read `.env` or that `DATABASE_URL` must be exported is
  corrected (`readme.md`, `docs/project-context.md`, `.env.example`).
- **`confidence-score` → "Published weights"** changes (D9): the document's sections become
  `Fórmula`, `Señales`, `Pesos` and `Límites`, and the eight limit statements are pinned in Spanish.
  `tests/unit/knowledge/confidence-doc.spec.ts` follows the modified requirement in the same commit as
  the delta (a requirement change, not a test edited to make the suite pass).
- **Screen 1's unavailable-API alert** (design D13): «Arráncala con make up y pulsa Reintentar.»
  becomes «Arráncala con npm run up y pulsa Reintentar.», so the hint the web gives works in any shell;
  the web test that pins the alert text follows the modified requirement.
- **Clean-clone run (E)** before the PR: a clone of the branch in the agent's scratchpad follows
  `docs/DEMO.md` literally with the Bash tool and with the PowerShell tool; its real output goes into
  the guide and the check is recorded in the PR body.

## Capabilities

### New Capabilities

- `local-startup`: how an evaluator starts and stops the system locally and runs the demo from
  either shell — the `.env` grammar and its loading (location, precedence, absence, which entry
  points load it and which never do), `npm run up` / `npm run down` and the `Makefile` delegation, the
  configurable Postgres port, the `demo:ask` and `demo:excerpt` helpers, and the cross-shell,
  Spanish demo, deployment and testing guides.

### Modified Capabilities

- `confidence-score`: requirement "Published weights" — `docs/CONFIDENCE.md` is written in Spanish;
  the required sections and the limit statements the test pins change language. The weights, the
  table's columns and the content required do not change.
- `project-picker`: requirement "API status on Screen 1" — the unavailable-API alert tells the reader
  to start the API with `npm run up` instead of `make up`, which does not exist in PowerShell (design
  D13). Nothing else of the screen changes.

## Impact

- New files: `scripts/env.mjs`, `scripts/load-env.mjs`, `scripts/up.mjs`, `scripts/demo-ask.mjs`,
  `scripts/demo-excerpt.mjs`, with `.d.mts` declarations for the modules the tests import;
  `tests/unit/scripts/*.spec.ts`.
- Changed (product, one string): `packages/web/src/pages/ProjectPickerPage.tsx` (design D13) and its
  test `packages/web/src/pages/ProjectPickerPage.test.tsx` ("A failed retry keeps the alert").
- Changed: root `package.json` (scripts `up`, `down`, `demo:ask`, `demo:excerpt`; the `.env` preload
  on the D4 scripts), `packages/api/package.json` (`dev`), `vitest.config.ts` (the suite's skip
  switch), `Makefile`, `docker-compose.yml`, `.env.example`, `docs/DEMO.md`, `docs/CONFIDENCE.md`,
  `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `readme.md` (§0, §1.3, §1.4), `docs/project-context.md` (including the language exception of the four guides, design D18),
  `prompts.md`, `tests/unit/knowledge/confidence-doc.spec.ts` (follows the D9 delta).
- Not changed: any other file under `packages/*/src` (the TSDoc that cites `docs/CONFIDENCE.md` names only
  the file, which keeps its name), `packages/api/dev-register.mjs`, fixtures, `seeds/`,
  `package-lock.json`, CI workflows. No input of the seed or answer fingerprint changes, so
  `npm run verify` stays green.
- Dependencies: none added (D2). No migration, no API or CLI contract change.
- Security and privacy: `.env` is still gitignored and never printed; the loader never logs keys or
  values; `demo:excerpt` refuses paths outside `fixtures/<project>`; `npm run down` never removes the
  data volume. No personal data.
- Commands and constraints: as in `docs/project-context.md` → Commands (`npx vitest run`,
  `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`,
  `npm run test:mutation`, `npm run db:migrate`, `npm run db:seed`, `npm run verify`).

### Non-goals

- Changing product behaviour (API, CLI, web) beyond loading `.env` in the entry points and the one
  start hint of Screen 1 (D13).
- An API route that lists projects (the demo passes the seed's fixed id).
- Translating any other document of the repository; raising Node `engines`.
- A public deployment; the dev-tool vulnerabilities `npm install` reports (separate debt).
- Making the web's Vite proxy follow a non-default `PORT` (it stays fixed at `127.0.0.1:3000`).
