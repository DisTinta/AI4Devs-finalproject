CHANGES REQUIRED

# Spec audit — cli-ask (DIS-40)

- Date: 2026-10-13
- Auditor: `spec-auditor` subagent, first run
- Inputs: DIS-40 (sub-issue) and DIS-29 (parent) with their comments; the four artifacts of
  `openspec/changes/cli-ask/`; `docs/openspec-tasks-mandatory-steps.md`, `docs/base-standards.md`
  §7.1, `docs/backend-standards.md`, `docs/project-context.md`; the main `explain` spec; the code and
  test helpers named in the design.

**Question for the author (Q1).** DIS-40 `[enhanced]` §2 criterion 1 says each of the two statements
prints `app/…/PriceCalculator.php:<start>-<end>`. On acme-shop, the heuristic span of the Q1 pack is
in `app/Http/Controllers/CheckoutController.php:19-33`, not in `PriceCalculator.php`
(`openspec/changes/archive/2026-10-13-explain-use-case/reports/2026-10-13-14-manual-interface-testing.md:39`;
`tests/integration/explain/explain.spec.ts:102` picks the first `heuristic` span). Proposed wording:
statement 1 → `app/Services/PriceCalculator.php:16-44`; statement 2 → the path and lines of the
heuristic span. A factual correction; it does not reopen P1–P5.

## 1. Scope against the ticket — clean

Everything traces back to DIS-40: the `ask` command, P1–P5, the `adapter-llm` wiring, the docs
updates of ticket §3 "Done". Additions not literal in the ticket, all acceptable: `--version`
(mirrors `projects`), the `source` and `now` seams, the deduplication of the evidence section (D5),
and `application_name: 'codemind-ask'` plus a `pg_stat_activity` test (D3, beyond P2's literal pool
options; see m12). Nothing widens the change to the parent's whole story.

## 2. Inherited acceptance criteria

All five DIS-40 criteria, the §2 interface rules and the parent criteria the DoD inherits have a
requirement and a scenario. One defect:

- **B1 — Blocker.** "A typed answer is printed with its evidence and stored" (`spec.md:136-140`)
  requires every `evidence:` line to name `app/…/PriceCalculator.php`; the real heuristic span of Q1
  is `CheckoutController.php:19-33`. The scenario cannot pass without bending the test; task 7.2
  inherits it. The ticket has the same error (Q1).

## 3. Missing scenarios

- **M3 — Major.** SHALL clauses without a scenario: (a) the daily spend ceiling with
  `DAILY_BUDGET_USD` (`spec.md:53-54`), only an extra unit in task 6.3; (b) no output contains
  `LLM_API_KEY` (`spec.md:59-60`; the DIS-29 handoff note also requires it); (c) each distinct cited
  span counted once and citation order (`spec.md:114-117`), only the extra task 5.5; (d) `explain`
  called once with its default budget and hops (`spec.md:105-106`).

## 4. Ambiguity

- **M1 — Major.** `spec.md:169` "No raw control character SHALL reach stdout or stderr": the format
  writes U+000A line feeds, so a literal test fails on every run. Restrict it to "besides the line
  feeds the format writes".
- **m5 — Minor.** "one output line per line of the answer" (`spec.md:109`) does not say what a
  trailing line break of `answer` or a statement `text` does; excerpts drop one (`spec.md:120`). Pin
  one rule.
- **m6 — Minor.** "the argument parser SHALL NOT print text of its own" (`spec.md:16`) contradicts
  `--help`. Say "no error text of its own".

## 5. Open decisions

- **m4 — Minor.** `USAGE` messages not pinned (D6, `design.md:152-155`). The commander 12 codes are
  known: `commander.missingArgument`, `commander.excessArguments`, `commander.unknownOption`,
  `commander.helpDisplayed`, `commander.version`. Pin the four messages now.
- **m3 — Minor.** D6's `LLM_CONFIG_INVALID` message `<variable> is missing or invalid` is wrong when
  `modelVariable` is set (`packages/adapters/llm/src/config.ts:60-64`, `:105`). Pin a second message.

## 6. Contradictions inside the change

None between proposal, design and spec. D5/D9 versus task 5.2 is a wording slip (m2).

## 7. Contradictions with the project

- **M4 — Major.** `docs/openspec-tasks-mandatory-steps.md` §2 orders the mandatory steps Review →
  Run Tests → Manual → E2E → Update Technical Documentation → Pre-merge; `tasks.md` puts Docs (§11)
  before Run Tests, Manual and E2E.
- **m11 — Minor.** `docs/backend-standards.md` §8 (148-150): on budget exhaustion "the use case
  degrades to cache-only with a warning". Ticket criterion 4 decides `BUDGET_EXHAUSTED`, exit 1, and
  there is no cache until DIS-21. Not reopened: record the deviation in D6.
- **m10 — Minor.** The DIS-29 comment (DIS-17 handoff): the composition root never logs or
  serialises `LiveLlmConfig` (holds `apiKey`). Not in the design. Also record the "key with characters
  invalid in a header" point as a follow-up; no adapter change here.
- The `explain` spec "Explain events and logging" is consistent. No ADR conflicts.

## 8. Contrast with the real code

- "¿Dónde vive el ornitorrinco?" anchors nothing on acme-shop — confirmed (`anchor.ts:22-68`; 0
  matches for `vive|ornit` in the seed; `openspec/specs/explain/spec.md:105-107`,
  `openspec/specs/context-engine/spec.md:347-348`).
- Confirmed: evaluation mode anchors first, then `llm-required` (`explain.ts:62-65`); ESC accepted in
  `answer` and `text`, only NUL rejected (`statement-schema.ts:22-27`); one evidence entry per
  citation when stored (`explain.ts:143-145`), so D5's dedup is needed; the `schema_violation` event
  starts with `type`; the seed has no claim rows and `DELETE FROM project` cascades to `claim`;
  `buildOne` is deterministic (`HEAD` `4f028db4…`); `REPO_ROOT` resolves to the repository root.
- **M2 — Major.** "Only the exact name resolves the project" hard-codes the seed id; task 4.1 runs
  it over `createInMemoryStore`, which gives each project a fresh `randomUUID()`
  (`tests/support/in-memory-store.ts:147`), so the case passes without proving an id is rejected. Use
  "the stored acme-shop project's id".
- **m1 — Minor.** Helper names and options: `createScriptedLlm` returns `{ llm, requests }`, no
  `calls`; `createInMemoryStore` requires `projects` and `failClaimWrite` is `{ claim, evidence }`;
  its `sumCostSince` throws "not implemented" (task 6.3 must override it); with `DAILY_BUDGET_USD` set,
  `LLM_MODEL` must have a price in `COST_TABLE` (`config.ts:104-106`).
- **m2 — Minor.** The span path comes from the store's graph (`graph.files[].path`), not from the
  source double, which is only keyed by it; the file needs a symbol the question anchors on.
- **m12 — Minor.** pg merges the parsed connection string over the explicit options, so a
  `DATABASE_URL` carrying `application_name` wins and the `pg_stat_activity` filter matches nothing.
  Note it in D3.
- **m13 — Minor.** `ask-command.spec.ts` and `projects-command.spec.ts` both `DELETE FROM project`
  and `loadSeed` with the fixed seed id in parallel files: row-lock waits, not failures. Note it.
- **Reuse — Minor.** `toFailure` should return `CliFailure` (`compose-index.ts:124-133`);
  `CONNECTION_TIMEOUT_MS` (`compose-index.ts:20`) is not exported: export it instead of copying
  `10_000`.

## 9. Task size — clean

## 10. Mandatory steps

Step 0 first; labels, AGENT MUST EXECUTE, report paths and Pre-merge last are right. Order: M4.

- **m9 — Minor.** 13.1 may create `fixtures/acme-shop/.git` and run `npm run db:seed`; 13.6 restores
  neither. Restore against the 0.4 baseline.
- **m7 — Minor.** Ticket §3 "Done" asks for a unit test of the format function covering ESC; 5.1
  has no ESC case.
- **m8 — Minor.** 11.1 must add `@codemind/adapter-llm` to the `tsconfig.run.json` mapping list in
  `docs/project-context.md:95-96`; 11.2 must fix `readme.md:298` (sample questions "sin LLM
  (caché)") and `readme.md:304` (`ask task-api`: task-api is not seeded).
- **m14 — Minor.** 7.3 does not say how "the model is never called" is asserted with the real
  `createLlm`: exit 0 with `llm-required` proves it, since a call fails with `LlmUnavailable`.

## 11. Traceability

Every scenario had a task; four SHALL clauses had no scenario (M3): the daily ceiling, `LLM_API_KEY`
never in output, span dedup and citation order, default budget and hops.

## Corrections to apply

Spec: B1 (exact calculator span, heuristic span by its own path), M1, M2, M3 (four new scenarios),
m5, m6. Design: D3 m12; D6 m4, m3, m11, reuse; D9 m1, m2; Risks m10, m13; Follow-ups m10. Tasks: M4
reorder and renumber, B1 in 7.2, M2 and `requests` in 4.1, M3 tasks, m1 in 5.4 and 6.3, m2 in 5.2,
m7 in 5.1, m14 in 7.3, m8 in docs, m9 in manual restore. Linear DIS-40: a Spanish comment with the
criterion-1 correction once the author confirms Q1 (never the `[original]` block).

## Resolution of the findings (first run)

| Finding | Resolution |
|---|---|
| B1 | Fixed: the scenario names `app/Services/PriceCalculator.php:16-44` for statement 1 and the heuristic span's own path and lines for statement 2 (`CheckoutController.php:19-33` on acme-shop); task 7.2 asserts each `evidence:` line against the cited span. Q1 (ticket wording) pending the author's confirmation before a Spanish comment on DIS-40; the `[original]` block is not touched |
| M1 | Fixed: the terminal-safety requirement excludes the line feeds the format writes |
| M2 | Fixed: the scenario uses the stored acme-shop project's id; task 4.1 uses `projectIds[0]` |
| M3 | Fixed: four scenarios added — "A daily budget stops the model call", "The API key never reaches an output", "A span cited twice is listed once", "Explain receives only the project id and the question"; tasks 3.2, 3.3, 5.6, 5.7 |
| M4 | Fixed: mandatory steps reordered (Review 10 → Run Tests 11 → Manual 12 → E2E 13 → Docs 14 → PR 15 → Pre-merge 16) and cross-references renumbered |
| m1 | Fixed: helper names and options in D9 and tasks 2.1, 3.3, 4.1, 5.5 |
| m2 | Fixed: the escaped path lives in the in-memory graph (D9, task 5.3) |
| m3 | Fixed: second `LLM_CONFIG_INVALID` message in D6 |
| m4 | Fixed: `USAGE` messages pinned in D6; task 0.5 only confirms the codes |
| m5 | Fixed: one trailing line break of the answer or a statement text prints no empty line (spec item 1, D5) |
| m6 | Fixed: "no error text of its own" |
| m7 | Fixed: task 5.2, ESC against `formatAnswer` |
| m8 | Fixed: tasks 14.1 and 14.2 |
| m9 | Fixed: task 12.6 restores the database rows and `fixtures/acme-shop/.git` to the 0.4 baseline |
| m10 | Fixed: Risks note that `LlmConfig` is never logged or serialised; header-invalid key recorded as Follow-up D |
| m11 | Fixed: D6 records the deviation from backend-standards §8 until DIS-21 |
| m12 | Fixed: D3 notes the `application_name` precedence |
| m13 | Fixed: noted in Risks |
| m14 | Fixed: task 7.3 states the proof |
| Reuse | Fixed: `toFailure` returns `CliFailure`; `CONNECTION_TIMEOUT_MS` exported (task 1.3) |

# Second pass — APPROVED

**Verdict: APPROVED.** Every artifact was re-read from disk. All 23 first-pass findings are resolved,
the renumbered cross-references are consistent (step 11 report, `-11-test-and-state-verification`,
`-12-manual-interface-testing`, 11.1 → 0.4, 12.6 → 12.1/0.4), and each of the 21 scenarios maps to
exactly one task. The four new scenarios are consistent with D2 step 7, D2 step 8, D5 and D6/D9.
Two new minor findings, neither blocking:

- **n1 — Minor.** "The API key never reaches an output" left out part of its setup. Under D2's order,
  `DATABASE_URL` is read before `LLM_*`, so case 1 needs a valid `DATABASE_URL`. Case 2 needs
  acme-shop stored, so that `explain` reaches the model (`spec.md:97-98`).
- **n2 — Minor.** The Impact section of `proposal.md` did not list `packages/cli/src/compose-index.ts`,
  which task 1.3 and D3 change to export `CONNECTION_TIMEOUT_MS`.

Still pending, not a finding: the author's confirmation of Q1 (the ticket wording of criterion 1).

## Resolution (second pass, 2026-10-13)

| Finding | Resolution |
|---|---|
| n1 | Fixed: the GIVEN now holds a valid `DATABASE_URL` and acme-shop stored, plus a live configuration with an http `LLM_BASE_URL` and `LLM_MODEL` set |
| n2 | Fixed: `packages/cli/src/compose-index.ts` added to Impact → Code |
| Q1 | Decided by the author (2026-10-13): Spanish comment posted on DIS-40 outside the `[original]` block, with the corrected criterion-1 wording and the `BUDGET_EXHAUSTED` note. The artifacts already use that wording |
