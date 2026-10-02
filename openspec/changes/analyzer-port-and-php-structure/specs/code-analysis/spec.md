## Purpose

How the domain turns the content of a repository's files into the files and symbols of the
knowledge graph through `AnalyzerPort`, without knowing the source language: every file gets a kind
and a line count, and every class, interface, method and function gets its exact line span, so that
later explanations can cite real lines.

## ADDED Requirements

### Requirement: Analysis contract

`AnalyzerPort.analyze(input)` SHALL take `{ files }`, where each file is `{ path, content }` with a
repository-relative `path` using `/` as separator, and SHALL resolve to `{ files, symbols, edges,
diagnostics }` built from the existing graph types:

- `files`: exactly one `GraphFile` per input file, with its `path`, its `kind` and its `loc`, and no
  `contentHash` or `redacted`;
- `symbols`: the `GraphSymbol`s declared in those files;
- `edges`: always empty in this capability (edges are added by a later change);
- `diagnostics`: one `{ path, message, line? }` per file that could not be parsed, and one per symbol
  dropped as a duplicate (see Symbol extraction); a file MAY have more than one.

The result SHALL be accepted by the graph validation of `graph-store` once wrapped in a graph with no
commits and no file–commit links. The result SHALL be deterministic: the same input SHALL produce an
equal result. `files` SHALL be ordered by `path`, and `symbols` by file `path`, then `startLine`, then
the enclosing symbol before the symbols it contains, then `name`; paths and names SHALL be compared
by UTF-16 code unit, not by locale.

The analyzer SHALL use only the content it receives: it SHALL NOT read the analysed repository's
files, open a network connection, or execute or install anything from the analysed repository.
Loading its own parser is the only file it MAY read.

#### Scenario: The acme-shop analysis is a valid deterministic graph

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop` (the `.git` directory
  excluded)
- **WHEN** they are analysed twice with the same input
- **THEN** both results are equal, `files` is ordered by `path`, `symbols` by `path` then
  `startLine`, and `edges` is `[]`
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: The analyzer reads only the content it receives

- **GIVEN** a file `app/Ghost.php` that does not exist on disk, whose content declares
  `class Ghost`
- **WHEN** it is analysed
- **THEN** the result has one file `app/Ghost.php` and one `class` symbol `Ghost`, and no error is
  raised

### Requirement: File classification

Every path SHALL be classified into exactly one kind by a single language-independent rule, with
`/` as separator and the first matching kind winning:

1. `test` when any directory segment is `tests`, `test` or `__tests__`, or the file name matches
   `*.test.*`, `*.spec.*` or `*Test.php`;
2. `doc` when any directory segment is `docs`, or the extension is `.md`;
3. `config` when the first segment is `config`, or the extension is `json`, `xml`, `yml`, `yaml`,
   `toml` or `ini`, or the file name starts with `.`, or matches `*.config.*`;
4. `source` otherwise.

The rule SHALL live in the domain, independent of any analyzer, so every analyzer classifies files
and counts lines identically. A file's `loc` SHALL be its number of lines: `0` for empty content, otherwise the number
of `\n`-separated lines, a final line terminator not counting as an extra line (`\r\n` counts as one
terminator).

#### Scenario: Paths are classified by the canonical rule

- **WHEN** paths are classified
- **THEN** `tests/Unit/TaxServiceTest.php` is `test`, `tests/unit/task.service.test.ts` is `test`,
  `docs/api.md` is `doc`, `tsconfig.json` is `config`, `src/config/env.ts` is `source` (its `config`
  segment is not the first) and `app/Services/TaxService.php` is `source`

#### Scenario: The acme-shop files are classified

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `files` has 53 entries, one per path, of which 8 are `test` (`tests/**`), 2 are `doc`
  (`README.md`, `docs/pricing.md`), 7 are `config` (`config/app.php`, `config/services.php`,
  `config/shop.php`, `composer.json`, `phpunit.xml`, `.env.example`, `.gitignore`) and 36 are
  `source` (including `artisan`)
- **AND** every file's `loc` equals the line count of its content
- **AND** `routes/api.php`, `routes/web.php` and `config/app.php` appear in `files` and produce no
  symbols (valid PHP with no class, interface or function declaration)

#### Scenario: Line count of a file

- **WHEN** the line count of the contents `''`, `'a'`, `'a\n'`, `'a\nb\n'` and `'a\r\nb'` is computed
  by the domain rule
- **THEN** it is `0`, `1`, `1`, `2` and `2`

#### Scenario: A described file has no contentHash or redacted

- **WHEN** a file's path and content are described by the domain rule
- **THEN** the resulting `GraphFile` has `path`, `kind` and `loc`, and no `contentHash` or `redacted`
  field

### Requirement: Symbol extraction

Only files whose path ends in `.php` SHALL be parsed for symbols; every other file SHALL appear in
`files` with no symbols. For each parsed file the analyzer SHALL emit:

- one `class` symbol per named class, named by its short name;
- one `interface` symbol per interface, named by its short name;
- one `function` symbol per named function declared outside any class, named by its short name;
- one `method` symbol per method, named `Type::method` when the enclosing type is named.

A symbol's span SHALL be the lines of its declaration, including its modifiers and attributes
(`#[...]`) and excluding any preceding doc comment. Its `signature` SHALL be the declaration's header
up to, and excluding, its body `{` or its terminating `;`, with every run of whitespace collapsed to
one space and trimmed. Closures and arrow functions SHALL NOT produce symbols. Enums and their
methods SHALL NOT produce symbols in this capability (the schema has no enum kind and no fixture
declares one).

A trait SHALL be emitted as a `class` symbol named by its short name whose `signature` starts with
`trait`, and its methods as `Trait::method`; the symbol kinds of the schema SHALL NOT be extended.
An anonymous class SHALL produce no class symbol; its methods SHALL be emitted with their bare name
(no prefix). Two symbols of one result SHALL never share file, name and start line: when a symbol
would share them with one already emitted for that file, in tree-walk order, it SHALL NOT be
emitted, and one diagnostic SHALL be added with the file's `path`, `line` equal to that start line
and `message` `duplicate symbol "<name>"; kept the first`. Symbols SHALL NOT be renamed to tell them
apart.

#### Scenario: PriceCalculator symbols have exact spans

- **GIVEN** the content of `fixtures/acme-shop/app/Services/PriceCalculator.php`
- **WHEN** it is analysed
- **THEN** its symbols are exactly, as kind, name, start line and end line:
  `class PriceCalculator` 16–44, `method PriceCalculator::__construct` 18–23,
  `method PriceCalculator::compute` 25–35 and `method PriceCalculator::taxableBase` 38–43 (the doc
  comments on lines 10–15 and 37 are outside the spans)
- **AND** the signature of `PriceCalculator::compute` is `public function compute(Order $order): Money`

#### Scenario: Symbol spans include modifiers and attributes

- **WHEN** `app/Base.php` with content `<?php\nabstract class Base {\n    abstract public function run(): void;\n}\n`
  is analysed
- **THEN** its symbols are `class Base` 2–4 with signature `abstract class Base`, and
  `method Base::run` 3–3 with signature `abstract public function run(): void`
- **WHEN** `app/Model.php` with content
  `<?php\n#[Entity]\nclass Model {\n    #[Column]\n    public function save(): void {}\n}\n` is analysed
- **THEN** its symbols are `class Model` 2–6 with signature `#[Entity] class Model`, and
  `method Model::save` 4–5 with signature `#[Column] public function save(): void`

#### Scenario: Every named class of acme-shop is listed

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** each of the 35 classes declared with a name appears as a `class` symbol in its file
- **AND** no file whose path does not end in `.php` (including `artisan`) has a symbol

#### Scenario: Interfaces and top-level functions are listed, enums are not

- **WHEN** `app/Payable.php` with content `<?php interface Payable { public function pay(): void; }`
  and `app/helpers.php` with content `<?php function helper(): int { return 1; }` are analysed
- **THEN** the symbols are `interface Payable`, `method Payable::pay` with signature
  `public function pay(): void`, and `function helper`
- **AND** `app/Status.php` with content
  `<?php enum Status { case A; public function label(): string { return 'a'; } }` has no symbol

#### Scenario: A trait is encoded as a class

- **GIVEN** the content of `fixtures/acme-shop/tests/CreatesApplication.php`
- **WHEN** it is analysed
- **THEN** it has a `class` symbol `CreatesApplication` whose signature is `trait CreatesApplication`,
  and a `method` symbol `CreatesApplication::createApplication`
- **AND** `diagnostics` is empty

#### Scenario: Anonymous classes yield only their methods

- **GIVEN** the content of the 5 files of `fixtures/acme-shop/database/migrations/`, each returning
  `new class extends Migration`
- **WHEN** they are analysed
- **THEN** they have no `class` symbol and exactly 10 `method` symbols, `up` and `down` in each file,
  with no prefix
- **AND** the closures passed to `Schema::create` produce no symbol

#### Scenario: Duplicate symbols are dropped with a diagnostic

- **WHEN** `app/Dup.php` with content
  `<?php $a = new class { function run(){} }; $b = new class { function run(){} };` is analysed
- **THEN** its symbols are exactly one `method run` with start line 1
- **AND** `diagnostics` has exactly one entry: `path` `app/Dup.php`, `line` 1, `message`
  `duplicate symbol "run"; kept the first`
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

### Requirement: Syntax errors do not stop the analysis

A PHP file that cannot be parsed without errors SHALL still appear in `files` with its `kind` and
`loc`, SHALL have no symbols, and SHALL add one diagnostic with its `path`, a non-empty `message`
and, when known, the 1-based `line` of the first error. The analysis SHALL NOT reject because of it,
and the other files of the same call SHALL keep their symbols.

#### Scenario: A syntax error does not stop the analysis

- **WHEN** `app/Broken.php` with content `<?php class Broken { public function x( }` and
  `app/Ok.php` with a valid class `Ok` are analysed in the same call
- **THEN** the analysis resolves; `app/Broken.php` is in `files` with kind `source` and its `loc`,
  and has no symbol; `diagnostics` has exactly one entry, for `app/Broken.php`, with a non-empty
  message
- **AND** `app/Ok.php` has its `class Ok` symbol
