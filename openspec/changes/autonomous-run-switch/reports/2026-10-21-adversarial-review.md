# Adversarial Review Report

- Date: 2026-10-21
- Change: autonomous-run-switch (DIS-106), commit `ec14e85`, PR #61 (CI green after a rerun of the
  known seed-load race)
- Mode: inline (`ai-specs/skills/adversarial-review/SKILL.md` → Inline mode). Following the skill's
  advice to review from a different session than the implementer, three fresh read-only reviewers
  covered the axes (1+4 spec and evidence; 2 hostile input; 3 blast radius) and reported back to this
  session. Every finding below was reproduced by the reviewer with a probe on throwaway copies of the
  hooks (scratchpad `adv1/`, `adv2/`, `adv3/`) or verified in code and history.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Blocker | `block-dangerous-bash.sh` 48-58; `autonomous-merge-gate.sh` 33-39; hook timeouts 30/60 s | **Fail-open by timeout.** Each interpreter text costs several process spawns. `eval true; ` ×100 before `gh pr merge 5 --admin --squash` takes 53.7 s in the shell guard (timeout 30 s); ×170 takes 71.7 s in the merge gate (timeout 60 s). A hook killed by its timeout lets the call through. | Any rule, the merge gate included, is bypassed by padding the line. |
| Blocker | process (`tasks.md` 14.x; both earlier reports on `ffc64f6`) | The show-spec-working and verify-against-spec reports predate the fix commits `db9afa9`..`ec14e85`; no addendum, no re-run of the verification yet. | The mandatory steps require both before the archive. |
| Major | `shell-words.mjs` 676, 400 | **Merge through an alias.** `gh alias set pm "pr merge"` then `gh pm 5 --admin --squash`, or `git config alias.m "!gh pr merge 5 --admin"` then `git m`: no decision from the shell guard or the gate. | The gate is skipped. Bounded by the base protection (PR and checks required, administrators included), not by the hooks. |
| Major | `shell-words.mjs` 718-730, 309; `lib.sh` 367-378, 432-441; `protect-specs-and-tests.sh`; `spec-audit-gate.sh` | **Windows path spellings.** `\\?\<proj>\.claude\…`, `\\localhost\C$\…`, `/proc/cygdrive/c/…`, a junction (`mklink /J cfg .claude`, no admin rights needed), and case or dot variants (`OpenSpec/specs/…`, `Docs/Base-Standards.md`, `./docs/…`, `Tests/…`, `Packages/core/x.ts`) are not recognised as kit configuration, doctrine, main specs, existing tests or code under the spec-audit gate. | An autonomous run can rewrite its own hooks, the doctrine, main specs or signed tests, or write code before the audit. |
| Major | `shell-words.mjs` 354-384 | Alternative forms of the spec's own writers: `cp -t`/`--target-directory=`, `ln -t`, `install -t`, `sed -i --expression=…`, `sed --in-place …` give no decision on a kit path. | Kit configuration is writable through standard syntax. |
| Major | `block-dangerous-bash.sh` 106-115; `shell-words.mjs` 452-455, 605 | Writes to kit paths from interpreter text (`python -c "open('.claude/hooks/lib.sh','w')…"`, `node -e "…writeFileSync('.claude/sdd-harness.env',…)"`) and from writers outside the list (`curl -o`, `tar -C`, `touch`, `chmod -R 0777`, `git apply`, `git stash pop`, `git update-index --assume-unchanged`). The design accepted interpreter text and these writers as a risk (Risks: "Interpreter gaps", "Indirect execution"); the review shows they reach the switch itself. | The local switch and the hooks are not "untouched" in an autonomous run. |
| Major | `autonomous-merge-gate.sh` 157 | A pull request that renames a file out of `.claude/hooks/` (the new path is outside) or touches `.Claude/…` passes the kit-configuration condition: `gh pr view --json files` gives only the new path, and the match is case-sensitive. | A merged PR can disable the base's hooks. |
| Major | `.claude/settings.json` 4-17; `block-secret-reads.sh` matcher `Read` | The broad `Read(.env.*)` deny became a fixed list; `.env.ci`, `.env.prod`, `.env.dev`, `.env.backup`… are no longer denied for Grep and Glob (the hook only runs on Read). | Secret protection is relaxed, against the proposal ("without relaxing the secret protections"). |
| Major | `block-dangerous-bash.sh` via `parse_command`; `design.md` 439 | Every Bash call takes about +1.25 s with the switch `"0"` (median `ls`: 1198 → 2437 ms on Windows); the design estimated ~50 ms. Undescribed by the "nothing changes for interactive use" claim. | Interactive cost on every shell call. |
| Major | `tests/harness/kit-config.spec.ts` 92-93; spec 436-445 | `git push origin +HEAD:final-project-CRN` is listed by "Pushing or merging into the base directly is denied", whose THEN says the reason names the merge gate; the test was relaxed to check only the decision (the force-push rule answers first). | A test bent to the code. |
| Major | `tests/harness/denial-log.spec.ts` 14-32 | No test asserts `classifier_verdict` in the log line (spec added it in `ec14e85`). | Deleting that branch survives the suite. |
| Major | `tests/harness/autonomous-protect.spec.ts` 96, 108-116 | No case for a main-spec sync with a delta and `CHANGES REQUIRED`, nor for a switch-`"0"` background agent editing a planned test. | Removing `VERDICT == APPROVED` or `autonomous_run ||` in `protect-specs-and-tests.sh` survives. |
| Major | `tests/harness/merge-gate.spec.ts` 68-69 | `-s`/`--squash` are tested without `--merge`; `-m -s` and `-m -r` never. | Removing the short-flag rules survives. |
| Major | `tests/harness/vet-package.spec.ts` 106-110, 138 | Thresholds tested far from their limits; only `postinstall`; `npx -p`/`@version` tested only where the missing-binary rule already denies. | Off-by-a-lot thresholds and dropped rules survive. |
| Major | `design.md` Follow-ups (D list); spec | U6 and U7 are recorded as "added to the spec delta" but are not in the spec (e.g. any `git checkout` in an unknown directory is denied in an autonomous run). The author's approval of the D additions is not recorded. | Undescribed behaviour; destination D requires the spec. |
| Minor | `block-secret-reads.sh` | The only decision hook without `fail_closed` (D21). | Inconsistent fail-closed coverage. |
| Minor | `stryker.config.json` 20-29 | `shell-words.mjs` and `vet-package.mjs` are not mutated, and the harness is excluded from Stryker. | No mutation score on the security-critical logic. |
| Minor | `tests/harness/no-pending-ask.spec.ts` 66-73 | Missing-jq deny tested only on the shell guard. | Removing `hook_input_init` elsewhere survives. |
| Minor | `tests/harness/env-example.spec.ts` 20-35 | The example-file rule under the spec-audit gate is tested only on the allow side. | The new SHALL has no deny-side evidence. |
| Minor | `.github/workflows/ci.yml` 97-99 | The `runtime` filter misses `.claude/settings.json`, `.claude/doctor.sh`, `.claude/sdd-harness.env` and `ai-specs/templates/autonomous/`, which the harness reads. | A PR touching only those skips the harness. |
| Minor | ADR 79-81; `docs/project-context.md`; `docs/AUTONOMOUS-RUN.md` 122-139; `readme.md` 627, 1610, 1630 | Docs lag the code: the always-on list misses the contract-removal rule (ADR) and install detection (project-context); the guide misses the ruleset bypass check; the readme says 10 hooks (12 now) and §8.6 says the guard reads text. | Stale delivery docs. |
| Minor | `reports/2026-10-20-11-test-and-state-verification.md` 126 | The step-11 counts (16 files, 144 tests) no longer describe the suite. | Stale evidence. |
| Question | `.cursor/hooks.json` | Commands are relative to the project root; from another cwd `node` exits 1 (not a deny). Cursor documents running hooks from the root. | Fail-open if Cursor ever changes the cwd. |
| Question | spec 59 (`ec14e85`) | The jq exception narrows an existing SHALL after implementation; it traces to D2 and the author approved adding it to the spec (2026-10-21), which design.md does not yet record. | Spec edited after implementation. |

What held: empty, garbage and `null` inputs give no decision in every hook; secret reads deny `.ENV`,
`.env::$DATA` and `\\?\…\.env` in both clients; `/c/…` and `//localhost/C$/…` redirect targets, ADS
paths and `git rm --cached .claude/…` are denied; the merge gate denies `--admin` with odd whitespace;
no test that existed at the base was modified (all 22 harness files are new); with the switch `"0"`,
about 75 commands, 40 edit cases, 9 reads and 3 prompts gave the same decisions as the base except the
always-on items; hook timeouts match between clients; CI runs the harness on Ubuntu without local
state.

### Verdict

**FAIL** — two Blockers (fail-open by timeout; reports not re-run after the fixes) and several Majors.

### Recommended next steps before archiving

1. Fix the timeout fail-open (a time and size budget that denies in unattended mode, and fewer process
   spawns per interpreter text, which also addresses the +1.25 s).
2. Normalise paths before classifying (UNC, `\\?\`, cygdrive, `.`/`..`, case on Windows, real path
   for junctions) in the parser, `rel_path`/`under` and the merge gate.
3. Close the alias, `-t`/`--expression` and kit-path-in-interpreter-text forms in an autonomous run, and
   treat unknown writers that name a kit path as writes; detect renames out of `.claude/` in the gate.
4. Restore the secret-read coverage for Grep/Glob; add `fail_closed` to `block-secret-reads.sh`.
5. Strengthen the listed tests; restore the `+HEAD` case.
6. Put U6/U7 in the spec, record the author's approval; update the docs and the CI filter.
7. Add the addenda and re-run verify-against-spec and this review until no Blocker or Major remains.
