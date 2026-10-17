# Security Review Report

- Date: 2026-10-17
- Change: golden-cache-build (DIS-26)
- Why it ran: the diff handles secrets (`DATABASE_URL`, `LLM_API_KEY`, the planted AWS-shaped key of
  the samples) and adds an outbound HTTP client (`longFetch`). It adds no HTTP route, no rate limit
  and no personal data.
- How: the checklist of `.claude/agents/security-reviewer.md` (High → Low), applied by the agent of
  the pre-merge step over `git diff origin/feature/entrega-2-CRN...HEAD` (the run has no sub-agent
  launcher, so the agent's checklist was followed in place). Read-only; no file was changed by it.

| Severity | File:line | Finding | Proposed fix |
|---|---|---|---|
| — | — | No High, Medium or Low finding. | — |

## What was checked

- **Secrets in plain text.** `seeds/cache/acme-shop.json` holds no URL, absolute path, user name or
  key (`grep` for `https?://`, drive letters, `/Users/`, `/home/`, `AKIA`, `password`, `secret`,
  `token`: none). The only new secret-shaped literal is the synthetic `AKIAABCDEFGHIJKLMNOP` of the
  unsafe-content scenario, allow-listed in `.gitleaks.toml` by an exact regex; the tests build it by
  concatenation. `gitleaks dir openspec/changes/golden-cache-build --config .gitleaks.toml --redact`
  → no leaks; the step 12 report records `gitleaks dir .` and `gitleaks git` over the branch, clean.
- **Secrets reaching a versioned file.** `isUnsafe` (`packages/cli/src/cache-build.ts:338-345`)
  refuses, before the write, a response holding the key pattern, either root (native and `/` form),
  `DATABASE_URL`, `LLM_BASE_URL` or `LLM_API_KEY`, raw or JSON-escaped; tested in
  `tests/unit/cli/cache-build.spec.ts:468` and the integration scenario "A question without a
  cacheable answer fails without writing".
- **Entry points and authorisation.** Two development commands (`npm run cache:build`,
  `npm run db:seed`); no new route. The API serves golden entries through the existing answer cache
  path, unchanged.
- **Validation of external input.** Arguments: closed list of ids. Environment: trimmed, typed, range
  checked, before any I/O. Golden files read by `db:seed`: a strict Zod schema plus
  `parseStoredResponse` and the name/project/key checks, before connecting.
- **Queries.** No new SQL: the golden saves use the store's `saveCacheEntry` (parameterised); the
  seed's statements are executed by the existing `loadSeed` after the existing seed checks.
- **Sensitive data in outputs.** Every error line is `{"error":{code,message,details}}` with no URL,
  credential, absolute path or answer text; an unexpected error is `INTERNAL` with a fixed message.
  Exercised for real with `postgres://u:s3cret@127.0.0.1:1/db` and `LLM_API_KEY=k3y` (no leak).
- **Outbound HTTP (`packages/cli/src/cache/long-fetch.ts`).** Sends the authorisation header only to
  the configured base URL; never follows a redirect; TLS verification left on (`node:https`
  defaults); the caller's `AbortSignal` is the only limit (the build's per-request limit). The body is
  read whole into memory with no size cap, like Node's `fetch`; the endpoint is the author's own model
  server, so this is not a finding.
- **Dependencies.** Only `zod` `^4.6.5` added to `@codemind/cli`, already used by `@codemind/core`
  and `@codemind/api` (no new package in `package-lock.json`).
- **Logs.** The build logs nothing beyond its attempt and final lines; no request body is logged.
