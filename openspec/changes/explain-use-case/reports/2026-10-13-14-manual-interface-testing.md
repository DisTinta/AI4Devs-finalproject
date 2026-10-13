# Manual interface testing of `explain` (DIS-39, step 14)

**Change:** `explain-use-case` · **Date:** 2026-10-13 · **Paths:** the OS user name is masked as `<user>`.

## Why a script

No CLI or HTTP entry point calls `explain` yet (DIS-40, CM-HU-12). It was exercised through a
scratchpad `tsx` script (never committed, deleted after the run) that imports `@codemind/core` and
the real adapters from their sources: the Postgres store on **one transaction rolled back at the
end**, the git source tree, a scripted live `LlmPort` (model name `scripted-manual`) and the
evaluation model built by `createLlm(llmConfigFromEnv({}))`.

## Preconditions and state

| Check | Result |
| --- | --- |
| `fixtures/acme-shop/.git` present | yes (`4f028db docs: project readme`) |
| `SELECT count(*) FROM project` before | 0 (acme-shop not loaded) |
| `npm run db:seed` | `1 project loaded` · `acme-shop  php/laravel  174 nodes · 170 edges` |
| `claim` / `evidence` before the script | 0 / 0 |
| `claim` / `evidence` after the rollback | 0 / 0 |
| Restore | `DELETE FROM project WHERE is_sample AND name = 'acme-shop'` → `DELETE 1`; `project` / `claim` / `evidence` back to 0 / 0 / 0 |
| `git status` after deleting the script | clean |

Commands (Git Bash, from the repository root):

```
export DATABASE_URL=postgres://codemind:<password>@localhost:5432/codemind REPO_ROOT="$(pwd -W)"
npm run db:seed
npx tsx --tsconfig packages/cli/tsconfig.run.json C:/Users/<user>/AppData/Local/Temp/claude/…/scratchpad/manual-explain.mts
```

## Success path (14.2, 14.3)

Q1 `¿Cómo se calcula el precio final de un pedido?` with a model citing the anchor span of
`app/Services/PriceCalculator.php` (16–44) and a `heuristic` span:

```json
{"kind":"answered","persisted":true,"statements":[{"text":"compute calcula el precio final.","type":"FACT","status":"current","verification":"none","evidenceIds":["324bc1c2-…"]},{"text":"Otra pieza interviene en el cálculo.","type":"INFERENCE","status":"current","verification":"none","evidenceIds":["088a872f-…"]}],"evidence":[{"id":"324bc1c2-…","path":"app/Services/PriceCalculator.php","startLine":16,"endLine":44},{"id":"088a872f-…","path":"app/Http/Controllers/CheckoutController.php","startLine":19,"endLine":33}],"priorClaims":0,"events":[]}
```

Rows read back with SQL inside the transaction:

```json
[{"layer":"L2","type":"INFERENCE","status":"current","predicate":"explains","subject":"PriceCalculator","statement_type":"FACT","model":"scripted-manual"},
 {"layer":"L2","type":"INFERENCE","status":"current","predicate":"explains","subject":"CheckoutController::store","statement_type":"INFERENCE","model":"scripted-manual"}]
```

A second ask of Q1 in the same transaction returned both as prior claims, newest first, the `FACT`
one shown as `FACT` (current, no warning).

## UNKNOWN and error paths (14.4)

| Case | Result | Question / span text / model output in it? |
| --- | --- | --- |
| `¿Dónde vive el ornitorrinco?`, live | `UNKNOWN`, `no-anchor` | none |
| same, evaluation | `UNKNOWN`, `no-anchor` | none |
| Q1, evaluation | `UNKNOWN`, `llm-required`, message `evaluation mode (cache-only): set LLM_* to enable free-form asks` | none |
| Output with `"type":"FACT"` | `UNKNOWN`, `invalid-model-output`, one `schema_violation` (`invalid_shape`, issue `statements.0` / `unrecognized_keys`) | none |
| `{"answer":"…","statements":[]}` | `UNKNOWN`, `no-evidence` (the model's answer text absent) | none |
| Question `"   "` | `InvalidExplainRequest`, `field: question`, message `Invalid explain request: question` | none |
| Question of 1 001 characters | same | none |
| Unknown project `00000000-0000-4000-8000-000000000000` | `ProjectNotFound` | none |
| `over-budget` | not reproducible on acme-shop: `DiscountService`, `OrderPricingTest` and `Order` at budget 1000 each had a span that fits (they answered `no-evidence` with the empty script) | — |

`over-budget` is covered by the unit scenario "A pack where nothing fits is unknown over budget"
(spans larger than the minimum budget), since no acme-shop span exceeds 1000 tokens.
