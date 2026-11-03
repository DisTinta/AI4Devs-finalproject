# Verify against spec — graph-quality-measurement (DIS-79)

*Agent's text, autonomous run, review step (2026-11-03), inline mode of `verify-against-spec`
(`docs/AUTONOMOUS-RUN.md` §6). Task 11.4. Spec: `specs/graph-quality/spec.md` (ten requirements, 26
scenarios). Code at the head of PR #102 plus the fix of this step (`scripts/measure-graph.mjs:213`).*

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Freeze check before measuring | `scripts/measure-graph.mjs:57-67` (`freezeProblems`, report prefix), `:554-555` (runs before any other read) | `tests/unit/scripts/measure-graph.spec.ts:94`, `:113` |
| The graph is read from the seed | `scripts/measure-graph.mjs:116-121` (four tables), `:131-165` (`readLiteral`: `'…'`, `''`, `E'…'`, `\\`, `\uXXXX`, `NULL`, booleans, numbers), `:173-190` (`readRow`), `:205-259` (`readSeed`, referential check `:220-228`), `:281-291` (unreadable seed, missing project) | `measure-graph.spec.ts:199`, `:216`, `:231`, `:248`, `:262`, `:288` |
| Annotation files are complete | `scripts/measure-graph.mjs:92-113` (`checkAnnotations`), `:268-280` (unreadable file) | `measure-graph.spec.ts:155`, `:174` |
| Site matching and attribution | `scripts/measure-graph.mjs:356-367` (`calledNames`), `:380-397` (`calls` of the project only), `:418-465` (scope `:421-428`, hits `:429`, attributed `:431`, recorded hit `:441`, false positives `:434-443`, outcome `:445-446`) | `measure-graph.spec.ts:387`, `:399`, `:411`, `:423`, `:443`, `:458`, `:470`, `:486`, `:513`, `:531`, `:542` |
| Measures per project | `scripts/measure-graph.mjs:309-312` (`roundRatio` from integers), `:466-485` | `measure-graph.spec.ts:564`, `:600`, `:612` |
| Measurement output and CLI | `scripts/measure-graph.mjs:37-48` (`--root` only, once), `:496-513` (layout, two-space indentation, final LF), `:521-524` (stdout line), `:547-562` | `measure-graph.spec.ts:74`, `:632` |
| Committed measurement matches the repository | `docs/measurements/graph-quality.json` | `tests/unit/docs/graph-quality.spec.ts:62` |
| Published Table 2 | `readme.md` §2.6 (`#### Mediciones que se publicarán`, Table 2, agreement lines, link); `formatRatio` `:322-326`, `formatAgreement` `:338-342` | `graph-quality.spec.ts:88`, `:114` |
| Measurement report | `docs/measurements/graph-quality.md` | `graph-quality.spec.ts:131` |
| The frozen sources are not modified | no file under `fixtures/annotations/`, `docs/measurements/annotation/` or `docs/measurements/annotation-agreement.md` in `git diff origin/final-project-CRN` (0 lines, show-spec-working report → State) | `graph-quality.spec.ts:78`, `tests/unit/docs/annotation-freeze.spec.ts` (unmodified) |

## 2. Requirements missing or partial

- **"The graph is read from the seed": "every other table … SHALL be ignored."** Partial at the head of the
  PR: a table whose name is an `Object.prototype` member (`constructor`, `__proto__`) passed the
  `table in SEED_COLUMNS` test of `scripts/measure-graph.mjs:213` and the reader crashed with
  `(SEED_COLUMNS[table] ?? []).find is not a function` (exit 1 without naming the seed). **Fixed in this
  step** (`Object.hasOwn`), test `measure-graph.spec.ts:231` written first and seen failing. Same finding
  as adversarial-review F1.
- Nothing else is missing.

## 3. Unspecified behaviour

Checked one by one; none is scope nobody asked for, so nothing is removed:

- `--root` followed by a value starting with `--` is a usage error (`scripts/measure-graph.mjs:45`). The
  spec makes "any other argument" a usage error, and `--root --verbose` holds one; the spec covers it.
  Decision: keep (destination D, recorded in design → Follow-ups).
- An annotation text that is JSON but has no `sites` array gives `<file>: holds no list of sites`
  (`:100`). It is the "exactly 50 sites" rule of "Annotation files are complete" when the list is absent;
  covered.
- An `edge` whose `source_symbol_id` / `target_symbol_id` names no `symbol` row is not an error
  (`:223-243` only check `project_id` and the `*_file_id` columns). The spec makes only rows naming no
  `project` or `file` row malformed; design D2 (R3-I2) states the symbol case explicitly, as
  `seedProjects` does. Consistent with the spec, not extra behaviour.
- Number literals accept a leading `-` and a decimal part (`:137`): the spec's "a number". Covered.

Specific checks:

- **Dependencies:** `scripts/measure-graph.mjs:11-14` imports only `node:fs`, `node:path`, `node:url`
  and `./annotation-agreement.mjs`; `package.json` gains only `scripts.measure:graph`. No new dependency.
- **Authorisation:** the spec requires none (a local read-only command over repository files).
- **Fields not in the spec:** the JSON has `formatVersion`, `seed.{path, analyzerFingerprint}` and, per
  project, `fixture`, `language`, the nine measures and `sites`; per site `id`, `call`, `site`,
  `expected`, `outcome`, `hit`, `attributedEdges`, `falsePositiveEdges`. All are named by "Measures per
  project" and "Measurement output and CLI". None extra.
- **Weaker tests:** "The frozen sources still match their hashes" (`graph-quality.spec.ts:78`) asserts
  only `checkFreeze(...) === []`; the other two clauses of its `THEN` (the freeze test passes unmodified,
  the diff touches none of the frozen paths) are proved by the suite and by the `git diff` of task 5.6
  and of the show-spec-working report, not by that test. Accepted (D): a unit test cannot read the
  branch diff without network access to the base. Every other test asserts the full `THEN`.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| A frozen annotation file was modified | `measure-graph.spec.ts:94` | green |
| The agreement report is missing | `measure-graph.spec.ts:113` | green |
| The seed reader agrees with the CLI's seed parser | `measure-graph.spec.ts:199` (+ `:216`) | green |
| A project of the annotations is not in the seed | `measure-graph.spec.ts:262` | green |
| A malformed seed line is an error | `measure-graph.spec.ts:288` (+ `:248`) | green |
| An annotation file has 49 sites | `measure-graph.spec.ts:155`, `:174` | green |
| An edge from the enclosing symbol to the annotated target is a hit | `measure-graph.spec.ts:387` | green |
| An edge from the site's file is in scope | `measure-graph.spec.ts:399` | green |
| A positive site without a matching edge is a miss | `measure-graph.spec.ts:411` | green |
| An edge with the called name to another target is a false positive | `measure-graph.spec.ts:423` | green |
| A none site with an attributed edge is a false positive | `measure-graph.spec.ts:443` | green |
| A none site without an attributed edge is a true negative | `measure-graph.spec.ts:458` | green |
| Two sites in one symbol do not count each other's hit as a false positive | `measure-graph.spec.ts:486` | green |
| An edge of another kind or another project does not count | `measure-graph.spec.ts:513` | green |
| A source symbol whose range ends before the site is out of scope | `measure-graph.spec.ts:531` | green |
| The called name of a route action, an array callable and a snake_case read | `measure-graph.spec.ts:470` | green |
| Of two hits the one with the expected resolution is recorded | `measure-graph.spec.ts:542` | green |
| Measures of a synthetic project | `measure-graph.spec.ts:564` | green |
| Undefined measures are null | `measure-graph.spec.ts:600` | green |
| The measurement is deterministic | `measure-graph.spec.ts:632` | green |
| An unknown argument is a usage error | `measure-graph.spec.ts:74` | green |
| The committed JSON is the current measurement | `graph-quality.spec.ts:62` | green |
| The README table agrees with the measurement | `graph-quality.spec.ts:88` | green |
| A TypeScript figure below PHP is explained | `graph-quality.spec.ts:114` | green |
| The report agrees with the measurement | `graph-quality.spec.ts:131` | green |
| The frozen sources still match their hashes | `graph-quality.spec.ts:78` | green |

26 of 26 scenarios have a test with the same name; all green (`npx vitest run tests/unit/scripts
tests/unit/docs`: 16 files, 122 tests, after the fix).
