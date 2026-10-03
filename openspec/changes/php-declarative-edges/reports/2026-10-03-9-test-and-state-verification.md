# Test and State Verification Report

- Date: 2026-10-03
- Change: php-declarative-edges
- Step: 9 — Run Tests and Verify Data State

## Forced failures (task 7.4)

Each bug was introduced, the single named test was run to confirm the failure, then the file was
restored from a scratchpad backup and the restoration confirmed with `cmp` (`names.ts`,
`php-analyzer.ts`) or by re-running the suite green again (`doc-mentions.ts`, `edges.ts` — new
untracked files this change, so `cmp` was used against the scratchpad backup taken before the
mutation rather than against a git baseline):

1. **Resolve by short name** (`names.ts`'s `resolveClassName` reduced to `lastSegment(raw)`,
   `edges.ts`'s `buildFqnTable` keyed by `type.name` instead of the namespaced FQN) → "Names resolve
   by fully-qualified name, never by short name" failed: `PriceCalculatorTest` wrongly got an
   `extends` edge to `tests/TestCase.php`'s `TestCase` (1 failed, 14 passed in `edges.spec.ts`).
   Restored both files; `cmp` confirmed identical to the backups.
2. **Count prose tokens** (`doc-mentions.ts`, `codeText = file.content` instead of
   `codeRegionsOf(file.content)`) → "The acme-shop README describes the symbols it names in code"
   failed: `docs/pricing.md` wrongly got a `describes` edge from its prose ("Order of operations",
   "Pricing rules"). Restored; `cmp` confirmed identical to the backup.
3. **Drop `sortUniqueEdges`, reverse the input** (`php-analyzer.ts`,
   `[...buildPhpEdges(...), ...docMentionEdges(...)].reverse()`) → "The acme-shop analysis is a valid
   deterministic graph" failed: `edges` was no longer ordered by `compareEdges` (`tested_by` edges
   appeared before `imports` edges). Restored; `cmp` confirmed identical to the backup.

## Mutation score (task 2.4)

- `npx stryker run --mutate "packages/core/src/knowledge/doc-mentions.ts,packages/core/src/knowledge/edge-order.ts"`
  → `doc-mentions.ts` **96.77 %** (89 killed, 1 timeout, 3 survived), `edge-order.ts` **94.64 %** (53
  killed, 3 survived); both well above `MIN_MUTATION_SCORE=70`. The 6 remaining survivors are
  equivalent mutants (`aIsFile && bIsFile` vs `||` after the preceding guard already forces both
  equal; re-`set`ting a `Map` entry with an identical value; a dedup-key tag string that cannot
  collide given the differing array shapes) or Stryker's seeded-placeholder-array mutants that no
  realistic symbol name can trigger.
- Full `npx stryker run` (whole of `packages/core/src`) → **93.89 %** overall (`doc-mentions.ts`
  96.77 %, `edge-order.ts` 94.64 %, every pre-existing file at or above its prior score). No
  regression.

## Commands executed

- `npx vitest run tests/unit/knowledge/edge-order.spec.ts tests/unit/knowledge/doc-mentions.spec.ts tests/unit/analyzers/php` (×2, flakiness check)
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npx stryker run`
- `npx vitest run --exclude 'tests/integration/**'` (no `DATABASE_URL`)
- `git status --porcelain fixtures`
- `git ls-files -s fixtures/acme-shop | sha1sum`

## Test results

- Targeted tests (×2): 59 passed, 0 failed, 0 skipped both times (`edge-order.spec.ts` 14,
  `doc-mentions.spec.ts` 16, `edges.spec.ts` 15, `structure.spec.ts` 14).
- Full suite (`npx vitest run`): 176 passed, 99 skipped (no `DATABASE_URL`), 0 failed — 16 test files
  passed, 7 skipped.
- `npm run lint`: 0 errors, 1 pre-existing warning (`LlmPort.ts` empty interface, unrelated to this
  change).
- `npm run typecheck`: clean.
- `npm run lint:architecture`: 0 errors, 4 pre-existing `no-orphans` warnings (empty stub packages).
- `npm run docs:coverage`: clean (every new export carries TSDoc).
- `npx stryker run`: 93.89 % overall, see above.
- No-database run (`--exclude 'tests/integration/**'`, no `DATABASE_URL`): 12 test files, 150 passed,
  including both new spec files and the updated `structure.spec.ts` — no import error.
- Baseline (task 0.4, before any change): 131 passed, 99 skipped, 13 files passed / 7 skipped (20
  total). Post-change: 176 passed (+45: the 3 new spec files plus the new scenarios in
  `edges.spec.ts` and `structure.spec.ts`'s updated assertions), 99 skipped, 16 files passed / 7
  skipped (23 total, +3 new spec files). No existing test's outcome changed beyond the two MODIFIED
  scenarios the change explicitly updates.
- Runtime: full suite ~28–31 s per run.
- Notes: no flaky test across repeated runs.

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
  - Tracked files under `fixtures/acme-shop`: 53
  - Database: no DB entity impacted (this change adds no migration, no store call)
- Post-test validation:
  - `git status --porcelain fixtures`: empty (unchanged)
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- State restored: Yes (nothing to restore — the fixture was never mutated; the three deliberate bugs
  of task 7.4 were restored from scratchpad backups and confirmed with `cmp`, as detailed above)
- Restoration actions: none needed beyond the 7.4 proof-and-restore cycle already described

## UI evidence (if applicable)

- (none — this change has no browser UI; see task 11.1)

## End-to-end testing (task 11.1)

Not applicable: this change adds no user interface, no HTTP route and no CLI command. The interface
is `createPhpAnalyzer()`, exercised directly in the Manual Interface Testing report (step 10). There
is no user workflow to drive end to end.

## Outcome

- Status: PASS
- Blocking issues: none
