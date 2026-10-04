# Show Spec Working — analyzer-php-debt

- Date: 2026-10-04
- Change: analyzer-php-debt (DIS-96), local uncommitted diff on `feature/DIS-96-analyzer-php-debt`
- Interface: `createPhpAnalyzer().analyze()` (no HTTP route or CLI exists for it)
- Script: `demo.mts` in the session scratchpad (outside the repository), run from the repository root
  with `npx tsx <scratchpad>/demo.mts`. It imports the analyzer from source, `validateGraph` and
  `compareEdges` from core, and the test fixture reader; each `THEN` is an exact check.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The acme-shop analysis is a valid deterministic graph | 53 fixture files analysed by two analyzers | equal results; files, symbols, edges (169) in order; `validateGraph` `[]` | yes | S1 |
| The analyzer reads only the content it receives | `app/Ghost.php` (absent on disk) | one file, one `class Ghost`, no error | yes | S2 |
| Duplicate input paths keep the first | the six inputs of the scenario | 3 files (loc 1), `class A` + `class Lower`, 3 `duplicate path` diagnostics without `line`, graph valid | yes | S3 |
| A failed parser load does not poison later calls | **real** load failure: the grammar `tree-sitter-php.wasm` renamed for the first call, restored before the second | first call rejects (`ENOENT … tree-sitter-php.wasm`), second call on the same analyzer resolves with `class Ghost` | yes | S4 |
| Symbols that start on one line are ordered by span, then name | `app/tie.php` of the scenario | `z 1–2`, `a 1–1`, `a2 3–3`, `b 3–3` | yes | S5 |
| A syntax error does not stop the analysis (error scenario) | `app/Broken.php` + `app/Ok.php` | Broken: kind `source`, `loc` 1, no symbol; one diagnostic `line` 1, `syntax error`; `class Ok` kept | yes | S6 |

S4 differs from the unit test (which mocks `loadPhpParser`): here the real loader fails on a missing
grammar file, so the retry is shown through the real `web-tree-sitter` path. "The parser was loaded
twice" is observed as the second call succeeding after the first rejected on the same instance.

## Evidence

```
$ npx tsx <scratchpad>/demo.mts
== S1 The acme-shop analysis is a valid deterministic graph
PASS  53 input files  → 53
PASS  two results equal
PASS  files ordered by path
PASS  symbols ordered by path then startLine
PASS  edges non-empty and in compareEdges order  → 169
PASS  validateGraph returns no error  → []
== S2 The analyzer reads only the content it receives
PASS  app/Ghost.php does not exist on disk
PASS  one file app/Ghost.php and one class Ghost  → {"files":[{"path":"app/Ghost.php","kind":"source","loc":5}],"symbols":["class Ghost"]}
== S3 Duplicate input paths keep the first
PASS  files exactly README.md, app/A.php, app/a.php, loc 1  → [{"path":"README.md","kind":"doc","loc":1},{"path":"app/A.php","kind":"source","loc":1},{"path":"app/a.php","kind":"source","loc":1}]
PASS  symbols exactly class A (app/A.php), class Lower (app/a.php)
PASS  diagnostics: exactly three, none with line, no duplicate symbol  → [{"path":"README.md","message":"duplicate path \"README.md\"; kept the first"},{"path":"app/A.php","message":"duplicate path \"app/A.php\"; kept the first"},{"path":"app/A.php","message":"duplicate path \"app/A.php\"; kept the first"}]
PASS  validateGraph returns no error  → []
== S4 A failed parser load does not poison later calls (real failure: grammar .wasm renamed)
PASS  grammar file restored, same SHA-256
PASS  first call rejects  → "rejected: ENOENT: no such file or directory, open 'C:\\Users\\cristina\\Desktop\\AI4Dev\\00-TFM\\Codemind\\node_modules\\tree-sitter-php\\t"
PASS  second call on the same analyzer resolves with class Ghost (the parser was loaded again)  → ["class Ghost"]
== S5 Symbols that start on one line are ordered by span, then name
PASS  z 1–2, a 1–1, a2 3–3, b 3–3 in that order  → [["function","z",1,2],["function","a",1,1],["function","a2",3,3],["function","b",3,3]]
== S6 A syntax error does not stop the analysis
PASS  Broken.php in files, kind source, loc 1, no symbol  → {"path":"app/Broken.php","kind":"source","loc":1}
PASS  exactly one diagnostic, Broken.php, line 1, non-empty message  → [{"path":"app/Broken.php","message":"syntax error","line":1}]
PASS  Ok.php has class Ok

ALL CHECKS PASS
exit 0
```

No screenshots: the change has no browser UI.

## State

- Before: `git ls-files -s fixtures/acme-shop | sha1sum` `167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`;
  `git status --porcelain fixtures/acme-shop` empty; `node_modules/tree-sitter-php/tree-sitter-php.wasm`
  present.
- After: same checksum, `git status --porcelain fixtures/acme-shop` empty; the grammar file back in
  place with the same SHA-256 (checked inside the script, in a `finally`); `ls node_modules/tree-sitter-php/*.wasm*`
  shows only the two original grammar files (no `.demo-off` left).
- Restored: yes — the only mutation was the temporary rename of the grammar file, undone before the
  second call.

## Not demonstrated

None. The concurrency extra case (two concurrent calls sharing one failed load) is not a spec
scenario; it is covered by `parser-load.spec.ts`.

## Handoff

The change is **demonstrably working**: all six scenarios of the delta, including the error scenario
and a real (not mocked) parser-load failure, match their `THEN` exactly. No screenshot or scratch file
was left in the repository.

## Addendum — after the author decisions of 2026-10-04 (design D10)

The scenario "Symbols that start on one line are ordered by span, then name" gained a sibling pair on
lines 5–6 (option A: the order is `endLine` descending, not containment). Re-run against the real
analyzer:

```
$ npx tsx -e "…analyze({ files: [{ path: 'app/tie.php', content: '<?php function z() { function a() {}\n}\nfunction b() {} function a2() {}\n\nfunction c() {} function d() {\n}\n' }] })…"
[["function","z",1,2],["function","a",1,1],["function","a2",3,3],["function","b",3,3],["function","d",5,6],["function","c",5,5]] []
```

Matches the extended `THEN` exactly (`d` 5–6 before `c` 5–5). The other five scenarios are unchanged
in text and behaviour; their evidence above still holds. Fixture checksum after the run:
`167c762e26cdc3ad7b71484c19aa6135dc6c2a8d`.
