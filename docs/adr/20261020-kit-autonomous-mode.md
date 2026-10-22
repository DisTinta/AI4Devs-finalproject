# The kit gets a manual autonomous-run switch, and the doctrine it relaxes holds only while it is on

## Status
Accepted

## Context and problem
*Agent's text, written at the author's request (DIS-106, 2026-10-20), as in the 2026-10-16 record.*

The Entrega 2 experiment ([`20261016-autonomous-workflow-run-entrega-2.md`](./20261016-autonomous-workflow-run-entrega-2.md),
`readme.md` §8.6) showed that a multi-agent workflow can carry the whole SDD cycle of a ticket, from
`/enrich-us` to the merge. It also showed that every point where the kit or Claude Code asks a human
stalls an unattended run for hours: 10.5 h on a dependency-install confirmation, 2 h 20 min on an
`rmdir`, about 3 h of polling for every merge the auto-mode classifier denied (7 of 12 PRs), reports
lost by forked review skills, and false positives of the shell guard on text that was not a command.
That run relaxed four human gates "for this run only", by a written decision, with no switch in the
kit: nothing told a hook that nobody was there to answer, and nothing stopped the agent from editing
the hooks that guarded it.

Cursor, which the kit also installs, ran no kit hook at all.

The kit needed a way to run unattended again without stalling, without weakening the secret
protections, and without making the relaxed doctrine the default.

## Options considered
* **Relax the gates per run, by an ADR each time** (the Entrega 2 way): no code, but the hooks still
  ask, and the relaxation has no enforcement.
* **Trigger on Claude Code's permission mode** (`auto`, `dontAsk`): no new key, but auto mode is also
  used interactively, where a human does answer, and Cursor has no such mode.
* **A manual switch in `.claude/sdd-harness.env`**, read by every hook through `lib.sh`, with two
  modes and the relaxations tied to it.

## Decision
We choose **the manual switch `KIT_AUTONOMOUS_RUN`** because:
* **Two modes, decided in one place** (design D1). *Unattended* (the switch is `"1"`, or a Cursor
  background agent): no hook leaves a confirmation pending. *Autonomous run* (the switch `"1"` only):
  the agent merge, the relaxed doctrine and the kit-configuration protections. A background agent never
  waits on a question, but it does not merge unless the author turned the switch on.
* **Every question becomes a decision** (D2): an automatic check that allows or denies (npm package
  vetting, the planned-test and approved-artifact rules), or a deny that names the alternative. A
  missing `jq` denies instead of turning the hooks off.
* **The merge is gated by GitHub's state, not by the model** (D4): the `autonomous-merge-gate` hook
  allows `gh pr merge <n> --merge` alone, only into `AUTONOMOUS_MERGE_BASE`, with every check green,
  mergeable, with an archived OpenSpec change and nothing under `.claude/` or `.cursor/`, on a protected
  base. GitHub branch protection with `enforce_admins` is the server-side backstop (D20).
* **The guard cannot be switched off by the guarded** (D5): in an autonomous run, edits and shell
  writes to `.claude/`, `.cursor/` and the autonomous profile, whole-tree staging, reverts that could
  reach the local switch, and forced branch changes are denied.
* **Protect-specs gets autonomous decisions** (D9): artifacts of the active change are rewritable
  before the first spec audit and after an `APPROVED` one; an existing test changes only when
  `tasks.md` names it or the branch created it. A `CHANGES REQUIRED` audit stops the ticket cleanly.
* **One implementation, two clients** (D11): `.cursor/hooks.json` runs the same scripts through
  `invoke.cjs --client cursor`, which adapts input and output.
* **A separate Claude Code profile** (D12): `CLAUDE_CONFIG_DIR` points at a profile without the
  author's personal `ask` rules and with the merge authorisation in `autoMode.allow`. In the 12.4 dry
  run that authorisation won over the classifier's built-in "Merge Without Review".

**Doctrine relaxed in an autonomous run only** (`KIT_AUTONOMOUS_RUN="1"`). The doctrine files do not
change; this list is repeated in `docs/AUTONOMOUS-RUN.md`, `docs/project-context.md` and
`.cursor/rules/20-openspec.mdc`. A Cursor background agent with the switch `"0"` gets none of it.
* `docs/base-standards.md` §3, **rule 2** (a human approves the plan before code): the
  `spec-auditor` verdict `APPROVED` replaces the human plan gate. Its enforcement, the spec-audit
  gate's `APPROVED` requirement before code or tests, holds in all of unattended mode.
* §3, **rule 3** (tests come from the spec's scenarios under human supervision): written without
  supervision.
* §3, **rule 4** (a test is not modified to pass): only tests named in `tasks.md` or created on the
  branch are edited.
* §3, **rule 8** (the "why" is written by a human): the agent writes the "why" of PRs and ADRs and marks
  it as its own text.
* §3, **rule 9** (merges are signed by a human): the agent merges through the gate.
* `docs/openspec-tasks-mandatory-steps.md` §3, Pre-merge Review item 5 ("the agent never merges"): the
  agent merges after the archive commit, through the gate.

**Relation to [`20261016-autonomous-workflow-run-entrega-2.md`](./20261016-autonomous-workflow-run-entrega-2.md).**
That record relaxed the same rules for one run, by decision. This one makes the relaxation available
whenever the switch is on, and only then, with hooks that enforce what replaces each rule. The 2026-10-16
record stays as the history of the first run.

## Consequences
* With the switch `"0"` nothing changes for interactive use, except the items that are always on: the
  shell guard reads commands instead of text, a lone `rm` in the session scratchpad gets no decision,
  install detection sees flags before the package, removing or replacing the kit contract counts as
  writing it, secret reads are also checked for `Grep` and `Glob`, `.env.example` is readable and
  editable, the secret-scan allowlist, and the hooks in Cursor. The shell guard now parses each line in
  one Node process, and the read and edit hooks avoid most `jq` calls. Windows medians, before this
  change → now: `Bash` 1.2 → 0.76 s, `Read` 0.86 → 0.47 s, `Edit` 1.28 → 1.02 s; `Grep`/`Glob` had no
  hook and now take 0.5 s.
* The author reviews the agent's decisions after the merge, not before. A wrong decision can reach the
  base and need a follow-up change.
* The `APPROVED` verdict is written by the same session that runs the propose; nothing cryptographic
  ties it to the `spec-auditor`. The pre-merge reviews and the author's review of the PR are the check.
* The auto-mode classifier is not deterministic. When it denies a merge the ticket stops In Review, and
  the denial is logged in `.claude/autonomous-denials.log`.
* The guard is a list of what it recognises, so it can never be complete. The pre-merge reviews closed
  the forms they found (path spellings and junctions, aliases, alternative writer syntax, kit paths in
  interpreter text, unknown commands naming the kit, a line padded until the hook times out). Gaps
  accepted and documented in `docs/AUTONOMOUS-RUN.md` §9: a path built piece by piece inside
  interpreter text; scripts written and then run; `git apply` or `git stash pop` with no kit path in
  the line; a `Grep` over a whole folder; a shell read of `.env.*`. In Claude Code the classifier
  remains; in both clients, the base-branch protection.
* `enforce_admins` binds the author too: a direct push or a merge on red CI needs the protection
  switched off first in the web UI.
* The switch, the profile and the protection are set by hand. Forgetting to set the switch back to
  `"0"` leaves the next interactive session in unattended mode; the session start warns while it is on.
