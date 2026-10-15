# Show spec working — evidence-verifier-syntactic (DIS-68)

- Date: 2026-10-15
- Code: `2e0b6a1` (branch `feature/DIS-68-evidence-verifier-syntactic`, PR #41)
- Interface: the `ask` CLI (the change has no browser UI), over the real acme-shop project in the local
  Postgres and the real git source tree.
- Model: the author's choice for step 10, a local OpenAI-compatible stub in the session scratchpad
  (never in the repository), answering every request with three statements: S1 → `[E1]`,
  S2 → `[E1, E2]`, S3 → `[E2]`. Deleted at the end.
- The broken cases use the real trigger of design Risks: a graph symbol whose range reaches beyond its
  file (`UPDATE symbol SET end_line = …`), restored afterwards.

This run is fresh, on the committed code; the step 10 report
([`2026-10-15-10-manual-interface-testing.md`](./2026-10-15-10-manual-interface-testing.md)) holds a
first run with a one-statement stub and a separate indexed repository.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| explain "Cited spans are verified in one read at the pack's commit" / cli-ask "A typed answer is printed with its evidence and stored" | `ask acme-shop` with every span intact | exit 0, three statements, stderr empty, 4 `evidence` rows `cited` | Yes | Run 1 |
| explain "A broken citation is neither stored nor shown" / cli-ask "A broken citation is logged as an error" | E2's symbol `end_line` 51 → 57 (file has 52 lines) | S1 and S2 shown, S2 citing only E1, S3 gone; one `{"level":"error","type":"evidence_broken",…,"reason":"range-out-of-file"}` line; 2 claims, no row for E2 | Yes | Run 2 |
| explain "Every citation broken is unknown with broken evidence" / cli-ask "Every citation broken answers broken-evidence" | E1's symbol `end_line` 57 → 62 too | stdout `UNKNOWN (broken-evidence)`, two `error` lines in evidence-id order, 0 claims | Yes | Run 3 |
| cli-ask "Evaluation mode answers llm-required" (no verification read) | `ask` without `LLM_*` | `UNKNOWN (llm-required)` + message, stderr empty, stub not called | Yes | Run 4 |
| context-engine "The pack of the price question holds the calculator class once" (unchanged after the span-text refactor) | `ask` after restoring both symbols | exit 0, stderr empty, 4 rows `cited`: the pack and the verifier agree on real files | Yes | Run 5 |

## Evidence

`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`; `ask` = `LLM_BASE_URL=http://127.0.0.1:18080/v1 LLM_MODEL=stub npm run --silent cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`.

### Run 1 — healthy

```
exit=0
El precio final lo calcula PriceCalculator.

statements:
1. [FACT] S1 cita E1.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
2. [FACT] S2 cita E1 y E2.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57, tests/Feature/OrderPricingTest.php:31-51
3. [FACT] S3 cita E2.
   evidence: tests/Feature/OrderPricingTest.php:31-51
(evidence section: tests/Unit/PriceCalculatorTest.php:21-57, tests/Feature/OrderPricingTest.php:31-51)
--stderr: (empty)
```

`SELECT c.object, f.path, e.start_line, e.end_line, e.verification …`:

```
S1 cita E1.|tests/Unit/PriceCalculatorTest.php|21|57|cited
S2 cita E1 y E2.|tests/Feature/OrderPricingTest.php|31|51|cited
S2 cita E1 y E2.|tests/Unit/PriceCalculatorTest.php|21|57|cited
S3 cita E2.|tests/Feature/OrderPricingTest.php|31|51|cited
```

Rows deleted (`DELETE FROM claim` → `DELETE 3`) before the next run.

### Run 2 — E2 broken

`UPDATE symbol SET end_line = 57 WHERE id = 'f6e8d3c5-…'` (`OrderPricingTest::test_final_price_applies_discount_before_tax`, 31–51; the file has 52 lines).

```
exit=0
El precio final lo calcula PriceCalculator.

statements:
1. [FACT] S1 cita E1.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
2. [FACT] S2 cita E1 y E2.
   evidence: tests/Unit/PriceCalculatorTest.php:21-57
(evidence section: tests/Unit/PriceCalculatorTest.php:21-57 only)
--stderr:
{"level":"error","type":"evidence_broken","evidenceId":"E2","path":"tests/Feature/OrderPricingTest.php","startLine":31,"endLine":57,"reason":"range-out-of-file"}
```

Rows (object, path, lines, verification, statementType):

```
S1 cita E1.|tests/Unit/PriceCalculatorTest.php|21|57|cited|FACT
S2 cita E1 y E2.|tests/Unit/PriceCalculatorTest.php|21|57|cited|FACT
```

Rows deleted (`DELETE 2`).

### Run 3 — every citation broken

`UPDATE symbol SET end_line = 62 WHERE id = '858906c3-…'` (`PriceCalculatorTest`, 21–57; the file has 57 lines).

```
exit=0
UNKNOWN (broken-evidence)
--stderr:
{"level":"error","type":"evidence_broken","evidenceId":"E1","path":"tests/Unit/PriceCalculatorTest.php","startLine":21,"endLine":62,"reason":"range-out-of-file"}
{"level":"error","type":"evidence_broken","evidenceId":"E2","path":"tests/Feature/OrderPricingTest.php","startLine":31,"endLine":57,"reason":"range-out-of-file"}
claim=0
```

No file text in any stderr line.

### Run 4 — evaluation mode

Both symbols restored first (`end_line` 51 and 57, checked with a `SELECT`).
`env -u LLM_BASE_URL -u LLM_API_KEY -u LLM_MODEL npm run --silent cli -- ask acme-shop "…"`:

```
exit=0
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
stderr bytes=0
```

### Run 5 — restored graph

`ask` again → `exit=0`, `stderr bytes=0`, `evidence` rows `cited,cited,cited,cited`; deleted (`DELETE 3`).

The stub logged four `POST /v1/chat/completions` (runs 1, 2, 3 and 5), none for run 4.

## State

- Before: `project` 1, `claim` 0, `evidence` 0; `OrderPricingTest::test_final_price_applies_discount_before_tax` 31–51, `PriceCalculatorTest` 21–57.
- After: `project` 1, `claim` 0, `evidence` 0; both symbols back to 31–51 and 21–57.
- Restored: yes — claims deleted after each run, both `symbol.end_line` values reverted, stub stopped and
  deleted, no file left in the repository (`git status` shows only `tasks.md` and the never-staged
  `.claude/sdd-harness.env`).

## Not demonstrated

- `file-missing` and `excerpt-mismatch` over the real interface: under D1 the pack and the verifier read
  the same commit moments apart, so a real file cannot vanish or change between the two reads without
  corrupting the git object store. Both are covered by unit tests ("A missing file or a range out of the
  file is broken", "A diverging excerpt is broken", and the `explain-verification.spec.ts` scenarios with
  `verificationContents`).
- The unsaved-answer path (`claims_not_persisted` after `evidence_broken`) needs a failing claim write;
  covered by "An unsaved answer keeps only its verified citations" (unit).

## Handoff

The change is **demonstrably working** over the real CLI, the real database and real git: valid
citations are stored `cited`, a broken citation is dropped from its statement and the statement left
without citations disappears, everything broken answers `UNKNOWN (broken-evidence)`, each broken id is
one `error` line with no content, and evaluation mode never verifies. No screenshot was taken; none is
left at the repository root.
