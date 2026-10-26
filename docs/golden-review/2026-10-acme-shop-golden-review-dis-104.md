# Review of the regenerated acme-shop golden answers (DIS-104, October 2026)

**Ticket:** DIS-104. **Reviewer:** `agent:claude-sonnet-5-5`, 2026-10-26, in an autonomous run (no author
present). **Why they were regenerated:** `packages/core/src/explain/prompt.ts` is an input of the answer
fingerprint, and DIS-104 changed it (a Spanish question gets a Spanish system message), so
`seeds/cache/acme-shop.json` was out of date and `npm run verify` failed with `FINGERPRINT_MISMATCH`
(ADR `20261017-stale-fingerprint-fails-verify`). `npm run cache:build` ran on the local Ollama
(`qwen2.5-coder` for answer and verification, pure CPU, `OLLAMA_CONTEXT_LENGTH=16384`): Q1 570 s, Q3 268 s,
Q4 86 s on the second attempt (the first was `no-evidence` and was not kept). This replaces the three
answers reviewed in DIS-34 (`2026-10-acme-shop-golden-review.md`), and their reviews (the author's
signatures included) were reset by the regeneration, as the format says. Each new entry carries the
agent's review and needs the author's.

Checked against the code at the pack commit (`fixtures/acme-shop`), as in DIS-34: every statement true or
false, every evidence a cited span of an existing file, FACT only where the code states it.

| Golden | Verdict | Notes |
|---|---|---|
| Q1 | correct, one language slip | The answer and the statements are in Spanish and true: the subtotal is the sum of the lines (`Order::getSubtotalAttribute`), the discount comes before the tax (`PriceCalculator::compute`), `PriceCalculator` integrates the discount, tax and shipping services (the only FACT, right). The word «descuadernado» (for «descontado») is a slip of the model, not a false claim. |
| Q3 | doubtful | The answer («Los cupones se validan en el servicio CouponValidator») is true. The FACT says `percentFor` «verifica si un código de cupón es válido»: loose (it returns the percentage, `0.0` when the code is missing, unknown, inactive or expired). The INFERENCE says `isRedeemable` decides if a coupon is «redistribuible»: the word is wrong («canjeable»), the meaning is close. Kept; it is in the author's sample. |
| Q4 | correct | `created` dispatches `RecalculateTotals` and fires `OrderPlaced` (`OrderObserver.php:14-28`): both FACT statements are true. Statements end with «(E1)», a leftover of the prompt id. |

Not a regression: all three are in Spanish (the previous Q1 mixed languages). The model is the same 7B
one, so the quality limits of DIS-34 stay (whole-class evidence, systematic under-typing, loose wording).

**Sample for the author to sign:** Q3 (doubtful), Q1 and Q4 (all three: the set is small). The author adds
`{"by": "<author>", "date": "YYYY-MM-DD"}` next to the agent's review in each entry. If the author rejects
one, `npm run cache:build -- <id>` regenerates it alone while the fingerprints stay as they are.
