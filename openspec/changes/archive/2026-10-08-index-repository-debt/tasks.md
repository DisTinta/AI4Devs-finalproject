## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-100 to In Progress in Linear right away, with a short comment in Spanish (change name `index-repository-debt` and branch)
- [x] 0.2 Fetch `origin` and confirm `origin/feature/entrega-2-CRN` still contains the DIS-86 merge `7e6d25a` (this change modifies its `cli-indexing` spec; if it does not, stop and ask the author). Then create feature branch `feature/DIS-100-index-repository-debt` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/index-repository-debt/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: `docker compose up -d` and `DATABASE_URL` exported; run `npx vitest run` once, green, and record the totals and the duration of `tests/integration/index/acme-shop.spec.ts` for the step 7 report; record `git status --porcelain fixtures` (must be empty), `git ls-files -s fixtures | sha1sum`, and `SELECT count(*) FROM project` on the local database

## 1. Core: path hygiene (TDD, design D5)

- [x] 1.1 RED: unit test in `tests/unit/index/index-repository.spec.ts` for "C1, bidirectional and separator characters make a path invalid" (fake ports; the twelve characters, `café.php` and `z<U+200B>.php`); see it fail on the C1 and bidi entries
- [x] 1.2 GREEN: widen the forbidden set in `packages/core/src/index/source-path.ts` (`FORBIDDEN_PATH_CHARACTER`); keep "Malformed, repeated and binary entries never reach the analyzer" green
- [x] 1.3 REFACTOR: TSDoc of `selectIndexableFiles` and the requirement-1 wording in its comment; `npm run lint`, `npm run typecheck` green

## 2. Core: skip reasons (TDD, design D6)

- [x] 2.1 Add `'too-large' | 'non-utf8-path'` to `SkipReason` in `packages/core/src/index/index-report.ts`; update its TSDoc and the `skipped` TSDoc of `SourceTree` in `packages/core/src/ports/SourceTreePort.ts`; `npm run typecheck` green (the new reasons are exercised by section 4)

## 3. Adapter: git process helper (TDD, design D1)

- [x] 3.1 RED: unit test in `tests/unit/git/` that the helper's argument vector starts with `-c <entry>` for every `GIT_CONFIG` entry, in order, followed by the subcommand, and that the spawn options carry `env: GIT_ENV`, `shell: false` and the root as `cwd` (spawn injected, no real process)
- [x] 3.2 GREEN: `spawnReaderGit` and the `GitSpawner` type in `packages/adapters/git/src/repository.ts`, with the `finished` promise rejecting with git's stderr on a non-zero exit
- [x] 3.3 RED → GREEN: integration test that a failing git command (e.g. `cat-file -t` of a missing oid) rejects `finished` with git's message, and a missing git binary propagates `ENOENT`

## 4. Adapter: source tree (TDD, design D2, D3)

- [x] 4.1 RED: integration test "A file over the size limit is skipped without being read" in `tests/integration/git/git-source-tree.spec.ts` (1 048 576 and 1 048 577 bytes of ASCII)
- [x] 4.2 RED: integration test "Paths that are not UTF-8 are skipped and never merged" — build the commit with `git hash-object -w`, `git mktree` (fed the raw path bytes) and `git commit-tree`, never through the file system (design Risks)
- [x] 4.3 RED: integration test "Many files are read without one process per file" — 1-file and 500-file repositories, a counting wrapper around the real `GitSpawner`; equal counts
- [x] 4.4 GREEN: `git-source-tree.ts` lists with `ls-tree -r -z -l --full-tree HEAD` as bytes through the helper, applies the reason order of the spec, `MAX_BLOB_BYTES`, and reads kept blobs through one `cat-file --batch` process (oid validation, back-pressure, order and size checks, `missing` → reject and kill); 4.1–4.3 green
- [x] 4.5 Keep every existing scenario of `git-source-tree.spec.ts` green, in particular "Reading executes nothing from the repository" and "A partial clone never fetches a missing object" (now through `cat-file --batch`)
- [x] 4.6 RED → GREEN: extra integration case that a `missing` object mid-batch rejects `readFiles` and the `cat-file` child has exited (design Risks)
- [x] 4.7 REFACTOR: TSDoc on every new export; remove the `simple-git` blob read; `npm run lint`, `npm run typecheck` green

## 5. Adapter: streamed history (TDD, design D4)

- [x] 5.1 RED: unit test in `tests/unit/git/` that the log parser fed the same captured output in 1-byte chunks and in one chunk returns deeply equal histories (multi-byte characters in messages and paths, numstat with `-` counts, a merge commit)
- [x] 5.2 RED: unit test that a numstat token whose path bytes are not UTF-8 is dropped and its commit kept
- [x] 5.3 GREEN: `LogParser` in `parse-log.ts`; `parseLog` becomes the one-chunk wrapper; 5.1 and 5.2 green
- [x] 5.4 RED: integration test "A link whose path is not UTF-8 is left out" in `tests/integration/git/simple-git-history.spec.ts` (commit built with Git's object commands)
- [x] 5.5 RED: integration test "A long history read as a stream equals the history read whole" (300 commits, multi-byte messages; whole output captured with `LOG_ARGUMENTS` and parsed with `parseLog`)
- [x] 5.6 GREEN: `simple-git-history.ts` pipes `spawnReaderGit(root, LOG_ARGUMENTS).stdout` into the parser and rejects with git's error on a non-zero exit; 5.4, 5.5 and every existing `git-history` scenario green (broken HEAD, executes nothing, missing object)
- [x] 5.7 REFACTOR: TSDoc; `npm run lint`, `npm run typecheck` green

## 6. CLI: escaping scenarios (design D5)

- [x] 6.1 Update "Control characters are escaped in the log, the JSON report and the error" in `tests/unit/cli/index-command.spec.ts`: `k\u009b2J.php` now appears in the JSON report as `invalid-path` and no `secret_redacted` line names it; the rest of the assertions stay. See it fail before section 1 is applied if run on a stash (or record that section 1 made it fail first)
- [x] 6.2 RED → GREEN: test "A redaction event's file path is escaped in its log line" at the logger/command level with an event whose `file` is `k\u009b2J.php` (keeps the event-path escaping covered now that core cannot produce it)

- [x] 6.3 RED → GREEN (design D7, added after the manual test): unit test "Bidirectional and separator characters in untrusted strings are escaped" in `tests/unit/cli/render-report.spec.ts` (text and `--json` serialisation); widen `toTerminalSafeJson` in `packages/cli/src/safe-json.ts`; re-run 9.3 and record that `skipped` no longer prints U+202E raw

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: `git-source-tree.spec.ts`, `simple-git-history.spec.ts`, `index-repository.spec.ts`, `index-command.spec.ts`, `render-report.spec.ts`, `acme-shop.spec.ts`
- [x] 7.2 Update them without weakening their assertions; lower the 60 s timeout of `acme-shop.spec.ts` only if the measured run allows it, and record before/after durations
- [x] 7.3 Map every `#### Scenario:` of the three delta specs to its test (table in the step 8 report)

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline (0.4 indicators)
- [x] 8.2 Run targeted tests: `npx vitest run tests/unit/git tests/unit/index tests/unit/cli tests/integration/git tests/integration/index`
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/index/source-path.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [x] 8.4 Verify the post-test state (same indicators as 0.4) and restore if needed
- [x] 8.5 Create the report `openspec/changes/index-repository-debt/reports/YYYY-MM-DD-8-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6), with the acme-shop duration before/after
- [x] 8.6 Mark complete only after tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Note the current state (8.1 indicators). The interface is the CLI `index` command (DIS-86) with the real adapters
- [x] 9.2 Exercise the success path: copy acme-shop to a temporary allowed root, rebuild its history, run `index` with `--json`; verify exit 0, the report, and the wall time against the baseline
- [x] 9.3 Exercise the new skips: a temporary repository with a 1 MiB + 1 byte file, a non-UTF-8 path and a file whose name holds U+202E (both built with Git's object commands); run `index`; verify `too-large`, `non-utf8-path` and `invalid-path` in the report and that no stored `file.path` holds U+202E
- [x] 9.4 Exercise the error cases: a partial clone with a removed blob (git's error, exit 1, no project), and a repository path outside the allowed root
- [x] 9.5 Mutating operations: delete every project created in 9.2–9.4 by name (the schema cascades) and confirm the counts equal the 9.1 baseline
- [x] 9.6 Document every command and output in `openspec/changes/index-repository-debt/reports/YYYY-MM-DD-9-manual-interface-testing.md` (mask the OS user name in paths)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface is affected (no route, no web change; the CLI is covered by step 9). Record "not applicable", with that reason, in the step 8 report
- [x] 10.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the changed spec files ran and passed (the integration ones with Git, including the non-UTF-8 path fixtures). Link the run in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Update `docs/project-context.md`: the git adapter gotcha ("one `git cat-file` per blob", "~6 s", "60 s"), the spawn helper sharing `GIT_CONFIG`/`GIT_ENV`, the 1 MiB limit, `non-utf8-path`, the streamed log, and the forbidden path characters
- [x] 11.2 No ADR (decisions are local to `adapters/git` and one core rule); confirm nothing in the implementation contradicted that
- [x] 11.3 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 11.4 Tick the five checklist items of DIS-100 (description checklist and the DIS-86 comment) only in a new Spanish comment, never editing the `[original]` block; every review finding not fixed gets an A/B/C/D destination in `design.md` → Follow-ups
- [x] 11.5 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed. After verification, set DIS-100 to In Review in Linear with a comment in Spanish linking the PR and the change
- [x] 11.6 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review` (reports `2026-10-08-show-spec-working.md`, `2026-10-08-verify-against-spec.md`, `2026-10-08-adversarial-review.md`); fix every finding in this change, TDD, and give each one an A/B/C/D destination in `design.md` → Follow-ups
