# Adversarial Review — ask-endpoint (DIS-78)

- Date: 2026-10-16
- Change: ask-endpoint
- Step: 14.6 `/adversarial-review`, with the security review (the diff adds an HTTP entry point
  behind the rate limit)
- Reviewed: `git diff origin/feature/entrega-2-CRN...HEAD` (21 files, commit `ce4ecb0`), the change
  artifacts and the step 9 and 10 reports. Run unattended (autonomous-run ADR). The forked
  `adversarial-review` skill (a read-only context distinct from the implementer's) did not report back
  to the review step's agent; its result was read from its transcript. Its findings are AR2–AR7; AR1,
  AR8 and AR9 come from the review step's own pass (hostile-input probes against `buildApp` with
  `inject`, listed below).

## Adversarial review

### Findings

| # | Severity | File:line | Finding | Why it matters | Outcome |
|---|---|---|---|---|---|
| AR1 | Question | `specs/http-ask/spec.md` ("Ask answered response"); `packages/api/src/routes/ask.ts:86-101` | The body "MUST NOT contain … the use case's prompt ids (`E1`…)" or a database id, but the model's `answer`/statement `text` and the repository `excerpt` are passed through: a model text "según E1" or an excerpt holding a UUID would break the rule as written. | Rewriting model or repository text in the transport would corrupt legitimate content; the rule could only hold by luck. | **A, spec clarified** (`/opsx:update`): the rule is about the fields the route builds; the passed-through text is sent as it is (design U3). |
| AR2 | Minor | `routes/ask.ts:142`; `tests/unit/api/ask.spec.ts:231` | No test checked that `explain` receives the stored project's id: the forwarding test sends the id in lower case, and the upper-case integration test runs in evaluation mode. Forwarding the raw path parameter passed every test. | The spec requires "`projectId` is the stored project's id". | **A**: test "forwards the stored project's id, not the id as sent in the path"; it fails on that mutant (`expected [ Array(1) ] to deeply equal [ Array(1) ]`, observed) and passes on the code. |
| AR3 | Question | `routes/ask.ts:53`; `readme.md` §2.5 (6) | `cacheOnly: true` and the readme ("degrada a modo solo-caché… en lugar de fallar") promise a cache-only mode while no answer cache exists: `/ask` answers `429`. | Clients (CM-HU-14) could build on a mode that does not exist yet. | **A + B**: readme reworded (only the paths without a model call still answer; cached answers once CM-HU-13 exists); Spanish hand-off comment on DIS-21 (serve cache hits under the ceiling, `useCache: false`). |
| AR4 | Minor | `packages/api/src/plugins/zod-compiler.ts:26-30`; `schemas/ask.ts:43` | An extra body key is named in its issue (`Unrecognized key: "x"`) against "no … part of the response SHALL contain a received value". Same as V1. | Reflected client text in a `400`. | **A, spec clarified**: the key name is the client's own field name, never a field's value (as `api-foundation`, DIS-76 AR6). |
| AR5 | Question | `routes/ask.ts:86-91` | The public statement drops `status`/`warning: 'stale-evidence'`; a stale `INFERENCE` looks like any other. | Staleness is hidden from API clients. | **D**: decided in D3 and listed in the spec's MUST NOT. |
| AR6 | Question | `routes/ask.ts:42-52` | `SOURCE_UNAVAILABLE` `not-indexed` answers `503`, a retryable status, for a lasting state. | A client may retry pointlessly. | **D**: already accepted under design Risks; `reason` tells the cases apart. |
| AR7 | Question | `routes/ask.ts:130` | One verification cache serves every project and client; `usage.verification.cacheHits` tells a client a pair was checked before. | Cross-request signal. | **D**: a verdict depends only on the statement and the cited text; unauthenticated API bound to `127.0.0.1`. Added to design Risks. |
| AR8 | Question | Fastify JSON parser (DIS-76) | A body with a `__proto__` or `constructor.prototype` key answers `400 VALIDATION_ERROR` with `details` `{}` (no `issues`). | Different `details` than a schema failure. | **D**: the parser rejects it as an invalid body, the DIS-76 row "not valid JSON" (`details` `{}`). |
| AR9 | Minor | process | The forked review skills did not report back to the review step's agent. | Weaker independence than a separate session reporting back. | **D**: their output was read from their transcripts and recorded here and in the verify report. |

Hostile-input probes (review step's own pass, `buildApp` over the in-memory acme-shop subset, `inject`):

```text
null body => 400 VALIDATION_ERROR, issue path [] invalid_type "expected object, received null"
array body => 400 VALIDATION_ERROR, issue path [] invalid_type
string body => 400 VALIDATION_ERROR, issue path [] invalid_type
lone surrogate ("price \ud800 calc") => 200 UNKNOWN llm-required
5 x U+200B => 200 UNKNOWN no-anchor
tokenBudget true => 400 VALIDATION_ERROR ["tokenBudget"] invalid_type
tokenBudget 1e3 => 200
duplicate "question" key (last one valid) => 200
question 12345 => 400 VALIDATION_ERROR ["question"] invalid_type
__proto__ key / constructor.prototype key => 400 VALIDATION_ERROR details {}   (AR8)
upper-case id (in-memory store) => 200
two requests at once => 200, 200
```

Checked without a finding (forked run and own pass):

1. **Spec and task alignment.** The 32 scenarios map 1:1 to tests of the same name (table in
   `2026-10-16-verify-against-spec.md`). No existing test was modified: only the three new spec files
   changed under `tests/`. No delta spec was edited after implementation before this review (the specs
   were last committed by `580121e`, the approved audit; `0ae457b` touched `design.md` only, disclosed).
   This review's three spec edits are clarifications, listed above (AR1, AR4) and in the verify report
   (V4).
2. **Hostile input.** Zod 4.6.5 counts `min`/`max` in code points (`checks.js:271-299`); NUL, blank,
   `{}`, fractional and string budgets, ids with anything around the UUID are rejected before any port
   is called; an unknown project answers `404` without the id; the same request twice reuses the
   verdict; two at once both miss the cache, which fits "an earlier request"; a budget hit during
   verification leaves the citation `cited` (`packages/core/src/verify/semantic.ts:151`).
3. **Blast radius.** `answerOf` consults a route table first on every route; routes without one fall
   back as before (`route-errors.spec.ts`). The core change only derives `StatementVerification` from a
   new constant. No migration. The CLI is untouched.
4. **Evidence quality.** The test that matters most, "Evidence ids are renumbered in evidence order",
   fails if public ids follow citation order, if numbering is off by one, or if any internal id leaks;
   "Requests to one API share verification verdicts" fails if the cache is created inside the handler.

### Security review (security-reviewer checklist)

| Severity | Item | Result |
|---|---|---|
| High | Secrets in plain text | None: test sentinels only (`SENTINEL-*`, `10.0.0.5`). |
| High | Routes without authentication / authorisation | The API has no authentication (non-goal; DIS-76 `docs/DEPLOYMENT.md`) and binds `127.0.0.1` by default. Any caller may ask about any stored project id, as specified. |
| High | External input reaching business code unvalidated | Params and body validated by Zod before the handler; only `question` and an optional `tokenBudget` reach `explain`, built explicitly (no spread of the body). |
| High | Mass assignment / SQL by concatenation | None: strict body, explicit forwarding; no SQL in `packages/api` (`api-no-sql`). |
| High | Sensitive data in the response | No database, file or prompt id, prior claim, event or provenance in the fields the route builds (AR1 clarifies the passed-through text). Excerpts are the redacted spans of `explain`. |
| Medium | Error messages leaking internals | Fixed messages; details only from error fields (`reason`, `status`, `expected`, `received`, `systemCode`, repository-relative `path`); `INTERNAL` without text. AR4 recorded. |
| Medium | Listing without pagination | No listing endpoint. |
| Medium | New dependencies | None. |
| Medium | Personal data to a third party | The question goes to the configured model in live mode only (by design; step 9 privacy check). |
| Low | Logs with the request body | No: the request log holds method, URL, host, address; events carry codes, ids, paths and lines (`explain-event.ts`); the fresh run of `/show-spec-working` logged no line with the question. |
| Low | Rate limiting on public endpoints | `/ask` is behind the per-IP limit (scenario "The ask route is rate limited"); spend is capped by the daily budget. |

No High or Medium security finding.

### Verdict

**PASS WITH GAPS** (forked run): no Blocker, no Major. After the fixes of this step every gap has a
destination: AR1, AR2, AR4 fixed (A), AR3 fixed in the readme (A) and handed to DIS-21 (B), AR5–AR9
D. No re-run is required (no Blocker or Major; the fixes are tests, a one-line guard and spec
clarifications).

## Addendum — verification after the fixes

- `npx vitest run tests/unit/api`: 81 passed (the two new tests and the strengthened events test
  included). Full suite and gates: see the addendum of `2026-10-16-9-test-and-state-verification.md`.
- `npm run test:mutation -- --mutate "packages/api/src/routes/ask.ts"`: `routes/ask.ts` 99.19 %
  (123 killed, 1 survived), overall 95.69 % ≥ 80. The survivor `message !== undefined` → `true`
  (`routes/ask.ts:76`) is equivalent: it adds `message: undefined` only for `llm-required`, which JSON
  drops, the same equivalent survivor as step 9.
