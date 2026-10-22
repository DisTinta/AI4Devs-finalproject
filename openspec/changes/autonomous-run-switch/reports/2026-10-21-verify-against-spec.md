# Verify Against Spec Report

- Date: 2026-10-21
- Change: autonomous-run-switch (DIS-106), commit `ffc64f6`
- Mode: inline (`ai-specs/skills/verify-against-spec/SKILL.md` → Inline mode). The reading was split by
  requirement among four read-only auditors whose findings came back to this session; several
  findings were reproduced by running the parser (`shell-words.mjs` → `inspect()`) and the real hook
  scripts against copied fixture projects in the scratchpad. Nothing in the repository was edited by
  the audit.

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| The autonomous run is a manual switch… | `lib.sh` defaults and whitelist (54, 86), `unattended()`/`autonomous_run()` (165-170); `session-context.sh` 29-31, 40 | `autonomous-switch.spec.ts` |
| No hook leaves a confirmation pending… | `lib.sh` `ask()` (225-230), jq exit 2 (153-159); alternatives in `block-dangerous-bash.sh` 88-89, `docs-gate.sh` 42-45; interpreter-text hint 53-56 | `no-pending-ask.spec.ts` |
| Dependency installs are vetted… | detection `shell-words.mjs` 623-660; pre-vetting denials `block-dangerous-bash.sh` 125-148; `vet-package.mjs` 11-75; deferred `allow` 119, 155 | `vet-package.spec.ts` |
| Rewrites of specs, tests and doctrine… | `protect-specs-and-tests.sh` 44-107; `lib.sh` `latest_verdict`, `rel_path`, `existed_at_merge_base`, `active_change`; `spec-audit-gate.sh` | `autonomous-protect.spec.ts` |
| The agent merges only in an autonomous run… | `autonomous-merge-gate.sh` 233-340 (SKIPPED accepted at 331, as spec line 308 allows) | `merge-gate.spec.ts` |
| The kit configuration and the local switch stay untouched… | rule 8 `block-dangerous-bash.sh` 106-114; `shell-words.mjs` 462-492, 662-740, 784-796; edit tool `protect-specs-and-tests.sh` 48-50 | `kit-config.spec.ts`, `autonomous-protect.spec.ts` |
| The shell guard reads commands, not text | `shell-words.mjs` 32-365, 494-566; hook 40-47, 66-68 | `shell-guard.spec.ts` |
| Scratchpad removals undecided | `shell-words.mjs` 610-614; hook 71 | `scratchpad-rm.spec.ts` |
| Example environment files | `lib.sh` 453-458; `protect-specs-and-tests.sh` 30-40 | `env-example.spec.ts` |
| Test sentinels exempted | `lib.sh` 319-331, 66; `block-secrets.sh` 14 | `secret-allowlist.spec.ts` |
| Denials logged locally | `log-permission-denied.sh` 9-18; `.gitignore` 80 | `denial-log.spec.ts` |
| Cursor runs the same hooks | `invoke.cjs` 13-17, 47; `lib.sh` adapter 107-287; `.cursor/hooks.json` | `cursor.spec.ts` |
| A preflight checks the setup | `doctor.sh`, `doctor.ps1` (`-Autonomous`) | `doctor-autonomous.spec.ts` (bash only) |
| Forked review skills run inline | `verify-against-spec/SKILL.md` 45-53, `adversarial-review/SKILL.md` 85-93; copies byte-identical | `tests/unit/docs/kit-skills.spec.ts` |

## 2. Requirements missing or partial

Bypasses (a protection the spec states can be evaded):

- **V1** "it carries an `npm_config_*`… assignment" and "there is no `GH_*` environment assignment
  before `gh`": assignments after an `env` wrapper are dropped (`shell-words.mjs` 318-322, checks at
  641 and 758). `env npm_config_registry=… npm i left-pad@1.3.0` is vetted against the public registry
  and allowed; `env GH_REPO=x gh pr merge 61 --merge` reaches the gate with `ghAssign: false`.
- **V2** "uses `--registry` or `--userconfig` in any form": an abbreviation (`--reg=…`) is not matched
  (`shell-words.mjs` 635); npm accepts abbreviated long options.
- **V3** forbidden merge flags (`--admin`, `--auto`, `--delete-branch`) pass in `--flag=value` form
  (`autonomous-merge-gate.sh` 275).
- **V4** "checks out … a pathspec that is kit configuration": `git checkout .cursor/hooks.json` (no
  `--`) gets no decision (`shell-words.mjs` 675).
- **V5** message options are stripped for every git subcommand, not only `commit`/`tag` (spec 536;
  `shell-words.mjs` 585, 664): `git checkout -m -- .claude/settings.json` gets no decision.
- **V6** "parsed recursively": shell text inside interpreter text is not re-parsed (`shell-words.mjs`
  538): `bash -c "bash -c 'rm -rf build'"` gets no decision; a pipe into a shell inside `sh -c` is
  not flagged.
- **V7** a `cd` inside interpreter text or a substitution is ignored instead of making the directory
  unknown (`shell-words.mjs` 556).
- **V8** "interpreter text … matched against every pattern, as before": the kit-contract raw pattern
  runs only on unparsable lines (`block-dangerous-bash.sh` 99-100); `eval "echo x >>
  .claude/sdd-harness.env"` with the switch `"0"` now gets no decision (it was denied before).
- **V9** words after `powershell`/`pwsh`/`cmd` are not joined unless after `-c`/`-Command`//c
  (`shell-words.mjs` 404-411): `powershell "rm -rf build"` gets no decision.
- **V10** the spec-audit gate in unattended mode lets code through when a report exists with no
  verdict line (or only a fenced one): `latest_verdict` prints `NONE`, which `spec-audit-gate.sh`
  202-210 does not handle.
- **V11** a URL selector for another repository: `pr view` reads that repository but the protection
  query runs against the cwd repository (`autonomous-merge-gate.sh` 304-306).
- **V12** a missing `changedFiles` makes the file-completeness check pass (`(.changedFiles // 0)`, 334).
- **V13** a merge split over several lines of interpreter text escapes the raw check (line-by-line
  grep, `autonomous-merge-gate.sh` 254).

Behaviour that does not match the text:

- **V14** "a check whose result cannot be read" denies: a non-date `time.created` or non-numeric
  downloads become `NaN` and pass; a missing `time[<version>]` skips the version-age check
  (`vet-package.mjs` 28, 49-53).
- **V15** "appended as one JSON line": the `KEY=value` secret pattern, applied by `sed` to serialized
  JSON, also eats the closing `"}}` (`log-permission-denied.sh` 15, `lib.sh` 315). Reproduced with
  `DB_PASSWORD=hunter2222`.
- **V16** "print one OK/WARN/FAIL line per check": `doctor.sh` aborts silently under `set -euo
  pipefail` when an env key is missing (143, 182), a settings file is invalid JSON (163), or
  `gh run list` errors (228).
- **V17** "for rulesets, no bypass actors": neither doctor queries the bypass actors (`doctor.sh` 250,
  `doctor.ps1` 233).
- **V18** "a merge authorisation that names the base": both doctors only check that `gh pr merge` and
  the base appear anywhere in the output, not in the same rule (`doctor.sh` 190, `doctor.ps1` 181).
- **V19** "on Windows, the Defender exclusions … WARN": `doctor.sh` under Git Bash has no such line.
- **V20** parity: `doctor.ps1` prints nothing when `gh` is authenticated but the base is empty (211);
  it FAILs "Git Bash not found" on non-Windows pwsh (153); both run `docker compose ps` in the current
  directory, not `--dest`.
- **V21** "a parsed destructive command does not get that sentence": the interpreter-text hint is keyed
  on `P_RM` only (`block-dangerous-bash.sh` 75), so a parsed `mkfs`/`dd if=` gets it (from `ffc64f6`).
- **V22** "a commit message is not a command": a quoted heredoc body inside `$(…)` is lexed for quotes
  and parentheses (`shell-words.mjs` 100-110); a body with an apostrophe or `1)` makes the line
  unparsable, so an unattended commit is denied.
- **V23** "each denial SHALL name every condition that failed": the gate stops at the first failing
  stage (`autonomous-merge-gate.sh` 261-340).
- **V24** "the reason names the merge gate": the `gh api` protection deny does not
  (`block-dangerous-bash.sh` 113).
- **V25** `is_kit_config` fails open when node crashes or times out (`lib.sh` 382): in an autonomous run
  the edit tool then passes.
- **V26** the free paths `openspec/changes/*/reports/*` and `*/tasks.md` match nested paths of any
  change because `*` crosses `/` (`protect-specs-and-tests.sh` 53).
- **V27** an existing test outside the repository is allowed as "created by this branch"
  (`protect-specs-and-tests.sh` 85, 94).
- **V28** the allowlist goes through `awk -v`, which processes backslash escapes, so `\.` runs as `.`.
- **V30** "when jq is missing in unattended mode, every hook… SHALL deny": with the switch `"0"`, a
  Cursor background agent without jq cannot be detected (reading `is_background_agent` needs jq). D2
  accepts this; the spec has no exception.
- **V31** "the reason adds … the alternative the agent can take": the stack guard
  (`block-dangerous-bash.sh` 152) and the `sdd-harness.env` edit (`protect-specs-and-tests.sh` 36)
  give none.

## 3. Unspecified behaviour

- **U1** `sudo`, `env`, `nice` and `timeout` are unwrapped (`shell-words.mjs` 312-337); the spec
  defines no wrapper rule.
- **U2** the pip value flags (`-r`, `-c`, `--requirement`, `--constraint`) are skipped for every manager
  and the npm ones for pip (`shell-words.mjs` 624, 636).
- **U3** `rm`/`rmdir`/`install` count as kit-contract writes in every mode (`shell-words.mjs` 484-488,
  593); the spec's write-target list has no `rm`.
- **U4** the bypass-flag check ignores message options: `git commit -m "--dangerously-skip-permissions"`
  is denied, against spec 536 (`shell-words.mjs` 604).
- **U5** the log line also carries `classifier_verdict` (D10 has it; the spec does not).
- **U6** `invoke.cjs` passes extra arguments to the script (design amendment D13).
- **U7** the merge gate's `gh api` merge pattern matches without `gh api` (D4 accepts it); legacy
  status contexts pass only on `SUCCESS`; scratchpad prefix comparison is case-sensitive; `git stash
  push <path>` without `--` counts as pathless; `doctor.sh` exits 2 on an unknown option;
  `doctor.ps1` prints OK when the Defender exclusion exists. All stricter or reporting-only.

## Tests weaker than their scenario

- "A match found only in interpreter text names the editing tools": checks only `editing tools`, and
  the negative half only for reset/clean.
- "Each unmet condition denies the merge": the failed and running check cases assert only `check`.
- "An existing test not planned in tasks.md is protected": asserts only `tasks.md`.
- "A pull request that meets every condition is merged": the all-success case is not tested (fixture
  has a SKIPPED check).
- "Pushing or merging into the base…": no assertion that the reason names the merge gate.
- "Whole-tree or glob staging…": the regex also accepts the revert reason.
- "A commit message is not a command": the heredoc body has no apostrophe or `)`.
- "The example file is read and edited": spec-audit gate and unattended mode not exercised.
- "GitHub problems / Missing hooks / An ask rule / A missing merge authorisation": no exit-status
  assertion; the ask-rule case in `settings.local.json` does not check the rule name.
- "Nothing is logged outside an autonomous run": a pre-existing log is not checked for changes.
- "Both skills describe the inline mode": the section split runs to the end of the file.
- "An unreachable or slow registry denies": the 9 s stub is close to the hook's 10 s timeout.
- No test for V1–V28 as listed.

## Scenario → test → state

All 99 scenarios have a test of the same name in `tests/harness/` or `tests/unit/docs/kit-skills.spec.ts`
(`scenario-map.mjs`: 99 mapped, 0 missing), and the suite is green (145/145). The table of section 11
(`2026-10-20-11-test-and-state-verification.md`) lists them; the 99th, "A match found only in
interpreter text names the editing tools", is in `no-pending-ask.spec.ts`. Green is not conformance
here: the findings above sit in cases the tests do not exercise.

## Verdict

**Not conformant yet.** Thirteen bypasses (V1–V13) and seventeen behaviour gaps (V14–V31) are fixed in
this change (task 14.2). Each gets a test first and its A/B/C/D destination in `design.md` →
Follow-ups. U1–U7 are either added to the spec or removed, as recorded there.

## Addendum (2026-10-22): fixes
Every finding V1–V28, V30–V31 was fixed in this change with a test seen red first (commits `db9afa9`,
`c086116`, `90beebe`, `241b9b1`, `f4de47b`); U2 and U4 were removed from the code; U1, U3, U5, U6,
U7 and the jq limit were added to the spec or recorded as D with the author's approval
(`design.md` → Follow-ups). The adversarial review then found further gaps, fixed in the same change
(see its report and addendum). The second run of this check follows in
`2026-10-22-verify-against-spec.md`.
