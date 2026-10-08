## Why

`index-repository` (DIS-85) left explicit debt (DIS-100, destination **C**): reading a repository is
correct and safe on the fixtures, but it does not scale and is fragile with large or unusual
repositories. The whole `git log` is held in memory as one string, every blob costs one `git`
process (~6 s for the 53 files of acme-shop), a single huge blob can exhaust memory, and paths that
are not UTF-8 are decoded lossily, so two of them can merge into a false `duplicate-path`. DIS-86
added one more point: core keeps paths with C1 controls and bidi/format characters, which reach the
database as is and can visually reorder a displayed path ("Trojan Source"). None of this affects
correctness on the fixtures or security today; it is performance and robustness, and it is cheapest
to close now, before the API and the UI start reading and showing paths.

## What Changes

- **Blobs read by one process.** The Git source tree reads every blob through a single
  `git cat-file --batch` process instead of one `git cat-file` per blob.
- **Size limit per blob.** A blob larger than 1 MiB (1 048 576 bytes) is not read: it is left out
  and reported in `skipped` with the new reason `too-large`. The size comes from the tree listing,
  so the content is never loaded.
- **Paths read as bytes.** The tree listing is read as bytes; a path that is not valid UTF-8 is not
  read and is reported in `skipped` with the new reason `non-utf8-path` (its reported path is the
  lossy decoding, for display only). Two such paths can no longer merge into a `duplicate-path`.
- **History streamed.** The history reader consumes `git log` output as a stream and parses it
  incrementally, so the raw log is never held whole in memory. A file–commit link whose path is
  not valid UTF-8 is dropped by the reader (it can never match an indexed file).
- **Path hygiene in core.** Input hygiene treats as `invalid-path` a path holding a C1 control
  (U+0080–U+009F) or a bidi or line/paragraph-separator character (U+061C, U+200E, U+200F,
  U+202A–U+202E, U+2066–U+2069, U+2028, U+2029), in addition to the C0 controls and DEL it already
  rejects. Such a file is no longer indexed or stored.
- **Bidi escaping in the CLI.** Every CLI output escapes the bidi and separator characters above as
  `\uXXXX`, like the controls it already escapes. Found in the manual test: core rejects such a path,
  but the rejected path is still printed in `skipped`, raw.
- `SkipReason` gains `too-large` and `non-utf8-path` (additive; no consumer switches exhaustively
  on it outside core).

### Non-goals

- No configurable size limit (no env variable, no CLI flag): 1 MiB is a fixed constant.
- `GitPort` still returns the whole parsed history in memory (`commits`, `fileCommits`): streaming
  removes the raw output and its token array, not the parsed result. Paging the port is out of scope.
- No other zero-width characters (U+200B–U+200D, U+FEFF) are rejected.
- The `ls-tree` listing is still read whole: it holds one short line per tracked entry, not file
  contents. Only the blobs (one batch process) and the history (streamed) change.
- No public seam to replace the git launcher: the adapter's factories keep their signatures.
- No change to commit message, author name or e-mail decoding.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `repository-indexing`: the source tree contract gains the `too-large` and `non-utf8-path` skip
  reasons and reads blobs in one process; input hygiene rejects C1, bidi and separator characters
  as `invalid-path`.
- `git-history`: history reading drops file–commit links whose path is not valid UTF-8 and never
  holds the raw log whole in memory.
- `cli-indexing`: the scenario "Control characters are escaped in the log, the JSON report and the
  error" assumed core keeps a path with a C1 control; it is rewritten so the C1 path reaches the
  output through the skipped list and a diagnostic, which the CLI still escapes. The escaping
  requirement also covers the bidi and separator characters.

## Impact

- **Code:** `packages/adapters/git/src/` (`git-source-tree.ts`, `simple-git-history.ts`,
  `parse-log.ts`, `repository.ts` gains a process helper that reuses `GIT_CONFIG` and `GIT_ENV`),
  `packages/core/src/index/source-path.ts`, `packages/core/src/index/index-report.ts`,
  `packages/core/src/ports/SourceTreePort.ts` (TSDoc), `packages/cli/src/safe-json.ts`.
- **Tests:** `tests/integration/git/git-source-tree.spec.ts`,
  `tests/integration/git/simple-git-history.spec.ts`, the core unit tests of input hygiene, the CLI
  escaping test, and `tests/integration/index/acme-shop.spec.ts` (its 60 s timeout can drop).
- **Security:** git still runs with the same pinned configuration and closed environment; the new
  long-lived `cat-file --batch` process must keep `GIT_NO_LAZY_FETCH` (a missing object rejects with
  git's error, never fetches). No personal data, auth or logging is touched.
- **Dependencies:** none new (`node:child_process` for the streaming process).
- **Ordering:** the `cli-indexing` capability was created by DIS-86 (`cli-index-command`), already
  merged into `feature/entrega-2-CRN` (PR #24, `7e6d25a`); this change branches from there.
- **Docs:** `docs/project-context.md` (git adapter gotcha: "one `git cat-file` per blob", ~6 s).
