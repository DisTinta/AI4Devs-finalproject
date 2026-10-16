# Architecture Decision Records

Decisions that affect more than one module or cost more than a day to revert. New records follow
[`_template.md`](./_template.md) and are named `YYYYMMDD-<slug>.md`.

| Date | Record | Status |
|---|---|---|
| 2026-09-28 | [Edge endpoints as two nullable foreign-key pairs with an exactly-one CHECK](./20260928-edge-endpoints-as-fk-pairs.md) | Accepted |
| 2026-09-28 | [node-pg-migrate with plain SQL migrations](./20260928-node-pg-migrate-sql-migrations.md) | Accepted |
| 2026-10-02 | [PHP parsing: `web-tree-sitter` (WASM) over native `tree-sitter`, and trait → `class` encoding](./20261002-php-parser-web-tree-sitter.md) | Accepted |
| 2026-10-11 | [Span text is read from git at the project's indexed commit](./20261011-span-text-read-from-git-at-indexed-commit.md) | Accepted |
| 2026-10-13 | [A `FACT` statement is stored as an `L2` `INFERENCE` claim that keeps its type in the provenance](./20261013-fact-statements-stored-as-l2-inference.md) | Accepted |
| 2026-10-14 | [A `broken` citation is neither stored nor shown; it only leaves an `evidence_broken` event](./20261014-broken-citations-not-stored.md) | Accepted |
| 2026-10-16 | [The API runs on Fastify 5 with Zod as its single schema language, through its own compilers](./20261016-fastify-5-and-zod-json-schema.md) | Accepted |
