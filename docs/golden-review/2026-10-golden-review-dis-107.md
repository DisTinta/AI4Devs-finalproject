# Independent review of the golden answers, round DIS-107 (October 2026)

**Ticket:** DIS-107. **Scope:** the six golden answers regenerated after the TypeScript analyzer fix of
DIS-107, `seeds/cache/task-api.json` (`Q1`, `Q2`, `Q3`) and `seeds/cache/acme-shop.json` (`Q1`, `Q3`,
`Q4`), plus the behaviour item task-api `Q4` (`UNKNOWN (no-anchor)`, no golden answer).
**Generator of the golden answers:** `qwen2.5-coder`. This is the second round of the independent
golden review; the previous round is DIS-33. The review is done by a panel of agents of models other
than the generator, under the criterion below, which is fixed before the panel input exists.

## Criterion

- Judge each statement as one of: `true` — true against the code and backed by the lines of the evidence it cites; `false` — contradicted by the code; `unverifiable` — a cited evidence entry does not exist (file or lines) or its lines do not back the statement, even if the statement is true elsewhere; `overtyped` — typed `FACT` but the code does not state it literally (true only by inference). A statement typed `INFERENCE` that the code states literally is `true` (under-typing is not an error).
- An **error** is any statement judgement other than `true`.
- Judge the item's `answer` text: `"true"` if what it says is true against the code, `"false"` otherwise. For the behaviour item task-api `Q4` («¿Cómo se autentican los usuarios?»): `"true"` if the fixture has no authentication (no route, middleware, hook, plugin or check that authenticates a user), so `UNKNOWN` is the due answer; `"false"` if it has any.
- **Verdict**, derived from the judgements, never chosen apart from them: `incorrect` if `answer` is `"false"`, or a `FACT` statement is judged `false`, or the item has statements and every one has an error; otherwise `correct` if every statement is `true` (the behaviour item, with no statements, is `correct` when its `answer` is `"true"`); otherwise `partial`.
- Spelling slips or typos of the model (for example a misspelt word) are noted in `notes` but are not errors. A statement that is true against the code but imprecise (for example it lists a route twice) is judged `true` and the imprecision is noted in `notes`.
- When more than one judgement applies to a statement, use the first that applies in this order: `false`, `unverifiable`, `overtyped`, `true`.

## Panel

- **Panelist 1:** Opus, model `claude-opus-5-5`, date 2026-10-28. **Panelist 2:** Sonnet, model
  `claude-sonnet-5-5`, date 2026-10-28. They judge the seven items blind to each other.
- **Resolver:** Opus, model `claude-opus-5-5`, date 2026-10-28, in a fresh context, only over the items
  where the two panelist verdicts differ (one in this run: acme-shop Q3).
- **Outputs:** under `docs/golden-review/panel/` (the input, the two panelist outputs and the
  resolution).

Allowed sources of a panelist, each file read recorded in its `sourcesRead`:

- `openspec/changes/ts-await-using-golden-regen/tasks.md` (the Panel group)
- `docs/golden-review/2026-10-golden-review-dis-107.md` (the sections `## Criterion` and `## Panel`)
- `docs/golden-review/panel/2026-10-golden-review-dis-107-input.json`
- `docs/base-standards.md`
- every file under `fixtures/task-api/` and `fixtures/acme-shop/`, except their `README.md`, `docs/`
  and `node_modules/`

The resolver may also read the two panelist outputs of this round and `docs/AUTONOMOUS-RUN.md`.

Forbidden sources: `fixtures/README.md` (it holds the expected answers); `seeds/` (the golden files:
the panel input replaces them); the fixtures' `README.md`, `docs/` and `node_modules/`; every file of
the previous round, `docs/golden-review/2026-10-task-api-golden-review.md` and the DIS-33 files under
`docs/golden-review/panel/`; the other reports of `docs/golden-review/`; the other panelist's output;
the rest of `docs/`, `packages/`, `tests/`, `scripts/` and `openspec/`; any Linear content. A panelist
does not run the analyzers, `ask`, `verify`, the fixtures' tests or any script, and does not read the
database or the answer cache.

## Verdicts

The panel outputs and the resolution are unchanged since the commits that created them. The panelists
disagreed on one item, acme-shop Q3 (panelist 1 `partial`, panelist 2 `correct`); the resolver decided
`partial`.

| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |
|---|---|---|---|---|---|---|
| task-api | Q1 | correct | correct | correct | Each route attaches a validation schema in its options (`fixtures/task-api/src/routes/tasks.routes.ts:18`) and the handlers read the request already validated (`fixtures/task-api/src/controllers/tasks.controller.ts:14`); calling Fastify's schema validation a middleware is imprecise | none |
| task-api | Q2 | correct | correct | correct | buildPage takes items, total, page and pageSize and returns a Page object (`fixtures/task-api/src/domain/pagination.ts:13`); the answer omits pageCount, which is an omission and not a mistake | none |
| task-api | Q3 | partial | partial | partial | S2 is true, but its only cited lines define the error class (`fixtures/task-api/src/domain/errors.ts:23`) while the throw on an illegal transition is not cited (`fixtures/task-api/src/services/task.service.ts:50`) | S2 unverifiable |
| task-api | Q4 | correct | correct | correct | No route, hook, plugin or check authenticates a user (`fixtures/task-api/src/app.ts:28`), so UNKNOWN is the due answer | none |
| acme-shop | Q1 | correct | correct | correct | The steps of the calculation are true against the code (`fixtures/acme-shop/app/Services/PriceCalculator.php:28`); the method is named discountFor, not discount (`fixtures/acme-shop/app/Services/DiscountService.php:34`), a naming slip that is not an error | none |
| acme-shop | Q3 | partial | correct | partial | S1 is true (`fixtures/acme-shop/app/Services/CouponValidator.php:37`) but it also cites a validated() override that does not back it (`fixtures/acme-shop/app/Http/Requests/StoreOrderRequest.php:41`), so it is unverifiable under the criterion | S1 unverifiable |
| acme-shop | Q4 | correct | correct | correct | The observer dispatches the recalculation job and fires the event (`fixtures/acme-shop/app/Observers/OrderObserver.php:18`), as the answer says; the misspelt verb is a slip of the model | none |

## Agreement

n = 7

Percent agreement: 85.7%

Cohen's kappa: 0.588

The kappa is indicative: with seven items it has a wide uncertainty.

Resolved by the resolver: 1 of 7

No final verdict is `incorrect`, so there is no `## Pending` section: all six golden answers carry
both panel signatures in `seeds/cache/task-api.json` and `seeds/cache/acme-shop.json`.

## Limitations

- Two models of one family are not independent reviewers in the sense of two people.
- The generator is a local 7B model (qwen2.5-coder).
- sourcesRead is self-declared.
- The criterion was written by an agent that had read the golden answers.
