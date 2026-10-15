# Adversarial review — evidence-verifier-semantic (DIS-70)

- Date: 2026-10-15
- Code: `aef2698` (PR #42) against `origin/feature/entrega-2-CRN`; reviewer in a separate, read-only
  session (the report was saved by the main session from the reviewer's output).
- Inputs: proposal, design, the four delta specs, tasks, the step 10 / step 11 / show-spec-working
  reports, the source diff of `packages/` and the test diff. Findings W1–W3 / U1–U4 of
  `/verify-against-spec` are taken as known and not repeated except where noted.

## What was checked

- Every requirement of `specs/evidence-verification/spec.md` against `verify/semantic.ts`,
  `verification-cache.ts`, `verify-prompt.ts`, `policy.ts`, `verify-answer.ts`; the `explain` delta
  against `explain/explain.ts` (`storedAnswer`, `unsavedAnswer`) and `claim-items.ts`.
- Hostile input per entry point: empty pair list; duplicate pairs (same key, also after
  neutralisation); duplicate evidence ids inside one statement (rejected earlier by
  `statement-schema.ts:65`, `duplicate_evidence_id`); maximum fan-out (20 × 10 = 200 sequential
  calls); output at 1 024 / 1 025 bytes; non-JSON, extra-field, wrong-type outputs; `LlmUnavailable` /
  `BudgetExhausted` / other errors; evaluation mode; cache `maxEntries` 0, -1, 1.5, NaN, 2^53;
  missing `outputTokens` (the adapter defaults it to 0, `openai-compatible-llm.ts:84`, so no NaN).
- Blast radius: every caller of `explain` (only `packages/cli/src/commands/ask.ts:105`; the API does
  not call it); readers of `evidence.verification` (enum already has `entailed`, migration 0002, no new
  migration); prior-claim display (`explain/prior-claims.ts`); the new public exports in `verify/index.ts`.
- Edits to existing tests (all of `tests/unit/explain/*.spec.ts`, `tests/unit/verify/*.spec.ts`,
  `tests/integration/**`): every `-` line in the diff.
- Spec history: `git log` of the change's specs.
- Working tree: uncommitted changes.

Nothing wrong was found in: the regrouping of verdicts per statement (`verify-answer.ts:98-99` slices
by `evidenceIds.length`, which equals `spans.length`); statement-level vs row-level verification
(`explain.ts:163,170,208` statement-level, `claim-items.ts` per citation, as spec lines 192 and 214
require); the order of the cache check before the `stopped` short-circuit (`semantic.ts:64-74`, tested
by the cached `(S2, E2)` in "An unavailable verifier degrades the remaining pairs"); fail-closed parsing
(`semantic.ts:113-123`); the LRU (`verification-cache.ts:57-69`); nothing logged.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `reports/2026-10-15-show-spec-working.md` "Not demonstrated"; `reports/2026-10-15-11-manual-interface-testing.md:13-20`; `packages/adapters/llm/src/openai-compatible-llm.ts:76-80`; `packages/core/src/verify/semantic.ts:113-123` | No real model has ever received `VERIFY_SYSTEM_PROMPT`. Step 11 and show-spec-working both use a scratchpad stub that picks its verdict by path, not by reading the prompt. Task 11.2 allowed the stub only "if Ollama cannot run"; the report says the author *chose* it. The adapter sends no `response_format`, and the parser accepts only bare JSON. A model that wraps its answer in a code fence or adds a sentence gets `invalid-output` on every pair. | The change exists to turn supported citations into `entailed`. Failing closed means a wrong verifier is never unsafe. But nothing shows the feature does anything with a real verifier: it could leave every `ask` all-`INFERENCE` and flood stderr with `entailment_unverified`. Even one real-model run would settle it. |
| Minor | `tests/integration/cli/ask-command.spec.ts:276-279` | An existing test was narrowed: it now samples DB sessions only for `purpose === 'answer'`. Design S10 justifies this ("its subject is the answer"). But the up to 200 sequential `verify` calls also happen with the pool open, between `findClaimsOverlapping` and `saveClaims`, and no test now checks that no transaction is held during them. | A future change that opens a transaction before verification would hold it across N model timeouts, and no test would catch it. Removing the filter (or adding a second sample on `verify`) costs nothing. |
| Minor | `tests/unit/verify/semantic.spec.ts:280-294` | "A changed statement or excerpt misses the cache" changes the statement, the excerpt and `endLine`. The requirement (spec lines 157-161) also names the path, `startLine` and the truncation mark. None of those three is tested to change the key. | Hashing the whole request covers them today. A refactor that keys a hand-built tuple instead would pass the suite while letting a cut and an uncut span share a verdict. |
| Minor | `tests/unit/verify/verify-answer.spec.ts:178-183` | The pair-order test builds its expected requests with the production `buildVerifyMessages`. | It restates the implementation, so a bug in `buildVerifyMessages` cannot fail it. The literal assertion in `semantic.spec.ts:120-128` partly makes up for this; the gap is only in the `verifyAnswer` → pair mapping (e.g. `truncationMark` from `truncation.mark`), which line 183 checks once with `toContain`. |
| Minor | `packages/core/src/explain/prior-claims.ts:17-19`; `design.md` "Migration Plan" | Claims stored before DIS-70 keep `statementType: 'FACT'` in their provenance. They were only checked syntactically, yet they still show as `[FACT]` prior claims. No scenario covers this. | After this change, a `[FACT]` label means "every citation entailed", except on old rows. Local and dev data only today, but the meaning of `FACT` is now inconsistent until those rows are rewritten or relabelled. |
| Minor | `design.md:276-278`; `packages/core/src/verify/semantic.ts:62-95` | No per-answer cap on `verify` calls. Each answer can make up to 200 calls of up to ~8 000 characters each. The daily budget reads spend that nothing writes until DIS-74, so it cannot stop them today. | Real spend and latency per `ask` are unbounded in practice until DIS-74 records `cost_usd`. Design names the risk; there is no tracked follow-up. |
| Minor | `.claude/sdd-harness.env:50` (uncommitted) | The working tree has `KIT_PROTECT_SPECS="0"`; the file says "do not commit it as 0". `tests/support/sample-graph.ts` shows as modified with no content diff (line endings or mode). | The 15.4 fixes will be made with spec/test protection off, and a careless `git add -A` would commit both files. |
| Question | `git log` of `openspec/changes/evidence-verifier-semantic/specs` | Specs and code were committed 8 seconds apart (`c2a8eb9` code 16:09:52, `4171364` specs 16:10:00). Git cannot show that the specs came first or were not edited to match the code. The spec-audit report is the only evidence. | Recommend attesting, in the 15.4 addendum, that the specs were not edited after the step 9 RED. |
| Question | `packages/adapters/llm/src/config.ts:90`; `verification-cache.ts:5-8` | When `LLM_MODEL_VERIFY` is unset, the answer model checks its own statements. The model is deliberately left out of the cache key (D2), so verdicts given by one verifier survive a model switch in a long-lived process. | Is self-verification with the same model acceptable for D1's `FACT` guarantee? If so, record it as a D; if not, warn when the two models are equal. |
| Minor (U1–U4, from verify-against-spec) | `semantic.ts:54` (`costTable`), `verify/index.ts:1-3` (`buildVerifyMessages`, `verificationKey`, `MAX_VERIFICATION_CACHE_ENTRIES` now public), `verify-prompt.ts:16` (strictness sentence), `verification-cache.ts:52` (message) | Confirmed real. None changes observable behaviour beyond the spec, except the prompt's strictness sentence: it narrows "supports" to "the evidence alone shows" (accepted as Q1/D5 in design S13 but not written into the requirement). | Fold the prompt wording into the requirement text (A, `/opsx:update`) or record it as D. |

## Evidence quality

Most important test: `tests/unit/explain/explain-verification.spec.ts` → "A valid but irrelevant
citation is cited and never a fact". It would fail if:

- `every` became `some` in `policy.ts:50`: S2 would be `entailed`/`FACT`-eligible;
- the regrouping offset in `verify-answer.ts:99` were off by one: S2's rows would no longer be
  `entailed` then `cited`;
- `applyEntailment` trusted the input `type` instead of re-running `typeStatement`: S1 is an `anchor`
  span and must still become `INFERENCE`.

`semantic.spec.ts` "Only a conforming output entails" would fail if `z.strictObject` became `z.object`
(the `"why"` output would entail) or if `>` became `>=` at `semantic.ts:114` (the 1 024-byte output
would be rejected). "The usage counts only the verifier's resolved calls" would fail if `calls++`
moved after the parse (the `yes` call would not count). Mutation score `verify/` 97.06, CI run
38749021316.

Existing tests edited: `cited` → `entailed` and request counts that now include `verify` (design S10,
caused by the double's default verifier). These edits are justified, except the narrowing in
`ask-command.spec.ts` above.

## Verdict

PASS WITH GAPS — no Blocker. One Major (no real-model evidence) must be either fixed (A) or
explicitly accepted (D) before archiving; the Minors need destinations.

## Recommended next steps before archiving

1. Major (real model): A. Run one `ask` over acme-shop with a real verifier (Ollama `qwen2.5-coder`
   or the author's chosen model) and add the result as an addendum to the show-spec-working report,
   showing at least one `entailed` row or the `invalid-output` rate. If the model fences its JSON,
   decide in this change whether to strip one code fence (spec + TDD) or record D. If the author will
   not run it, D with the reason in `design.md` Follow-ups.
2. Integration-test narrowing: A. Also sample sessions on `verify` requests in
   `ask-command.spec.ts:276-279`.
3. Cache-key coverage (path, `startLine`, truncation mark): A. Three more cases in "A changed
   statement or excerpt misses the cache"; no spec change.
4. `verify-answer.spec.ts` self-referential expectation: A or C. A literal expectation for one cut pair.
5. Legacy `FACT` prior claims, and the missing per-answer cap on `verify` calls: B on DIS-74 for the
   cap/spend (Spanish comment + Follow-ups line). Put the legacy rows on the single `Deuda:
   evidence-verifier-semantic` checklist (C), or D if dev data only.
6. Self-verification when `LLM_MODEL_VERIFY` is unset, and the prompt-strictness wording (U3):
   answer the Question. Then D in design/spec, or A via `/opsx:update` to state the strictness in the
   requirement.
7. Process (not a Linear issue): restore `KIT_PROTECT_SPECS="1"` before committing the fixes. Do not
   stage `.claude/sdd-harness.env` or `tests/support/sample-graph.ts`. Attest in the 15.4 addendum
   that the specs were not edited after RED.

## Addendum — destinations (15.4)

Every finding has its destination in `design.md` → Follow-ups. The Major is A: a real verifier
(`qwen2.5-coder` on Ollama, CPU) ran through the real `ask`, with `entailed` and `cited` rows and the
real usage (addendum of `2026-10-15-show-spec-working.md`); its follow-up observation (`llama3.2` puts
prose before the JSON) is D, strict parse kept by the author. The Minors on tests are A (pool test
samples every model call, three more cache-key cases, one literal pair in `verify-answer.spec.ts`);
the per-answer cap is B (DIS-74, comment posted); the legacy `FACT` claims and the process notes are D;
the self-verification question is D, stated in the spec. After the fixes the suite and the gates are
green (98 files, 1276 tests).
