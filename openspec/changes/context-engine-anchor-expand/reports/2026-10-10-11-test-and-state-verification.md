# Test and State Verification Report

- Date: 2026-10-10
- Change: context-engine-anchor-expand
- Step: 11. Backend: Run Tests and Verify Data State

`DATABASE_URL` was exported from `.env` in a subshell for every command, without printing it.

## Commands executed

- `npx vitest run tests/unit/context tests/unit/store/in-memory-store.spec.ts tests/unit/knowledge/read-arguments.spec.ts tests/integration/store/graph-read.spec.ts`
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run --mutate "packages/core/src/context/**/*.ts,packages/core/src/knowledge/read-arguments.ts"`
- `npx stryker run --mutate "packages/core/src/context/anchor.ts"` (twice, to read every survivor; see Mutation testing)
- `node <scratchpad>/counts.cjs` (row counts of `project`, `file`, `symbol`, `edge`, `query_log`)
- `npm run seed:build` (step 10), `git diff seeds/graph-dump.sql`, `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`

## Test results

- Baseline (0.5, before any change):
  - without `DATABASE_URL`: 56 files passed, 12 skipped (68); 701 tests passed, 130 skipped (883);
  - with `DATABASE_URL`: 68 files passed (68); 883 tests passed (883).
- Targeted tests: 6 files, 101 passed, 0 failed, 0 skipped (graph-read 33, in-memory double 22,
  read-arguments 26, anchor 10 at that point, expand 9, coherence 1). After the mutation-driven tests
  below, anchor has 13.
- Required suite (`npx vitest run`, with the database): 72 files passed (72); 940 tests passed (940);
  0 skipped; 137 s.
- `npm run lint`: 0 problems. `npm run typecheck`: 0 errors. `npm run docs:coverage`: exit 0.
  `npm run lint:architecture`: 0 errors, 3 warnings — the same three `no-orphans` warnings as before
  the change (`packages/web/src/data/sample-projects.ts`, `packages/analyzers/typescript/{src,dist}/index`).
- Notes:
  - TDD order. Every scenario test of the port and adapter (tasks 1–2) was seen failing against real
    Postgres before its implementation (wrong error class, empty results, `fileId` undefined). The
    first double test, `questionTerms`, `anchor` and `expand` were each seen failing (module or export
    missing). The later double tests and the later `anchor`/`expand` scenario tests were born green,
    because the implementation written for the first GREEN already covered them. A manual temporary
    mutation of `anchor.ts` to prove the diacritics test was blocked by the repository's
    destructive-command hook, so mutation testing stands in for those checks.
  - Two exact-equality tests in `graph-read.spec.ts` ("Symbols are found by a case-insensitive
    fragment of the name", "A cycle yields each node once with its minimum distance") now also assert
    `fileId`: strengthened, not weakened.
  - Extra integration case, not a scenario: "An incoming cross-project edge never returns another
    project's node" (backs the project filter of the two `in` branches of the CTE).

### Mutation testing

Final run over the change's core scope: **98.46 %** (≥ `MIN_MUTATION_SCORE` 70).

| File | Score | Killed | Timeout | Survived |
|---|---|---|---|---|
| `context/anchor.ts` | 97.46 | 115 | 0 | 3 |
| `context/expand.ts` | 100.00 | 21 | 0 | 0 |
| `knowledge/read-arguments.ts` | 100.00 | 56 | 0 | 0 |

The first full run scored 97.95 % but with 86 timeouts: the string literals of `ANCHOR_STOPWORDS` are
static mutants (every test runs for them) and no test depended on most of them. A run on `anchor.ts`
alone listed the meaningful survivors: `token.length <= MIN_TOKEN_LENGTH` and stopword literals
(`'have'`, `'our'`, then others as timing varied). Three extra tests in `anchor.spec.ts`, not
scenarios, kill them: a three-character non-stopword token is kept (`tax`), an English question drops
its function words, and the exported stopword list is pinned with each word dropped on its own. The
three remaining survivors are equivalent mutants:

- `if (true) terms.add(token.slice(0, PREFIX_LENGTH))`: for a token of 3–5 characters the prefix is
  the token itself, which the `Set` already holds.
- `split(/[^\p{L}\p{N}]/u)` without `+`: it yields extra empty tokens, which the length filter drops.
- `if (true) found.set(symbol.id, symbol)`: it re-sets the same key to an equal symbol; a `Map` keeps
  the first insertion order.

### Scenario map (7.2)

Every `#### Scenario:` maps to exactly one test whose name is the exact title (`it('<title>'`):

- `specs/context-engine/spec.md`: 12/12 — `tests/unit/context/anchor.spec.ts` (7) and
  `tests/unit/context/expand.spec.ts` (5).
- `specs/graph-store/spec.md`: 24/24 in `tests/integration/store/graph-read.spec.ts`, of which 6 are
  new or changed: "Edges are followed from source to target only", "Incoming edges are followed with
  direction in", "Edges are followed both ways with direction both", "The traversal is one
  statement", "A symbol result carries the id of its file", "An invalid traversal direction is
  rejected before querying".
- The in-memory double runs 22 of the `graph-store` read scenarios as
  `<title> (in-memory double)` in `tests/unit/store/in-memory-store.spec.ts`. It leaves out those
  that need direct SQL ("A cross-project edge never returns another project's node", the reindex
  scenarios, which need `saveGraph`) and the statement counts (the double sends none).

### Privacy and ethics check (6.1)

PASS. The question is never logged (no logger or `console` in `packages/core/src/context/`) and
leaves the process only as `findSymbols` terms against the local database. The acme-shop subset holds
paths, symbol names and signatures of the synthetic sample, with no commit or author data. No
dependency change, no environment file in the diff; the local harness configuration stays
uncommitted.

## Data state verification

- Pre-test baseline:
  - local database rows: `project 0, file 0, symbol 0, edge 0, query_log 0`
  - `git status --porcelain seeds packages/web fixtures`: empty
  - `seeds/graph-dump.sql` sha1 `3d0906e00beeb7c6d71b284fd8e3ecdfc6bfd667`; header
    `analyzer-fingerprint: sha256:d93ea76f…a6370`, `contract-fingerprint: sha256:95c72d62…47738`
  - `packages/web/src/data/sample-projects.ts` sha1 `62a2b90897331e86c267f9aa8f0939f0598b8929`
- Seed regeneration (step 10, commit `3dfe28e`): `npm run seed:build` →
  `acme-shop: 53 files, 121 symbols, 170 edges, 32 commits`. The diff of `seeds/graph-dump.sql` is one
  line: `analyzer-fingerprint` → `sha256:38d3edc116a5a592f1d48eac9fc1ad34cb6b4e6621295981e119db9e33b52dbb`.
  `contract-fingerprint` and every row unchanged; `sample-projects.ts` unchanged.
- Post-test validation:
  - local database rows: `project 0, file 0, symbol 0, edge 0, query_log 0`
  - `seeds/`, `packages/web/`, `fixtures/`: no change since `3dfe28e`; `seeds/graph-dump.sql` sha1
    `c342d55f7018d0b1fccf6f1b7ac3fa929d10c2cb`, `sample-projects.ts` sha1 unchanged
  - no `.stryker-tmp/` left behind
- State restored: Yes (the manual test of step 12 loaded the seed and removed it; see its report)
- Restoration actions: none needed for this step

## UI evidence (if applicable)

- (none: the change has no browser UI)

## End-to-end testing (13.1)

Not applicable: no user interface uses the Context Engine yet (DIS-39 / CM-HU-12); it was exercised
against the real database in step 12 (`2026-10-10-12-manual-interface-testing.md`). The CI run is
linked below once the pull request exists (13.2).

## CI evidence (13.2)

PR #33, run [38047837133](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/38047837133)
on head `e88fb4c`: `quality` pass (6m22s), `scope`, `secrets` and `frontend` pass.

- Tests: 72 files passed; 939 passed, 1 skipped (`tests/unit/index/path-policy.spec.ts`, an existing
  platform skip unrelated to this change). `tests/integration/store/graph-read.spec.ts` (33),
  `tests/unit/store/in-memory-store.spec.ts` (22), `tests/unit/context/anchor.spec.ts` (13) and
  `tests/unit/context/expand.spec.ts` (9) ran and passed.
- Mutation step: `context` 97.84 % (`anchor.ts` 97.46, `expand.ts` 100), `read-arguments.ts` 100 %;
  all files 95.18 %.
- No separate seed-freshness job exists; the seed diff is checked in step 10.

The verify-against-spec fixes (`e629271`) trigger a new run; its result is recorded in the
adversarial-review report.

## Outcome

- Status: PASS
- Blocking issues: none
