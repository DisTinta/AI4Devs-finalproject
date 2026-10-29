# Show spec working: index-endpoint (DIS-9)

- Date: 2026-10-29
- Branch: `feature/dis-9-index-endpoint` at `52f8b4f` (after the DIS-9 golden review round)
- Interface: the real API over HTTP (`curl`, Git Bash), against the local Postgres seeded by
  `npm run db:seed`. The full error matrix (403 `FORBIDDEN_PATH`, 403 `INDEXING_DISABLED`, 429, empty
  JSON body) was exercised in step 11 and is reused here
  (`./2026-10-29-11-manual-interface-testing.md`).

*Agent's text: run by the agent, without the author.*

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| http-index: A request without a body is a full reindex; A reindex answers 202 and invalidates the cache | `POST /api/projects/<acme-shop>/index`, no body | 202, `mode` `full`, `filesQueued` 53, `cacheEntriesInvalidated` 3, 0.94 s | yes | below |
| http-index: A body with a path or a language answers VALIDATION_ERROR without indexing | the same with `{"rootPath":"/tmp/x"}` | 400 `VALIDATION_ERROR`, `unrecognized_keys`, the value not echoed | yes | below |
| http-index: An unknown project answers PROJECT_NOT_FOUND | random UUID | 404 `PROJECT_NOT_FOUND`, `details` `{}` | yes | below |
| repository-indexing: A reindex saves over the stored project and then invalidates its cache | `/ask` of a golden question before and after the reindex | before: the signed golden answer, `cacheHit: true`; after: `UNKNOWN`, `llm-required` (evaluation mode) | yes | below |
| http-index: The document lists index | `GET /docs/json` | lists `/api/projects/{projectId}/index` | yes | below |
| golden-answers: the signed golden answers are served and match | `npm run verify`, no `LLM_*` | `acme-shop: 3/3`, `task-api: 3/3`, exit 0 | yes | below |

## Evidence

Server: `npm -w packages/api run dev` with, for that command only, `ALLOWED_REPOS_DIR` = the
repository's absolute `fixtures` directory, `AUTHOR_HASH_SALT=show-spec-salt` and empty `LLM_*`;
`GET /health` → `{"status":"ok"}`. acme-shop id `a794456d-6d1b-5b55-a360-13fec83dc7bc`.

```
--- ask (before)
"answer":"El precio final de un pedido se calcula en `App\\Services\\P
"cacheHit":true
--- index (no body)
{"projectId":"a794456d-6d1b-5b55-a360-13fec83dc7bc","mode":"full","analyzer":"php-treesitter-laravel","indexedCommit":"4f028db4d51a3321031f3a24b3f36240410ed38c","filesQueued":53,"filesSkipped":0,"cacheEntriesInvalidated":3} HTTP 202 0.938807s
--- index rootPath
{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":[],"code":"unrecognized_keys","message":"Unrecognized key: \"rootPath\""}]}}} HTTP 400
--- index unknown
{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}} HTTP 404
--- ask (after)
"answer":"UNKNOWN
"reason":"llm-required"
--- docs
"/api/projects/{projectId}/index"
```

No screenshots: the change has no browser UI.

## State

- Before: database seeded (`2 projects loaded`), acme-shop at its seed snapshot with its 3 golden
  cache entries.
- After the demo: acme-shop reindexed from `fixtures/acme-shop` (same commit `4f028db4…`), its cache
  entries invalidated.
- Restored: yes. `node scripts/dev-processes.mjs stop` (1 process tree), `npm run db:seed`
  (`2 projects loaded`), `npm run verify` with empty `LLM_*` (`acme-shop: 3/3`, `task-api: 3/3`);
  `git status --short` shows only the session's own `.claude/sdd-harness.env`.

## Not demonstrated

- The PowerShell check (design Follow-ups E13, destination C): for the author.
- 403, 429 and the empty-JSON-body 400: not repeated here; demonstrated in step 11 on the same code.

**Handoff:** the change is demonstrably working through its real interface. No screenshot was left at
the repository root.
