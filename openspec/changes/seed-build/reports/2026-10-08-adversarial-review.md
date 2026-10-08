# Adversarial review — seed-build (DIS-91)

- Date: 2026-10-08
- Change `seed-build`, PR #29, head `cccfb79`, base `origin/feature/entrega-2-CRN`.
- Run as a read-only subagent; this file transcribes its result.

**What was checked.**
- Read at head: the delta spec, `tasks.md`, design D4–D7 and Risks, and the test-and-verification report.
- Read the code: `seed-build.ts`, `seed/{seed-transaction,render-dump,deterministic-ids,fingerprint}.ts`, `export-seed.ts`, plus `indexWithEnvironment`, `toCliError` and `defaultOpenTransaction` in `compose-index.ts`.
- Read all five new spec files, the `buildOne` diff, `vitest.config.ts`, `.gitleaksignore` and `package.json`.
- Read the schema in `0001_graph-l1.up.sql` and the duplicate-symbol rule in `core/knowledge/validate-graph.ts`.
- Compared the seed in `2efe8de` with the one in `9cff8ee`.
- Ran `gh pr checks 29`.

**Checked and not raised.**
- **Symbol id collisions:** the core already rejects duplicate (file, name, start line), which is stricter than the seed's key.
- **Failed read-back:** it becomes `CommitUncertain` → `INTERNAL` with the seed message. The rollback and release still run (`compose-index.ts:263-276`).
- **Value types:** `weight` is `double precision` and the integer columns are `integer`, so `pg` returns numbers, not strings. All timestamps are `timestamptz`.
- **`node_count`:** it matches what `save-graph.ts:116` computes.
- **`displayPath`:** handles the root, its parent, another drive, and a directory named `..foo`.
- **Unique-edge `#0` mutation:** a renderer that adds `#n` only to duplicates is caught by "Ids derive from natural keys…" (`seed-render-dump.spec.ts:113-120`).
- **Existing tests:** none were modified. Only the five new spec files appear under `tests/`.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/cli/src/seed/fingerprint.ts:22,64-68`; spec `specs/seed-build/spec.md:194-210`; design D6 | The fingerprints cover only the PHP analyzer, `core/index`, `core/knowledge`, the parser versions, `AnalyzerPort.ts` and the `.up.sql` migrations. Code that also shapes the seed is not covered: the renderer (`packages/cli/src/seed/**`), the Git history adapter (`author_hash`, message parsing in `packages/adapters/git/src/`), and the store writer and export (`packages/adapters/store-postgres/src/save-graph.ts`, `export-seed.ts`). Verified: `9cff8ee` changed `render-dump.ts:138-140` and rewrote 32 lines of the seed, and no fingerprint header line changed. | The proposal says the fingerprint is how a stale seed is detected (PH-12), and `seed:build` does not run in CI. D6 justifies the inputs as "everything that shapes the rows", which this PR disproves. Once merged, a change to the renderer or these adapters leaves a stale seed that `verify` (CM-HU-14.1) cannot catch. |
| Minor | `specs/seed-build/spec.md:121-128` (commit `cccfb79`) | The spec was edited after implementation to match the code: every edge key now ends in `#n`, and a unique edge gets `#0`. Disclosed as an author decision in design Follow-ups A, with a stability reason in D4; the seed did not change. | The "spec edited to match code" pattern. The justification is sound and documented, so not a Blocker, but it should be visible to whoever archives the change. |
| Minor | `tests/integration/cli/seed-build.spec.ts`; `reports/2026-10-08-11-manual-interface-testing.md` | No test or manual step loads the generated SQL into Postgres. The column lists, the FK order, the `E'…\uXXXX'` literals, the quoted ISO timestamps and uniqueness of the derived ids are never checked against the real schema. | DIS-92 (`db:seed`) depends on this file. If it fails to load, that only shows up in the next ticket. Cheap fix: after a build inside the harness savepoint, run the dump and compare row counts with the summary. |
| Minor | `fixtures/build-history.mjs:90-99,108-170` (called from `seed-build.ts`) | `buildOne` writes marker or snapshot content into tracked fixture files and restores them only in `finally`. Ctrl+C during `npm run seed:build` (Node's default SIGINT handler skips `finally`), or two builds at once, can leave marker content in `fixtures/acme-shop/**`. The next run then reads that content as the "final" version and builds a seed from altered sources without any error. | The behaviour existed before, but `seed:build` now makes it the normal flow. Design Risks says "`buildOne` always restores the tracked sources", which is not true on SIGINT. `git status` would show the damage, but the build itself does not check. |
| Minor | `tests/integration/cli/index-command.spec.ts:297` and `tests/integration/cli/seed-build.spec.ts:271` | Two tests in different capabilities are both named "An unreachable database is reported without its URL". | Task 9.2 checks "no scenario with two tests" by grepping the title, which returns 2 hits, so the 1:1 traceability claim is not literally true. |
| Minor | `tests/unit/cli/seed-deterministic-ids.spec.ts` (case "a unique edge's id is the UUID v5 of its key ending in #0", added in `cccfb79`) | The case rebuilds `${key}${KEY_SEPARATOR}#0` exactly as `withOccurrence` does: it restates the implementation, and a change in the renderer would not make it fail. | The real protection is in the render tests. Presenting this case as the evidence for the `cccfb79` spec decision overstates it. |
| Minor | `tests/unit/cli/seed-build.spec.ts:224-230` | A unit test writes `.unit-seed-<pid>.sql` into the real checkout (`openspec/changes/seed-build/`) and removes it in `finally`. | A killed run leaves a stray file in the change directory; it also contradicts the reports' claim that tests "write only under the OS temp dir". |
| Question | `tasks.md` 12.2; `gh pr checks 29` | The green CI recorded for 12.2 is for head `364e672`. At head `cccfb79`, `quality` was still pending. | 12.2 is marked `[x]`, but there is no CI evidence yet for the reviewed head. |
| Question | `reports/2026-10-08-10-test-and-state-verification.md` | The tests of 3.3, 3.4, 4.3 and 4.4 passed on their first run: RED was not observed; forced failures (2)–(4) were run afterwards. | Process debt only, already disclosed. |

**Mutation the most important test would catch.** "Two consecutive builds produce identical files" runs two real builds on a database that already holds other projects. It would fail if the renderer kept any database id (for example `id: f.id` instead of `lookup(fileIds, f.id).id`), or if a table were not sorted.

## Verdict

**PASS WITH GAPS.** No Blocker. The Major on fingerprint coverage must be fixed in this change or given a tracked destination before archiving. The Minors need destinations too.

## Recommended next steps before archiving

1. **Major, fingerprint coverage — A (fix now):** add to the analyzer inputs (or a third fingerprint) `packages/cli/src/seed/`, `packages/adapters/git/src/` and `packages/adapters/store-postgres/src/{save-graph,queries,export-seed}.ts`; update the spec's "Fingerprints" requirement and its "covers exactly" scenario test; regenerate the seed; fix the wording in D6 and `docs/project-context.md`. Fallback B on CM-HU-14.1, documenting that any renderer change must bump `SEED_FORMAT_VERSION`.
2. **Minor, seed never loaded into Postgres — A:** one integration case that executes the dump in the savepoint and checks row counts; or B on DIS-92.
3. **Minor, SIGINT and concurrent builds in `buildOne` — C:** a `Deuda: seed-build` checklist item (SIGINT handler or lock file, and a clean-fixture check before the snapshot); correct the Risks line.
4. **Minors on the duplicate scenario name, the restating case and the test writing into the repo — C or fix now** (trivial).
5. **Minor, spec edited after implementation — D:** already in design Follow-ups A; mention it in the archive note.
6. **Question 12.2:** wait for `quality` on the head after fixes and link that run before 14.4/14.5.
7. Re-run `/verify-against-spec` after the fix in step 1 and add an addendum here (task 14.3).
