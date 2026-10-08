## Context

See `proposal.md` → Why. The relevant current state:

- `packages/adapters/git/src/git-source-tree.ts` lists `HEAD` with `git.raw(['ls-tree', '-r', '-z',
  '--full-tree', 'HEAD'])` (simple-git decodes stdout as UTF-8, lossily) and reads each blob with
  `git.binaryCatFile(['blob', oid])`, one process per blob.
- `packages/adapters/git/src/simple-git-history.ts` reads the whole `git log` with `git.raw` and
  `parse-log.ts` splits that string on NUL.
- Every git call goes through `readerGit(root)` (`repository.ts`): pinned `GIT_CONFIG`, closed
  `GIT_ENV` (`LC_ALL=C`, `GIT_NO_LAZY_FETCH=1`, `GIT_ATTR_NOSYSTEM=1`). These are security
  invariants of `repository-indexing` and `git-history` and MUST hold for every new process.
- simple-git can neither feed a process's stdin (needed by `cat-file --batch`) nor hand back stdout
  as a stream or as bytes for `raw`.
- `packages/core/src/index/source-path.ts` → `selectIndexableFiles` rejects C0 and DEL with
  `CONTROL_CHARACTER`.
- `cli-indexing` was created by DIS-86 (`cli-index-command`, archived and merged into
  `feature/entrega-2-CRN` by PR #24, `7e6d25a`); its escaping requirement is
  modified here.

## Goals / Non-Goals

**Goals:**

- A constant number of git processes per `readFiles`, independent of the file count.
- No blob over 1 MiB is ever loaded; no raw `git log` output is ever held whole.
- Paths handled as bytes until they are known to be valid UTF-8.
- Every new process keeps exactly the pinned config and the closed environment.

**Non-Goals:**

- Replacing simple-git for the repository checks (`assertRepositoryRoot`, `hasCommits`): they run a
  fixed number of short commands and are not part of the debt.
- Paging `GitPort` or `SourceTreePort` results (see proposal → Non-goals).
- Parallel blob reads.

## Decisions

### D1. One spawn helper that reuses `GIT_CONFIG` and `GIT_ENV`

Add to `repository.ts` a `spawnReaderGit(root, args)` that runs `git` through
`node:child_process.spawn` with `-c <entry>` for every `GIT_CONFIG` entry before the subcommand,
`env: GIT_ENV`, `cwd: root`, `shell: false`, `stdio: ['pipe', 'pipe', 'pipe']`, and
`windowsHide: true`. It returns the child process plus a `finished` promise that rejects with an
`Error` carrying git's stderr (trimmed, C locale) when the exit code is not 0 or the process fails
to start (`ENOENT` when git is missing propagates as is).

- `GIT_CONFIG` stays the single source of truth: `readerGit` passes it to simple-git as `config`,
  `spawnReaderGit` as `-c` pairs. A unit test asserts the argument vector starts with every
  `GIT_CONFIG` entry as `-c`, so a new entry cannot be forgotten in one of the two paths.
- The helper is the adapter's only `spawn`. A `GitSpawner` type (`(root, args) => GitProcess`) is
  the parameter of two **internal** constructors, `gitSourceTreeWith(spawnGit)` and
  `simpleGitHistoryWith(options, spawnGit)`; the public `createGitSourceTree()` and
  `createSimpleGitHistory(options)` keep their signatures and always pass `spawnReaderGit`, and the
  package index exports neither the seam nor its types. (First implemented as an optional
  `spawnGit` of the public constructors; `/verify-against-spec` pointed out that a caller-supplied
  launcher skips `GIT_CONFIG` and `GIT_ENV`, which breaks the spec's "neither the repository's own
  configuration nor the caller's git environment variables … SHALL change what is read".) Tests
  wrap the real spawner to count, observe or redirect processes; the simple-git checks are a fixed
  number of calls and cannot change with the file count, so counting the spawner is enough for
  "exactly as many processes".
- **Alternative rejected:** keep simple-git and use its `outputHandler` plugin to read streams. It
  still has no stdin for `--batch`, and it would mix two process models for the same reader.
- **Alternative rejected:** batching the log with `--skip/--max-count`. Each batch re-walks the
  skipped commits (quadratic), and a ref moving between batches would need pinning the sha; one
  streamed process avoids both.

### D2. `ls-tree -l` gives the size; paths decoded strictly

`LS_TREE_ARGUMENTS` becomes `['ls-tree', '-r', '-z', '-l', '--full-tree', 'HEAD']`, read through
`spawnReaderGit` as a `Buffer`. Each NUL-terminated record is `<mode> SP <type> SP <oid> SP+ <size>
TAB <path>` (the size is right-aligned with spaces, `-` for a gitlink). The record is split at the
first TAB on bytes; the header is ASCII; the path bytes go through
`new TextDecoder('utf-8', { fatal: true })`. Failure → `non-utf8-path`, reported with a non-fatal
decode (U+FFFD) for display.

Reason order follows the spec (`non-utf8-path`, `symlink`, `submodule`, `too-large`,
`binary-content`). `MAX_BLOB_BYTES = 1_048_576` is a named constant in `git-source-tree.ts`; an entry
with `size > MAX_BLOB_BYTES` is `too-large` and its oid is never sent to `cat-file`.

- Paths valid as UTF-8 are compared and reported as today; only invalid ones change behaviour.
- **Alternative rejected:** `cat-file --batch-check` for sizes: one more process and one more
  protocol for a value `ls-tree -l` already prints.

### D3. One `cat-file --batch` process for every kept blob

After listing, the reader starts one `git cat-file --batch` process, writes every kept oid followed
by `\n` to stdin, ends stdin, and parses stdout as a byte stream of responses, in order:
`<oid> SP blob SP <size> LF <size bytes> LF`. A response `<oid> missing` (a partial clone with
`GIT_NO_LAZY_FETCH`, or a corrupt repository) rejects `readFiles` with an `Error` naming the oid and
`missing`, and the process is killed. Any other unexpected header, or an exit code ≠ 0, rejects too.
No partial `SourceTree` is ever returned.

- Writes to stdin respect back-pressure (`write` returning `false` → wait for `drain`), and stdout is
  consumed concurrently, so a large tree cannot dead-lock the pipe.
- **Found while implementing:** for a missing object (a corrupt repository, or a partial clone under
  `GIT_NO_LAZY_FETCH`) `ls-tree -l` prints the size `BAD` and `cat-file --batch` prints
  `<oid> missing`, both with exit code 0 (git 2.45.1). Neither is git's error, which the
  "A partial clone never fetches a missing object" scenario requires. So a kept entry whose size is
  `BAD` rejects before the batch starts — **any** entry, including one that would only be skipped
  (a symbolic link, a non-UTF-8 path, a file over the limit), because the repository is incomplete
  and the spec allows no partial result — and a `missing` answer kills the batch; in both cases one
  `git cat-file blob <oid>` (same helper, same config and environment, so it never fetches either)
  runs to obtain git's own `fatal:` message, and `readFiles` rejects with that error. This extra
  process exists only on the failure path, so the process count of a successful read stays fixed.
- Responses are matched to entries by order and checked against the requested oid. Any other
  unexpected answer (a different header, no trailing newline, extra answers, an early end) rejects
  with a `BatchAnswerError`. On an early end the reader does not stop git (git closed its output
  and is exiting on its own) and rejects with git's error when git exits non-zero; this was missing
  in the first implementation (`/adversarial-review`) and has its own test, with a stand-in process
  that cuts a real batch answer and fails.
  `ls-tree` printing an object id that is not 40 or 64 hex characters rejects before anything is
  written to `cat-file`.
- The `ls-tree` listing is read whole (one line per tracked entry, a few dozen bytes each); only
  the blobs and the history are streamed (proposal → Non-goals).
- Each blob is collected only up to its announced size, which `ls-tree -l` already bounded at 1 MiB;
  a header announcing a different size than the listing rejects.
- `--batch` does not apply filters or textconv (same as `cat-file blob` today), so "Reading executes
  nothing from the repository" still holds; the existing scenario guards it.
- **Alternative rejected:** `--batch-command` / `--buffer`: newer git and no gain for a single pass.

### D4. Streamed log parser

`parse-log.ts` gains a `LogParser` that is fed `Buffer` chunks and emits nothing until `end()`,
which returns the `GitHistory`. Internally it keeps only the bytes of the current incomplete token,
splits on NUL as bytes (never inside a UTF-8 sequence, since NUL is never part of one), and decodes
each complete token:

- commit fields (sha, name, e-mail, date, message): UTF-8, non-fatal (today's behaviour of
  `git.raw`);
- numstat tokens: the counts are ASCII; the path bytes are decoded fatally; an invalid path drops
  the link (spec: "A link whose path is not UTF-8 is left out"). Core's co-change rule never sees
  such a link, so it does not count towards a commit's 100-file limit (written into the delta after
  `/adversarial-review`; a commit right at the limit is the only one whose weighting can change).

The state machine mirrors today's `parseLog`: `COMMIT_FIELDS` values, then numstat tokens until a
token does not match. Since a token's kind depends on the next token only through `NUMSTAT`, the
parser decides per token as it arrives. `parseLog(output, salt)` stays as a thin wrapper (feed one
chunk, `end()`), so existing unit tests and the "stream equals whole" scenario compare the same
code fed differently. A unit test feeds the same output in 1-byte chunks and in one chunk and
asserts deep equality, covering splits inside multi-byte characters and around NUL.

`readHistory` pipes `spawnReaderGit(root, LOG_ARGUMENTS).stdout` into the parser and awaits
`finished`; on a non-zero exit it rejects with git's error and discards the parser, even when the
parser already holds complete commits (a test delivers half of a real `git log` output and then
fails). When the parser rejects the output first, it stops git and that parse error is reported.

### D5. Path hygiene in core

`CONTROL_CHARACTER` in `source-path.ts` becomes `FORBIDDEN_PATH_CHARACTER`, matching
`[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]`. The reason
stays `invalid-path` (no new reason: the reader of `skipped` needs "the path is unusable", not
which character). TSDoc of `selectIndexableFiles` and of `SkipReason` are updated.

- The list is Trojan Source's bidi set (U+202A–U+202E, U+2066–U+2069) plus the three implicit marks
  (U+200E LRM, U+200F RLM, U+061C ALM), which also reorder display, plus the two Unicode line
  separators, which break line-oriented output. Zero-width characters stay allowed (proposal →
  Non-goals); the spec pins that with `z<U+200B>.php`.
- **Alternative rejected:** escaping bidi/format in `toTerminalSafeJson` *instead of* rejecting in
  core (author decision, DIS-100): the path would still reach the database and every future reader
  (API, UI) would need its own escaping. Escaping *as well* is D7.

### D6. `SkipReason` additions

`'too-large' | 'non-utf8-path'` are added to the union in `index-report.ts`. The only consumers are
the report sort (by string) and `render-report.ts` (prints the reason as is), so no switch needs an
extra branch. The `--json` report contract is additive.

### D7. The CLI escapes bidi and separator characters too (found in the manual test)

The manual test (task 9.3) showed that rejecting in core is not enough for the terminal: the
rejected path is reported in `skipped`, and the text report and `--json` printed
`evil<U+202E>gnp.php` raw, reordered on screen. The proposal's non-goal "no escaping of bidi in the
CLI" rested on "no indexed path carries them", which is true but misses the skipped list. The author
chose to fix it here.

`toTerminalSafeJson` (`packages/cli/src/safe-json.ts`), the single serialiser of every CLI output
(text literals through `escapeLiteral`, the `--json` report, log lines, the error line), widens its
replacement from `[\u007f-\u009f]` to the same set core rejects minus C0 (which `JSON.stringify`
already escapes): `[\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]`, each as
`\uXXXX`. The JSON still parses to the original string. The two lists are kept in two places
(core's `FORBIDDEN_PATH_CHARACTER`, the CLI's serialiser), each documented as mirroring the other;
core cannot import from the CLI and the CLI escapes more than paths.

## Risks / Trade-offs

- [A long-lived child process can leak if the reader throws mid-stream] → every path that rejects
  kills the child (`child.kill()`), and `finished` is awaited in a `finally`; a test makes `cat-file`
  meet a missing object and asserts the promise rejects and no process remains (exit observed).
- [Spawning `git` directly bypasses simple-git's argument checks] → the argument vectors are
  constants of the adapter, never built from repository data; only oids read from `ls-tree` go to
  stdin, and they are validated against `^[0-9a-f]{40}$|^[0-9a-f]{64}$` before writing.
- [Windows: `spawn('git')` without a shell must find `git.exe` on `PATH`] → `GIT_ENV` already passes
  `PATH`; simple-git resolves git the same way. The integration suite runs on Windows locally and
  exercises the real spawn.
- [Fixtures for non-UTF-8 paths cannot be created on the Windows file system] → build them with
  `git hash-object -w`, `git mktree` (fed the raw path bytes) and `git commit-tree` in a temp
  repository; no work-tree file with that name is ever needed.
- [The 1 MiB limit may skip a legitimate large generated file] → it appears in `skipped` with
  `too-large`; the number is a named constant and a later change can make it configurable.
- [Dropping non-UTF-8 numstat links changes `co_changed` weights for those commits] → such a path can
  never be an indexed file, and only the rare commit touching one is affected; accepted.

## Migration Plan

No data migration: `skipped` is not persisted, and no stored path can hold the newly forbidden
characters except projects indexed before this change, which keep them as stored (development data
only at this stage). Rollback is reverting the commit.

## Follow-ups

Review findings of `/verify-against-spec` and `/adversarial-review` (2026-10-08) and their
destinations (`docs/project-context.md` → Tracking deferred findings). Nothing is left for a later
ticket.

| Finding | Destination | Where |
|---|---|---|
| verify 2.2: no test for git failing part-way through the log | **A**, fixed | integration test "rejects with git's error, never a partial history, when git fails part-way" |
| verify 2.4: "without being read" proven by the output only | **A**, fixed | size and non-UTF-8 tests record the object ids written to `cat-file` |
| verify 2.5: missing object behind a skipped entry resolved | **A**, fixed | D3; test "rejects with git's error when the object of an entry that would be skipped is missing" |
| verify 3.1 and 3.2: package exported the launcher seam and its types; a caller could bypass `GIT_CONFIG`/`GIT_ENV` | **A**, fixed | D1: internal `gitSourceTreeWith` / `simpleGitHistoryWith`, public factories unchanged |
| verify 3.3–3.5: unspecified error details, `ls-tree` read whole | **A**, documented | D3, D4, proposal → Non-goals |
| verify 2.1: no memory measurement of the stream | **D**, accepted | the property is structural; the chunk-boundary failure mode is pinned by unit tests (1- and 7-byte chunks) |
| verify 2.3: the process count does not include the simple-git checks | **D**, accepted | D1: a fixed number of calls, independent of the file count |
| adversarial 1: git's error hidden when `cat-file --batch` dies part-way | **A**, fixed | D3; test "rejects with git's error when cat-file dies part-way through the batch" |
| adversarial 2: dropped non-UTF-8 links leave a commit's 100-file count | **A**, spec | `git-history` delta, requirement "History reading"; D4 |
| adversarial 3: new parsers outside mutation testing | **A**, fixed | unit tests for `parseTree`, `BatchAnswers` and `LogParser`; Stryker `git-source-tree.ts` parsers 92.63 %, `parse-log.ts` 82.64 % (survivors: equivalent or regex-anchor variants git never prints) |
| adversarial Q: spec history not checkable while uncommitted | process | committed with the change; D7 and task 6.3 record that they came after the manual test |
| adversarial Q: CI's git may differ (`BAD` / `missing` with exit 0) | process | task 10.2 checks the CI run |
