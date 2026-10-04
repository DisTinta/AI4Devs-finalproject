## MODIFIED Requirements

### Requirement: Analysis contract

`AnalyzerPort.analyze(input)` SHALL take `{ files }`, where each file is `{ path, content }` with a
repository-relative `path` using `/` as separator, and SHALL resolve to `{ files, symbols, edges,
diagnostics }` built from the existing graph types:

- `files`: exactly one `GraphFile` per distinct input path, with its `path`, its `kind` and its `loc`,
  and no `contentHash` or `redacted`;
- `symbols`: the `GraphSymbol`s declared in those files;
- `edges`: the `GraphEdge`s between those files and symbols defined by the requirements "Code
  relation edges", "Array-action routes", "Declared-type calls", "Laravel heuristic calls", "Test
  coverage edges" and "Documentation mention edges"; every edge SHALL have a non-empty `extractor`, a
  `resolution`, no `weight`, and both endpoints present in `files` or `symbols` of the same result; no
  two edges SHALL share `kind`, source and target;
- `diagnostics`: one `{ path, message, line? }` per file that could not be parsed, one per symbol
  dropped as a duplicate (see Symbol extraction), and one per input discarded as a duplicate path; a
  file MAY have more than one.

Two inputs share a path when their `path` strings are equal code unit by code unit; paths SHALL NOT
be normalised (case, `./`, separators and whitespace are significant). When several inputs share a
path, only the first of them in input order SHALL be analysed. Every later one SHALL be discarded
before any parsing or indexing: it SHALL contribute no `GraphFile`, no symbol, no edge and no other
diagnostic, and it SHALL add exactly one diagnostic with that `path`, no `line`, and `message`
`duplicate path "<path>"; kept the first`. This applies to every input, whatever its kind. Apart
from inputs discarded as duplicate paths, the order of the inputs SHALL NOT affect the result.

The result SHALL be accepted by the graph validation of `graph-store` once wrapped in a graph with no
commits and no file–commit links. The result SHALL be deterministic: the same input SHALL produce an
equal result. `files` SHALL be ordered by `path`, and `symbols` by file `path`, then `startLine`, then
`endLine` descending (so an enclosing symbol precedes the symbols it contains), then `name`. `edges`
SHALL be ordered by `kind`,
then source endpoint, then target endpoint, where an endpoint is ordered by its file `path`, then a
file endpoint before the symbol endpoints of that path, then symbol `name`, then `startLine`. Kinds,
paths and names SHALL be compared by UTF-16 code unit, not by locale.

The analyzer SHALL use only the content it receives: it SHALL NOT read the analysed repository's
files, open a network connection, or execute or install anything from the analysed repository.
Loading its own parser is the only file it MAY read. When its parser cannot be loaded, the call that
needed it SHALL reject; the analyzer SHALL NOT keep that failure, so a later call on the same analyzer
SHALL try to load the parser again.

#### Scenario: The acme-shop analysis is a valid deterministic graph

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop` (the `.git` directory
  excluded)
- **WHEN** they are analysed twice with the same input
- **THEN** both results are equal, `files` is ordered by `path`, `symbols` by `path` then
  `startLine`, and `edges` is non-empty and in the order defined above, with no two edges sharing
  `kind`, source and target
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: The analyzer reads only the content it receives

- **GIVEN** a file `app/Ghost.php` that does not exist on disk, whose content declares
  `class Ghost`
- **WHEN** it is analysed
- **THEN** the result has one file `app/Ghost.php` and one `class` symbol `Ghost`, and no error is
  raised

#### Scenario: Duplicate input paths keep the first

- **WHEN** these six inputs are analysed in one call, in this order: `app/A.php` with content
  `<?php class A {}`, `README.md` with content `# Readme`, `app/A.php` with content `<?php class A {}`,
  `app/A.php` with content `<?php class B {}`, `README.md` with content `# Other`, and `app/a.php` with
  content `<?php class Lower {}`
- **THEN** `files` is exactly `README.md`, `app/A.php` and `app/a.php`, in that order, each with
  `loc` 1
- **AND** `symbols` is exactly `class A` in `app/A.php` and `class Lower` in `app/a.php` (no
  `class B`)
- **AND** `diagnostics` has exactly three entries, none with a `line`: two with `path` `app/A.php` and
  `message` `duplicate path "app/A.php"; kept the first`, and one with `path` `README.md` and `message`
  `duplicate path "README.md"; kept the first` (no `duplicate symbol` diagnostic)
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: A failed parser load does not poison later calls

- **GIVEN** an analyzer whose first attempt to load its parser fails, and whose later attempts succeed
- **WHEN** `app/Ghost.php` with content `<?php class Ghost {}` is analysed with it, and then analysed
  again with the same analyzer
- **THEN** the first call rejects
- **AND** the second call resolves with one `class` symbol `Ghost` in `app/Ghost.php`, and the parser
  was loaded twice

#### Scenario: Symbols that start on one line are ordered by span, then name

- **WHEN** `app/tie.php` with content
  `<?php function z() { function a() {}\n}\nfunction b() {} function a2() {}\n\nfunction c() {} function d() {\n}\n`
  is analysed
- **THEN** its symbols are exactly, in this order, as kind, name, start line and end line:
  `function z` 1–2, `function a` 1–1, `function a2` 3–3, `function b` 3–3, `function d` 5–6,
  `function c` 5–5 (on line 1 the enclosing `z` precedes `a` despite its name; on line 3, with equal
  spans, `a2` precedes `b`, against their declaration order; on line 5 the sibling `d` precedes `c`
  because it ends later, although neither contains the other: the order is by `endLine`, not by
  containment)

### Requirement: Syntax errors do not stop the analysis

A PHP file that cannot be parsed without errors SHALL still appear in `files` with its `kind` and
`loc`, SHALL have no symbols, and SHALL add one diagnostic with its `path`, a non-empty `message`
and, when known, the 1-based `line` of the first error. The analysis SHALL NOT reject because of it,
and the other files of the same call SHALL keep their symbols.

#### Scenario: A syntax error does not stop the analysis

- **WHEN** `app/Broken.php` with content `<?php class Broken { public function x( }` and
  `app/Ok.php` with a valid class `Ok` are analysed in the same call
- **THEN** the analysis resolves; `app/Broken.php` is in `files` with kind `source` and `loc` 1, and
  has no symbol; `diagnostics` has exactly one entry, for `app/Broken.php`, with `line` 1 and a
  non-empty message
- **AND** `app/Ok.php` has its `class Ok` symbol
