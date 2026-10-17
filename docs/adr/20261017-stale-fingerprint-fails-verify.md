# A stale seed or golden fingerprint fails `verify`, locally and in CI; the author regenerates locally

## Status
Accepted

## Context and problem
The versioned seed (`seeds/graph-dump.sql`, DIS-91/DIS-92) carries two fingerprints in its header
(analyzer and contract), computed from the files that decide what the indexer writes: the store
adapter, `core/index`, `core/knowledge`, the PHP analyzer, the git adapter, the fixtures and the seed
build itself. Each golden file (`seeds/cache/*.json`, DIS-26) carries the seed's two fingerprints and
an answer fingerprint over the prompts, the statement schema and typing rules, the verification
policy, the confidence weights and the stored-response format (`ANSWER_FINGERPRINT_FILES`). When one
of those files changes, the versioned seed or golden answers may no longer be what the current code
produces (PH-12), but nothing failed: `npm run verify` was a placeholder that printed "pending" and
exited `0`.

DIS-44 makes `verify` real (`packages/cli/src/verify.ts`) and runs it in its own CI job. The handover
comment of DIS-91 left open what a stale fingerprint should do: warn, fail, or regenerate in CI. The
answer binds every later pull request that touches a fingerprint input (DIS-32, DIS-45, any change to
`core/knowledge`, the store adapter or the prompts), not only this one.

Decided by the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`, on branch `feature/DIS-101-readme-entrega-2` until it
reaches the base branch), decision D2 of DIS-44, on 2026-10-17. The author reviews it afterwards.

## Options considered
* **Warn**: `verify` prints a warning and goes on comparing answers.
* **Fail**: `verify` exits `1` with `FINGERPRINT_MISMATCH` before asking any question, and says which
  command to run.
* **Regenerate in CI**: the CI job runs `seed:build` and `cache:build` itself.

## Decision
We choose **fail**, locally and in the CI `verify` job. The reasons are the agent's (D2):
* A warning leaves CI green on a seed or golden answers the indexer no longer produces, which is
  exactly the risk PH-12 names.
* Regenerating in CI is not possible: `seed:build` needs the author-hash salt, which is not versioned
  (PH-11), and `cache:build` needs a live model (about 30 minutes on CPU with Ollama); PH-12 had
  already ruled out regenerating on every CI run.
* The error says exactly what to run: `run npm run seed:build, then npm run cache:build` for a stale
  seed, `run npm run cache:build` for a stale golden file.

## Consequences
* Any pull request that touches an input of the seed fingerprint or of the answer fingerprint turns
  the `verify` job red until its author runs `npm run seed:build` and then `npm run cache:build`
  locally and commits the regenerated files. The regenerated golden entries come back with empty
  `reviews`, so they need a new review (DIS-34 flow).
* Only the `verify` job goes red: the unit and integration tests inject the fingerprints (DIS-44
  amendment A4), so a stale fingerprint does not fail the whole suite.
* The fingerprint ties the versioned files to the code, never a database to the files: a local
  database seeded before a regeneration still needs `npm run db:seed` before `verify`
  (`docs/project-context.md` → Gotchas).
* Reverting it means turning the failure into a warning in `verify.ts`; the cost of reverting is low,
  the cost of the policy is paid by every later PR that touches a fingerprint input.
