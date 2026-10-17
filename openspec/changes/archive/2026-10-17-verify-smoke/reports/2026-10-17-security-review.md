# Security Review Report

- Date: 2026-10-17
- Change: verify-smoke (DIS-44)
- Why it ran: the diff handles a secret (`DATABASE_URL` and its credentials, which no output may
  carry), adds a CI job with its own database credentials and adds a dependency (`yaml`). It adds no
  HTTP route, no rate limit and no personal data.
- How: the checklist of `.claude/agents/security-reviewer.md` (High → Low), applied by the agent of
  the pre-merge step over `git diff origin/feature/entrega-2-CRN...HEAD` (the run has no sub-agent
  launcher, so the agent's checklist was followed in place). Read-only; no file was changed by it.

| Severity | File:line | Finding | Proposed fix |
|---|---|---|---|
| — | — | No High, Medium or Low finding. | — |

## What was checked

- **Secrets in plain text.** `gitleaks git --log-opts="origin/feature/entrega-2-CRN..HEAD" --config
  .gitleaks.toml --redact` → 13 commits scanned, no leaks; `gitleaks dir
  openspec/changes/verify-smoke` → no leaks. The only credential-shaped literals added are the CI
  service's throw-away `postgres:postgres` (same pattern as the existing `quality` job, a container
  that lives for the job) and the test probes `s3cret` / `k3y`, asserted to be absent from every
  output.
- **Secrets reaching an output.** `runVerify` reads only `DATABASE_URL` (`packages/cli/src/verify.ts:97`)
  and hands it to the shared opener; every failure is printed by `toFailure` as
  `{"error":{code,message,details}}` with fixed messages; an unexpected error is `INTERNAL` with the
  fixed `verify failed; the database is unchanged` and `details` `{}` (the driver's message never
  reaches the line). Exercised for real (`2026-10-17-show-spec-working.md` E1, E8):
  `postgres://u:s3cret@127.0.0.1:1/db` → `DATABASE_UNAVAILABLE`, no `s3cret`, `u:`, `127.0.0.1:1`
  or `postgres://` in stdout or stderr; malformed URLs (`not a url`, `postgres://%zz@x/db`,
  `http://x`, `postgres://u:p@[::1:5432/db`) → `DATABASE_UNAVAILABLE` (the last one was `INTERNAL` before amendment A14 of this review), never the URL.
- **No model, no outbound request.** `verify` builds `createEvaluationLlm({ mode: 'evaluation' })`
  and never reads `LLM_*`; a counting HTTP server configured as `LLM_BASE_URL` with `LLM_API_KEY=k3y`
  received `0` requests (show-spec-working E7; integration test "No request reaches a model even
  when one is configured").
- **Entry points and authorisation.** One development command (`npm run verify`) and one CI job; no
  route, no new permission in `ci.yml` (the workflow-level `permissions` block is unchanged); the
  job defines no `LLM_*` variable and no secret.
- **Validation of external input.** Arguments ignored. The seed and golden files are read by the
  same readers and checks as `db:seed` (`readSeed`, `readGoldenFiles`), before any connection; the
  seed's SQL is never executed by `verify` (only parsed for its header, project ids and indexed
  commits).
- **Queries.** No new SQL: `listProjects` and the answer-cache lookup are the store's parameterised
  queries; everything runs in one transaction that is always rolled back (`verify.ts:83-88`).
- **Sensitive data in outputs.** No answer, statement or excerpt text is printed (only structural
  fields); questions, ids, project names and compared values go through `terminalSafeText` /
  `toTerminalSafeJson` (control and terminal-unsafe characters escaped; unit test "renders a value
  holding a control character as its escaped literal"); paths are repository-relative
  (`displayPath`).
- **New dependency.** `yaml@2.9.1` exists in the official registry (`npm view yaml@2.9.1` → name
  `yaml`, integrity `sha512-3NxN8+78…Eb2yFw==`, identical to the `package-lock.json` entry, which was
  already in the lock as a transitive dependency); dev-only, used by `tests/unit/ci/verify-job.spec.ts`.
- **Logs.** No request body or answer is logged; `verify` writes only the lines the spec lists.

## Outcome

- No finding. Nothing to add to `design.md` → Follow-ups from this review.
