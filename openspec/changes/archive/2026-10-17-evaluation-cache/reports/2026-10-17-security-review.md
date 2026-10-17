# Security Review — evaluation-cache (DIS-21)

- Date: 2026-10-17
- Change: evaluation-cache (DIS-21)
- Reviewer: the agent, following `.claude/agents/security-reviewer.md` inline (read-only), because the
  diff touches an HTTP input (`useCache` of `POST /api/projects/{projectId}/ask`).
- Diff: `git diff origin/feature/entrega-2-CRN...HEAD` at `5c6a60b` (19 source files under `packages/`).

## Scope reviewed

`packages/api/src/schemas/ask.ts`, `packages/api/src/routes/ask.ts`,
`packages/adapters/store-postgres/src/postgres-store.ts`, `packages/adapters/store-postgres/src/queries.ts`,
`packages/core/src/cache/{normalize,response-cache}.ts`, `packages/core/src/knowledge/{cache-entry,errors}.ts`,
`packages/core/src/ports/StorePort.ts`, `packages/core/src/explain/{explain,explain-event,explain-request}.ts`.

## Checklist

| Severity | Check | Result |
|---|---|---|
| High | Secrets, tokens, keys or passwords in plain text | none in the diff (the test pool URL is credential-free since `12c65eb`) |
| High | New routes or entry points without the project's auth middleware | no new route; `/ask` gains one optional field. The API has no authentication by design and listens on `127.0.0.1` by default (readme, `HOST`) |
| High | Missing authorisation / resource ownership | every cache statement is scoped by `project_id`; `touchCacheEntry` updates only `WHERE id = $2 AND project_id = $1`; `invalidateCache` deletes only the project's rows; the lookup starts from the project row |
| High | External input reaching core without validation | `useCache` is `z.boolean().optional()` inside `z.strictObject` at the route and again in `explainRequestSchema`; a non-boolean answers 400 `VALIDATION_ERROR` before the store (demonstrated in `2026-10-17-show-spec-working.md` E3) |
| High | Mass assignment | the route forwards named fields only (`projectId`, `question`, `tokenBudget`, `useCache`) |
| High | Queries built by concatenation or interpolation | none: the six new statements are constants with `$n` parameters; the advisory-lock key is built inside SQL from parameters (`$1::uuid::text \|\| ':' \|\| $2::text`) |
| High | Sensitive data in the response | a hit returns the same fields a live answer returns (answer, statements, evidence excerpts of the indexed project, prior claims, usage); the stored response is re-validated with a strict schema on read, so extra columns or keys never reach the client |
| Medium | Error messages leaking internal structure | `CacheWriteFailed` has fixed text and no `cause`; `InvalidStoreQuery` messages never hold the key; `answer_not_cached` carries a code only; a malformed stored response is a silent miss |
| Medium | Listing endpoints without pagination | none added |
| Medium | New dependencies | none (`package.json` / `package-lock.json` unchanged) |
| Medium | Personal data sent to a third party | a hit sends nothing to the model; the cache key (normalized question) is stored only in `cache_entry.question_normalized`, never logged |
| Low | Logs including the full request body | the route logs event codes only (unchanged); the new event `answer_not_cached` carries a code only |
| Low | Missing rate limiting on public endpoints | unchanged by this change; `useCache: false` reaches the model like any uncached question and stays under the existing daily LLM budget ceiling (`429 BUDGET_EXHAUSTED`, demonstrated in E5) |

## Findings

| Severity | file:line | Finding | Proposed fix / destination |
|---|---|---|---|
| Low (informational) | `packages/core/src/explain/explain.ts` (`finish`) | Any caller of `/ask` with a live model can replace a project's cached answer by asking the same question with `useCache: false` (the spec's intended behaviour: "the new answer still replaces the cached one"). Only answers that passed the pipeline (stored claims, every statement `current`) or a `no-evidence` `UNKNOWN` are saved, and the key is derived from the question's words, so a prompt-injection payload changes the key rather than overwriting another question's entry. With no authentication in the project, this is the same trust level as every other write of `/ask` (claims, `query_log`). | No change. **D** — accepted risk, recorded in `design.md` → Follow-ups; protecting golden entries from replacement belongs to DIS-26 if it needs it. |

No High or Medium finding.

## Verdict

**PASS** — no Blocker or Major security finding; one Low informational item, accepted (D).
