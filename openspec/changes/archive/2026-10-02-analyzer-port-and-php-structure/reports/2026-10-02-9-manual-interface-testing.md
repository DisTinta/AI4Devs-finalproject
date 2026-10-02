# Manual Interface Testing Report

- Date: 2026-10-02
- Change: analyzer-port-and-php-structure
- Step: 9 — Manual Interface Testing

## Interface under test

This change adds no HTTP route and no CLI command. Its interface is the `AnalyzerPort`
implementation `createPhpAnalyzer()` (`packages/analyzers/php/src/index.ts`), called directly as a
function — there is no transport to drive. "Exercising it" means calling `analyze()` from a scratch
script and inspecting the real result, which is what follows.

## Preparation (9.1)

State noted before running (same indicators as the task 8 report, §"Pre-test baseline"):
`git status --porcelain fixtures` empty, `git ls-files -s fixtures/acme-shop | sha1sum` =
`167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.

## Commands executed

```
NODE_PATH="$(pwd)/node_modules" npx tsx <scratchpad>/manual-interface-test.ts
```

The script (deleted after this report was written, per step 9.5): walked `fixtures/acme-shop` with
`node:fs` (skipping `.git`), called `createPhpAnalyzer().analyze({ files })` on the real 53 files, then
ran four more `analyze()` calls with inline content for the error cases below. It read but never wrote
to the fixture.

## Success path (9.2)

Real output:

```
input files: 53
files by kind: { config: 7, doc: 2, source: 36, test: 8 }
symbols by kind: { class: 36, method: 82 }
total diagnostics (should be 0): 0

PriceCalculator.php symbols:
  class PriceCalculator 16 - 44 (class PriceCalculator)
  method PriceCalculator::__construct 18 - 23 (public function __construct( private readonly DiscountService $discounts, private readonly TaxService $taxes, private readonly ShippingService $shipping, ))
  method PriceCalculator::compute 25 - 35 (public function compute(Order $order): Money)
  method PriceCalculator::taxableBase 38 - 43 (public function taxableBase(Order $order): Money)

CreatesApplication.php symbols:
  class CreatesApplication 10 - 20 (trait CreatesApplication)
  method CreatesApplication::createApplication 12 - 19 (public function createApplication(): Application)
```

Verified against the spec and `fixtures/README.md`:

- File breakdown (`config: 7, doc: 2, source: 36, test: 8`, total 53) matches DIS-47 `[enhanced]` E1
  and the "The acme-shop files are classified" scenario exactly.
- `symbols by kind: { class: 36, method: 82 }` — `class` is 35 (the named `class` declarations, per
  the "Every named class of acme-shop is listed" scenario) **plus 1** (`CreatesApplication`, the
  trait encoded as `class` per design D2); the scenario only asserts the 35 are present, not an
  exact total, so 36 is correct, not a discrepancy.
- `PriceCalculator` spans and the `compute` signature match the "PriceCalculator symbols have exact
  spans" scenario exactly (lines 16–44 / 18–23 / 25–35 / 38–43,
  `public function compute(Order $order): Money`).
- `CreatesApplication` matches the "A trait is encoded as a class" scenario exactly: `class` symbol
  with `signature: 'trait CreatesApplication'`, plus `CreatesApplication::createApplication`.
- `total diagnostics: 0` — the real fixture has no broken PHP, as expected.

## Mutating operations (9.3)

None: the analyzer performs no I/O and writes nothing. Confirmed by re-checking the same two
indicators after the script ran: `git status --porcelain fixtures` still empty, checksum still
`167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` — unchanged. No restoration needed.

## Error cases (9.4)

Real output for each:

```
-- a broken PHP file --
files: [{"path":"app/Broken.php","kind":"source","loc":1}]
symbols: []
diagnostics: [{"path":"app/Broken.php","message":"syntax error","line":1}]

-- an empty file --
files: [{"path":"app/Empty.php","kind":"source","loc":0}]
symbols: []
diagnostics: []

-- artisan (PHP content, no .php extension) --
files: [{"path":"artisan","kind":"source","loc":20}]
symbols (should be empty, no .php extension): []
diagnostics: []

-- a path that does not exist on disk --
files: [{"path":"app/Ghost.php","kind":"source","loc":5}]
symbols: [{"file":"app/Ghost.php","name":"Ghost","kind":"class","signature":"class Ghost","startLine":3,"endLine":5}]
diagnostics: []
```

- **Broken PHP** (`app/Broken.php`): `analyze` resolved (did not throw), the file still appears in
  `files` with `kind: 'source'` and its `loc`, no symbol, and exactly one diagnostic naming the file
  with a non-empty message — matches "A syntax error does not stop the analysis".
- **Empty file**: classified `source`, `loc: 0`, no symbol, no diagnostic (an empty file parses
  without error — no class, no content to flag).
- **`artisan`**: present in `files`, `loc` computed from its real content, but no symbol at all and
  no diagnostic — the path does not end in `.php`, so it is never parsed, even though its content is
  valid PHP. Matches the "Every named class of acme-shop is listed" scenario's second clause.
- **Non-existent path** (`app/Ghost.php`): the analyzer read only the content given to it — it never
  touched the disk for this path (it does not exist there) — and still produced the file entry and
  its `class Ghost` symbol correctly. Matches "The analyzer reads only the content it receives".

## State verification (9.6)

Post-run: `git status --porcelain fixtures` empty, checksum
`167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` — identical to the pre-run state recorded above.

## Outcome

- Status: PASS
- Blocking issues: none
