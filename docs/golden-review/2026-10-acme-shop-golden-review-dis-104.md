# Review of the regenerated acme-shop golden answers (DIS-104, October 2026)

**Ticket:** DIS-104. **Reviewer:** `agent:claude-opus-5-5`, 2026-10-27, in an autonomous run (no author
present). **Why they were regenerated:** `packages/core/src/explain/prompt.ts` is an input of the answer
fingerprint, and DIS-104 changed it (a Spanish question gets a Spanish system message); the pre-merge
review then added `packages/core/src/explain/question-language.ts`, which chooses that message, to the
fingerprint inputs (design Follow-ups V1). Each change left `seeds/cache/acme-shop.json` out of date and
`npm run verify` failing with `FINGERPRINT_MISMATCH` (ADR `20261017-stale-fingerprint-fails-verify`).

Two regenerations, on the local Ollama (`qwen2.5-coder` for answer and verification, pure CPU,
`OLLAMA_CONTEXT_LENGTH=16384`):

- 2026-10-26, after the `prompt.ts` change: reviewed by `agent:claude-sonnet-5-5` (Q1 correct with a
  language slip, Q3 doubtful, Q4 correct). Superseded by the next one; it replaced the DIS-34 answers
  (`2026-10-acme-shop-golden-review.md`), whose reviews and the author's signatures the regeneration reset.
- 2026-10-27, after V1 (`npm run cache:build`, all three): Q1 678 s, Q3 251 s, Q4 530 s, each at its first
  attempt. These are the answers in the file. A second build of Q1 alone (`npm run cache:build -- Q1`,
  667 s) gave an answer whose evidence was all relevant but that called the discount «reembolsación» (a
  refund) in the answer and in a statement; the agent kept the first Q1, whose text is right, and
  discarded the second.

Checked against the code at the pack commit (`fixtures/acme-shop`), as in DIS-34: every statement true or
false, every evidence a cited span of an existing file, FACT only where the code states it.

| Golden | Verdict | Notes |
|---|---|---|
| Q1 | doubtful | Spanish and true in substance: `PriceCalculator::compute` computes the final price (FACT, right); the discount is applied to the subtotal with `DiscountService::discountFor` (FACT, right, `PriceCalculator.php:16-44`); tax on the discounted base with `TaxService::taxFor`, shipping with `ShippingService::shippingFor`, total = taxable + tax + shipping (INFERENCE, true). Two flaws: the shipping statement cites `tests/Unit/DiscountServiceTest.php:44-56` and `app/Listeners/RecordDiscountAudit.php:16-22`, which do not back it (it stays INFERENCE, `cited`, «sin verificar» in the web), and «monto exensible» is a slip for «base imponible». 7 statements, 9 evidence entries, confidence 0.71. |
| Q3 | correct | «Los cupones se validan en el servicio CouponValidator.» One INFERENCE: `isRedeemable` checks whether a coupon code is valid, true (`percentFor($code) > 0.0`, which is `0.0` for a missing, unknown, inactive or expired code; `CouponValidator.php:14-39`). Short: it does not describe the checks. |
| Q4 | correct, loose wording | `created` dispatches `RecalculateTotals` and fires `OrderPlaced` (`OrderObserver.php:14-28`): the four statements are true (one FACT, right). The answer calls both «eventos», but `RecalculateTotals` is a job; «OrderPlaced emite un evento que puede ser escuchado» cites `SendOrderConfirmation`, which does listen to it. |

All three are in Spanish. The model is the same 7B one, so the quality limits of DIS-34 stay (whole-class
evidence, systematic under-typing, loose wording).

**Sample for the author to sign:** Q1 (doubtful), Q3 and Q4 (all three: the set is small). The author adds
`{"by": "<author>", "date": "YYYY-MM-DD"}` next to the agent's review in each entry's `reviews`. If the
author rejects one, `npm run cache:build -- <id>` regenerates it alone while the fingerprints stay as they
are (handed off on DIS-104, design Follow-ups V7).
