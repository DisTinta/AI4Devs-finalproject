# Adversarial Review

- Date: 2026-10-28
- Change: task-api-seed-golden (DIS-32, PR #77, head `8c125f9`, base `final-project-CRN`)
- Mode: inline (autonomous run; `.claude/skills/adversarial-review/SKILL.md`, Inline mode), in a step separate from the apply

*Agent's text: autonomous run (docs/AUTONOMOUS-RUN.md §6), without the author.*

## Adversarial review

### Findings
| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/analyzers/typescript/src/symbols.ts:100` | `(list.flags & ts.NodeFlags.Const) !== 0` is also true for `await using` (TypeScript 5.9.3: `AwaitUsing` = `Const \| Using` = 6). A module-level `await using f = async () => 1;` gives a `function f` symbol; the spec speaks of `const` statements only. Verified with `ts.createSourceFile`. | Spec deviation on code that does not type-check (a function is not `Disposable`); no fixture is affected. Fixing it changes the analyzer fingerprint and forces an hour of golden regeneration. Deferred: **C**, Linear DIS-107 (Follow-ups R1) |
| Minor | `docs/project-context.md:1167`, `docs/DEPLOYMENT.md:81-91` | Both still showed the single-sample output: `1 project loaded` as the `make up` summary, and a `verify` output with only acme-shop's lines | An evaluator reading them expects the wrong output. **A**, fixed in this step (Follow-ups R2) |
| Minor | `packages/cli/src/seed/fingerprint.ts:129-140` | When `repoRoot` is a directory inside another repository's working tree without being its root (a ZIP unpacked inside a repository, the Stryker sandbox), `git ls-files` lists nothing for the fixtures instead of failing, so the fixtures silently drop out of the analyzer fingerprint | It fails safe: `verify` then reports `FINGERPRINT_MISMATCH` (`reason: seed`), never a false pass, and `seed:build` is only run by the author in a clone. Changing it would change the fingerprint and break the Stryker sandbox test (A2). **D**, accepted (Follow-ups R3) |
| Minor | `tests/unit/cli/cache-build.spec.ts:357` | "Every golden project is built without arguments" runs with doubles and does not assert that every evidence `fileId` names a task-api file of the seed | The clause is asserted on the real versioned files by `tests/unit/seed/golden-coherence.spec.ts:58`, which is where it can fail. **D**, accepted (Follow-ups R4) |
| Question | `openspec/changes/task-api-seed-golden/specs/local-startup/spec.md` | The `local-startup` delta was added after the last spec audit (commit `b5821b4`) | Not a spec bent to match code: it is the author's decision P7 (Linear comment e2237f60), test-first (task 13.1) and checked here: `scripts/up.mjs:74-78` and `tests/unit/scripts/up.spec.ts` match it. No action |

### What was checked

1. **Spec and task alignment.** Every requirement of the ten deltas has scenarios; every scenario maps to a test or a recorded check (`./2026-10-28-verify-against-spec.md`, final table). Tasks 0–11 and 13.1–13.3 marked `[x]` have their evidence in the step 8, 9 and 10 reports. The spec files did not change after the implementation commits except for the author's `local-startup` addition (`git diff 5ce7396 HEAD -- …/specs`).
2. **Hostile input.** `cache:build`: empty argv (all projects), `--project` without value, twice, `--project=…`, unknown option, unknown project, ids without project, repeated and lowercase ids, ids before the option — all in the spec's order (`cache-build.ts:224-259`, run live in `./2026-10-28-show-spec-working.md`). `index --language`: `cobol`, `TypeScript` (case) → `UNSUPPORTED_LANGUAGE`. `seed:build`: failure in the second project names it and writes nothing (`failing`, `seed-build.ts:108-121`); a history failure before the loop is `INTERNAL` with no path, as the spec requires. `cache:build` second-project failure: the `INTERNAL` message names the files already written; non-`INTERNAL` codes keep their own message, as specified. TS analyzer: `let`, `var`, several declarators, destructuring, parenthesised/`as` initializers, `declare const`, nested and block-level `const` — all yield nothing (scenario tests); `await using` is the one hole found.
3. **Blast radius.** `PortsFactory`/`defaultPorts` have no caller outside the CLI and its tests (grep). The PHP analyzer's output is unchanged (structure tests untouched; acme-shop's seed block identical line by line, step 8 report 6.1). `renderSeedDump`/`renderSampleProjects` callers: `seed-build.ts` and tests only. Readers of the seed and golden files (`db:seed`, `verify`, `ask`, the web constant) already handled N projects; the CI `verify` job passes with six golden answers. No migration.
4. **Evidence quality.** Existing tests changed are all named in `tasks.md` (1.1, 3.1, 4.1–4.6, 5.1–5.5, 6.3–6.6, 13.1) and the step 8 report lists them; none lost an assertion (the Stryker-sandbox guard of "fingerprint reads the real repository" is Follow-ups A2). The most important test, "A failure of the second project's repository names it", would catch a mutation that keeps `failing = SEED_PROJECTS[0].name` (the message would say `"acme-shop"`) or that renders before both read-backs (the previous seed would change). CI mutation job passed.

### Verdict
PASS WITH GAPS — no Blockers and no Majors; one Minor fixed (R2), the others with a destination: R1 → C (Linear DIS-107), R3 and R4 → D.

### Recommended next steps before archiving
1. Commit the doc fixes of R2 and the review reports; wait for CI green on PR #77.
2. Keep R1 in DIS-107 and fix it in the next change that touches `packages/analyzers/typescript/src` (that change regenerates the golden answers anyway).
3. `/opsx:archive` (task 12.7), reconciling the main `local-startup` spec (task 13.4).
