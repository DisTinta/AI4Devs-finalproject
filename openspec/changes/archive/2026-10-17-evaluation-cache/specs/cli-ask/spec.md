## ADDED Requirements

### Requirement: Ask from the answer cache

The command SHALL print an answer that `explain` serves from the answer cache (`explain`, "Answer
cache") exactly as it prints any answered answer (requirement "Ask answer output") or any `UNKNOWN`
(requirement "Ask UNKNOWN output"), and SHALL exit with `0`; it SHALL add no option and print nothing
that tells a cached answer apart. In evaluation mode a cached question SHALL therefore print its
stored answer instead of `UNKNOWN (llm-required)`, without calling the model and without storing a
claim.

#### Scenario: Evaluation mode prints a cached answer

- **GIVEN** acme-shop seeded with its history built, its answer to
  `¿Cómo se calcula el precio final de un pedido?` saved in the cache by a first `ask` with a live
  model that answers one statement citing only `app/Services/PriceCalculator.php` lines 16–44 and
  accepts every verification, and then neither `LLM_BASE_URL` nor `LLM_API_KEY` set
- **WHEN** `ask acme-shop "como se calcula el precio final de un pedido"` runs
- **THEN** it exits with `0`; stdout is exactly the stdout of the first `ask` (the answer, then
  `1. [FACT] …` followed by `   evidence: app/Services/PriceCalculator.php:16-44`, then the evidence
  section, and no `note:` line); stderr is empty
- **AND** the model is never called, no `claim` row is added, and the entry's `hit_count` is 1
