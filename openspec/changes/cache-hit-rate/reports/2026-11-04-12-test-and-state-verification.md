# Test and State Verification Report

- Date: 2026-11-04
- Change: cache-hit-rate
- Step: 12. Backend: Run Tests and Verify Data State (MANDATORY)

Text of the agent (autonomous run, DIS-69).

## Commands executed

- `npx vitest run --project dom --project seed-build --project node` (baseline, no `DATABASE_URL`)
- `DATABASE_URL=…/codemind_dis69_test npx vitest run tests/unit/cache tests/unit/store tests/unit/api tests/unit/cli tests/unit/seed tests/unit/explain tests/integration/store tests/integration/api tests/integration/cli` and `npx vitest run --project dom`
- `DATABASE_URL=…/codemind_dis69_test npx vitest run --project dom --project seed-build --project node` (final)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run seed:build`, `npm run cache:embed` (live), `npm run verify` (scratch database seeded)
- `npx stryker run`, then `npx stryker run --force --mutate packages/core/src/cache/hit-rate.ts`

The integration specs ran against `codemind_dis69_test`, a migrated, empty scratch database (the harness refuses
a database holding committed projects, so the shared `codemind` database was not used).

## Test results

- Baseline (no database): 202 files passed, 31 skipped; 2144 tests passed, 297 skipped (92.8 s).
- Targeted tests: all passed.
- Required suite (final, with the scratch database, so nothing skipped): 236 files passed; 2516 tests passed,
  0 failed, 0 skipped; 349.8 s.
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture` (0 errors; one pre-existing orphan warning on
  `packages/web/dist`), `npm run docs:coverage`: clean.
- `npm run verify` over the seeded scratch database: `acme-shop: 3/3` and `task-api: 3/3 golden answers match`.
- Notes: a broader run of the integration specs once failed two tests (`projects-command`, `seed-load` "A seed
  without golden files…") that pass alone and in the next full runs: the known races of specs that commit to the
  shared database (DIS-110), not a regression. The `RED` of 8.3 and part of group 4 was nominal: the module of 8.2
  existed before its later tests were written, and 4.x tests were written together with their code.

## Stryker (12.4)

- Full run: **92.66** (threshold 80), 27 min 42 s. After the survivors below were handled: **92.76**.
- Survivors of `packages/core/src/cache/hit-rate.ts` (three: fixed message, the `>= 0` and `<= 2147483647` bounds):
  killed with new tests below the scenarios (`tests/unit/cache/hit-rate.spec.ts`); the file is now 100 % (33/33).
- `packages/api/src/routes/ask.ts`: the throw for a missing `projectCache` was uncovered; new test in
  `tests/unit/api/ask.spec.ts`. `packages/cli/src/commands/projects.ts`: only uncovered the default store read,
  which needs a database (covered by the integration spec) and the pre-existing parser survivors.
- `packages/cli/src/cache-embed.ts` (new): the `--project` filter, the `after writing` message and the argument
  loop got tests; the rest are the entry-point guard, `DEFAULT_REPO_ROOT`, the `join(', ')` separator (only one file
  can precede a failure with two projects) and an `instanceof CliError` branch that `toAskFailure` also covers:
  equivalent or the same survivors `cache-build.ts` already has. `usage-display.ts` is outside Stryker's `mutate` set.
- No `.stryker-tmp/` left.

## Existing tests edited (10.2), none weakened

| File | Test | Reason |
|---|---|---|
| `tests/unit/explain/explain.spec.ts` | "A question holding U+0000 is rejected before the store", "A malformed request is rejected before the store", "An invalid token budget, hop count or workspace root is rejected before the store" | the double's call counters gain `countExplainQueries: 0` |
| `tests/unit/api/ask.spec.ts` | "answers llm-required with its message and copies the usage…"; "The document lists ask…"; "throws on a statement citing an evidence id absent…" | usage gains `projectCache`; document asserts its schema; `toPublicAnswer` gains its argument |
| `tests/integration/api/ask.spec.ts` | "An answered question returns only the public fields over the seed" | `projectCache` in the key list and its exact value |
| `packages/web/src/pages/AskPage.test.tsx` | "An answer from the model…", "A cache hit…", "No saving is not shown as a saving" | fixtures and the project cache line; the «%» check covers the text before that line |
| `packages/web/src/services/api-client.test.ts`, `tests/a11y/ask-page.a11y.test.tsx`, `tests/e2e/ask-page.a11y.spec.ts` | usage fixtures | typed `projectCache`, assertions unchanged |
| `tests/unit/cli/projects-command.spec.ts` | "prints one line per project…", "escapes a name…", "prints printable values…", "fills the template…", "marks a sample…" | the `cache` field and the `count` log entries |
| `tests/integration/cli/projects-command.spec.ts` | "Sample and user projects are listed" | writes 10 `explain` and 2 `impact` rows and expects the modified lines |
| `tests/unit/cache/golden-file.spec.ts` | "The canonical render is stable", "Golden files with an invalid shape are rejected" | `questionEmbedding` |
| `tests/integration/cli/cache-build.spec.ts` | "Only the named question is regenerated" | vectors kept, regenerated one `null` |
| `tests/integration/cli/seed-load.spec.ts`, `tests/unit/cli/seed-load.spec.ts` | "Golden answers are loaded and served…", "Loading golden answers again…", "saves every golden entry…", "saves every golden drift entry…" | the stored vector; the fourth argument |
| `tests/unit/seed/golden-coherence.spec.ts` | both "The versioned … golden file matches…" | every `questionEmbedding` usable |
| `tests/unit/store/in-memory-store.spec.ts`, `tests/unit/cache/similarity-cache.spec.ts` | (only gain a test) | |
| `tests/support/in-memory-store.ts`, `tests/support/golden-file.ts` | support | the counter; `questionEmbedding: null` and `goldenVector` |

`tests/support/explain-doubles.ts` needed no edit: it spreads the base store.

## Seed fingerprints (9.1) and vectors (9.3)

- `npm run seed:build`: `git diff --stat seeds/graph-dump.sql` is one line, the analyzer fingerprint
  (`sha256:da160de5…` → `sha256:c0eb8315…`); no row changed and `sample-projects.ts` was not rewritten. Copied into
  `seeds/cache/acme-shop.json`, `seeds/cache/task-api.json`, `seeds/drift/acme-shop.json` and
  `docs/measurements/graph-quality.json`. No `cache:build`, no `drift:build` (design S11).
- 7.3b: `git diff --numstat seeds/cache` was `3 0` per file; hashes `567bb8c2…` / `6079da48…`.
- 9.3: `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=qwen2.5-coder LLM_EMBED_MODEL=nomic-embed-text npm run cache:embed`
  printed `acme-shop: 3 question embeddings -> seeds/cache/acme-shop.json` and `task-api: 3 question embeddings -> seeds/cache/task-api.json`.
  A scratch script confirmed each file with the vectors set to `null` equals the file before; the six vectors have
  length 768 and norm 1.000000. Final hashes `cfffacae…` and `a445a4dc…`.

## Data state verification

- Pre-test baseline (shared database `codemind`):
  - `SELECT count(*) FROM project`: 2
  - `SELECT count(*) FROM cache_entry`: 7
  - `SELECT count(*) FROM cache_entry WHERE question_embedding IS NOT NULL`: 0
  - `SELECT count(*) FROM query_log`: 0
  - `SELECT max(created_at) FROM query_log`: empty
  - `git hash-object seeds/cache/acme-shop.json seeds/cache/task-api.json`: `1287e8a5…`, `d30e61e0…`
- Post-test validation: the same five values (2, 7, 0, 0, empty); `codemind_dis69_test` holds 0 projects, 0 `query_log`
  rows and 0 cache entries after the full suite.
- State restored: Yes (shared database). The scratch databases `codemind_dis69` and `codemind_dis69_test` were not
  dropped: the kit's destructive-command hook denies `DROP DATABASE` and nobody can confirm it in an autonomous run
  (see `design.md` → Follow-ups, destination D).

## Privacy / ethics check (12.5)

Verdict: PASS. Scope: the response and the CLI carry two integers and a percentage per project, no question text;
the request log holds no question (checked in step 13); the only new text sent anywhere are the golden questions
(public demo questions), by `cache:embed` to the endpoint configured in `LLM_BASE_URL` and nowhere else; the golden
vectors are embeddings of those public questions; no new dependency (no install, no lockfile change). A grep of the
diff for emails, `AKIA` keys, `Authorization:`, passwords and API keys found only test sentinels (`k3y`, `/secret/path`).
No ADR is needed (11.4): the decisions are local and reversible (design S1 to S14).

## Outcome
- Status: PASS
- Blocking issues: none
