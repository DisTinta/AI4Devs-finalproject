# Adversarial Review — index-repository-debt (DIS-100)

- Date: 2026-10-08
- Run: `/adversarial-review index-repository-debt` (forked agent, read-only), after
  `/show-spec-working` and the fixes of `/verify-against-spec`.
- Scope reviewed: the uncommitted working tree on `feature/DIS-100-index-repository-debt` against
  `7e6d25a`, and the change artifacts.

## Verdict of the review

**PASS WITH GAPS**: no Blocker, no Major, three Minors and two questions. It checked with no finding:
the scenario ↔ test mapping, the skip-reason order and the 1 MiB boundary, hostile inputs (empty
tree, `BAD` sizes, invalid object ids, back-pressure, EPIPE), the security of `spawnReaderGit`
(pinned `-c` config, closed environment, no shell, seams not exported), the agreement between core's
`FORBIDDEN_PATH_CHARACTER` and the CLI's `TERMINAL_UNSAFE`, where skipped paths go, and the existing
tests that were modified.

## Findings and what was done

| Severity | Finding | Action |
|---|---|---|
| Minor | When `cat-file --batch` dies part-way, stdout ends first, the reader throws "ended after N of M objects" and git's own error is never shown, contrary to design D3 | **Fixed (A).** New `EarlyEnd` answer error: on an early end the reader does not stop git and rejects with git's error when git exits non-zero. RED first: the new test "rejects with git's error when cat-file dies part-way through the batch" (a stand-in process cuts a real batch answer and fails) got `git cat-file --batch ended after 1 of 2 objects`; green after the fix. |
| Minor | Dropping non-UTF-8 links before core also removes them from a commit's 100-file count for co-change edges; no scenario said so | **Fixed in the spec (A).** One sentence in the `git-history` delta ("History reading"): such a path is not one of its commit's files for co-change edges either. Design D4 notes the effect. |
| Minor | The new byte-level parsers (`BatchAnswers`, `LogParser`, `parseTree`) had no mutation testing | **Fixed (A).** `parseTree`, `BatchAnswers` and the answer errors are exported by their module (not by the package) and covered by `tests/unit/git/git-source-tree-parsers.spec.ts` (11 tests); `parse-log.spec.ts` gained 4 tests. Stryker: `git-source-tree.ts` parser ranges (lines 130–160, 256–305) **92.63 %**, `parse-log.ts` **82.64 %** (was 74.38 %). The survivors are equivalent (`Buffer.from` of a Buffer, concatenating an empty `pending`, pushing an empty tail, the `end()` extra-bytes check already enforced by `takeAnswer`, counts git never prints mixed as `-` and a number) or anchor variants of the size and sha regexes over strings git never prints. |
| Question | Spec history cannot be checked while the artifacts are uncommitted | The artifacts are committed with the change; D7, the new `cli-indexing` scenario and task 6.3 record that they came after the manual test. |
| Question | Tasks 10.2 and 11.5 open; CI's git may not print `BAD` / `missing` with exit 0 like 2.45.1 | 10.2 checks the CI run after the push; 11.5 is the PR. |

All destinations are also in `design.md` → Follow-ups.

## After the fixes

- `openspec validate index-repository-debt --strict`: valid.
- Results of the final run: see the "Final run" section of
  `2026-10-08-8-test-and-state-verification.md`.
