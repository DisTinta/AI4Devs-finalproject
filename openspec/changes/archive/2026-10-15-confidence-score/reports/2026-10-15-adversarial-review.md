# Adversarial review

- Date: 2026-10-15
- Change: confidence-score (DIS-72), PR #43, `feature/DIS-72-confidence-score` vs `feature/entrega-2-CRN`
  (merge-base 3630f6a)
- Run by: the `/adversarial-review` skill in a read-only fork; saved by the main session from the
  fork's result, unchanged in substance.
- Inputs read: the three delta specs, `tasks.md` (committed and working tree), `design.md`, the reports
  (8 and verify-against-spec), the full code and test diff, and the readers of `claim.confidence`.
- Findings V1–V5 and U1–U4 of verify-against-spec are not repeated. V5 was fixed in the working tree
  (5.2a–e ticked), not yet committed at review time.

## Findings

| Id | Severity | File:line | Finding | Why it matters |
|---|---|---|---|---|
| A1 | Minor | `tests/unit/explain/explain-verification.spec.ts:483-484` | "An answer carries the confidence of its statements" checks `[true, true, false]` with `kind === 'answered' && persisted`; an `UNKNOWN` third run also gives `false`, and the guard at :484 would then `return` early and skip every confidence assertion. | The main scenario of the unsaved path could pass with no check run. Fix: assert `kind` per run (`toMatchObject({ kind: 'answered', persisted: false })` on the third). |
| A2 | Minor | `tests/unit/knowledge/confidence.spec.ts:98` | The only absolute-value test pairs equal signals (evidence = diversity = 0.5; crossConfirmation = resolution = 1) with equal weights (w1…w4 = 0.5); a weight wired to the wrong signal, or w3/w4 swapped, gives the same number. Every other value test builds its expectation with `confidence()` itself. | Invisible while those weights are equal; a later re-tune would expose it. Fix: one fixture whose signals all differ. |
| A3 | Minor | `packages/core/src/knowledge/confidence.ts:110`, `:118` | Two clauses of "Confidence signals" lack a discriminating test: (a) `resolution` needs **all** citations of a span resolved, but no test cites one span with mixed origins (last-write-wins would pass); (b) `crossConfirmation` is **per statement**, but no test has code entailed in S1 and test entailed in S2 (a set-wide check would pass). Stryker does not generate these mutants. | Both rules are explicit in the spec and unprotected; (b) is a plausible later "simplification". |
| A4 | Question | `packages/core/src/explain/explain.ts:116` | `answer.confidence` aggregates all statements and never falls when a well-backed statement is added. The model chooses how many statements to emit: padding a weak answer with trivially entailed statements raises `evidence`, `entailment` and `resolution` of the whole answer. Each claim keeps its own value, but the answer's hides the weakest. Not discussed in `design.md`. | The ordering of answers can be moved by output the model controls. Needs an author decision: D (state it in Limits) or a later ticket on the aggregate. |
| A5 | Question | `packages/core/src/explain/claim-items.ts:101`, `verify/policy.ts:47-49` | When the verifier is unavailable or out of budget, every uncached pair becomes `cited` and the claim is stored with `entailment` 0, permanently; the same statement asked after the outage gets a higher value. Nothing in the record tells a degraded verdict from a real one. | An infrastructure failure lowers a stored score silently. Needs a decision: D (Limits line) or B/C (mark degraded verdicts, or recompute later). |
| A6 | Question | git history: `7c18fe3` vs `97d4822`/`4616a50`/`d2db866` | The delta specs and `tasks.md` were first committed after the three `feat` commits; all commits were made in one batch, so the history cannot show spec-first order. | Process evidence only; the step 8 report's RED records are the evidence of spec-first order. |

### Checked and found sound

- Hostile input to `confidence` / `confidenceSignals`: empty set or empty statement throws `RangeError`
  before counting (`confidence.ts:93-96`); unknown origin fails closed; a citation listed twice counts
  twice in `entailment` and once in span-based signals, as specified and tested (2/3); order
  independence holds (integer counts, set sizes, fixed sum order); z ranges over [-1.5, 2.875], so the
  value stays in (0.18, 0.95), inside `CHECK (confidence BETWEEN 0 AND 1)` and Zod's `min(0).max(1)`;
  a `fileKind` outside `FILE_KINDS` cannot reach the code; `spans` and `evidenceVerifications` always
  have the same length in production (`policy.ts:47`).
- Same request twice or two at once: pure, no shared state; the repeated run is tested with `Object.is`.
- Fence regex (`statement-schema.ts:26`): anchored both ends, one unbounded group, no ReDoS, size check
  first; one layer unwrapped; a second fence or surrounding text cannot yield valid JSON; the
  case-insensitive `json` matches the spec.
- Blast radius: `claim.confidence` was always `NULL` before; its only readers are the Postgres adapter
  (`claims.ts:47`, `:93`; `queries.ts:247-273`) and tests; `PriorClaim` does not carry it, so stored
  values never reach the prompt or the CLI; `ask` does not print it; `double precision` round-trips the
  double exactly; no migration; the seed diff is the fingerprint line only.
- Edited existing tests: all explained by the modified scenarios and listed in the step 8 report; the
  `confidence: null` of seeded prior claims is correctly unchanged.
- The test that matters most, "The confidence follows the verifier's verdicts", would catch
  `toConfidenceStatement` reading the statement-level verification instead of `evidenceVerifications[j]`,
  or passing the pre-entailment statements.

## Verdict

**PASS WITH GAPS.** No Blocker or Major. The code matches the specs under hostile input and the blast
radius is a column that used to be `NULL`. Gaps: three test-strength Minors (A1–A3) and two design
Questions (A4, A5) that need an author decision; A6 is process evidence only.

## Recommended next steps before archiving

1. Destination A: harden A1's guard, add A2's all-different fixture, add A3's two cases as extra
   assertions in existing scenarios; rerun and add an addendum to the step 8 report.
2. A4 and A5: author decides between D (Limits lines in `docs/CONFIDENCE.md`, design, spec) and B/C.
3. Anything ending in C goes, with V1–V4 and U1–U4, into one debt record approved by the author, not
   one issue per Minor. A6 does not go to Linear.
4. Commit the working-tree changes before `/opsx:archive`.

## Addendum — resolution (2026-10-15)

Every finding has a destination in `design.md` → Follow-ups, approved by the author. A: fixed in this
change by TDD or spec update (details and bite checks in the step 8 report, review-fixes addendum). D:
accepted and documented (V4 not observable; U3 `toConfidenceStatement` stays the C5 mapping; A4 and A5
as Limits lines in the spec and `docs/CONFIDENCE.md`; A6 process evidence). No finding was left open
and none went to a new ticket. Rerun: 1298 tests, gates and mutation green.
