# Review of the acme-shop golden answers (DIS-34, October 2026)

**Ticket:** DIS-34 (CM-HU-13.3), hybrid mode of the autonomous Entrega 2 run (ADR
`20261016-autonomous-workflow-run-entrega-2`). **Reviewer:** `agent:claude-opus-5-5`, 2026-10-17.
**Scope:** every golden answer of `seeds/cache/acme-shop.json`, produced by DIS-26 (`npm run
cache:build`, local Ollama `qwen2.5-coder` for answer and verification). The author signs the sample
listed at the end; this report is the agent's half of the review.

## What was checked, and against what

- **Reference code:** `fixtures/acme-shop` at the pack commit, the seed's `indexed_commit`
  `4f028db4d51a3321031f3a24b3f36240410ed38c` (the HEAD of the rebuilt fixture history). The three
  cited files are byte-identical in the working tree and at that commit
  (`git show 4f028db:<path> | diff - <path>`).
- **Expected answers:** the demo-question table of `fixtures/README.md` (Q1, Q3, Q4) and the code
  itself; the table is a hint, the code is the authority.
- **Per evidence:** `path` exists; `startLine..endLine` of the file is exactly `excerpt` (script
  comparison, not by eye); `fileId` is the seed's `file` row with that path; every `evidenceIds` of
  a statement resolves to an evidence of the entry and every evidence is cited; the excerpt actually
  supports the statement that cites it.
- **Per statement:** true or false against the code; FACT/INFERENCE typing. The system types a
  statement FACT only when every cited span has origin `anchor`/`exact` **and** the verification
  model judged every citation `entailed` (`packages/core/src/verify/policy.ts`); otherwise
  INFERENCE. A FACT the code does not support is an error; an INFERENCE the code states literally
  is under-typing, conservative and not an error.
- **UNKNOWN:** no golden is an `UNKNOWN` answer. Q6 (refunds), the `UNKNOWN` demo question, has no
  golden by design: it answers `UNKNOWN` `no-anchor` before the cache is read (DIS-26 non-goals).
  There is nothing to check under this heading.

## Summary

| Golden | Question | Verdict | Action |
|---|---|---|---|
| Q1 | ¿Cómo se calcula el precio final de un pedido? | correct | reviewed, kept |
| Q3 | ¿Cómo se validan los cupones? | doubtful | reviewed, kept; in the author's sample |
| Q4 (DIS-26 version) | ¿Qué hace OrderObserver al crear un pedido? | **wrong** | regenerated with `npm run cache:build -- Q4` |
| Q4 (regenerated) | same | correct | reviewed, kept |

Every entry now carries `{"by": "agent:claude-opus-5-5", "date": "2026-10-17"}` in its `reviews`
list, the field the golden format reserves for this (`packages/cli/src/cache/golden-file.ts`). No
fingerprint covers `reviews`, and the file still passes `checkGoldenFile`, its canonical render
(`tests/unit/seed/golden-coherence.spec.ts`) and `npm run db:seed`.

## Q1 — ¿Cómo se calcula el precio final de un pedido?

**Verdict: correct.**

Answer: `PriceCalculator::compute()` computes the final price; it takes the subtotal, applies the
discount, adds tax and shipping; discount and tax are applied in that order. This is the reference
behaviour of the fixture (discount **before** tax) and covers every element of the expected answer:
subtotal → discount → tax on the discounted base → shipping.

| # | Statement | Type / verification | Check |
|---|---|---|---|
| 1 | `compute()` of `PriceCalculator` computes the final price of an order | FACT / entailed | True: `PriceCalculator.php:25-35`, returns the total. FACT is right. |
| 2 | First the discount is applied to the subtotal | FACT / entailed | True: lines 28-29 (`discountFor`, then `$taxable = $subtotal->subtract($discount)`). FACT is right. |
| 3 | Then tax is computed on the discounted amount | INFERENCE / cited | True: line 31, `taxFor($order, $taxable)`. The code states it literally: under-typed (the verifier answered `cited`), not an error. |
| 4 | Finally tax and shipping are added to the discounted amount | INFERENCE / cited | True: line 34, `$taxable->add($tax)->add($shipping)`. Under-typed, as statement 3. |

Evidence checked: four evidences, all `app/Services/PriceCalculator.php:16-44` (the whole class),
`fileId` `006db799-…` = the seed's row for that path; the excerpt equals lines 16-44 at the pack
commit; each one contains the lines that support its statement.

Notes, none of which changes the verdict:

- The answer text mixes languages («la tax»).
- Each evidence is the whole class, wider than the statement needs (it includes `taxableBase`); the
  four evidences are the same span. A structural comparison against this golden (DIS-44) should
  compare cited files/symbols, not line ranges.
- It does not say that shipping is also computed on the discounted base (line 32) or mention the
  free-shipping threshold; neither is part of the expected answer.

## Q3 — ¿Cómo se validan los cupones?

**Verdict: doubtful.** Nothing in it is false, but it is a weak reference for the evaluation.

Answer: «Los cupones se validan en el servicio CouponValidator.» One statement:

| # | Statement | Type / verification | Check |
|---|---|---|---|
| 1 | `CouponValidator::isRedeemable($code)` checks whether the code is valid by looking the coupon up in the database and running further checks such as its expiry and its active state | INFERENCE / cited | True only by delegation: `isRedeemable` (lines 35-38) just calls `percentFor($code) > 0.0`; the lookup (`Coupon::query()->find($code)`, line 22, primary key `code` per `app/Models/Coupon.php:19`), the active check (line 24) and the expiry check (line 28) are in `percentFor`. INFERENCE is the right type for a statement that attributes `percentFor`'s logic to `isRedeemable`. |

Evidence checked: one evidence, `app/Services/CouponValidator.php:14-39` (the whole class),
`fileId` `5b05b76b-…` = the seed's row; the excerpt equals lines 14-39 at the pack commit; it
contains every line the statement relies on.

Why doubtful and not correct:

- The expected answer centres on `CouponValidator::percentFor`, the method the pricing chain
  actually calls (`DiscountService.php:37`); `isRedeemable` is called nowhere in the fixture. The
  golden names the wrong entry point.
- It omits that a missing or empty code is rejected (line 18) and that validation yields a
  **percentage**, `0.0` when the coupon is missing, unknown, inactive or expired; «varios controles
  adicionales como…» is vague.
- One single INFERENCE statement: an evaluated answer that is better than this golden would still
  "differ" from it.

Why it was not regenerated: it is not wrong, the hybrid rule of DIS-34 sends doubtful goldens to
the author, and regeneration trades a known, true answer for an unknown one. If the author rejects
it, `npm run cache:build -- Q3` (with the fingerprints unchanged) regenerates it alone; the new entry
comes back with empty `reviews` and must be reviewed again.

## Q4 — ¿Qué hace OrderObserver al crear un pedido?

### DIS-26 version — wrong (replaced)

Answer: «OrderObserver recalculateTotals en el created y updated methods, emitiendo OrderPlaced
evento al crear o Actualizar un pedido.»

| # | Statement | Type / verification | Check |
|---|---|---|---|
| 1 | `created` of OrderObserver: RecalculateTotals is invoked when an order is created (lines 18-19) | FACT / entailed | True (`OrderObserver.php:18`; dispatched as a queued job, not invoked). |
| 2 | `updated` of OrderObserver: RecalculateTotals is invoked when an order is updated (lines 22-23) | INFERENCE / cited | **False as stated**: `updated` dispatches the job only when `status` changed and is `'paid'` (line 24); the line reference is wrong (the dispatch is line 25). Off-topic for a question about creation. |
| 3 | `OrderPlaced` is fired when an order is created, at the end of `created` (lines 19-20) | FACT / entailed | True (line 19). |

The answer text itself is false: it says `OrderPlaced` is emitted on create **or update**; `updated`
fires no event. A reference answer that carries a false claim cannot be the evaluation's ground
truth, so the entry was regenerated (Ollama reachable, recipe of `docs/project-context.md` →
Gotchas → golden answers: pure CPU, `OLLAMA_CONTEXT_LENGTH=16384`, `qwen2.5-coder`; the server was
stopped afterwards).

### First regeneration — discarded

«OrderObserver escucha eventos relacionados con los pedidos y recalculará los totales cuando se cree
un pedido.» (one FACT, 458 s). True, but it leaves out `OrderPlaced`, half of the expected answer. It
was not kept: a second run was cheap with the model warm and could produce a complete answer.

### Second regeneration — correct (kept)

**Verdict: correct.**

Answer: «OrderObserver ejecuta dos acciones principales al crear un pedido: recálcula los totales y
dispara un evento de pedido realizado.» Generated in 55 s (warm model), attempt 1/3; Q1 and Q3
were left byte-identical by the partial run, and the header (seed and answer fingerprints, models)
did not change.

| # | Statement | Type / verification | Check |
|---|---|---|---|
| 1 | OrderObserver recalculates the order's totals | FACT / entailed | True at the level of the statement: `created` dispatches `RecalculateTotals` (line 18), whose `handle()` recomputes the total through the queue (`app/Jobs/RecalculateTotals.php`). FACT is acceptable: the cited lines entail it. |
| 2 | OrderObserver fires an "order placed" event | FACT / entailed | True: `event(new OrderPlaced($order))`, line 19. |

Evidence checked: two evidences, `app/Observers/OrderObserver.php:14-28` (the whole class),
`fileId` `8ab77787-…` = the seed's row; the excerpt equals lines 14-28 at the pack commit.

Notes, none of which changes the verdict: it names neither the job class nor the event class
(«evento de pedido realizado» is `OrderPlaced`); it does not say the recalculation is asynchronous;
statement 1 does not repeat «al crear» (the answer text does); a typo («recálcula»).

## Observations for the evaluation (DIS-44)

- **Under-typing is systematic, over-typing absent.** Two true, literal statements of Q1 are
  INFERENCE because the verification model answered `cited`. No FACT in the reviewed set is
  unsupported. A comparison that counts FACT/INFERENCE should tolerate this direction.
- **Whole-class evidence.** All three goldens cite the whole class of the anchor symbol; line ranges
  are not a useful comparison key, cited paths and symbols are.
- **Reviews are reset by a regeneration.** `cache:build` writes an empty `reviews` list for every
  regenerated entry (and for all of them in a run without ids); after any regeneration the entry
  must be reviewed again.

## Sample for the author to sign

The author adds her own `{"by": "<author>", "date": "YYYY-MM-DD"}` next to the agent's in the
`reviews` list of each golden she signs.

| Golden | Why it is in the sample |
|---|---|
| — | `UNKNOWN` goldens: none exist (Q6 has no golden by design). |
| Q3 | Doubtful (and 2nd in the list). |
| Q4 | Last in the list; also the regenerated entry, never seen by the author. |
| Q1 | First in the list. |

With only three goldens the sample covers the whole set.
