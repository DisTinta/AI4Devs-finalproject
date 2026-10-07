pending — Entrega 2/3

## Indexing a repository (CLI)

Indexing runs from the CLI, `npm run cli -- index <path> --name <name> --language php` (DIS-86). It
needs three environment variables; plain `npm` scripts do not read `.env`, so export them or use
`make` (which includes and exports `.env`):

| Variable | Required | Meaning |
|---|---|---|
| `ALLOWED_REPOS_DIR` | yes, to index | The only directory repositories are indexed from; `<path>` is absolute inside it or relative to it. Empty or unset disables indexing (fixtures-only mode, exit `1`, `INDEXING_DISABLED`). |
| `AUTHOR_HASH_SALT` | yes | Keys the pseudonymisation of commit authors. Never commit a value; changing it changes every stored `author_hash`. |
| `DATABASE_URL` | yes | PostgreSQL the graph is saved to. Never printed: a refused connection is reported as `DATABASE_UNAVAILABLE`. |

**`ALLOWED_REPOS_DIR` must be writable only by the user that runs Codemind, and must hold only
trusted repositories.** The path is confined lexically and again on its real path before reading,
but git resolves it again when it reads. Someone who can write inside that directory could swap a
directory of a repository path for a link in between, or make git read objects from outside the
directory through a `.git` file (`gitdir:`) or `objects/info/alternates`. Codemind only reads Git
objects and never executes anything from an indexed repository, so the reach is reading another
repository the Codemind user can already read. This residual risk is accepted rather than closed in
code (DIS-86 design D7); revisit it before indexing repositories uploaded by untrusted parties.

Exit codes: `0` success, `1` a domain, configuration or runtime error, `2` a usage error. Errors are
one JSON line on stderr, `{"error":{"code","message","details"}}`; stdout carries only the report.
