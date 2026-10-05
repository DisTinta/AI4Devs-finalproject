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

**Correction (found by `/adversarial-review`, 2026-10-05).** The linearity claim above covered the
regexes only. It was never checked for the work around them, and three parts of it were quadratic in
the number of matches on one line:

1. **Overlap test.** Every candidate was compared with every claim so far.
2. **`private-key` closing search.** Every header without a closing searched the rest of its line
   again for the same closing. The body run and the indent of the following line were also recomputed
   for each header.
3. **Replacement.** Every claim rebuilt its whole line with `slice`. The review did not name this one;
   it showed up when the first two fixes alone left the times almost unchanged.

Measured before the fix:

- JWT case (`eyJa.` repeated on one line): 50k / 100k / 200k repetitions took 8.8 s / 24.1 s / 75.9 s
  in the review.
- 16k headers without a closing on one line: 11.2 s.
- New tests, at their sizes: 100k JWT repetitions 25.9 s, 20k AWS keys 12.5 s, 20k headers 15.7 s.
- After fixes 1 and 2 only: 21.9 s, 11.2 s and 12.3 s.

What changed:

- Claims live in a per-line index (`Claims`). Each line keeps the intervals it covers, sorted by
  `from`, and a multi-line `private-key` claim covers every line from its start to its end. Claims
  never overlap, so an overlap test only checks the last interval starting before the candidate's end,
  found by binary search.
- For each header line, the scanner remembers the closings already searched for in vain (from an
  earlier header's end, so also from any later one) and the body run with the next line's indent. The
  cache is reset when the line changes.
- Each covered line is rendered once from its sorted intervals, instead of once per claim.

After the fix the same inputs take 48 / 83 / 154 ms (JWT 50k / 100k / 200k), 66 ms (20k AWS keys)
and 84 ms (16k headers). The four timed tests in `secret-scanner.spec.ts` keep it that way (2 s each).

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
missing or blank root disables indexing".

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
