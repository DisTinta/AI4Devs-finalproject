# A `FACT` statement is stored as an `L2` `INFERENCE` claim that keeps its type in the provenance

## Status
Accepted

## Context and problem
`explain` (DIS-39) types every statement of a model answer from the spans it cites (DIS-38's typing
rule): `FACT` when every cited span was reached as an anchor or by exact edges, `INFERENCE` otherwise.
Each statement is then stored as a row of `claim`. The table's columns say two different things:
`layer` is where the claim came from (`L1`, the deterministic indexer; `L2`, the model) and `type` is
what it guarantees. The migration `0002_history-claims` forbids an `L2` `FACT`
(`fact_only_from_l1`), so a `FACT` statement made by the model has no row that holds both its origin
and its type. Every later reader of claims needs both: the answer shows the statement as `FACT`,
DIS-42 recomputes stale claims, DIS-21 caches answers, DIS-68 verifies citations.

## Options considered
* **Promote a `FACT` statement to `L1`**, so the row passes `fact_only_from_l1`.
* **Store it as `L2` `INFERENCE` and keep the statement type in `provenance.statementType`** (a field
  required on `L2` `INFERENCE`, forbidden on `L2` `UNKNOWN` and on `L1`).
* Change the migration to allow an `L2` `FACT`.

## Decision
We choose **`L2` `INFERENCE` with `provenance.statementType`** because, in the author's words
(DIS-39 `[enhanced]`, D1, 2026-10-13): «Sin promoción a `L1`: `layer` indica el origen (`L1` =
indexador determinista) y elegirla para pasar el CHECK `fact_only_from_l1` la deja sin sentido.»
* The row keeps its true origin (`L2`) and the database constraint keeps its meaning: no model output
  is ever an `L1` fact.
* The statement's own type is not lost: the answer shows `FACT`, and a reader of the claim reads it
  from the provenance (a stale claim is never shown as `FACT`, design D11).
* No migration: changing `fact_only_from_l1` would weaken the one database guarantee about model
  output.

## Consequences
* A reader of the `claim` table sees no `L2` row of type `FACT`; the guarantee of a model statement
  lives in `provenance.statementType`. Every reader of claims (DIS-42, DIS-21, DIS-68, DIS-71) must
  read it there.
* **Accepted exception to `docs/backend-standards.md` §5:** the `statementType` rule is checked by the
  domain records (`claimSchema`, three Zod variants) and not by a database `CHECK` (author decision:
  «sin migración; la BD no lo comprueba»). A writer that bypasses `claimSchema` could store a row that
  breaks it; the only writer, `StorePort.saveClaims`, validates every record first.
* Reverting the decision means migrating the stored provenances.
