# Span text is read from git at the project's indexed commit

## Status
Accepted

## Context and problem
The Context Engine (CM-HU-08) sends the model spans of code: a symbol's lines, or a whole file. It
needs their text to count tokens against the budget, to compute `baselineTokens` (what the whole
files would have cost) and to hand the code to `explain` (DIS-39). The database keeps no file
content: `file` stores `content_hash`, `kind` and `loc`, and `symbol` stores `start_line` /
`end_line`. `SourceTreePort` could only read every file at `HEAD` (`readFiles`), for indexing.
A project's `HEAD` and working tree can move after indexing, so text read from them may no longer
match the line numbers the graph stored. Decided by the author while refining DIS-28 (CM-HU-08.2),
decision 1, accepted on 2026-10-10.

## Options considered
* Read each file from git at the project's `indexedCommit`, through a new port method
  `SourceTreePort.readFileAt(root, commit, path)`.
* Store file content in the database at indexing time.
* Read the file from the working tree.

## Decision
We choose **reading each file from git at the project's indexed commit**
(`SourceTreePort.readFileAt(root, commit, path)`) because, in the author's words (Linear DIS-28,
decision 1):

> «La base de datos no guarda contenido, y sin texto no hay ni tokens, ni `baselineTokens`, ni nada
> que pasar a DIS-39. Se añade `SourceTreePort.readFileAt(root, commit, path)`. Al leer en el commit
> indexado, `startLine`/`endLine` casan con el contenido. Descartado: guardar el contenido en la base
> de datos (migración y semilla más grande) y leer el árbol de trabajo (puede no coincidir con lo
> indexado).»

That is:
* Without text there are no tokens, no `baselineTokens` and nothing to hand to DIS-39.
* Reading at the indexed commit keeps `startLine` / `endLine` matching the content.
* Storing content was rejected: it needs a migration and makes the seed larger.
* Reading the working tree was rejected: it may not match what was indexed.

## Consequences
* `SourceTreePort` gains `readFileAt`, implemented in `packages/adapters/git` with `ls-tree` (literal
  pathspecs) and `cat-file blob` through the same isolated launcher as `readFiles`: same 1 MiB limit,
  strict UTF-8, nothing from the repository runs. Its failures are the domain error
  `SourceUnavailable` (`not-indexed`, `not-a-repository`, `missing`, `too-large`, `binary-content`),
  which names the path and never carries content.
* Core redacts each file with `redactSecrets` before cutting spans or counting tokens, the same
  redaction the indexer applies before hashing.
* Building a context pack needs the repository on disk with its `.git`. A deployment without the
  samples' `.git` (a hosted demo) gets `SourceUnavailable`; making `.git` available is a deployment
  concern.
* A history rewritten so that the indexed commit disappears makes every read `missing` until the
  project is reindexed.
* Each distinct candidate file costs a few git processes per pack (root checks, one `ls-tree`, one
  `cat-file`). Batching several files into one `cat-file --batch` is a possible later optimisation
  behind the same port.
* The seed's relative `rootPath` (`fixtures/<name>`) is resolved against a workspace root injected by
  the composition root, never against the process working directory (DIS-28 decision 8).
* `StorePort.readSpan`, planned for DIS-68, has no content to read: DIS-68 should reuse
  `readFileAt`.
