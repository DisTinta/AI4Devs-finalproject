# Verify Against Spec Report (second run)

- Date: 2026-10-22
- Change: autonomous-run-switch (DIS-106), commit `314633c`
- Mode: inline; a fresh read-only auditor plus two edge-case runners on throwaway copies of the hooks
  (scratchpad `v2/`, `edge1/`, `edge2/`), reporting to this session.

## 1. Implemented correctly

All 110 scenarios have a test of the same name. First-run findings confirmed fixed by probe: V1, V2,
V4–V10, V15, V21, V22, V24, V27; by code and test: V3, V11–V14, V17, V19, V23, V25, V28, V31. The ten
scenarios added on 2026-10-22 are implemented (`shell-words.mjs` 456-486, 516-596, 662, 676-744,
866-876, 1111-1137; `lib.sh` 384-505, 610-651; `autonomous-merge-gate.sh` 32-57, 129-205;
`block-secret-reads.sh` 24-37). Every cost cap holds exactly at and one past its limit, within the
hook timeout (slowest case 7.3 s).

## 2. Missing or partial

| Id | Severity | Finding |
|---|---|---|
| R3-1 | Major | Equivalent interpreter forms escape "Interpreter text that names kit configuration" and "An unknown command that names kit configuration": `node --eval`, `node -p`, `python3 -Ic`, `python3.12 -c`, `perl -E` (`shell-words.mjs` 21, 429-432, 726). |
| R3-2 | Major | Options of read-only commands that run commands or write are not read: `rg --pre`, `git grep -O`/`--open-files-in-pager`, `git -c diff.external=…`/`core.fsmonitor=…`, `file -C`, `less -o` (`shell-words.mjs` 706-721). |
| R3-3 | Major | Secret checks are case-sensitive (`.ENV.prod`, `SECRETS/` on Windows) and glob wildcards (`?env.prod`, `[.]env.prod`) slip past the sample list (`lib.sh` 583-647). |
| R3-4 | Major | Cursor runs no secret check for `Grep` (`.cursor/hooks.json`), against "Cursor runs the same hooks with the same decisions". |
| R3-5 | Major | `HTTPS://` (upper case) URL selector: the gate checks the cwd repository while gh merges the other (`autonomous-merge-gate.sh` 111, 133). |
| R3-6 | Major | The Grep/Glob secret check is always on, but the first requirement's always-on list and the proposal do not name it; `Glob src/**/*.env.ts` is now denied (false positive). |
| R3-7 | Minor | With the switch `"1"`, parser output that ends in `SW_DONE=1` but cannot be evaluated lets the call through (`block-dangerous-bash.sh` 70-83). |
| R3-8 | Minor | `~/…` paths are not expanded in the protected-path check (`lib.sh` 384-458). |
| R3-9 | Minor | A `..` segment is denied before canonicalisation (`protect-specs-and-tests.sh` 21-23), while the new scenario promises the canonical decision. |
| R3-10 | Minor | An empty or truncated files page counts as clean; the REST count is not compared with `changedFiles` (`autonomous-merge-gate.sh` 197-200). |
| R3-11 | Minor | The merge gate uses its own caps (100 texts, 200 000 characters, no command cap), different from the guard's. |

## 3. Unspecified behaviour

- The read-only lists and the "kit's own tools" exception are wider than the spec's closed list
  (`shell-words.mjs` 706-734).
- Alias detection also denies `GIT_CONFIG_PARAMETERS`/`GIT_CONFIG_KEY_n` and `--config-env`.
- Time guards (20 s, 15 s before vetting), the 16-lookup cap and the 5 s parser timeout are specified
  only by the generic cost scenario.

## Tests weaker than their THEN

- "Writers in their alternative syntax are recognised" asserts parser facts, not the hook's deny.
- "A gh or git alias…" does not assert the reason; "A git checkout in an unknown directory…" neither.
- "A line too costly…": no test reaches the time guard, the 200-command cap or the 16-lookup cap;
  caps tested far from their limits; the cap is not asserted in the reason.
- "… in any spelling": no `..` or allow case; the Windows spellings run only on Windows (CI is Linux).
- "A pull request that renames…": the `.Claude/` case is also caught by the `pr view` check, so the
  files-query lower-casing is untested.
- "Secret files are not reached through search tools": Cursor not exercised.

Also: every `Grep`/`Glob` now pays about 1.3 s for the secret hook, `Read` +0.2 s and `Edit` +0.4 s
(Windows medians); undocumented.

## Verdict

**Not conformant.** Blocker 0, Major 6, Minor 5, plus the weak tests. Fixed in a third round in this
change (author's decision: rounds until clean, cost optimised in the same round).
