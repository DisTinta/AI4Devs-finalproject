# Adversarial review — http-impact (DIS-95)

- Date: 2026-11-02
- Change: http-impact · PR #95 against `final-project-CRN`
- Mode: inline (autonomous run, `ai-specs/skills/adversarial-review/SKILL.md` → Inline mode)

*Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6). Read: proposal, design, delta spec,
tasks, the step 5, step 6, show-spec-working and verify-against-spec reports, and the diff
`final-project-CRN...HEAD` (18 files). Run in a fresh subagent of the review step, not the session
that implemented the change.*

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/api/src/schemas/impact.ts:51-54` (head `618dd67`: lines 129-132) | The "two-way compile-time equality check" of design D6 / Follow-up P4 could not fail: `Equal<…> extends true ? true : never` inside a type alias resolves to `never` silently. Reproduced with `tsc --strict` in the scratchpad (exit 0 with a `RiskLevel` missing `LOW`). | P4 justifies departing from `docs/backend-standards.md` §4 (closed sets declared once) by this guard. Without it, the schema could keep publishing a risk level or unknown reason core no longer produces, and the OpenAPI document would advertise it, with green CI. The typed `toPublicReport` covers only the direction "core adds a value". **Fixed**: `Expect<T extends true>` makes a `false` a `TS2344`; red shown by widening `riskLevelSchema` to `'CRITICAL'` (`npm run typecheck` failed at `schemas/impact.ts(52,10)`), then reverted. |
| Minor | `tests/unit/api/impact.spec.ts:374-376`, `:472-474` (head: `:374-375`, `:472`) | The two event scenarios claimed "one log line carrying the request's `reqId`" but asserted only that the event's `reqId` is some string (the first by searching it among all `reqId`s, its own line included). | A mutation that logs the event through `app.log` with a fabricated or another request's id would pass. **Fixed**: both compare with the `reqId` of the request's `incoming request` line. |
| Minor | `openspec/changes/http-impact/tasks.md` 9.1, 9.2 | PR #95 is open and its CI (six checks, the mutation job included) is green, yet 9.1 and 9.2 were still unticked and the step 5 report had no CI addendum, which 9.2 requires. | A task list that lags the evidence misleads the archive gate and the reader. **Fixed in this step**: 9.1–9.4 ticked with their evidence, CI addendum added to the step 5 report after the fix commit's CI. |

Checked without a finding:

1. **Spec and task alignment.** Every requirement has scenarios and every scenario an `it` of the
   same name (map in the verify report). The delta spec was last edited in `d9b367b` (audit run 1
   resolution), before the implementation commit `204c6b9`: not edited to fit the code. No code beyond
   the spec except what the verify report's block 3 lists and keeps (module exports, the log message,
   the custom issue messages).
2. **Hostile input** (read in `schemas/impact.ts` and `routes/impact.ts`, exercised live in the
   show-spec-working run): empty body `{}` → 400 on `change`; 4 code points (8 UTF-16 units) → 400,
   5 → 200, 500 → 200, 501 → 400, so Zod counts code points like core's `[...change].length`
   (`packages/core/src/impact/impact-request.ts:46`); blank and U+0000 → 400; `maxHops` 0, 4, 1.5,
   `"2"` → 400 (`z.int`, no coercion; `null` is rejected the same way by reading the schema); unknown keys → 400 without values; malformed id → 400
   without echo; well-formed unknown id → 404 before the use case, also with a term-less change
   (closes DIS-89 P6); upper-case id → the stored id is forwarded (Postgres `uuid` and the in-memory
   store both resolve it). The same request twice writes two `query_log` rows and answers the same
   body (request 1 and 2 of the live run); two at once share no mutable state in the route. There is
   no authentication in the API (non-goal), so "a subject who owns nothing" does not apply.
3. **Blast radius.** The route writes nothing itself; the use case writes one `query_log` row with
   `capability` `impact`, exactly as the CLI `impact` already does, so whatever reads those rows
   sees no new shape. `app.ts` only adds a seam and a registration; `/ask`, `/index`,
   `/health` and `/docs` keep their tests green (`tests/unit/api`, 115 tests). The rate limit is the
   app-wide per-IP bucket, so `/impact` and `/ask` share it, as `api-foundation` "Rate limit by IP"
   states. No migration. No existing test modified (`git diff --name-only` lists only the two new spec
   files under `tests/`).
4. **Evidence quality.** The tests assert observable behaviour through `inject`, not the
   implementation. The most important one, "Fields the use case adds are not sent"
   (`tests/unit/api/impact.spec.ts:301`), kills the mutation that sends `staleSince` on a current
   document (it expects exactly `{ path, stale: false }`) and the one that spreads an entry (the
   `fileId` key and the UUID check). Stryker over the two new files: 53/53 and 38/38 killed (step 5
   report); the CI mutation job is green.

### Verdict

PASS — after the fixes of this step there are no Blockers and no open Majors, and the evidence is
sufficient. Before the fixes the verdict was PASS WITH GAPS (one Major, fixed in this PR).

### Recommended next steps before archiving

1. Wait for the CI of the fix commit to finish green (no check pending), then `/opsx:archive`.
2. Nothing is deferred: the three findings are fixed in this change (design Follow-ups V1, V2, V3,
   destination A). No finding goes to the author (no destination C).
