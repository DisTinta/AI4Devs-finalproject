# Independent review of the golden answers, round DIS-110 (October 2026)

**Ticket:** DIS-110. **Scope:** the six golden answers regenerated after the pooled transaction
runner of DIS-110 changed the store adapter (a new seed fingerprint, the same seed rows):
`seeds/cache/task-api.json` (`Q1`, `Q2`, `Q3`) and `seeds/cache/acme-shop.json` (`Q1`, `Q3`, `Q4`),
plus the behaviour item task-api `Q4` (`UNKNOWN (no-anchor)`, no golden answer).
**Generator of the golden answers:** `qwen2.5-coder`. The previous rounds are DIS-42 r3, DIS-42 r2,
the first DIS-42 round, DIS-10 r2, DIS-10, DIS-9, DIS-107 and DIS-33. The review is done by a panel
of agents of models other than the generator, under the criterion below, which is the DIS-33
criterion copied verbatim.

## Criterion

- Judge each statement as one of: `true` — true against the code and backed by the lines of the evidence it cites; `false` — contradicted by the code; `unverifiable` — a cited evidence entry does not exist (file or lines) or its lines do not back the statement, even if the statement is true elsewhere; `overtyped` — typed `FACT` but the code does not state it literally (true only by inference). A statement typed `INFERENCE` that the code states literally is `true` (under-typing is not an error).
- An **error** is any statement judgement other than `true`.
- Judge the item's `answer` text: `"true"` if what it says is true against the code, `"false"` otherwise. For the behaviour item task-api `Q4` («¿Cómo se autentican los usuarios?»): `"true"` if the fixture has no authentication (no route, middleware, hook, plugin or check that authenticates a user), so `UNKNOWN` is the due answer; `"false"` if it has any.
- **Verdict**, derived from the judgements, never chosen apart from them: `incorrect` if `answer` is `"false"`, or a `FACT` statement is judged `false`, or the item has statements and every one has an error; otherwise `correct` if every statement is `true` (the behaviour item, with no statements, is `correct` when its `answer` is `"true"`); otherwise `partial`.
- Spelling slips or typos of the model (for example a misspelt word) are noted in `notes` but are not errors. A statement that is true against the code but imprecise (for example it lists a route twice) is judged `true` and the imprecision is noted in `notes`.
- When more than one judgement applies to a statement, use the first that applies in this order: `false`, `unverifiable`, `overtyped`, `true`.

## Panel

- **Panelist 1:** Opus, model `claude-opus-5-5`, date 2026-10-30. **Panelist 2:** Sonnet, model
  `claude-sonnet-5-5`, date 2026-10-30. They judge the seven items blind to each other and to every
  earlier round, DIS-42 r3 included.
- **Resolver:** Opus, model `claude-opus-5-5`, date 2026-10-30, in a fresh context, only over the
  items where the two panelist verdicts differ (two in this run: task-api `Q1` and `Q3`).
- **Outputs:** under `docs/golden-review/panel/` (the input, the two panelist outputs and the
  resolution, with the `-dis-110` suffix).

Allowed sources of a panelist, each file read recorded in its `sourcesRead`:

- `openspec/changes/pool-transaction-release/tasks.md` (the Panel group, group 12c, only)
- `docs/golden-review/2026-10-golden-review-dis-110.md` (the sections `## Criterion` and `## Panel`)
- `docs/golden-review/panel/2026-10-golden-review-dis-110-input.json`
- `docs/base-standards.md`
- every file under `fixtures/task-api/` and `fixtures/acme-shop/`, except their `README.md`, `docs/`
  and `node_modules/`

The resolver may also read the two panelist outputs of this round and `docs/AUTONOMOUS-RUN.md`.

Forbidden sources: `fixtures/README.md` (it holds the expected answers); `seeds/` (the golden files:
the panel input replaces them); the fixtures' `README.md`, `docs/` and `node_modules/`; every file of
the previous rounds, `docs/golden-review/2026-10-golden-review-dis-42-r3.md`,
`docs/golden-review/2026-10-golden-review-dis-42-r2.md`,
`docs/golden-review/2026-10-golden-review-dis-42.md`,
`docs/golden-review/2026-10-golden-review-dis-10-r2.md`, `docs/golden-review/2026-10-golden-review-dis-10.md`,
`docs/golden-review/2026-10-golden-review-dis-9.md`, `docs/golden-review/2026-10-golden-review-dis-107.md`,
`docs/golden-review/2026-10-task-api-golden-review.md` and their files under `docs/golden-review/panel/`;
the other groups of the tasks file; the other reports of `docs/golden-review/`; the other panelist's
output; the rest of `docs/`, `packages/`, `tests/`, `scripts/` and `openspec/`; the git history; any
Linear content. A panelist does not run the analyzers, `ask`, `verify`, the fixtures' tests or any
script, and does not read the database or the answer cache.

## Verdicts

The panel outputs and the resolution are unchanged since the commits that created them. The
panelists disagreed on task-api `Q1` and `Q3`; the resolver decided both. task-api `Q1` is judged
`incorrect`, so it stays unsigned and is listed under `## Pending`; every other golden entry carries
both DIS-110 signatures.

| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |
|---|---|---|---|---|---|---|
| task-api | Q1 | incorrect | partial | incorrect | S3 is a FACT contradicted by the code: taskIdParamsSchema is a params schema, not a querystring one (`fixtures/task-api/src/routes/tasks.routes.ts:20`); filtering and sorting are done by applyFilters and sortTasks, not by the schemas (`fixtures/task-api/src/services/task.filters.ts:10`) | S3 false; S4 false |
| task-api | Q2 | correct | correct | correct | buildPage takes items, total, page and pageSize and returns a Page (`fixtures/task-api/src/domain/pagination.ts:13`); the answer omits the computed pageCount without being wrong | none |
| task-api | Q3 | correct | partial | correct | S1 is an INFERENCE backed by its cited lines: canTransition and allowedTransitions read the TRANSITIONS table of the same file (`fixtures/task-api/src/domain/task-status.ts:26`) | none |
| task-api | Q4 | correct | correct | correct | No route, hook, plugin or check authenticates a user; JWT_SECRET is parsed but never used (`fixtures/task-api/src/config/env.ts:13`), so UNKNOWN is the due answer | none |
| acme-shop | Q1 | partial | partial | partial | Discount, tax and shipping are applied as stated (`fixtures/acme-shop/app/Services/PriceCalculator.php:28`), but S2 attributes the discount logic to a document while citing README lines, so it is not backed; taxativas is a slip of the model | S2 unverifiable |
| acme-shop | Q3 | partial | partial | partial | The coupon is checked in percentFor (`fixtures/acme-shop/app/Services/CouponValidator.php:16`); S3 and S4 cite StoreOrderRequest lines that never touch the coupon (`fixtures/acme-shop/app/Http/Requests/StoreOrderRequest.php:26`) | S3 unverifiable; S4 unverifiable |
| acme-shop | Q4 | correct | correct | correct | The observer dispatches RecalculateTotals and fires OrderPlaced (`fixtures/acme-shop/app/Observers/OrderObserver.php:18`) | none |

Panelist 1's `sourcesRead` lists `fixtures/task-api/.env.example`, `fixtures/task-api/package-lock.json`
and `fixtures/task-api/tests/unit/task.filters.test.ts`; they are under the allowed prefix
`fixtures/task-api/`, so the validation check accepts the output, and no judgement cites them. The
output is recorded as returned.

## Agreement

n = 7

Percent agreement: 71.4%

Cohen's kappa: 0.517

The kappa is indicative: with seven items it has a wide uncertainty.

Resolved by the resolver: 2 of 7

## Pending

- task-api Q1: DIS-110

DIS-110 is a single round: no further round and no ticket follow, and task-api `Q1` stays as a known
unsigned golden answer for the author (`reviews` empty in `seeds/cache/task-api.json`).

## Limitations

- Two models of one family are not independent reviewers in the sense of two people.
- The generator is a local 7B model (qwen2.5-coder).
- sourcesRead is self-declared.
- The criterion was written by an agent that had read the golden answers.
