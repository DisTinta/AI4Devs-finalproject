# Adversarial Review — api-foundation (DIS-76)

- Date: 2026-10-16
- Change: api-foundation
- Step: 17.6 `/adversarial-review` (with the security review of 17.6b, since the diff adds HTTP
  inputs, a rate limit and reads `DATABASE_URL`)
- Reviewed: `git diff origin/feature/entrega-2-CRN...HEAD` (47 files, commit `156b108`), the change
  artifacts, and the fixes of `/verify-against-spec`. Run unattended (autonomous-run ADR) by the
  review step's agent, a context distinct from the one that implemented the change. The forked
  `adversarial-review` and `verify-against-spec` skill runs of this step returned no output to the
  orchestrating agent, so both checks were carried out by this agent against the same checklists.

## Adversarial review

### Findings

| # | Severity | File:line | Finding | Why it matters | Outcome |
|---|---|---|---|---|---|
| AR1 | Major | `packages/api/src/plugins/error-handler.ts:68-74` | A `POST` with a malformed (`{`) or oversized JSON body to a route that does not exist answered `400` `VALIDATION_ERROR` / `413` `PAYLOAD_TOO_LARGE`; the same URL with an XML body answered `404`. Fastify parses the body before the not-found handler runs. | Breaks the "Single error format" row "no route matches → 404 `NOT_FOUND`"; the answer for an unknown URL depended on the body. Same as V1 of `/verify-against-spec`. | **Fixed (A)**: scenario "A body error on a route that does not exist answers NOT_FOUND" added to the delta spec; RED (`expected 400 to be 404`) → GREEN with `request.is404 ? NOT_FOUND : answerOf(error)`. |
| AR2 | Minor | `packages/api/src/composition.ts:121-129` | The store was opened before the model and the source tree were built; a throw from `createLlm` or `createGitSourceTree` would leave the pool open (`startApi` only closes what `composeFromEnv` returned). | "Start-up failure" requires closing the store after any failure once it is open. Same as V3. | **Fixed (A)**: RED test "builds the model before opening the store, so a model that cannot be built opens no connection" → GREEN by reordering. |
| AR3 | Minor | `.env.example`; `tasks.md` 15.3 | Task 15.3 was still open: `.env.example` lacked `PORT`, `HOST`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, though every start-up line says `see .env.example`. | A user following the error message would not find the variable. Same as V2. | **Fixed (A)**: the four variables added, empty, with rule and default. |
| AR4 | Minor | `packages/api/src/plugins/rate-limit.ts:52-60`; `docs/DEPLOYMENT.md` | Security: the limit keys on the socket address with `trustProxy` off and an in-memory, per-process counter (the plugin's LRU of 5 000 keys). Behind a reverse proxy every client shares one counter; several processes do not share it; a restart resets it. `DEPLOYMENT.md` said nothing about the API, nor that it has no authentication. | An operator could expose `HOST=0.0.0.0` or put a proxy in front without knowing the limit's reach. | **Fixed (A, docs)**: `docs/DEPLOYMENT.md` → "Running the API" states no authentication, the default `127.0.0.1`, and the keying, proxy and per-process limits. The mechanism itself stays as specified (**D**: single local process, spec "Rate limit by IP"). |
| AR5 | Question | `packages/api/src/plugins/error-handler.ts:47-56` | What if a domain mapping throws while building its details (a `BudgetExhausted` with an invalid `resetsAt`)? | The answer could fall to Fastify's default handler, outside the error format. | **No change needed**: verified, it answers `500` `INTERNAL` in the error format with one `error` log line. Kept as a characterisation test ("answers INTERNAL in the error format when a domain mapping fails to build its details", passed at once). |
| AR6 | Question | `packages/api/src/plugins/zod-compiler.ts:24-28` | An `unrecognized_keys` issue's `message` names the undeclared key (`Unrecognized key: "x"`). | The spec forbids the received *value*; the key is the client's own field name, needed to correct the request, in a JSON body. | **D**: accepted; no value of a field reaches an issue (checked: `too_small`, `invalid_type` and `unrecognized_keys` messages carry types, bounds and key names only). |
| AR7 | Minor | `openspec/changes/api-foundation/specs/api-foundation/spec.md` ("Rate limit by IP") | The plugin's `x-ratelimit-limit/-remaining/-reset` headers were in the design (U4) but not in the spec. | Unspecified response content (block 3 of `/verify-against-spec`). | **Fixed (A)**: one sentence added to the requirement (MAY, counts and seconds only). |
| AR8 | Minor | process | The forked review skills of this step returned no output to the orchestrator; the checks were re-done by this agent. | The independence of the review is weaker than a separate session reporting back. | **D**: recorded here and in the run's ADR consequences (the author reviews after the fact). |

Checked without a finding:

1. **Spec and task alignment.** Every requirement has scenarios; all 37 scenarios map 1:1 to a test of
   the same name (table in `2026-10-16-verify-against-spec.md`). The delta specs were last edited by
   the spec-audit commits (`c5106cb` … `14027ef`, 17:59–18:17) before the first implementation
   commit (`470e1e6`); this step's two spec edits are explicit and listed above. Every `[x]` task up
   to 15.5 has its evidence in the step 12 and 13 reports; 15.3 was the only open one (AR3).
2. **Hostile input.** `PORT` `03000` → 3000, `+1`/`3e3`/`70000`/`0` → `INVALID_CONFIG`; blank `HOST`
   → default, an unresolvable `HOST` → `STARTUP_FAILED` with its `systemCode`; `DATABASE_URL` set to
   `nonsense`, `postgres://x:y@[::1` or a wrong database → one `DATABASE_UNAVAILABLE` line, exit 1, no
   URL (run against `server.ts`). Rate limit: `X-Forwarded-For` ignored, unknown routes and body errors
   on them not counted (35 malformed `POST /api/nope` → no `429`), `/docs/static/*` exempt by prefix,
   rejected requests counted (`onRequest`). Same request twice / concurrently: the counter is the
   plugin's atomic in-memory store. No subject owns anything yet (no authenticated route).
3. **Blast radius.** No package outside `packages/api` imports `@codemind/api` or `fastify`; the
   `index.ts` rewrite (re-exports only) and the Fastify 4 → 5 move affect nothing else. The adapter
   only gains `openPostgresStore` (the CLI keeps its own, Follow-up C). No migration. CI: the
   `business` filter and Stryker now include `packages/api`.
4. **Evidence quality.** No existing test was modified (`git diff --stat` of `tests/` outside the new
   files: insertions only). Mutation on `packages/api`: 96.81 % forced pass (step 12 report). The most
   important test, "Rejected requests count towards the limit", kills the mutation that moves the
   limiter from `onRequest` to `preHandler` (validation would answer `400` first and never count);
   "The limit is per IP and ignores forwarding headers" kills `trustProxy: true` or a
   `keyGenerator` reading `x-forwarded-for`.

### Security review (security-reviewer checklist)

| Severity | Item | Result |
|---|---|---|
| High | Secrets in plain text | None. Only the local compose URL (already in `.env.example`) and test sentinels (`s3cret`, `SENTINEL-*`). |
| High | Routes without authentication / authorisation | No authenticated route exists in this change; the API binds `127.0.0.1` by default and the lack of authentication is documented (AR4). |
| High | External input reaching business code unvalidated | Every schema'd part goes through the Zod compiler before the handler; no business route yet. |
| High | Mass assignment / SQL by concatenation | None: no SQL in `packages/api` (`api-no-sql` green). |
| High | Sensitive data in responses | Error bodies carry fixed messages only; tested with IPs, passwords and UUIDs as sentinels. |
| Medium | Error messages leaking structure | No stack, driver text, host, port or path in any response or start-up line. |
| Medium | New dependencies exist in the registry | `fastify` 5.12.7, `@fastify/swagger` 9.9.2, `@fastify/swagger-ui` 6.1.2, `@fastify/rate-limit` 11.2.1, `zod` 4.6.5 resolved by `npm install` into `package-lock.json`. |
| Low | Logs with the request body | No body and no header but `host` (tested with sentinels; seen again in `/show-spec-working`). The client IP and the URL with its query string are logged (privacy check 12.5). |
| Low | Rate limiting on public endpoints | Present (30 / 60 s per IP), `/health` and `/docs` exempt by spec. |

### Verdict

**PASS** — after the fixes of this step, no Blocker and no Major remain; AR1 (Major) was fixed in this
change and the check was re-run (below). Every other finding is fixed (A) or accepted (D) with its
line in `design.md` → Follow-ups.

### Recommended next steps before archiving

1. Open the PR and confirm in its CI run that the new and changed specs pass and the mutation job is
   ≥ 80 with `packages/api` (task 17.3).
2. Post the `Deuda: api-foundation` checklist comment (Follow-up C) and archive.

## Addendum — re-run after the fixes

- AR1 re-checked on the real process (`server.ts` on port 3077): `POST /api/nope` with `{`, with a
  70 000-byte JSON body and with an XML body each answer `404`
  `{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}`. An unresolvable
  `HOST=no.such.host.invalid` gives `STARTUP_FAILED` `{"systemCode":"ENOTFOUND"}`, exit 1.
- `npx vitest run tests/unit/api` → all green after each fix; full suite, lint, typecheck,
  `lint:architecture` and `docs:coverage` re-run before the commit (totals in the step 12 report
  addendum).
- Re-reading the diff after the fixes found no new Blocker or Major.
