# Verify Against Spec — ask-endpoint (DIS-78)

- Date: 2026-10-16
- Change: ask-endpoint
- Step: 14.5 `/verify-against-spec`
- Scope: `openspec/changes/ask-endpoint/specs/http-ask/spec.md` and
  `specs/api-foundation/spec.md` against `git diff origin/feature/entrega-2-CRN...HEAD` (commit
  `ce4ecb0`), run unattended (autonomous-run ADR). The forked `verify-against-spec` skill (a
  read-only context distinct from the implementer's) did not report back to the review step's agent;
  its result was read from its transcript and is recorded below, with the review step's own pass over
  the same three blocks and the outcome of each finding.

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| api-foundation → Single error format (code from the route's table for a domain error; `BUDGET_EXHAUSTED` fields fixed) | `packages/api/src/plugins/error-handler.ts:93-102` | `tests/unit/api/errors.spec.ts` (DIS-76 scenarios, unchanged); `tests/unit/api/route-errors.spec.ts:46` |
| api-foundation → Domain error mapping (route table first, then global; only that route; unknown code → `INTERNAL`) | `error-handler.ts:43-55,100` | `route-errors.spec.ts:46`; `errors.spec.ts:224,240` |
| http-ask → Ask request validation | `packages/api/src/schemas/ask.ts:26-52`; checked before the handler (`routes/ask.ts:131-136`) | `tests/unit/api/ask.spec.ts:137,164,181,211,231` |
| http-ask → Ask project resolution (`getProject` first, `404`, the store's id forwarded) | `routes/ask.ts:20,139-142` | `ask.spec.ts:397` and the AR2 test; `tests/integration/api/ask.spec.ts:179` |
| http-ask → Ask answered response | `routes/ask.ts:72-116`; `schemas/ask.ts:85-106` (serialiser strips undeclared keys) | `ask.spec.ts:302,326,362`; `integration/api/ask.spec.ts:111` |
| http-ask → Ask UNKNOWN response | `routes/ask.ts:73-78`; `schemas/ask.ts:116-122` | `ask.spec.ts:377` and the V2 test; `integration/api/ask.spec.ts:158` |
| http-ask → Ask error answers (five codes, `cacheOnly: true`, others `INTERNAL`, rate limited) | `routes/ask.ts:10-54,136` | `ask.spec.ts:417,460,481,497`; `integration/api/ask.spec.ts:201` |
| http-ask → Ask events and verification verdicts | `routes/ask.ts:129-130,146` | `ask.spec.ts:514,553` |
| http-ask → Ask in the OpenAPI document | `routes/ask.ts:131-135`; `schemas/ask.ts:30,50-51` | `ask.spec.ts:590` |

Dependencies: no new package; `@codemind/core`, `fastify` and `zod` are declared in
`packages/api/package.json`, and no `package.json` changed. Authorisation: none required by the spec
(no authenticated route; non-goal).

## 2. Requirements missing or partial

| # | Finding (forked run) | Requirement quoted | Outcome |
|---|---|---|---|
| V1 | An extra body key comes back in the issue message (`Unrecognized key: "hops"`, `plugins/zod-compiler.ts:26-30` keeps Zod's message). | "No issue and no other part of the response SHALL contain a received value." | **A, spec clarified** (`/opsx:update`): an `unrecognized_keys` issue names the undeclared key, the client's own field name, never a field's value, as `api-foundation` decided in DIS-76 (AR6). Same as AR4. |
| V2 | `message` was forwarded for any `UNKNOWN` reason (`routes/ask.ts:75`); only core kept it to `llm-required`. | "plus, only for the reason `llm-required`, `message`" | **A, fixed with TDD**: test "sends a message only with llm-required, even when the use case gives one with another reason", RED (`expected { …(4) } to deeply equal { …(3) }`) → GREEN in `toPublicAnswer`. |
| V3 | A route's table may only extend `BUDGET_EXHAUSTED`, but nothing enforces it. | api-foundation "Domain error mapping" | **D**: a convention; the `/ask` entry is built from the global one (`routes/ask.ts:53`), so the two cannot drift. |

## 3. Unspecified behaviour

| # | Behaviour | Where | Decision |
|---|---|---|---|
| V4 | The shared verification cache keeps the 10 000 most recently used verdicts; an evicted pair is sent again, while the spec said "SHALL NOT be sent to the model again". | `routes/ask.ts:130` (`createInMemoryVerificationCache()`) | **A, added to the spec**: "again while its verdict is kept" with the bound. |
| V5 | A use-case answer that breaks the response schema answers `500`. | serialiser (`plugins/zod-compiler.ts`) | **No change (D)**: specified by `api-foundation` "Response serialisation by schema" ("A result that breaks its response schema answers INTERNAL"). |
| V6 | The `explain` seam of `buildApp`/`registerAskRoute`; exports of `toPublicAnswer`, `ASK_DOMAIN_ERRORS`, the six schemas, their types, `registerAskRoute`, core's `STATEMENT_VERIFICATIONS`; the `explain event` log message; the OpenAPI `pattern` and `maxItems: 0`. | `app.ts:34-35,100`; `routes/ask.ts`; `index.ts:24-38`; `claim-items.ts:44`; `schemas/ask.ts` | **Kept, D** (design U1–U5): test seam, typed exports for the web client and the tests, log text and schema details with no contract effect. |

Weak-test check (forked run):

| # | Finding | Outcome |
|---|---|---|
| V7 | "The answer's events are logged by level" checked every field on the `evidence_broken` line only. | **A**: each of the three lines now matches its event (`toMatchObject`). |
| V8 | The integration scenarios count the model's `complete` calls, not `embed`. | **D**: the scripted model's `embed` throws ("not used by explain"), so an `embed` call would fail the request and the exact-body assertion. |
| — | "Optional fields are forwarded…" uses `toEqual`, which treats an `undefined` key as absent. | Already covered by "forwards no tokenBudget key at all when none is sent" (`Object.keys`). |

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| An unknown route answers NOT_FOUND | `tests/unit/api/errors.spec.ts:17` | green |
| A body error on a route that does not exist answers NOT_FOUND | `tests/unit/api/errors.spec.ts:121` | green |
| A malformed or empty JSON body answers VALIDATION_ERROR | `tests/unit/api/errors.spec.ts:45` | green |
| A body over the limit answers PAYLOAD_TOO_LARGE | `tests/unit/api/errors.spec.ts:61` | green |
| An unsupported content type answers UNSUPPORTED_MEDIA_TYPE | `tests/unit/api/errors.spec.ts:75` | green |
| Another 4xx error answers BAD_REQUEST with its status | `tests/unit/api/errors.spec.ts:95` | green |
| A 400 that is not a body error answers BAD_REQUEST | `tests/unit/api/errors.spec.ts:108` | green |
| An unexpected error answers INTERNAL without its text | `tests/unit/api/errors.spec.ts:30` | green |
| An exhausted budget answers 429 BUDGET_EXHAUSTED | `tests/unit/api/errors.spec.ts:224` | green |
| A domain error without a mapping answers INTERNAL | `tests/unit/api/errors.spec.ts:240` | green |
| A route's own mapping applies only to that route | `tests/unit/api/route-errors.spec.ts:46` | green |
| An invalid question answers VALIDATION_ERROR without asking | `tests/unit/api/ask.spec.ts:137` | green |
| A question at the length bounds is accepted | `tests/unit/api/ask.spec.ts:164` | green |
| An invalid token budget, cache flag or extra key answers VALIDATION_ERROR | `tests/unit/api/ask.spec.ts:181` | green |
| A malformed project id answers VALIDATION_ERROR | `tests/unit/api/ask.spec.ts:211` | green |
| Optional fields are forwarded as the use case expects | `tests/unit/api/ask.spec.ts:231` | green |
| An unknown project answers PROJECT_NOT_FOUND | `tests/unit/api/ask.spec.ts:397` | green |
| An upper-case project id resolves the same project | `tests/integration/api/ask.spec.ts:179` | green |
| An answered question returns only the public fields over the seed | `tests/integration/api/ask.spec.ts:111` | green |
| Evidence ids are renumbered in evidence order | `tests/unit/api/ask.spec.ts:302` | green |
| Internal fields of the answer are not sent | `tests/unit/api/ask.spec.ts:326` | green |
| A statement citing an unknown evidence id answers INTERNAL | `tests/unit/api/ask.spec.ts:362` | green |
| Evaluation mode answers UNKNOWN llm-required over the seed | `tests/integration/api/ask.spec.ts:158` | green |
| Another UNKNOWN reason carries no message | `tests/unit/api/ask.spec.ts:377` | green |
| Domain errors of the use case map to their answers | `tests/unit/api/ask.spec.ts:417` | green |
| An exhausted budget on ask answers 429 with the cache-only notice | `tests/unit/api/ask.spec.ts:460` | green |
| A spent daily budget stops the model over the seed | `tests/integration/api/ask.spec.ts:201` | green |
| Another error of the use case answers INTERNAL | `tests/unit/api/ask.spec.ts:481` | green |
| The ask route is rate limited | `tests/unit/api/ask.spec.ts:497` | green |
| The answer's events are logged by level | `tests/unit/api/ask.spec.ts:514` | green |
| Requests to one API share verification verdicts | `tests/unit/api/ask.spec.ts:553` | green |
| The document lists ask with its parameter, body and responses | `tests/unit/api/ask.spec.ts:590` | green |

All 32 scenarios (11 of `api-foundation`, the DIS-76 ones of the two modified requirements included,
and 21 of `http-ask`) map 1:1 to a test of the same name and are green after the fixes
(`npx vitest run`, see the Addendum of the adversarial review report for the totals).

## Verdict

**Conforms after fixes.** No requirement missing; V1, V2, V4 and V7 fixed in this change (A), the rest
recorded as D in `design.md` → Follow-ups.
