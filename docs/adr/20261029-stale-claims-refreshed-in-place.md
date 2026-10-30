# A stale claim is refreshed in its own row, and no previous version is kept

## Status
Accepted

## Context and problem
The trigger of migration `0003_indexes-stale` turns a `current` claim `stale` whenever the content of
a file its evidence cites changes, and nothing turns it back: the answer only shows it with
`warning: 'stale-evidence'`, never as `FACT`. DIS-42 makes the first answered question that reaches a
stale claim re-infer it against the current code (one `answer` call per claim over the pack's spans
that overlap its evidence, then the quarantine, the typing and the two-level verification of an
answer) and write the result back. The write has to decide what a refreshed claim *is*: the same row
brought up to date, or a new row next to the old one. The ticket's definition of done reads «deja
`status = 'current'` con `provenance` nueva», and the claim is shown to the user with its id.

*Agent's text: this record was written by the agent of the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author.*

## Options considered
* **Rewrite the claim in its own row** (same id, same `created_at`): subject, predicate, object,
  layer, type, confidence and provenance replaced, status `current`, `updated_at` set to the write,
  the evidence rows deleted and inserted again with new ids.
* **Insert a new claim and leave the stale one as it is**, optionally marking it superseded.
* **Insert a new claim and keep the old one as history** (a `claim_history` table or a version
  column).

## Decision
We choose **to rewrite the claim in its own row, and to keep no previous version**, because:
* The ticket asks for exactly that outcome (the same claim `current` with a new provenance), and a
  consumer that holds the claim's id keeps pointing at the live claim.
* A second row would leave the stale one in the retrieval order, so every later question would read
  both, show the stale one again and pay for refreshing it again; it would also need a status the
  schema does not have.
* The write is conditional and atomic: under the project lock and a row lock it happens only while
  the claim is still `stale` and the commit the evidence was read at is still the indexed one, so a
  second concurrent refresh finds a `current` claim and writes nothing, and a refresh of code that was
  re-indexed meanwhile is reported as `superseded`. `created_at` is kept, so the claim keeps its place
  in the newest-first retrieval order; `updated_at` records the refresh.
* No migration is needed: `updated_at` and the partial index `claim_stale_idx` already exist, and
  nothing in the schema forbids moving a claim back to `current`.

## Consequences
* There is no audit trail of what a claim said before its refresh: the previous object, provenance
  and evidence are overwritten. Accepted knowingly (design P10, destination D). A later history table or
  versioned claims would need a migration and a backfill of the claims refreshed until then, which is why
  this is recorded as a decision that is costly to reverse.
* A cached answer that holds a stale prior claim is not rewritten by a refresh: its entry is
  invalidated by the next re-index (DIS-9), and any other question that reaches the claim refreshes it.
* `StorePort` gains `refreshClaim(projectId, claimId, item, readAtCommit)`; every implementation of the
  port (the Postgres adapter, the in-memory double) must honour the same conditions.
* A refreshed claim's evidence ids change; no document stores them outside the answer that returned
  them.
* The store adapter and `packages/core/src/knowledge` are inputs of the seed fingerprint, so the change
  regenerates the seed and the golden answers and goes through a new golden review round (DIS-42).
