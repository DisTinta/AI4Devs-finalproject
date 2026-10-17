## Why

Since DIS-21 the answer cache exists (`cache_entry`, `normalizeQuestion`, the stored-response schema
and the cache step of `explain`), but it is empty after `make up` / `npm run db:seed`: in evaluation
mode (no `LLM_BASE_URL`) every demo question of acme-shop answers `UNKNOWN` / `llm-required`, so an
evaluator without an LLM account cannot see a real answer, and `verify` (DIS-44) has no golden answers
to compare against. The readme already promises them ("las entradas *golden* llegan con DIS-26").

This is DIS-26 (CM-HU-13.2), the second sub-issue of CM-HU-13 (DIS-16, "Caché de evaluación"). Its
user story: "Como persona que evalúa CODEMIND sin cuenta de LLM, quiero que tras `make up` /
`npm run db:seed` las preguntas demo de acme-shop respondan al instante desde respuestas *golden*
versionadas, y como autora quiero regenerarlas con un comando y Ollama local, con una huella que diga
cuándo se han quedado viejas, para que la demo y `verify` funcionen a coste cero y sin depender de un
modelo." Its DoD: `seeds/cache/acme-shop.json` generated with a fingerprint; after `db:seed` the demo
questions answer in evaluation mode.

The decisions D1–D14 were taken by the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-26 `[enhanced]` description on
2026-10-17; the amendments of this proposal (D12 loads through the store port, D15 rebuilds the stale
seed, D16 the closed failure reasons, D17 the workspace seam) are recorded there too. The author
reviews them afterwards.

## What Changes

- New development command `npm run cache:build [-- <id>...]` (`packages/cli/src/cache-build.ts`, the
  pattern of `seed:build`; D1): for each golden demo question of acme-shop (Q1, Q3 and Q4 of
  `fixtures/README.md`, D2) it loads the versioned seed in a transaction, asks `explain` with a live
  model (`LLM_*`, Ollama `qwen2.5-coder` as reference, `useCache: false`), keeps the cacheable stored
  response and rolls the transaction back (D3), so the author's database never changes. It:
  - rebuilds acme-shop's history and refuses a stale seed: fixture `HEAD` ≠ the seed's
    `indexed_commit`, or seed header fingerprints ≠ the ones of the current code (D4, D15);
  - uses its own per-request timeout `CACHE_BUILD_TIMEOUT_MS` (default 20 min) and a `fetch` without
    the runtime's 300 s cut, because one CPU answer takes ~6–7 min (D6);
  - retries a question up to 3 times when the model's output is not cacheable or the model times out
    (D7), and writes the file only when every requested question succeeded, atomically (D8);
  - regenerates only the named questions when ids are given, keeping the others and their reviews,
    provided the existing file's fingerprints and models match (D8, D16);
  - prints one progress line per attempt and a final summary; one JSON error line on failure.
- New versioned file `seeds/cache/acme-shop.json` (format 1, D9, canonical render D10): project,
  the seed's two fingerprints, the new `answerFingerprint` (prompt files, confidence weights, stored
  format; D11), the models used, and one entry per question with its normalized key, the stored
  response and an empty `reviews` list (filled by DIS-34). Generated for real with local Ollama on
  CPU (D14).
- `npm run db:seed` also loads every `seeds/cache/*.json`: each file is checked before connecting
  (new `INVALID_SEED` reason `cache`), and its entries are saved as `cache_entry` rows of the sample
  project in the same transaction, through the store port (D12). stdout does not change (D13).
- The versioned seed `seeds/graph-dump.sql` is rebuilt with `npm run seed:build`: its analyzer
  fingerprint has not matched the code since DIS-21 (D15). Its rows must not change.
- Docs: `readme.md` §2.4, §2.5 and the cost table (the golden answers exist; how to regenerate
  them), `docs/project-context.md` (`cache:build`, the golden format and fingerprint, `db:seed`
  loading the cache, Ollama on CPU), `fixtures/README.md` (which demo questions have a golden answer
  and why Q2, Q5 and Q6 do not), `.env.example` (`CACHE_BUILD_TIMEOUT_MS`).

## Capabilities

### New Capabilities

- `golden-answers`: the `cache:build` command (contract, configuration, stale-seed refusal, how each
  answer is produced, retries, partial regeneration, atomic write), the golden file format, its
  canonical render and its fingerprint, and the coherence of the versioned golden file with the seed,
  the demo questions and the code.

### Modified Capabilities

- `seed-load`: "Command contract and configuration" (the golden files are read and checked before
  connecting; new `INVALID_SEED` reason `cache`), "Sample projects are loaded idempotently" (golden
  entries are replaced on every load, with new ids and a zero hit count); new requirement "Golden
  answers are loaded with the seed" (entries saved in the load's transaction, served from the cache in
  evaluation mode).

## Impact

- Code: `packages/cli/src/cache-build.ts` (new); `packages/cli/src/cache/{demo-questions,golden-file,
  answer-fingerprint,long-fetch,write-atomically}.ts` (new); `packages/cli/src/seed-load.ts` (reads
  and loads the golden files; `readSeed` exported); `packages/cli/package.json` (`zod`, the version
  core uses); root `package.json` (script `cache:build`). Neither `packages/core` nor any adapter changes, and no seed fingerprint
  input changes (D12): `packages/cli/src/seed/` and `packages/adapters/store-postgres/src/` stay as
  they are.
- Data: `seeds/cache/acme-shop.json` (new, generated); `seeds/graph-dump.sql` (header only, D15).
  No migration: `cache_entry` is used as DIS-21 left it.
- Tests: `tests/unit/cache/golden-file.spec.ts`, `tests/unit/cache/answer-fingerprint.spec.ts`,
  `tests/unit/seed/golden-questions.spec.ts`,
  `tests/unit/cli/long-fetch.spec.ts`, `tests/unit/cli/cache-build.spec.ts`,
  `tests/integration/cli/cache-build.spec.ts` (scripted model, no Ollama in CI),
  `tests/unit/seed/golden-coherence.spec.ts`; new scenarios in `tests/unit/cli/seed-load.spec.ts`
  and `tests/integration/cli/seed-load.spec.ts`. No existing test changes its assertions: the tests
  that call `loadSeed` directly (`tests/integration/api/ask.spec.ts`,
  `tests/integration/cli/ask-command.spec.ts`) load no golden answers, so the `http-ask` scenarios
  over the seed that ask the price question stay cache misses.
- Dependencies: `zod` added to `@codemind/cli` (already in the lock file through core). No new
  package in the lock file.
- Security and privacy: the golden file holds only model answers over redacted spans of a synthetic
  sample; the build fails when the rendered file contains the AWS key pattern, the repository's
  absolute path, `DATABASE_URL` or `LLM_BASE_URL`. No output contains a URL or credentials. Every
  insert is the store's parameterised, project-scoped SQL. No personal data.
- Operations: the real run needs local Ollama on CPU with `OLLAMA_CONTEXT_LENGTH=16384` and takes
  about 30 minutes; it is never run in CI.
- Commands and constraints: as in `docs/project-context.md` (`npx vitest run`, `npm run typecheck`,
  `npm run lint`, `npm run lint:architecture`, `npm run test:mutation`, `npm run docs:coverage`,
  `npm run db:migrate`, `npm run seed:build`, `npm run db:seed`).

### Non-goals

- Reviewing the golden answers or filling `reviews` (DIS-34, CM-HU-13.3); the format only reserves
  the field.
- Checking fingerprints in `db:seed` or CI: that is `verify` (DIS-44, CM-HU-14.1, PH-12).
- Golden answers for task-api (CM-HU-18.3), impact (Q2, CM-HU-16) or documentation drift (Q5); a
  golden answer for Q6, which answers `no-anchor` without the model and without the cache (DIS-21
  D14).
- Embeddings in the golden file (CM-HU-19); changes to `explain`, the stored-response schema, the LLM
  adapter or the migrations.
- Running Ollama in CI.
