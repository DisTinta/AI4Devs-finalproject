# Adversarial review

- Date: 2026-11-03
- Change: add-drift-detection (DIS-71), PR #106 against `final-project-CRN`
- Step: 13.5, inline mode of `adversarial-review` (autonomous run; text of the agent that ran the review step, a
  different session from the one that implemented the change)
- Read: `proposal.md`, `design.md`, `specs/drift-detection/spec.md`, `tasks.md`, the step 9 and 10 reports, the diff
  `origin/final-project-CRN...HEAD` (30 files), every file of `packages/core/src/drift/`, the drift tests and double,
  and the callees `verifyAnswer`, `verifyCitations`, `sanitizeForPrompt` (truncation), `meterLlm`, the Postgres and
  in-memory `readIndexState`, `indexRepository`
- CI at the start of the step (head `9acea03`): `secrets` failed, `quality` and `mutation` pending, the rest green

## Adversarial review

### Findings
| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `tests/unit/drift/drift.spec.ts:248` (before the fix), `packages/core/src/drift/drift.ts:120` | The clause "its root path, joined to the workspace root when relative" had no test that could fail: the unit test named "The documents and the commit are resolved against the workspace root" used the double's absolute root and asserted `expect(WORKSPACE).toBe('/workspace')`; the integration spec indexes through `indexRepository`, which stores the absolute real path (`packages/core/src/index/index-repository.ts:57`). Task 6.1 claimed the seed's relative root covered it, which is false for that spec. | The seeded projects store a relative root (`fixtures/acme-shop`, seen by show-spec-working), so it is the production path of DIS-73's CLI. Deleting the `join` broke no test (Stryker runs the unit tests only). **Fixed** in this step: double option `rootPath`, two tests; the hand mutation now fails the new test. |
| Minor | `.gitleaks.toml` (end), `openspec/changes/add-drift-detection/reports/2026-11-03-spec-audit.md:191,193` (commit `a04ab56`) | The first spec audit quoted a draft scenario with the synthetic Stripe-shaped value `sk_live_` + `abcdef123456`; gitleaks (`stripe-access-token`) fails the `secrets` job in `dir` and `git` mode. | A red required check blocks the merge. The value is synthetic (it never was a key: a literal invented for a draft scenario, replaced in the final spec by the AWS shape built by concatenation). **Fixed**: allowed by exact value in `.gitleaks.toml` (the documented route for a value still in the tree); local `gitleaks git` over `origin/final-project-CRN..HEAD` and `gitleaks dir openspec` print «no leaks found». |
| Minor | `openspec/changes/add-drift-detection/tasks.md` task 6.1 | The sentence "The seed's relative project root covers the "joined to the workspace root when relative" clause" is wrong (see the Major). | A reader of the archive would believe the clause was tested by the integration spec. Recorded as design Follow-up V1; the checked task text is left as written (history), the correction lives in the Follow-up and in this report. |
| Minor | `packages/core/src/drift/drift.ts:163` | The total cost is rounded with an inline `Math.round(x * 1e6) / 1e6`, the private `roundCost` of `explain/usage.ts:154` repeated. | Duplication only; same result, covered by "The usage adds every answer and verify call of the run". Not changed: exporting `roundCost` edits `explain/usage.ts` for no behaviour. Follow-up V3 (D, accepted). |
| Question | `packages/core/src/drift/contradiction.ts:111` | A configuration file joins the context when its normalised content *contains* a claim term as a substring (`tax` matches `syntax`). | This is the spec's wording ("contains at least one term") and is bounded by `MAX_CONFIG_SPANS` and the budget; over-inclusion costs tokens, never a wrong report (the model still judges, and the citations are verified). No change. |

### What was checked and held

- **Spec and task alignment.** 29 scenarios, 29 tests with the same name (grep), each asserting the `THEN` (read one by
  one; the request scenario checks every field named and that the store, the source and the model saw no call; the
  provenance scenario recomputes the hash from the messages actually sent). The spec was last edited in `1fe1d37`
  (audit round 2), before the implementation commit `d04ccc2`: it was not fitted to the code. Tasks 0–12 marked `[x]`
  have their evidence in the step 9 and 10 reports.
- **Hostile input.** `null`, arrays, strings and `undefined` as the request → `request`; an extra field → `request`
  without its name or value; `docPath` empty, 1,001 code points, with U+0000; Zod 4.6.7 counts code points (checked:
  three emoji pass `.max(3)`); `tokenBudget` one below the minimum, fractional, one over the maximum; a `docPath` with
  `..` or naming a non-document → `no-docs` with no read (it is only compared with stored document paths); a claim
  with `endLine` beyond the document or a first line over the limit → dropped; a verdict citing `C1`, `D1`, an
  unknown id, an id twice, no id → skipped with its subcode, never verified; an output over 65,536 UTF-8 bytes →
  `output_too_large` before parsing. The same request twice reuses the verification cache (cache hits, no write);
  two runs at once share nothing mutable but that cache. The product is local and single-user, with no ownership
  model; `drift` reads only the project it is given.
- **Blast radius.** `drift` writes nothing (no store write method is called; the database counts are unchanged
  before and after the step 10 run and the show-spec-working run). `explain.ts` and `claim-items.ts` change only a
  comment (diff read); the `verify` CI job and `npm run verify` pass, so no golden-answer fingerprint input moved.
  `packages/core/src/index.ts` adds `export * from './drift/index.js'`; `npm run typecheck` passes, so no export name
  collides. No migration, no dependency, no existing test file modified (`git diff --name-only` over `tests/`
  lists only drift files).
- **Evidence quality.** The most important test, "The report of a contradiction carries both citations, its type and
  its provenance", compares the claim, the evidence (path, lines, kind, exact excerpt, `entailed`) and the provenance
  with `toEqual`/`toMatchObject`; it would catch an evidence taken from the wrong span, a provenance listing the
  spans in another order or dated with the last clock read, and a hash of something other than the sent messages.
  Mutation score of `packages/core/src/drift/` about 96 % (step 9; survivors accepted in Follow-up R19).

### Verdict
PASS

No Blocker. The one Major (an untested production branch) and the CI-blocking Minor were fixed in this step and
re-checked; the remaining Minor and the Question are recorded with their destinations in design Follow-ups V1–V3.

### Recommended next steps before archiving
1. Wait for CI green on the fix commit (the `secrets` job must pass with the new allowlist entry; `mutation` takes
   30–60 minutes).
2. `/opsx:archive` (creates `openspec/specs/drift-detection/spec.md` with the delta's `## Purpose`), commit to the
   same PR, merge after CI is green.
3. DIS-73 (successor): wires `drift` into the CLI over the seeded projects, whose root is relative; the new unit test
   guards that path.
