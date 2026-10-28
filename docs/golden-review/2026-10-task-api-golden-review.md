# Independent review of the golden answers (DIS-33, October 2026)

**Ticket:** DIS-33 (CM-HU-18.4). **Scope:** the six versioned golden answers, `seeds/cache/task-api.json`
(`Q1`, `Q2`, `Q3`) and `seeds/cache/acme-shop.json` (`Q1`, `Q3`, `Q4`), plus the behaviour item
task-api `Q4` (`UNKNOWN (no-anchor)`, no golden answer). **Generator of the golden answers:**
`qwen2.5-coder`. The review is done by a panel of agents of models other than the generator, under
the criterion below, which is fixed before the panel input exists.

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
- **Resolver:** Opus, model `claude-opus-5-5`, date 2026-10-28, in a fresh context, only over the
  items where the two panelist verdicts differ (none in this run).
- **Outputs:** under `docs/golden-review/panel/` (the input, the two panelist outputs and the
  resolution).

Allowed sources of a panelist, each file read recorded in its `sourcesRead`:

- `openspec/changes/golden-independent-review/tasks.md` (the Panel group)
- `docs/golden-review/2026-10-task-api-golden-review.md` (the sections `## Criterion` and `## Panel`)
- `docs/golden-review/panel/2026-10-golden-review-input.json`
- `docs/base-standards.md`
- `linear:DIS-33/description` (the description of the ticket, never its comments)
- every file under `fixtures/task-api/` and `fixtures/acme-shop/`, except their `README.md`, `docs/`
  and `node_modules/`

The resolver may also read the two panelist outputs and `docs/AUTONOMOUS-RUN.md`.

Forbidden sources: `fixtures/README.md` (it holds the expected answers); `seeds/` (the golden files:
the panel input replaces them); the fixtures' `README.md`, `docs/` and `node_modules/`; the other
reports of `docs/golden-review/`; the other panelist's output; the rest of `docs/`, `packages/`,
`tests/`, `scripts/` and `openspec/`; the comments of any Linear ticket. A panelist does not run
the analyzers, `ask`, `verify`, the fixtures' tests or any script, and does not read the database or
the answer cache.

## Verdicts

Panelist 2 ran in a resumed run: the first run was started with one panel model by mistake, so
panelist 1 was committed first and panelist 2 afterwards, blind to it. The panel outputs are
unchanged since their commits.

| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |
|---|---|---|---|---|---|---|
| task-api | Q1 | partial | partial | partial | S1 calls the controller a taskRoutes type, but it is a TasksController instance (`fixtures/task-api/src/routes/tasks.routes.ts:16`); the cited lines of S5 do not back a claim about the service (`fixtures/task-api/src/app.ts:22`); the answer itself is true (`fixtures/task-api/src/routes/tasks.routes.ts:18`) | S1 false; S5 unverifiable |
| task-api | Q2 | correct | correct | correct | buildPage takes items, total, page and pageSize and returns the page with pageCount (`fixtures/task-api/src/domain/pagination.ts:13`) | none |
| task-api | Q3 | correct | correct | correct | Valid transitions are the TRANSITIONS table (`fixtures/task-api/src/domain/task-status.ts:13`) and update rejects illegal ones (`fixtures/task-api/src/services/task.service.ts:49`) | none |
| task-api | Q4 | correct | correct | correct | No route, hook, plugin or check authenticates a user (`fixtures/task-api/src/app.ts:25`), so UNKNOWN is the due answer | none |
| acme-shop | Q1 | incorrect | incorrect | incorrect | The discount is subtracted, so the FACT S6 is false (`fixtures/acme-shop/app/Services/PriceCalculator.php:29`), and shipping uses the discounted base (`fixtures/acme-shop/app/Services/PriceCalculator.php:32`) | S4 unverifiable; S5 false; S6 false |
| acme-shop | Q3 | correct | correct | correct | percentFor returns 0 for a missing, unknown, inactive or expired code and the percent otherwise (`fixtures/acme-shop/app/Services/CouponValidator.php:18`), and discountFor adds it (`fixtures/acme-shop/app/Services/DiscountService.php:37`) | none |
| acme-shop | Q4 | incorrect | incorrect | incorrect | The answer says the observer updates the order record, but it only queues the job and fires the event (`fixtures/acme-shop/app/Observers/OrderObserver.php:18`), and the job writes nothing (`fixtures/acme-shop/app/Jobs/RecalculateTotals.php:34`) | none |

Statement-level differences that do not change a verdict: task-api Q1 S4 (panelist 1 `true`,
panelist 2 `unverifiable`) and S5 (panelist 1 `unverifiable`, panelist 2 `true`). The `Errors`
column follows panelist 1 because both verdicts equal the final one.

## Agreement

n = 7

Percent agreement: 100.0%

Cohen's kappa: 1.000

The kappa is indicative: with seven items it has a wide uncertainty.

Resolved by the resolver: 0 of 7

## Pending

- acme-shop Q1: DIS-108
- acme-shop Q4: DIS-109

These two golden answers stay in `seeds/cache/acme-shop.json` unsigned (`reviews: []`); the
successor tickets regenerate or retire them and have them reviewed again.

## Limitations

- Two models of one family are not independent reviewers in the sense of two people.
- The generator is a local 7B model (qwen2.5-coder).
- sourcesRead is self-declared.
- The criterion was written by an agent that had read the golden answers.
