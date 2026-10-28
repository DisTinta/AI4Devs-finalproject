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

- **Panelist 1:** Opus. **Panelist 2:** Sonnet. They judge the seven items blind to each other.
- **Resolver:** Opus, in a fresh context, only over the items where the two panelist verdicts differ.
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
