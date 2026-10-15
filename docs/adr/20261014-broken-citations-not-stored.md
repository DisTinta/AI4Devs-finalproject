# A `broken` citation is neither stored nor shown; it only leaves an `evidence_broken` event

## Status
Accepted

## Context and problem
The syntactic verifier (DIS-68, CM-HU-10.1) checks every citation of an `explain` answer against the
code at the pack's commit: the file exists, the range fits in it, and the frozen `excerpt` equals the
redacted text of those lines. A citation that fails is `broken`, which `readme.md` §3.2 defines as a
system failure. A statement can cite several spans, so it can be left with some `broken` citations
and some valid ones. The `evidence` table already accepts `verification = 'broken'`
(`0002_history-claims`), and the verifier task in `readme.md` (task 6) says «Persistir el resultado en
`EVIDENCE.verification`; registrar los `broken` como fallo del sistema con alerta en el log». Every
later reader of `evidence` would have to deal with what is decided here: the answer, the prior claims
that `findClaimsOverlapping` returns to later answers, DIS-70 (semantic verification) and DIS-42
(lazy recomputation of stale claims). Decided by the author while refining DIS-68, decision D2,
on 2026-10-14.

## Options considered
* **Neither stored nor shown**: the statement keeps only its valid citations and is retyped with them;
  the `broken` citation only leaves the `evidence_broken` event in the log.
* **Stored as `broken`, not shown**: the `evidence` row is written with `verification = 'broken'` as a
  trace in the database (readme task 6); `findClaimsOverlapping` would have to filter those rows, or
  prior claims would show them.
* **Stored and shown, marked**: the answer carries the citation with `verification: 'broken'`; most
  transparent, with more changes to the answer and the CLI.

## Decision
We choose **neither stored nor shown**, the option the author chose among the three on 2026-10-14,
for these reasons:
* The statement stays with the citations that support it, and is retyped with them.
* The `broken` citation leaves the `evidence_broken` event in the log, which is where a system
  failure is reported.
* Prior claims never return `broken` citations, so no reader of `evidence` has to filter them.

## Consequences
* **Departs from readme task 6**: `broken` is never persisted in `evidence.verification`. The enum
  value stays in the schema but `explain` never writes it; the only trace of a broken citation is the
  `evidence_broken` event (written at `error` level by the CLI), which is not persisted (no
  `AuditPort`, PH-09).
* A statement whose citations are all `broken` disappears from the answer and is not stored; when no
  statement is left, `explain` answers `UNKNOWN (broken-evidence)` (DIS-68 D4).
* Retyping with the remaining spans can only keep or raise the guarantee of the evidence shown: a
  statement typed `INFERENCE` because of a `broken` heuristic span may become `FACT`.
* `findClaimsOverlapping`, `PriorClaim` and the CLI need no change for this decision.
* A later need to audit broken citations over time (a dashboard, a rate in Tabla 1) has no stored
  data to read; it would need persisted events or this decision revisited.
