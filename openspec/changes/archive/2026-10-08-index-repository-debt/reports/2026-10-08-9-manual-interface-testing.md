# Manual Interface Testing Report

- Date: 2026-10-08
- Change: index-repository-debt (DIS-100)
- Step: 9 — Backend: Manual Interface Testing (agent executed)

## Environment

- Branch `feature/DIS-100-index-repository-debt`; Postgres from `docker compose up -d`
  (`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`), Git Bash on Windows 11,
  git 2.45.1.windows.1.
- The CLI runs from sources (`npm run cli` = `tsx` with `packages/cli/tsconfig.run.json`, DIS-86
  D10); the `too-large` reason in the output below exists only in the sources, which confirms it.
- Scratch allowed root `<scratch>/root`, built by a scratch script outside the repository:
  - `acme-shop`: a copy of `fixtures/acme-shop` without `.git`, its history rebuilt with `buildOne`
    (32 commits, `HEAD` `4f028db…`);
  - `rare`: one commit written with `git hash-object -w`, `git mktree -z` and `git commit-tree`
    only, tracking `small.php`, `big.txt` (1 048 577 bytes), a path whose bytes are `a` `0xFF`
    `.php`, and `evil<U+202E>gnp.php`;
  - `partial`: a repository declared a partial clone of a promisor remote that does not exist, with
    the blob of `a.php` removed.
- `ALLOWED_REPOS_DIR=<scratch>/root`, `AUTHOR_HASH_SALT=manual-salt` (scratch value).
- Paths masked: the scratchpad as `<scratch>`, the OS user name as `<user>`.

## Pre-test state

`project` 0 rows, `commit` 0 rows, `file` 0 rows; `git status --porcelain fixtures` empty.

## Results

| # | Command (`npm run -s cli -- …`) | Expected | Exit | Result |
|---|---|---|---|---|
| 1 | `index acme-shop --name dis100-acme --language php --json` | report, 53 files, nothing skipped, one `secret_redacted` line | 0 | PASS — 53 files, `skipped: []`, `indexedCommit` `4f028db…`, `laravel`, 1 `secret_redacted`, no `AKIA…` anywhere; wall time **5.5 s** for the whole command (each indexing was ~6 s of git reads alone before) |
| 2 | `index rare --name dis100-rare --language php --json` | `non-utf8-path`, `too-large`, `invalid-path` | 0 | PASS — `skipped`: `a<U+FFFD>.php` `non-utf8-path`, `big.txt` `too-large`, `evil<U+202E>gnp.php` `invalid-path`; 1 file (`small.php`) |
| 3 | `SELECT p.name, f.path … WHERE p.name LIKE 'dis100-rare%'` | only `small.php`, no bidi character | — | PASS — `small.php`, `has_bidi = f` |
| 4 | `index rare --name dis100-rare-text --language php` (text) | the three skipped entries, nothing raw | 0 | **FAIL, then fixed** — see below |
| 5 | `index partial --name dis100-partial --language php` | git's error, no project, nothing fetched | 1 | PASS — `{"error":{"code":"INTERNAL","message":"unexpected error; nothing was saved","details":{}}}` (DIS-86 maps an unknown git failure to `INTERNAL`); no `dis100-partial` row. Under it, read directly through the adapters: `readFiles` rejects with `fatal: git cat-file b3d9bbc7…: bad file`, `readHistory` with `warning: lazy fetching disabled; …` / `fatal: unable to read b3d9bbc7…` |
| 6 | `MSYS_NO_PATHCONV=1 … index ../outside --name dis100-out --language php` | `FORBIDDEN_PATH` | 1 | PASS — `"\"../outside\" is outside the allowed repositories directory"` |
| 7 | #4 again after task 6.3, text and `--json` (`dis100-rare-2`, `dis100-rare-2j`) | no raw bidi character, still parses | 0 | PASS — text prints `"evil\u202egnp.php" (invalid-path)`; 0 raw C1/bidi characters in either output; the JSON parses back to `evil<U+202E>gnp.php` |

### Finding (#4): a rejected bidi path reached the terminal raw

Core rejected `evil<U+202E>gnp.php` and never stored it (#3), but the CLI printed it in the
`skipped` list as is, in the text report and in `--json` (`JSON.stringify` does not escape U+202E),
so the terminal displayed it reordered. The proposal had declared "no escaping of bidi in the CLI"
a non-goal on the grounds that no indexed path carries those characters, which missed the skipped
list. The author chose to fix it in this change: design D7, new `cli-indexing` scenario
"Bidirectional and separator characters in untrusted strings are escaped", task 6.3
(`toTerminalSafeJson` now escapes the same bidi and separator set). Row 7 is the re-run.

## Mutating operations and restoration

Rows 1, 2, 4 and 7 created the projects `dis100-acme`, `dis100-rare`, `dis100-rare-text`,
`dis100-rare-2` and `dis100-rare-2j`. They were deleted by name
(`DELETE FROM project WHERE name IN (…) RETURNING name`; the schema cascades to files, commits and
edges).

## Post-test state

`project` 0 rows, `commit` 0 rows, `file` 0 rows — equal to the pre-test state;
`git status --porcelain fixtures` empty.

## Outcome

- Status: PASS (after the fix of #4)
- Blocking issues: none
