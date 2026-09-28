# Edge endpoints as two nullable foreign-key pairs with an exactly-one CHECK

## Status
Accepted

## Context and problem
`edge` is the central table of the knowledge graph. `readme.md` §3.1 originally described its
endpoints as `source_id` / `target_id`, each pointing to "SYMBOL or FILE": a call links two symbols,
but an import links two files and a `describes` edge links a document file to a symbol. A single
foreign-key column cannot reference two tables, so the original shape could only be implemented by
dropping referential integrity. The product's premise is that the database itself rejects invalid
graph data ("fails at database level, not only in the application"), and deleting a file or symbol
during a re-index must remove its edges. Decided by the author while planning DIS-11
(`openspec/changes/schema-graph-l1/design.md` D3).

## Options considered
* Two nullable FK pairs per endpoint (`source_symbol_id` / `source_file_id`,
  `target_symbol_id` / `target_file_id`) plus `CHECK (num_nonnulls(...) = 1)` per endpoint.
* Polymorphic `source_id` / `target_id` plus a `source_type` / `target_type` enum, without FKs.
* FK to `symbol` only, representing file-level endpoints with a synthetic per-file symbol.

## Decision
We choose **two nullable FK pairs with an exactly-one CHECK** because:
* Referential integrity and `ON DELETE CASCADE` are enforced by PostgreSQL for both symbol and file
  endpoints; the polymorphic option leaves both to application code.
* It keeps `symbol.kind` to the five values of §3.1; the synthetic-symbol option would add a `file`
  kind that is not a real symbol and would leak into every symbol query.

## Consequences
* `readme.md` §3.1/§3.2 no longer show `source_id` / `target_id`; queries and writers use the four
  endpoint columns.
* DIS-13's traversal indexes, specified as `EDGE(project_id, source_id, kind)` /
  `EDGE(project_id, target_id, kind)`, must be redefined over the four endpoint columns.
* Traversal SQL must read the endpoint from whichever column is set (e.g. `COALESCE`), slightly more
  verbose than a single column.
* Accepted L1 risk: the database does not check that an edge's endpoints belong to the same project
  as `edge.project_id`. The writers (analyzer adapters) own that consistency; a trigger can be added
  in a later migration if needed.
