# Manual Interface Testing Report

- Date: 2026-10-04
- Change: analyzer-php-debt
- Step: 9 — Backend: Manual Interface Testing
- Interface: `createPhpAnalyzer().analyze()` (no HTTP route or CLI command exists for it)

## Environment and state

- Pre-run: `git status --porcelain fixtures/acme-shop` empty; `git ls-files -s fixtures/acme-shop | sha1sum`
  `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.
- Script: `manual.mts` in the session scratchpad (never in the repository), run from the repository root
  with `npx tsx <scratchpad>/manual.mts`. It imports the analyzer from source, the test fixture reader and
  `validateGraph` from core. One analyzer instance serves every call.

## Calls and responses

### 1. Success path: acme-shop once

```
{ files: 53, symbols: 121, edges: 169, diagnostics: 0, unresolved: 0 } diagnostics [] validateGraph []
```

53 files and no diagnostics, as before the change; the acme-shop edge scenarios (47 `exact` + 17
`heuristic` `calls`) stay green in the step 8 suite.

### 2. Error case: the whole acme-shop input passed twice

```
{ files: 53, symbols: 121, edges: 169, diagnostics: 53, unresolved: 0 } duplicate-path diagnostics 53 any with line false
same files/symbols/edges as once true validateGraph []
sample { path: '.env.example', message: 'duplicate path ".env.example"; kept the first' }
```

One diagnostic per discarded input, none with `line`; `files`, `symbols` and `edges` identical to the
single run (no spurious `duplicate symbol`), and the graph is still valid.

### 3. Error case: the input of "Duplicate input paths keep the first"

```
files: README.md (doc, loc 1), app/A.php (source, loc 1), app/a.php (source, loc 1)
symbols: class A app/A.php, class Lower app/a.php
diagnostics:
  { path: 'README.md', message: 'duplicate path "README.md"; kept the first' }
  { path: 'app/A.php', message: 'duplicate path "app/A.php"; kept the first' }
  { path: 'app/A.php', message: 'duplicate path "app/A.php"; kept the first' }
```

No `class B` (the later `app/A.php` content is discarded); `app/a.php` is a distinct path (no
normalisation).

### 4. Error case: syntax error

```
{"files":[{"path":"app/Broken.php","kind":"source","loc":1},{"path":"app/Ok.php","kind":"source","loc":1}],
 "symbols":["class Ok"],"diagnostics":[{"path":"app/Broken.php","message":"syntax error","line":1}]}
```

### 5. Order independence: acme-shop input reversed

```
equal to once true
```

## Mutating operations

None: the analyzer writes nothing.

## Post-run state

- `git status --porcelain fixtures/acme-shop`: empty
- checksum: `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d` (unchanged)
- The scratch script stays in the session scratchpad, outside the repository.

## Outcome

- Status: PASS
