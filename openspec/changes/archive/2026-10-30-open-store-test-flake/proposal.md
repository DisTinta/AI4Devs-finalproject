## Why

The existing integration test `Every connection is released after a run` of
`tests/integration/store/open-store.spec.ts` fails from time to time when the integration files run in
parallel: it compares the global number of projects before and after its runs
(`expect(await projectCount()).toBe(before)`), and other test files create and delete projects at the
same moment. The test itself creates no project, so that comparison checks nothing of its scenario and
only adds a race. This is finding A7 of `openspec/changes/archive/2026-10-30-pool-transaction-release/`
(`reports/2026-10-30-adversarial-review.md`, destination C, the author; follow-up X14 of its
`design.md`), which the author approved to fix now under the scope of DIS-110.

## What Changes

- In the `it` "Every connection is released after a run" of
  `tests/integration/store/open-store.spec.ts`, remove the line `const before = await projectCount();`
  and the assertion `expect(await projectCount()).toBe(before);`. The two remaining assertions stay
  unchanged: `close()` resolves within 2 s and `sessionsLeft(applicationName)` is 0.
- The helper `projectCount()` stays: the `it`s "Work that resolves is committed", "Work that rejects
  leaves nothing" and "Work's writes are invisible to another connection before the commit" of the
  same file still use it.
- No behaviour change: no production code, no spec requirement, no migration, no seed input.

## Non-goals

- No change to any other `it` of `open-store.spec.ts`, including the three that still compare
  `projectCount()` (design Follow-ups F1), and no change to any other test file.
- No change under `packages/**`, migrations, seeds, fixtures, CI or `docs/TESTING.md`.
- No new Linear ticket; no golden round (tests are not an input of the seed fingerprint, design D2).
- No change to `.claude/` or `.cursor/`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — `skip_specs: true`. The scenario "Every connection is released after a run" of the
`graph-store` requirement "Running work in one transaction on a pooled store" already states only the
close time and the remaining sessions; it never mentions the project count, so the test now matches
the scenario exactly and no requirement changes.)

## Impact

- Tests: `tests/integration/store/open-store.spec.ts` (one `it`, two lines removed).
- Seed fingerprint: unaffected (`packages/cli/src/seed/fingerprint.ts` hashes no file under `tests/`).
- Linear: one Spanish comment on DIS-110, which stays Done.

## Privacy and logging impact

None: a test-only edit, no personal data.
