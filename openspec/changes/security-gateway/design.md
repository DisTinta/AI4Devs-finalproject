## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `packages/core/src/` has two modules, `ports/` and `knowledge/`, both re-exported from
  `packages/core/src/index.ts`. There is no `index/` module yet (the index use case of DIS-85 will
  live there too).
- `SourceFile { path, content }` (`ports/AnalyzerPort.ts`) is what the analyzer receives, so it is the
  input and output shape of redaction. `GraphFile.redacted?: boolean` and the column
  `file.redacted boolean NOT NULL DEFAULT false` already exist; the `file` table stores no content, so
  a secret would reach the index through `symbol.signature`, `evidence.excerpt` or `commit.message`.
- `DomainError` (`knowledge/errors.ts`): abstract `code`, `name` set in the constructor, the offending
  value as a `readonly` field (`ProjectNotFound.projectId`, `NotAGitRepository.repoPath`).
- `.dependency-cruiser.cjs` forbids infrastructure, `fastify`/`@fastify/` and `node:http` in core;
  `node:path` is allowed (precedent: `node:crypto` in `knowledge/author-hash.ts`).
- `ALLOWED_REPOS_DIR` is documented (`docs/project-context.md` → Operational constraints, `readme.md`)
  but read by no code. Precedent for env reading at the composition root only:
  `authorHashSaltFromEnv(env)` in `packages/adapters/git/src/config.ts`.
- `tests/support/read-fixture-files.ts` skips only `.git`. Locally `fixtures/task-api/node_modules/`
  exists (not in CI) and contains real JWTs.
- Stryker mutates `packages/core/src/**`: all the new code counts towards the threshold of 70.
- Verified 2026-10-05 with a scratch script over the ticket literals: AC3 columns 9, 12, 11, 35;
  key `<K>` length 32, entropy 5.0; `AKIAM3VXTQ9CZJY6WNKP` entropy 4.12; service-account column 19;
  heredoc column 7; `services.php` line 21 column 44; `env.ts` line 7 column 34.

## Goals / Non-Goals

**Goals:**

- Pure functions in core, no I/O: content in, redacted content and events out; path and root in,
  resolved path or domain error out.
- Matching time linear in the content size, including adversarial input.
- One test per spec scenario, with the scenario's exact title.

**Non-Goals (design level):**

- No configurable rule set: the four rules are constants.
- No streaming API: a whole `SourceFile` at a time, as the analyzer takes it.

## Decisions

### D1 — Module layout and public API

`packages/core/src/index/` with `secret-scanner.ts`, `path-policy.ts`, `audit-event.ts` and a barrel
`index.ts`; `packages/core/src/index.ts` gains `export * from './index/index.js';`. Exported:

```ts
export const REDACTION_MARKER = '[REDACTED: possible secret]';
export const MIN_SECRET_ENTROPY = 3.5;
export const MIN_SECRET_LENGTH = 20;
export type SecretRule = 'private-key' | 'jwt' | 'aws-access-key-id' | 'generic-high-entropy';
export type AuditEvent = SecretRedactedEvent; // union; later stories add members
export interface SecretRedactedEvent { type: 'secret_redacted'; file: string; line: number; column: number; rule: SecretRule }
export interface RedactionResult { file: SourceFile; redacted: boolean; events: AuditEvent[] }
export function redactSecrets(file: SourceFile): RedactionResult;
export function confinePath(requested: string, allowedRoot: string | undefined): string;
export class ForbiddenPathError extends DomainError { code = 'FORBIDDEN_PATH'; requestedPath }
export class IndexingDisabled extends DomainError { code = 'INDEXING_DISABLED' }
```

`SecretRedactedEvent` is named so later members (`schema_violation`, `evidence_broken`) join the
union without touching it. Alternative rejected: one flat `AuditEvent` with optional fields — loses
the discrimination. The name `ForbiddenPathError` keeps the `readme.md` §2.5 and parent-AC name even
though the existing errors have no `Error` suffix (ticket decision).

### D2 — Line model

This is the line model of the spec (requirement "Secret redaction").

Content is split on `\n`. A trailing `\r` belongs to the line terminator: it is excluded from rule
matching, columns and "end of line", and is kept on every line, including lines that become empty.
`line` and `column` are 1-based, the column counted in UTF-16 code units of the original line. "The
number of lines does not change" means the number of `\n` is preserved; the output is the lines joined
again with `\n`. The `jwt`, `aws-access-key-id` and `generic-high-entropy` rules match within one line
(no `\s` crosses a line break); only `private-key` spans several lines, and it is built from per-line checks (D4).

### D3 — Rule evaluation, priority and linear time

Spans are collected per line as half-open `[start, end)` intervals tagged with their rule, rule by rule
in priority order. A candidate that overlaps an already claimed interval on the same line (or a line
covered by a `private-key` block) is discarded. After all rules, each covered line is rebuilt once,
with `REDACTION_MARKER` in place of each span (see the correction below; first written as a
right-to-left replacement per span).

- `jwt` and `aws-access-key-id`: global regexes, exactly as in the spec table, run per line. Neither
  has nested quantifiers; the JWT segments exclude `.`, so each `+` is bounded by a separator.
- `generic-high-entropy`: the spec regex has `[A-Za-z0-9_-]*(keyword)[A-Za-z0-9_-]*`, which
  backtracks quadratically on a long run of repeated keywords. Because the character after group 1 must
  be a quote, whitespace, `=` or `:` — none of them in the class — and the lookbehind forbids a class
  character before it, group 1 is always a **whole maximal run** of `[A-Za-z0-9_-]`. The implementation
  is therefore equivalent and linear: scan the maximal runs, keep those whose lower-cased text contains
  `secret`, `password`, `passwd`, `token`, `apikey`, `api_key` or `api-key`, then match the tail with a
  sticky regex `(['"]?)\s*(?:=>|=|:)\s*(['"])([^\s'"]{20,})\2` at the run's end, then check the entropy
  of the value. The span is the value only. Alternative rejected: running the literal regex — correct
  but not linear on adversarial input.
- Shannon entropy over UTF-16 code units: `-Σ p·log2 p`, compared `>= MIN_SECRET_ENTROPY`.
- A regex discarded for overlap resumes after its own match (standard global-regex behaviour), so a
  lower-priority match starting inside a discarded one is not found. Accepted: it would overlap the
  same secret area anyway.

**Correction (found by `/adversarial-review`, 2026-10-05, two rounds).** The linearity claim above
covered the regexes only. It was never checked for the work around them, and four parts of that work
grew faster than linear in the number of matches on one line:

1. **Overlap test.** Every candidate was compared with every claim so far.
2. **`private-key` closing search.** Every header without a closing searched the rest of its line
   again with `indexOf`. The body run and the indent of the following line were also recomputed for
   each header.
3. **Replacement.** Every claim rebuilt its whole line with `slice`. The first review did not name
   this one; it showed up when fixes 1 and 2 alone left the times almost unchanged.
4. **Interval insertion and final sort** (second review). The first fix kept a per-line interval list
   sorted with `splice`, which is O(k) per insertion when a later rule lands between the claims of an
   earlier one. The first fix also cached "closing not found" per exact closing text. With a distinct
   label on every header the cache never hit, so the search stayed quadratic. Finally, all claims were
   sorted at the end to order the events, which is n log n.

Measured before each fix (one line):

- First round, in the review: JWT (`eyJa.` repeated) 50k / 100k / 200k took 8.8 / 24.1 / 75.9 s;
  16k identical headers without a closing took 11.2 s. In the tests: 100k JWTs 25.9 s, 20k AWS keys
  12.5 s, 20k headers 15.7 s. After fixes 1 and 2 only: 21.9 s, 11.2 s and 12.3 s.
- Second round, in the tests: 20k headers with distinct labels 4.8 s; the same closed once at the end
  3.5 s; JWTs and AWS keys alternating on 5.1 MB 12.2 s. In the review: 40k distinct labels (1.3 MB)
  took 19.8 s, and the alternating case took 7.4 s at 4.8 MB.
- After fix 4 without the event walk (sort still in place): alternating 5.1 / 10.2 / 20.4 MB took 317 /
  675 / 2 210 ms (median of 5), a ratio of 3.27 at the last step. With V8's young generation raised to
  128 MB it was 1.38, which pointed at allocation pressure rather than a quadratic step.

What the code does now:

- **Intervals are the only record of a claim.** `Claims.byLine` is an array indexed by line. Each entry
  is the line's covered intervals `{ from, to, marker, rule }`, sorted and disjoint. A multi-line
  `private-key` claim puts one interval on every line it covers, with `marker` only on its start line.
- **No insertion in the middle.** `private-key` claims arrive in increasing position and are appended.
  Each later rule works a line in one `LinePass`, which receives candidates in non-decreasing start
  order. A candidate is checked against the earlier rules' intervals, through a pointer that only
  moves forward, and against the last interval this pass accepted. At the end of the line the accepted
  intervals are merged into the list with one linear merge: no `splice`, no sort.
- **Closings.** For each header line, `ClosingIndex` scans the line's `-----END …PRIVATE KEY-----`
  once with a regex that captures the label the same way as the header regex. It resumes one character
  after each match, so closings that share dashes are all found, as with `indexOf`. Positions are
  grouped by label, in increasing order. Headers are met left to right with increasing `headerEnd`, so
  one pointer per label that only moves forward answers every search. The body run and the next
  line's indent are computed at most once per header line. Both caches are reset when the line changes.
- **One walk for text and events.** `Claims.apply` walks the lines in order, and within each line its
  sorted intervals. It rebuilds the line once and emits one event per interval with `marker`, so a
  multi-line block gives one event, at its start. The events come out ordered by `line`, then
  `column`, with no sort. There is no claim array and no `[...claims].sort`.

After the fixes, median of 5, default garbage collector, each step doubling the input:

| Case | n | 2n | 4n | Ratios |
| -- | -- | -- | -- | -- |
| Headers, distinct labels (20k / 40k / 80k) | 38.8 ms | 70.5 ms | 160.3 ms | 1.82, 2.27 |
| Distinct labels, closed once at the end | 28.4 ms | 52.8 ms | 100.0 ms | 1.86, 1.89 |
| JWT/AWS alternating (5.1 / 10.2 / 20.4 MB) | 420.3 ms | 675.5 ms | 1 558.1 ms | 1.61, 2.31 |
| JWT (100k / 200k / 400k) | 43.8 ms | 72.5 ms | 132.5 ms | 1.65, 1.83 |
| AWS keys (20k / 40k / 80k) | 21.0 ms | 33.7 ms | 69.3 ms | 1.61, 2.06 |
| Identical headers (20k / 40k / 80k) | 34.4 ms | 52.5 ms | 117.6 ms | 1.53, 2.24 |
| Repeated keywords (35k / 70k / 140k) | 0.9 ms | 1.3 ms | 2.7 ms | 1.49, 2.11 |

Every ratio is 2.31 or less. The scenario "Redaction time grows linearly on adversarial lines" pins it
(`tests/unit/index/secret-scanner.linear.spec.ts`). It has nine timed cases, one per input family, each
with a 2 s budget, the elapsed time asserted, and an input of at most ~5 MB. It also has a scaling
check: on the four-rules line, the median of three runs at `4n` must be less than 8 times the median
at `n` (10k / 40k units, 1 / 3.9 MB). The scaling check catches quadratic paths with a small constant
that a fixed budget misses: forcing the per-line cache reset, or a splice-based merge, gives ~17. The
20 MB sizes are only for measuring.

### D4 — `private-key` blocks

For each line, find headers left to right. For a header at `(line h, column c)`:

1. Form c: search the closing with the same label after the header on line `h`; if found, the block
   ends at its last dash on line `h`.
2. Otherwise compute the body run from line `h + 1` (PEM body predicate of the spec; the
   "empty after a `Name: value` header" case looks at the previous run line). Form a: if the line after
   the run, leading whitespace removed, starts with the closing, the block ends at its last dash on that
   line. Form b: else the block ends at the end of the last run line, or at the header's last dash if
   the run is empty.
3. Line `h` keeps the text before column `c` and gets the marker; lines strictly between become empty;
   the last line keeps the text after the block end (for a one-line block, the marker sits between both
   kept parts). One event at `(h, c)`.
4. Scanning resumes after the block end, so a second key later on the same last line is found;
   lines inside the block are not evaluated by any lower-priority rule.

### D5 — Events

Built from the claimed spans, sorted by `line`, `column`, then `rule` (string order). Claims never
overlap, so two never start at the same place: the `rule` tie-break never applies and the code sorts
by `line` and `column` only (found in apply, 2026-10-05: Stryker reported the tie-break as unreachable,
`NoCoverage`). Only the
coordinates and the rule are copied; the matched text never leaves the scanner function. `redacted`
is `events.length > 0`. Nothing is logged (PH-09, ticket decision 2026-10-04, option A).

### D6 — `confinePath`

Exactly the spec algorithm with `node:path` (the platform default, so `win32` semantics on Windows,
which compares drive letters and case correctly in `path.relative`): blank check with `trim()` first,
then `path.resolve(allowedRoot)`, `path.resolve(root, requested)`, `path.relative(root, resolved)`
and the acceptance test `rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) &&
!path.isAbsolute(rel))`. Alternative rejected: `resolved.startsWith(root)` — accepts `/repos-evil`.
The check is lexical; DIS-85 must call it again on the `realpath` before reading (Follow-ups).
`ForbiddenPathError`'s message includes the requested path (it is a path, not a secret).

### D7 — `readFixtureFiles(root, ignoredDirs = ['.git'])`

The second parameter is compared with each entry's name, whatever its type, as `.git` already was.
Default keeps the 6 current callers unchanged. The oracle test calls it with `['.git', 'node_modules']`
so it gives the same result locally and in CI. (Changed in apply, 2026-10-05: the first version compared
only directory entries, and Stryker's sandbox links `fixtures/task-api/node_modules` instead of copying
it, so the link was read as a file: `EISDIR`.)

### D8 — Test inputs and secret hygiene

AC1/AC2 read the real fixtures (read-only, PH-22). Every synthetic secret-shaped literal in
`secret-scanner.spec.ts` is built by concatenation, so `gitleaks` (DIS-87) and the repository hooks do
not flag the test file. The AC1 "no substring of 8+ characters" check iterates over all substrings of
the key and searches the serialised events.

### D9 — Spec scenario mapping

The ticket asks for one scenario per AC; AC3 and AC4 bundle cases with distinct assertions, so they
are split (each scenario ↔ one test): AC1 → "The acme-shop planted secret is redacted"; AC2 → "The
fixtures produce no false positive"; AC3 main → "Every rule produces one ordered event per span";
AC3 (i)–(iv) → the four "Private key blocks" scenarios; AC4 → "Paths inside the root are accepted",
"Paths outside the root are forbidden", "A path on another Windows drive is forbidden"; AC5 → "A
missing or blank root disables indexing". The linear-time clause of "Secret redaction" → "Redaction
time grows linearly on adversarial lines" (added 2026-10-05 after the third `/adversarial-review`).
Its test is the `describe` block of that name in `tests/unit/index/secret-scanner.linear.spec.ts`,
which holds one timed case per input family and the `n`/`4n` scaling check.

### D11 — Stryker adds `// @ts-nocheck` only to the mutated files

Found in apply (2026-10-05). Stryker's default `disableTypeChecks` (`{test,src,lib}/**/*.{js,ts,…}`)
prepends `// @ts-nocheck` to every matching file of the sandbox, including
`fixtures/task-api/src/**`. That shifts the planted secret of `src/config/env.ts` to line 8, and the
oracle test "The fixtures produce no false positive" fails in the dry run. `stryker.config.json` now
sets `"disableTypeChecks": "packages/core/src/**/*.ts"`, the same glob as `mutate`. The Vitest runner
does not type-check, so nothing else depends on the directive. Alternative rejected: excluding the
oracle test from Stryker, because it kills overlap and priority mutants.

### D12 — Vitest excludes `.stryker-tmp/**`

Found in apply (2026-10-05). The two Stryker dry runs that failed before D11 left their sandboxes in
`.stryker-tmp/`, and Vitest collected them (the gotcha in `docs/project-context.md`).
`tests/integration/helpers/gate.spec.ts` counted 6 skipped files instead of 2, and the full suite also
ran the third-party specs behind the sandbox's linked `fixtures/task-api/node_modules` (2803 files).
`vitest.config.ts` now sets `exclude: ['fixtures/**', 'node_modules/**', '.stryker-tmp/**']`, so any
Stryker run that fails later cannot break the local suite. It is outside the plan because the plan
assumed the manual clean-up the gotcha described; the failed runs of this change showed that manual
step does not hold up. `vitest.stryker.config.ts` inherits the exclusion through `mergeConfig`.

### D13 — `.gitattributes`: `* text=auto eol=lf`

Found in apply (2026-10-05). The edits of this change left CRLF in `stryker.config.json`,
`vitest.config.ts`, `packages/core/src/index.ts` and `tests/support/read-fixture-files.ts`, and the
whole file showed as changed. Cause: the rule `* text=eol=lf` gives `text` the value `eol=lf`
(`git check-attr -a stryker.config.json` printed `text: eol=lf`), so no `eol` attribute applied and
nothing was normalised. It is now `* text=auto eol=lf` (`text: auto`, `eol: lf`); the comments above it
are unchanged. `git add --renormalize .` changed no other file: every tracked text file was already LF
in the index. It is outside the plan because it is repository hygiene unrelated to the gateway, and it
goes in its own commit (`chore: fix .gitattributes eol rule`) so the PR can be reviewed or reverted
without it.

### D14 — The timed linear-time tests do not run under Stryker

Found in apply (2026-10-05), on the second round of linearity fixes. Stryker's initial test run executes
the suite on code instrumented for per-test coverage, with 15 runner processes in parallel. There, "a
very long line alternating JWTs and AWS keys is scanned in linear time" (5.1 MB) took 2 517 ms against
its 2 s budget, while outside Stryker it takes about 420 ms. Instrumentation counters and machine load
make wall-clock budgets meaningless on mutated code, so the dry run failed and no mutant ran.

The seven timed cases moved, unchanged, to `tests/unit/index/secret-scanner.linear.spec.ts`, and
`vitest.stryker.config.ts` excludes that file next to `tests/integration/**`. `mergeConfig` appends to
the base `exclude` (`fixtures/**`, `node_modules/**`, `.stryker-tmp/**`): checked by printing both
resolved configs. The file still runs in `npx vitest run` locally and in the CI Vitest step. Mutants that
change only the running time, not the result, are therefore invisible to Stryker; the step 6 report
lists them and shows, with forced failures, that this file catches them. It is outside the plan because
the plan had no timed tests. Alternatives rejected: a smaller alternating input (still fragile under CI
load, and the author asked for ~5 MB), and skipping on a Stryker global (ties the tests to the tool).

### D10 — No ADR

Module-local decisions; the architectural one (no `AuditPort`, PH-09) is already recorded. Reverting
means deleting a module nobody consumes yet.

## Risks / Trade-offs

- [Regex literals and many small branches give Stryker many mutants; survivors could pull the core
  score under 70] → the scenarios assert exact events and content; add extra cases (not scenarios) for
  boundaries: 19 vs 20 characters, entropy just below/above 3.5, `\b` around AWS keys, lowercase
  `akia`, JWT with only two segments, `api-key`/`api_key`/`apikey`, unquoted value, mismatched quotes,
  CRLF content.
- [`\b` in the AWS rule does not match after `_` (e.g. `X_AKIA…`)] → accepted, it is the ticket's
  regex; recorded in the gotcha.
- [Lexical confinement can be bypassed by a symlink inside the root] → out of scope; hand-off to
  DIS-85 (Follow-ups).
- [`commit.message` may carry a secret] → decision handed to DIS-85 (Follow-ups).
- [Local `node_modules` makes AC2 differ between machines] → D7.
- [The PEM body test is loose: single-word lines (`end`, `else`) are valid base64 and `nombre: valor`
  passes as a `Name: value` header, so after a header with no closing such lines are emptied] →
  accepted (D, author decision 2026-10-05): it over-redacts and never leaks; recorded as a known
  limitation in `docs/project-context.md`.
- [Adversarial long lines] → D3 keeps every rule linear. The first version had a single untimed case
  (repeated `secret`) and missed three quadratic paths (see the D3 correction). Four timed cases (2 s
  each, elapsed time asserted) now cover repeated keywords, JWTs, AWS keys and headers without a
  closing, each above 100k characters.

## Migration Plan

None: new code, nothing consumes it yet. Rollback = revert the commits.

## Follow-ups

Destination B (successor ticket), written as Spanish Linear comments at archive time:

- **DIS-85**: apply `redactSecrets` before the analyzer and take `file.redacted` from
  `RedactionResult.redacted`; aggregate each file's `events` into the index report; call
  `confinePath` again with the `realpath` before reading; decide whether `commit.message` goes through
  the scanner.
- **DIS-86**: read `ALLOWED_REPOS_DIR` at the CLI composition root and pass it to `confinePath`; write
  every `AuditEvent` with the CLI's structured logger (covers the parent AC "the structured log
  contains a `secret_redacted` event"); `ForbiddenPathError.message` carries the requested path, which
  may contain an OS user name: log it with that in mind (privacy check 2026-10-05, Low); trim
  `ALLOWED_REPOS_DIR` when reading it, because `confinePath` trims the root only for the blank check and
  `' /repos'` would resolve relative to the working directory (`/adversarial-review` Minor, 2026-10-05).
- **DIS-87**: `gitleaks` must cover `-----BEGIN PGP PRIVATE KEY BLOCK-----`. The `private-key` rule does
  not match it, and secrets outside the four rules are out of scope for this change
  (`/adversarial-review` question, author decision 2026-10-05).
