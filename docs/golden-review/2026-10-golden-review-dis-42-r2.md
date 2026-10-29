# Independent review of the golden answers, round DIS-42 r2 (October 2026)

**Ticket:** DIS-42. **Scope:** the second DIS-42 round, over the six golden answers regenerated after
the stale claim refresh of DIS-42 changed the store adapter (on the code merged with DIS-10), once
task-api `Q2` and acme-shop `Q1` alone have been regenerated again: `seeds/cache/task-api.json`
(`Q1`, `Q2`, `Q3`) and `seeds/cache/acme-shop.json` (`Q1`, `Q3`, `Q4`), plus the behaviour item
task-api `Q4` (`UNKNOWN (no-anchor)`, no golden answer).
**Generator of the golden answers:** `qwen2.5-coder`. The previous rounds are the first DIS-42 round,
DIS-10 r2, DIS-10, DIS-9, DIS-107 and DIS-33. The review is done by a panel of agents of models other
than the generator, under the criterion below, which is the DIS-33 criterion copied verbatim.

## Criterion

- Judge each statement as one of: `true` — true against the code and backed by the lines of the evidence it cites; `false` — contradicted by the code; `unverifiable` — a cited evidence entry does not exist (file or lines) or its lines do not back the statement, even if the statement is true elsewhere; `overtyped` — typed `FACT` but the code does not state it literally (true only by inference). A statement typed `INFERENCE` that the code states literally is `true` (under-typing is not an error).
- An **error** is any statement judgement other than `true`.
- Judge the item's `answer` text: `"true"` if what it says is true against the code, `"false"` otherwise. For the behaviour item task-api `Q4` («¿Cómo se autentican los usuarios?»): `"true"` if the fixture has no authentication (no route, middleware, hook, plugin or check that authenticates a user), so `UNKNOWN` is the due answer; `"false"` if it has any.
- **Verdict**, derived from the judgements, never chosen apart from them: `incorrect` if `answer` is `"false"`, or a `FACT` statement is judged `false`, or the item has statements and every one has an error; otherwise `correct` if every statement is `true` (the behaviour item, with no statements, is `correct` when its `answer` is `"true"`); otherwise `partial`.
- Spelling slips or typos of the model (for example a misspelt word) are noted in `notes` but are not errors. A statement that is true against the code but imprecise (for example it lists a route twice) is judged `true` and the imprecision is noted in `notes`.
- When more than one judgement applies to a statement, use the first that applies in this order: `false`, `unverifiable`, `overtyped`, `true`.

## Panel

- **Panelist 1:** Opus. **Panelist 2:** Sonnet. They judge the seven items blind to each other and to
  every earlier round, the first DIS-42 round included.
- **Resolver:** Opus, in a fresh context, only over the items where the two panelist verdicts differ.
- **Outputs:** under `docs/golden-review/panel/` (the input, the two panelist outputs and the
  resolution, with the `-dis-42-r2` suffix).

Allowed sources of a panelist, each file read recorded in its `sourcesRead`:

- `openspec/changes/stale-claims-refresh/tasks.md` (the r2 Panel group, group 19, only)
- `docs/golden-review/2026-10-golden-review-dis-42-r2.md` (the sections `## Criterion` and `## Panel`)
- `docs/golden-review/panel/2026-10-golden-review-dis-42-r2-input.json`
- `docs/base-standards.md`
- every file under `fixtures/task-api/` and `fixtures/acme-shop/`, except their `README.md`, `docs/`
  and `node_modules/`

The resolver may also read the two panelist outputs of this round and `docs/AUTONOMOUS-RUN.md`.

Forbidden sources: `fixtures/README.md` (it holds the expected answers); `seeds/` (the golden files:
the panel input replaces them); the fixtures' `README.md`, `docs/` and `node_modules/`; every file of
the previous rounds, `docs/golden-review/2026-10-golden-review-dis-42.md`,
`docs/golden-review/2026-10-golden-review-dis-10-r2.md`, `docs/golden-review/2026-10-golden-review-dis-10.md`,
`docs/golden-review/2026-10-golden-review-dis-9.md`, `docs/golden-review/2026-10-golden-review-dis-107.md`,
`docs/golden-review/2026-10-task-api-golden-review.md` and their files under `docs/golden-review/panel/`;
the other groups of the tasks file (in particular the groups of the first DIS-42 round); the other
reports of `docs/golden-review/`; the other panelist's output; the rest of `docs/`, `packages/`,
`tests/`, `scripts/` and `openspec/`; the git history; any Linear content. A panelist does not run
the analyzers, `ask`, `verify`, the fixtures' tests or any script, and does not read the database or
the answer cache.
