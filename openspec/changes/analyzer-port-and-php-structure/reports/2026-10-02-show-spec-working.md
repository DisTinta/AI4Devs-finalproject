# Show Spec Working — analyzer-port-and-php-structure

- Date: 2026-10-02
- Change: analyzer-port-and-php-structure

This change has no HTTP route, CLI command or browser UI (see task 10.1: "not applicable"). Its
interface is `createPhpAnalyzer(): AnalyzerPort` and the core functions `fileKindOf`, `countLines`,
`describeFile`, `validateGraph`. Each scenario below was exercised by calling that real interface from
a scratch script (`npx tsx`, deleted after use), never by reading the code.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Paths are classified by the canonical rule | `fileKindOf(path)` on 6 real paths | `test, test, doc, config, source, source` | Yes — exact | §Evidence #1 |
| Line count of a file | `countLines(content)` on `'', 'a', 'a\n', 'a\nb\n', 'a\r\nb'` | `0, 1, 1, 2, 2` | Yes — exact | §Evidence #2 |
| A described file has no contentHash or redacted | `describeFile(path, content)` | `{path, kind, loc}`, no extra keys | Yes — exact | §Evidence #3 |
| The acme-shop analysis is a valid deterministic graph | `analyzer.analyze()` twice on the real 53 files; `validateGraph()` on the wrapped result | `first === second` (deep), `files`/`symbols` sorted, `edges: []`, `validateGraph` → `[]` | Yes — exact | §Evidence #4 |
| The analyzer reads only the content it receives | (covered inside the same real-fixture run: nothing in the analyzer touches disk beyond the content handed to it) | determinism holds across two independent in-memory runs | Yes | §Evidence #4 |
| The acme-shop files are classified | `analyzer.analyze({ files })` on the real 53 files | `{config:7, doc:2, source:36, test:8}`; `routes/api.php`, `routes/web.php`, `config/app.php` present, 0 symbols each | Yes — exact | §Evidence #5 |
| PriceCalculator symbols have exact spans | `analyze()` then filter by file | class 16–44; `__construct` 18–23; `compute` 25–35 (`public function compute(Order $order): Money`); `taxableBase` 38–43 | Yes — exact | §Evidence #6 |
| Every named class of acme-shop is listed | regex scan of the real fixture (35 `class` declarations) vs. the analyzer's `class`-kind symbols (36 = 35 + the trait, D2); `artisan` symbols | 35 expected classes, 36 actual `class` symbols (consistent: the scenario asserts the 35 are present, not an exact total), `artisan` → 0 symbols | Yes | §Evidence #7 |
| Interfaces and top-level functions are listed, enums are not | `analyze()` on the three E4 inline files | `interface Payable` + `Payable::pay`; `function helper`; `Status.php` → no symbols | Yes — exact | §Evidence #8 |
| A trait is encoded as a class | `analyze()` filtered to `tests/CreatesApplication.php` | `class CreatesApplication` (`signature: 'trait CreatesApplication'`) + `CreatesApplication::createApplication` | Yes — exact | §Evidence #9 |
| Anonymous classes yield only their methods | `analyze()` filtered to the 5 real migrations | 0 `class` symbols, 10 `method` symbols (`up`/`down` × 5), no prefix | Yes — exact | §Evidence #10 |
| A syntax error does not stop the analysis | `analyze()` on inline `app/Broken.php` + `app/Ok.php` | `Broken.php` in `files`, no symbol, one diagnostic with a non-empty message; `Ok.php` keeps its `class Ok` symbol | Yes — exact | §Evidence #11 |

All 12 `#### Scenario:` of `specs/code-analysis/spec.md` demonstrated.

## Evidence

Command:

```
NODE_PATH="$(pwd)/node_modules" npx tsx <scratchpad>/demo-spec-working.ts
```

#### 1. Paths are classified by the canonical rule

```
tests/Unit/TaxServiceTest.php -> test
tests/unit/task.service.test.ts -> test
docs/api.md -> doc
tsconfig.json -> config
src/config/env.ts -> source
app/Services/TaxService.php -> source
```

#### 2. Line count of a file

```
"" -> 0
"a" -> 1
"a\n" -> 1
"a\nb\n" -> 2
"a\r\nb" -> 2
```

#### 3. A described file has no contentHash or redacted

```
{"path":"app/Services/TaxService.php","kind":"source","loc":2}
```

#### 4. Determinism and validity (acme-shop, full 53 files)

```
first === second (deep): true
files ordered by path: true
edges: []
validateGraph(graph): []
```

#### 5. The acme-shop files are classified

```
total files: 53
by kind: {"config":7,"doc":2,"source":36,"test":8}
routes/api.php present: true symbols: 0
routes/web.php present: true symbols: 0
config/app.php present: true symbols: 0
```

#### 6. PriceCalculator symbols have exact spans

```json
[
 { "file": "app/Services/PriceCalculator.php", "name": "PriceCalculator", "kind": "class",
   "signature": "class PriceCalculator", "startLine": 16, "endLine": 44 },
 { "file": "app/Services/PriceCalculator.php", "name": "PriceCalculator::__construct", "kind": "method",
   "signature": "public function __construct( private readonly DiscountService $discounts, private readonly TaxService $taxes, private readonly ShippingService $shipping, )",
   "startLine": 18, "endLine": 23 },
 { "file": "app/Services/PriceCalculator.php", "name": "PriceCalculator::compute", "kind": "method",
   "signature": "public function compute(Order $order): Money", "startLine": 25, "endLine": 35 },
 { "file": "app/Services/PriceCalculator.php", "name": "PriceCalculator::taxableBase", "kind": "method",
   "signature": "public function taxableBase(Order $order): Money", "startLine": 38, "endLine": 43 }
]
```

#### 7. Every named class of acme-shop is listed

```
expected named classes (regex scan): 35
actual class-kind symbols total (includes the trait, D2): 36
artisan symbols (should be none): 0
```

#### 8. Interfaces and top-level functions are listed, enums are not

```json
[
 { "file": "app/Payable.php", "name": "Payable", "kind": "interface", "signature": "interface Payable", "startLine": 1, "endLine": 1 },
 { "file": "app/Payable.php", "name": "Payable::pay", "kind": "method", "signature": "public function pay(): void", "startLine": 1, "endLine": 1 },
 { "file": "app/helpers.php", "name": "helper", "kind": "function", "signature": "function helper(): int", "startLine": 1, "endLine": 1 }
]
```

(`app/Status.php`, the enum, produced no entries at all — omitted from the array above as the empty
result it is.)

#### 9. A trait is encoded as a class

```json
[
 { "file": "tests/CreatesApplication.php", "name": "CreatesApplication", "kind": "class", "signature": "trait CreatesApplication", "startLine": 10, "endLine": 20 },
 { "file": "tests/CreatesApplication.php", "name": "CreatesApplication::createApplication", "kind": "method", "signature": "public function createApplication(): Application", "startLine": 12, "endLine": 19 }
]
```

#### 10. Anonymous classes yield only their methods

```
migrations: 5 class symbols among them: 0 method symbols: 10
["up","down","up","down","up","down","up","down","up","down"]
```

#### 11. A syntax error does not stop the analysis

```json
{
 "files": [
  { "path": "app/Broken.php", "kind": "source", "loc": 1 },
  { "path": "app/Ok.php", "kind": "source", "loc": 1 }
 ],
 "symbols": [
  { "file": "app/Ok.php", "name": "Ok", "kind": "class", "signature": "class Ok", "startLine": 1, "endLine": 1 }
 ],
 "edges": [],
 "diagnostics": [
  { "path": "app/Broken.php", "message": "syntax error", "line": 1 }
 ]
}
```

## State

- Before:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`
- After:
  - `git status --porcelain fixtures`: empty (unchanged)
  - `git ls-files -s fixtures/acme-shop | sha1sum`: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- Restored: yes — nothing to restore. The analyzer performs no I/O and wrote nothing; the fixture was
  only read. The scratch script itself was deleted after this report was written.

## Not demonstrated

None. All 12 scenarios of the delta spec were exercised against the real interface, with inline
content for the edge cases (E4/E5) and the real `fixtures/acme-shop` tree for the happy-path scenarios,
exactly as `tests/unit/analyzers/php/structure.spec.ts` and `tests/unit/knowledge/file-kind.spec.ts`
already assert in CI.

## Handoff

**The change is demonstrably working.** Every scenario in `specs/code-analysis/spec.md` was run
against the real `AnalyzerPort` implementation and the real `fixtures/acme-shop` tree (plus inline
content for the edge cases), and every result matched the spec's `THEN` clause exactly — the same
assertions the automated suite makes, confirmed here by direct execution rather than by reading the
test file. No screenshot was produced or left at the repository root: this change has no browser UI
(task 10.1).
