# Verify Against Spec Report (third run)

- Date: 2026-10-22
- Change: autonomous-run-switch (DIS-106), commit `786e54e`
- Mode: inline; a fresh read-only auditor, an edge-case runner (about 120 inputs) and an
  evidence/blast-radius reviewer, on throwaway copies of the hooks (scratchpad `v3/`, `edge3/`,
  `adv6/`), reporting to this session. CI green at `786e54e` on the first run.

## 1. Implemented correctly

All 110 scenarios have a test of the same name. R3-1 to R3-11 confirmed fixed by probe. The spec text
edited on 2026-10-22 matches the code (caps 20/200/65 536/16 compared as "more than"; the
environment-file rule; `..` denied outright). With the switch `"0"`, 107 Bash commands gave the base's
decisions except the always-on items.

## 2. Missing or partial

| Id | Severity | Finding |
|---|---|---|
| R4-1 | Blocker | A prefix assignment with a quoted value (`A="b" git m`) is read as the command name (`shell-words.mjs` 65). With the switch `"1"`, `FOO="1" gh pr merge 61 --merge` and `GIT_CONFIG_KEY_0="alias.m" … git m` get no decision from the guard or the gate; with `"0"`, `X="1" git reset --hard` no longer asks. |
| R4-2 | Major | No test covers the gate's "file list could not be read" denial; removing it lets a merge through on an unreadable page (`autonomous-merge-gate.sh` 214-215). |
| R4-3 | Major | Globs and braces naming kit paths (`.{claude,x}/…`, `.cl?ude/…`, `.c*e/…`) are not kit configuration, for write targets and the generic rule (`shell-words.mjs` 478, 757-766, 888, 1182-1200). |
| R4-4 | Major | `json_str` is quadratic on long escaped values: a 60 KB backslash path makes Read/Edit/Grep take 18–23 s, past the 10 s hook timeout (`lib.sh` 152-154). |
| R4-5 | Minor | `.env::$DATA` (Windows alternate data stream) is not a secret path (pre-existing). |
| R4-6 | Minor | `fast_free` reads a nested `tool_name`, which can relax a Cursor read of `.env`. |
| R4-7 | Minor | `.env.sh` and `.env.md` are readable and editable (`sh`, `md` in the source-extension list); the base denied them. |
| R4-8 | Minor | A kit path in a variable reaches generic writers (`D=.claude; curl -o "$D/…"`); `echo > ~/.claude/…` passes while `touch ~/.claude/…` is denied. |
| R4-9 | Minor | `RIPGREP_CONFIG_PATH`, `LESS`, `MORE` pass program-running options to read-only commands. |
| R4-10 | Minor | Spec wording: Cursor checks only `Grep` (it has no `Glob` tool); the kit-script exemption is "without options"; with the switch `"0"` secret reads now also match relative paths and any letter case — none of these is in the spec text. |

## 3. Unspecified behaviour

`json_str`/`field_v` (pure-bash JSON reading with a jq fallback), the per-call nonce, the glob
templates and the source-extension list are internal; `zsh`, `.` and a direct `.claude/doctor.sh` are
also treated as kit scripts.

## Evidence gaps

No `.secrets` case; no quoted-assignment case in any suite; `RIPGREP_CONFIG_PATH`/`LESS` absent; the
Windows-only spellings and case folding do not run on Linux CI; the step-11 addendum and the step-12
Cursor run predate round 3 (23 harness files now; the Cursor `Grep` line is new); the `Edit` cost was
measured on a branch with an active change.

## Verdict

**Not conformant.** Blocker 1, Major 3, Minor 6. Fixed in a fourth round in this change (author:
rounds until clean; `.env.sh`/`.env.md` secret again, author's decision 2026-10-22).
