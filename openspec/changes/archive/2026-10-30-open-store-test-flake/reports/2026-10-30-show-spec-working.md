# Show spec working: open-store-test-flake

- Date: 2026-10-30
- Change: open-store-test-flake (`skip_specs: true`)
- Interface: none (test-only edit). The evidence is the test itself, run against a real Postgres.

## Scenario exercised

`graph-store` → "Running work in one transaction on a pooled store" → scenario "Every connection is
released after a run" (`openspec/specs/graph-store/spec.md:1237-1241`), implemented by the `it` of the
same name in `tests/integration/store/open-store.spec.ts:229-246`.

## Evidence (reused from step 3, as `docs/openspec-tasks-mandatory-steps.md` §3 allows)

- Six runs with `DATABASE_URL` on the local test database (`reports/2026-10-30-3-test-and-state-verification.md`):
  five of `tests/integration/store` and one of `tests/integration` in parallel. The `it` passed in all
  six, with the files that create and delete projects running at the same time; in runs 3 and 6 the
  sibling `it` "Work that resolves is committed" failed on the very global-count comparison this change
  removes (`expected 1 to be 2` at `open-store.spec.ts:179:34`), which shows the race was live in those
  runs and no longer affects the changed `it`.
- CI of PR #88, run 41036062002: `quality` (whole suite, own database) green.

## Outcome

PASS: the scenario's two assertions (close within 2 s, no session left) hold; the global-count race no
longer touches this `it`.
