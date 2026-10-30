## Why

The DIS-110 round of the independent golden review (`docs/golden-review/2026-10-golden-review-dis-110.md`)
judged the golden answer task-api `Q1` («¿Cómo valida taskRoutes las peticiones entrantes?»)
`incorrect`: statement S3, typed `FACT`, says `listTasksQuerySchema` and `taskIdParamsSchema` are
querystring schemas used by GET and DELETE, and the fixture contradicts it. By decision X15 of
`openspec/changes/archive/2026-10-30-pool-transaction-release/design.md` it was left unsigned
(`reviews: []`) as a known golden answer for the author, with no further round. The author has now
asked for a second DIS-110 round (DIS-110 r2) that regenerates task-api `Q1` alone and has all seven
items judged again by a new blind panel, the same way DIS-10 r2 and DIS-42 r2/r3 did.

The same change carries a documentation fix that DIS-110 could not make (its decision X8): the
`## Purpose` header of `openspec/specs/explain/spec.md` still says that explain "asks the model once",
which is false since the requirement "Stale claim refresh" (DIS-42).

*(Agent's text: the decisions of this proposal were taken by the agent as lead engineer in an
autonomous run, `docs/AUTONOMOUS-RUN.md` §6, from the author's instruction for this run; they are
listed in `design.md` → Follow-ups with their A/B/C/D destination.)*

## What Changes

- Regenerate task-api `Q1` alone with the local Ollama model `qwen2.5-coder`
  (`npm run cache:build -- --project task-api Q1`, requirement "Partial regeneration"), once; its
  output is the r2 answer, whatever it says. No other golden answer and no seed is rebuilt: no
  fingerprint input changed since the DIS-110 regeneration commit `ebc47ba`.
- Run round DIS-110 r2 of the independent golden review over the seven items (six golden answers
  and the behaviour item task-api `Q4`), with new files suffixed `-dis-110-r2`: the report
  `docs/golden-review/2026-10-golden-review-dis-110-r2.md` (criterion committed before the
  regeneration), the blind input, two panelist outputs (Opus, Sonnet) and the resolution of their
  disagreements (Opus). The criterion is the DIS-33 criterion, copied verbatim.
- Sign again, from the r2 verdicts, every golden entry whose final verdict is `correct` or `partial`
  (they replace the DIS-110 signatures); an `incorrect` one stays unsigned and is listed in the
  report's `## Pending`.
- If task-api `Q1` is still judged `incorrect`, a third round DIS-110 r3 runs inside this change the
  same way (task-api `Q1` regenerated alone once more; suffix `-dis-110-r3`), after this change's
  artifacts are updated for it. If it is still `incorrect` after r3, the change stops for the author.
- The `golden-answers` delta retargets the round-specific requirements from DIS-110 to DIS-110 r2,
  with DIS-110 as one more previous round; `tests/unit/seed/golden-reviews.spec.ts` is retargeted the
  same way.
- The `## Purpose` of `openspec/specs/explain/spec.md` names the answer call and the lazy refresh of
  the due stale prior claims, in a separate `docs(DIS-110)` commit.
- The docs that name the current golden round (`fixtures/README.md`, `docs/project-context.md`,
  `readme.md`, `docs/DEMO.md`, the TSDoc of `packages/cli/src/cache/golden-file.ts`) name DIS-110 r2.

No behaviour change (the only edit under `packages/` is the TSDoc of
`packages/cli/src/cache/golden-file.ts`), no breaking change, no migration.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `golden-answers`: the requirements "Blind panel input of the golden review", "Panel outputs of the
  golden review", "Signatures of the reviewed golden answers", "Golden review report" and "Criterion
  first and immutable panel record" name the DIS-110 r2 round as the current one and the DIS-110
  round as a previous one.

The Purpose header of `explain` is edited directly in the main spec (a delta cannot change a
Purpose), with no requirement change.

## Impact

- Data: `seeds/cache/task-api.json` (task-api `Q1` regenerated; `reviews` of every entry),
  `seeds/cache/acme-shop.json` (`reviews` only). `verify` reads neither `reviews` nor anything else
  that changes except the regenerated `Q1` entry, which it checks like any golden entry.
- New files under `docs/golden-review/` and `docs/golden-review/panel/` (suffix `-dis-110-r2`).
- Test: `tests/unit/seed/golden-reviews.spec.ts` retargeted (existing test, named in `tasks.md`).
- Docs: `openspec/specs/explain/spec.md` (Purpose), `fixtures/README.md`, `docs/project-context.md`,
  `readme.md`, `docs/DEMO.md`, `packages/cli/src/cache/golden-file.ts` (TSDoc only; it feeds no
  fingerprint), `prompts.md`.
- Linear: DIS-110 stays Done; one Spanish comment at the end. No new ticket.
