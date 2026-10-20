## Why

The Entrega 2 experiment (ADR `20261016-autonomous-workflow-run-entrega-2`, `docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md`, `readme.md` §8.6) showed that a multi-agent workflow can carry the whole SDD cycle of a ticket — enrich, propose, `spec-auditor`, TDD apply, the three pre-merge reviews, PR, archive, merge — but every point where the kit or Claude Code asks a human stalled it for hours: 10.5 h on a dependency-install confirmation, 2 h 20 min on an `rmdir`, about 3 h of polling for every merge the auto-mode classifier denied (7 of 12 PRs), lost reports from forked review skills, and false positives of the shell guard. DIS-106 integrates that autonomous mode into the kit, fixing those problems, so the next unattended run goes from ticket to merge without blockers and without relaxing the secret protections — in Claude Code and in Cursor, which the kit also installs but which today runs no kit hook at all.

## What Changes

- New manual switch `KIT_AUTONOMOUS_RUN` in `.claude/sdd-harness.env` (default `"0"`, committed only as `"0"`), announced at session start. Two modes:
  - **unattended:** the switch is `"1"`, or the hook runs for a Cursor background agent. No hook asks a human.
  - **autonomous run:** the switch is `"1"` only. The agent merge, the doctrine relaxations and the kit-configuration protections apply only here.
- In unattended mode no kit hook leaves a confirmation pending (a missing `jq` denies instead of disabling the hooks): each `ask` becomes either an automatic check that allows or denies, or a deny that names the alternative.
- Dependency installs are vetted automatically (npm only: exact pinned version, package age, version age, repository, weekly downloads, install scripts) instead of asking.
- OpenSpec artifacts, existing tests, kit doctrine, versioned migrations and the kit contract get explicit autonomous decisions instead of confirmations.
- New merge gate: only in an autonomous run may the agent run `gh pr merge`, and only when the PR targets the configured base, its checks are green, it carries an archived OpenSpec change, it touches nothing under `.claude/` or `.cursor/`, it is mergeable and the method is a merge commit. A direct push or local merge into the base is denied too, and the base branch is protected on GitHub (PR and the five `ci.yml` checks required, administrators included) as the server-side backstop.
- In an autonomous run, edits of `.claude/` or `.cursor/` (editing tools and shell writes), git operations on them, whole-tree staging, reverts that could reach the local switch and forced branch changes are denied.
- Always on (both modes):
  - the shell guard reads commands, not text: it parses the line like the shell, so a commit message or a grep pattern is not a command, while quoted paths and flags, substitutions and text piped into a shell are still checked;
  - the `sdd-harness.env` rule fires only when that file is the write target;
  - install detection also catches flags before package names;
  - the shell guard leaves `rm` inside the session scratchpad undecided;
  - `.env.example` / `.env.sample` can be read and edited;
  - a project allowlist exempts known test sentinels from the prompt secret scan.
- In an autonomous run (switch `"1"` only), `docs/base-standards.md` §3 rules 2, 3, 4, 8 and 9 and the "agent never merges" item of the mandatory steps are relaxed:
  - the spec auditor's `APPROVED` replaces the human plan gate. The spec-audit gate requires it before code or tests are written in all of unattended mode, and denies when the branch has no determinable change;
  - merges go through the gate;
  - only test edits planned in `tasks.md`, or of tests the branch created, are allowed;
  - the agent writes the "why" and marks it as its own text. A new ADR records this, next to the 2026-10-16 ADR that relaxed it for the Entrega 2 run only. A `CHANGES REQUIRED` spec audit stops an autonomous ticket cleanly.
- The tracked `.claude/sdd-harness.env` gains `KIT_AUTONOMOUS_RUN="0"`, `AUTONOMOUS_MERGE_BASE` and `KIT_SECRET_ALLOWLIST`.
- Denials of the autonomous run are logged locally for the final report.
- The kit hooks also run in Cursor through `.cursor/hooks.json`, with the same decisions in Cursor's response format.
- The forked review skills (`verify-against-spec`, `adversarial-review`) document an inline mode for workflow steps.
- Preflight `doctor --autonomous` (Bash and PowerShell), a separate Claude Code profile template (`CLAUDE_CONFIG_DIR`) with the auto-mode merge authorisation and no `ask` rules, a Cursor CLI permissions template, the Spanish guide `docs/AUTONOMOUS-RUN.md` and an ADR.

## Capabilities

### New Capabilities
- `agent-harness`: the decisions the kit's hooks take on the agent's tool calls (shell commands, file reads and edits, prompts, merges), the autonomous-run switch, the preflight and the parity between Claude Code and Cursor. Only the behaviour this change adds or alters is specified; the rest of the hooks keep their current behaviour, which the first requirement pins with the switch off.

### Modified Capabilities
None.

## Impact

- Kit hooks: `.claude/hooks/lib.sh`, `block-dangerous-bash.sh`, `protect-specs-and-tests.sh`, `block-secrets.sh`, `block-secret-reads.sh`, `docs-gate.sh` (through `lib.sh`), `spec-audit-gate.sh` (shared change detection), `session-context.sh`, `invoke.cjs`; new hooks for the merge gate, package vetting and the denial log, and the command-line parser `shell-words.mjs` they share.
- Configuration: `.claude/settings.json` (hook registration, narrower `.env` read denials), new `.cursor/hooks.json`, `.cursor/rules/*.mdc`, `.gitignore` (local denial log), `.claude/sdd-harness.env` (new keys, added through the Edit tool with the author's confirmation, design D18).
- Skills and templates: `ai-specs/skills/verify-against-spec`, `adversarial-review`, `kit-health` (and their synced copies), new `ai-specs/templates/autonomous/`.
- Tooling: `.claude/doctor.sh`, `.claude/doctor.ps1`, `vitest.stryker.config.ts` (harness excluded), `.github/workflows/ci.yml` (hooks in the `runtime` filter), `docs/adr/README.md`.
- Tests: new `tests/harness/` (vitest), run in CI on Ubuntu (bash and jq available).
- Docs: `docs/AUTONOMOUS-RUN.md` (Spanish), a new ADR (related to `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`), `docs/project-context.md` (local patch to the kit; the base-branch rule `final-project-CRN`), `readme.md` §8.6, `prompts.md`. Kit doctrine files are not edited; their exceptions in an autonomous run live in the ADR and the guide.
- No product code, API, database or dependency changes. No personal data is involved; the denial log stays local and untracked.
- Outside the repo (author): create the autonomous Claude Code profile from the template and log in to it once (before the merge dry run); set the switch by hand before a run.
- `npm audit` after a vetted install is a rule of the workflow contract, not a hook.

## Non-goals

- The Workflow script itself as a kit template (only its contract is documented).
- Automatic vetting for package managers other than npm (they are denied in unattended mode).
- Changing the author's personal `~/.claude` configuration.
- Making the auto-mode classifier deterministic: the merge authorisation is configured and dry-run, not guaranteed.
