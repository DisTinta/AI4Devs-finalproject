CHANGES REQUIRED

**Questions for the author.** Under `docs/AUTONOMOUS-RUN.md` §6 the agent answers these as lead engineer in the correction round. The author does not have to act.

- Q1. Parent DIS-93 AC 4 says the `200` has "exactly the keys `direct`, `indirect`, `tests`, `docs`, `history`, `risk`, `usage` of §4". This change adds `status`, drops `usage` (design D1, E1/P1) and rewrites `readme.md` §4 to match. The DIS-95 DoD ("respuesta enumera solo los campos de §4") then holds only because §4 is rewritten by the same change. The sub-issue's `[enhanced]` and the parent disagree. The departure is already recorded as P1 (destination D) and is well argued (no model call, so no real `usage`). The correction round only needs to confirm P1 and say in the DIS-95 comment that the DoD is checked against the rewritten §4. Not blocking.

Audit inputs: proposal.md, design.md, specs/http-impact/spec.md, tasks.md; Linear DIS-95 (description and its 4 comments) and its parent DIS-93 (no comments); docs/base-standards.md, docs/backend-standards.md, docs/project-context.md, docs/openspec-tasks-mandatory-steps.md, docs/AUTONOMOUS-RUN.md §2 and §6; openspec/specs/{api-foundation,http-ask,impact}/spec.md; code in packages/api/src/{app.ts,index.ts,routes/ask.ts,schemas/ask.ts,schemas/common.ts,plugins/zod-compiler.ts}, packages/core/src/impact/{impact.ts,impact-report.ts,impact-request.ts}, stryker.config.json, scripts/load-env.mjs, tests/unit/api/support.ts.

---

## 1. Scope against the ticket

Clean. Every item follows from the DIS-95 `[enhanced]` description or its comments:
- route, schemas and seam (technical context);
- the `getProject`-first `404`, closing DIS-89 P6 (decision 3);
- the `readme.md` §4 rewrite (decision 1, DIS-94 E5);
- the `docs/project-context.md` and `docs/DEMO.md` Paso 4 edits (Docs bullet);
- the `## Purpose` edit of the `impact` spec (decision 7, DIS-94 task 13.7);
- E8, the PowerShell rule (decision 8).

The change does not widen to the parent's whole story: core `history`, `docs` and risk stay out, as non-goals. Task 0.2 and the `prompts.md` entry in 8.4 are process steps, not product scope.

## 2. Inherited acceptance criteria

- DIS-95 AC 1 (Q2 over the seed): covered by "Q2 answers only the public fields over the seed".
- AC 2 (unknown for 5 × U+1F600; no `maxHops` means the use case gets none): covered by "A change without search terms answers unknown" and "The hop limit is forwarded only when sent".
- AC 3 (each 400 case): covered by the four validation scenarios.
- AC 4 (404 for both changes; upper-case id): covered by "An unknown project answers PROJECT_NOT_FOUND on impact" and "An upper-case project id resolves the same project on impact".
- AC 5 (domain errors, 500, events, OpenAPI, rate limit): covered by the five scenarios of requirements "Impact error answers", "Impact events" and "Impact in the OpenAPI document".
- Parent DIS-93 AC 4 (`maxHops: 4` → 400, unknown project → 404): covered. Its key list conflicts with the sub-issue; see Q1.
- Parent ACs 1, 2, 3 and 5 belong to core (DIS-94). The route passes them through unchanged, so no HTTP requirement is missing.

One improvable point:
- **2.a (improvable).** Parent AC 1 also says co-changed files must not appear in `direct`/`indirect` as `graph` without a static edge. The HTTP Q2 scenario only says `direct`/`indirect` "hold" the expected entries. Correction: add to the Q2 scenario "and no entry of `direct`, `indirect` or `tests` has `file` `app/Services/ShippingService.php`", so the HTTP body shows the graph/git separation of the parent story.

## 3. Missing scenarios

- **3.a (improvable).** Requirement "Impact events" says events of an `unknown` report are logged too ("answered or `unknown`"). Only an answered report's event is checked against the log. "An unknown report with events sends no events" checks the body only. Correction: extend that scenario's THEN with "and one log line carrying the request's `reqId` holds `type` `query_not_logged` and `code` `store-write-failed` at level `info` (30)". Its GIVEN must then build the app with its log written to a test stream.
- **3.b (improvable).** Requirement "Impact error answers" says "a failure of the store included" answers `500`. The second half of "Another error on impact answers INTERNAL" makes the store's *project read* reject. That read is the route's own `getProject`, so core's use case never runs, although the scenario says "core's use case". A store failure inside the use case is not exercised. Correction: rename it to "…then with core's use case over a store whose project read resolves the project and whose traversal read rejects with `new Error('pool failed at 10.0.0.5')`". Or keep the `getProject` case and call it "the route's project read".

## 4. Ambiguity

None of the listed words (fast, easy, secure, efficient, many, appropriate, robust) appears. Two vague phrases remain:
- **4.a (improvable).** design.md → Risks: "negligible next to the traversal". Replace with "one primary-key read per request, besides the reads of the report (traversal, tests, `docs`, `history`) and the `query_log` write".
- **4.b (improvable).** tasks.md 5.4: "kill the meaningful survivors". Replace with "kill every survivor in `toPublicReport`, `IMPACT_DOMAIN_ERRORS` and the body schema's limits with a red-first test. Accept only equivalent mutants, each recorded with its id and the reason it is equivalent in `design.md` → Follow-ups (destination D)".

## 5. Open decisions

- **5.a (BLOCKING): response-schema strictness, and a RED that cannot fail.**
  - Task 1.2 says the entries are "closed to the keys of design D1", but neither the design nor the spec says whether the response schemas use `z.object` or `z.strictObject`.
  - The serializer (`packages/api/src/plugins/zod-compiler.ts:56-58`) is `JSON.stringify(zod.parse(data))`. With `z.object`, as `/ask` does (`packages/api/src/schemas/ask.ts:86-123`), undeclared keys are already dropped by the serializer (api-foundation, "Response serialisation by schema").
  - Task 2.4 then states something false: "a spread in `toPublicReport` must make the first fail". With strip schemas a spread still answers `200` without `fileId`, `events` or `usage`, so the scenario cannot fail for that reason.
  - With `z.strictObject` response schemas, a spread fails, but with `500`. Any field core adds later would then break the route in production until the schema learns it.
  - The implementer has to pick one and the tests pin the result.
  - Fix in design D1 (decision) and tasks 1.2 and 2.4. Recommended: keep `z.object`, as `/ask` and api-foundation do, and say in D1 that the serializer is the guarantee and `toPublicReport` is defence in depth. Remove the false claim from 2.4. Instead, make the RED of 2.4 fail because the route does not yet project `docs` per `stale`: assert the current document has no `staleSince` key even when the seam sends one, which is what the field-by-field projection guarantees.
  - Also reword requirement "Impact answered response": change "Each entry SHALL be built field by field from the use case's report, so a field the use case adds is not sent" to "A field the use case's report or one of its entries carries beyond those listed SHALL NOT be sent". That is the observable behaviour; the build method stays in design D1.
- **5.b (improvable).** Task 6.4: "the thirteenth request within the window". Steps 6.3–6.4 as listed send 10 requests to the limited route (`GET /docs/json` and `GET /health` are not counted). Requests 11 and 12 are not defined. Correction: "then send `{"change":"abc"}` (400) until the response is `429`. It must be the 13th request to `/api/projects/*/impact` in the window, with `Retry-After` an integer ≥ 1."
- **5.c (improvable).** Task 6.5 deletes "exactly the `query_log` rows … created after the 6.1 `max(created_at)`" but gives no expected count. Correction: add "(expected 4: Q2, upper-case Q2, `maxHops` 3 and the no-anchor change; the 400, 404 and 429 requests write none). If the count differs, stop and record it."
- **5.d (improvable).** Tasks 6.3 and 6.4 send `ó` and U+1F600 through `curl -d` from Git Bash on Windows, where the console code page can garble the bytes. Correction: write those bodies with JSON escapes (`"cómo se gestionan los reembolsos"`, `"😀😀😀😀😀"`) so the bytes sent are ASCII.

## 6. Contradictions inside the change

- **6.a (improvable).** Proposal → Capabilities says "Modified Capabilities: None … only its `## Purpose` text is updated". That is coherent, since OpenSpec deltas cannot carry `## Purpose`. The D8 fallback, though, says "record it … with destination A for the next change that touches `impact`". The design's own legend defines A as "this change". A follow-up owned by a future change is not A. Correction in design D8, the E7 row and task 9.5: "destination D — accepted and recorded: the `## Purpose` stays as it is, and the reason the hook denied the edit is recorded". No new ticket.
- Otherwise clean:
  - proposal, design and spec agree on the public shape (D1/D2);
  - on `getProject` first (D3);
  - on the error table and the declared `200/400/404/429/500` (D4);
  - on events at `info` (D5);
  - on limits from core and `maxHops` forwarded only when sent (D6);
  - on the seam, the registration and the exports (D7).

## 7. Contradictions with the project

- **7.a (improvable).** `docs/backend-standards.md` §4, "Closed sets of domain values are declared once … Never maintain the list twice". Design D6/P4 re-lists `HIGH|MEDIUM|LOW`, `no-anchor`, `graph` and `git` as literals in `schemas/impact.ts`, because core declares them only as types (`packages/core/src/impact/impact-report.ts:14,40,50,53`). The typed projection catches only one direction (core adding a value). The ticket forbids changing core, so the deviation is defensible, but D6 does not name the standard it departs from. Correction in design D6: name `backend-standards.md` §4 as the rule departed from, and add a two-way compile-time check in `schemas/impact.ts`, e.g. `type _RiskLevels = Assert<Equal<z.infer<typeof riskLevelSchema>, RiskLevel>>`, for `RiskLevel` and `ImpactUnknownReason`. Record it in P4.
- **7.b (improvable).** Task 8.1 names the `readme.md` lines that say `/impact` is Entrega 3 work (diagram 512, stack row 589, §4 paragraph 1173). It misses line 149 ("F3 (impacto) … son de la Entrega 3") and the screen table row at line 183. Correction: add both to 8.1 ("F3 por CLI y por `POST /impact`; solo la pantalla web es de la Entrega 3").
- Otherwise clean:
  - api-foundation allows a route's own domain error table;
  - the `getProject`-first pattern and the `{}`/`{ field }` details match `http-ask` and the `impact` spec ("Anchoring the change");
  - E8 (agent runs any PowerShell itself with `pwsh -NoProfile`, no `$env:`) departs from `docs/openspec-tasks-mandatory-steps.md` §3 and `docs/AUTONOMOUS-RUN.md` §6 (PowerShell checks to the author as destination C) on the author's explicit instruction for DIS-95. It is recorded as D, and no PowerShell check applies to this change.

## 8. Contrast with the real code

- **8.a (BLOCKING): the same defect as 5.a, seen from the code.** `packages/api/src/plugins/zod-compiler.ts:56-58` already strips undeclared response fields. Under the `/ask` convention (`z.object`) the guarantee task 2.4 and design D1 attribute to `toPublicReport` cannot be shown by any HTTP test. Resolve with the 5.a correction; one fix closes both.
- Checked and consistent:
  - `impact(store, request: unknown, { now })` (`packages/core/src/impact/impact.ts:45`);
  - `MIN_CHANGE_CHARS`, `MAX_CHANGE_CHARS`, `DEFAULT_IMPACT_HOPS` (`impact-request.ts:16-22`), `MAX_HOPS`, `EDGE_RESOLUTIONS` (`knowledge/graph-edge.ts:18`) and `hasNoNul`, all exported by `@codemind/core`;
  - `projectIdParamsSchema` (`schemas/common.ts:25`);
  - `app.deps.store` and `app.deps.now` (`app.ts:33-46`);
  - the seam pattern `AppOptions.explain`/`reindex` (`app.ts:54-57`);
  - registration in `buildApp` (`app.ts:121-123`);
  - the helpers `counting`, `defaultDeps`, `errorBody`, `logStream` (`tests/unit/api/support.ts`);
  - `scripts/load-env.mjs` keeps an already-set `RATE_LIMIT_MAX` (task 6.2 works);
  - Stryker `break: 80` (`stryker.config.json:17`);
  - `tests/unit/api/health-docs.spec.ts:47-50` uses `toContain`, so the new path breaks no existing test.
- `impactBodySchema` repeats the rules of core's `impactRequestSchema` rather than deriving from it. That is justified: core checks length with `.refine`, which would not publish `minLength`/`maxLength` in OpenAPI. `/ask` does the same.
- Minor: D7 says "after `registerAskRoute`". To keep `app.ts` deterministic, state "between `registerAskRoute` and `registerReindexRoute`" (improvable, no test pins it).

## 9. Task size

- **9.a (BLOCKING): task 1.2 cannot reach GREEN.**
  - Task 1.1's RED fails "because the route does not exist (404 `NOT_FOUND`)".
  - Task 1.2's GREEN creates only `packages/api/src/schemas/impact.ts`. No route uses those schemas until 2.2, so the scenario still answers `404`, not `400`.
  - The scenario also counts calls to the use case through `AppOptions.impact`, which does not exist until 2.2.
  - Task 1.3 already admits this for the bounds scenario only.
  - Correction in tasks.md, one of:
    - (a) 1.2 GREEN also creates a minimal `packages/api/src/routes/impact.ts` with `registerImpactRoute` declaring `params`/`body` only and a handler that answers `501`, plus `AppOptions.impact` and the `buildApp` registration. Step 2 then completes that file.
    - (b) Move 1.1–1.3 after 2.2.
  - Recommended: (a), which keeps the schema-first layer order of `docs/backend-standards.md` §2.
- Every other task fits one agent turn. Task 8.1 is the largest (five places in `readme.md`) but is a single edit pass.

## 10. Mandatory steps

Clean:
- Step 0 is the branch (`feature/dis-95-http-impact`, `BRANCH_PREFIX=feature/`).
- Steps 4 (existing tests), 5 (run tests and verify data state, report path and pattern named in 5.7), 6 (manual interface, AGENT MUST EXECUTE, restoration in 6.5), 7 (E2E, marked not applicable with its reason), 8 (docs) and 9 (pre-merge, last, the three checks in order, fixes on the same PR, archive commit before merge) are present and labelled (MANDATORY).
- Every step that starts a process ends with `node scripts/dev-processes.mjs stop`.
- Merge only through the gate under `KIT_AUTONOMOUS_RUN=1` (`docs/AUTONOMOUS-RUN.md` §2).

Steps for the author: none. No task or follow-up has destination C, by the author's instruction (E8). In this repository, work goes to the author only in these cases:
- a PowerShell check the agent cannot run (`docs/openspec-tasks-mandatory-steps.md` §3, `docs/AUTONOMOUS-RUN.md` §6; E8 avoids it here);
- a merge the auto-mode classifier denies, or a ticket without an OpenSpec change (`AUTONOMOUS-RUN.md` §5);
- the clean stops of §6.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Impact request validation | An invalid change answers VALIDATION_ERROR without a store call | 1.1, 1.2 (see 9.a) |
| Impact request validation | A change at the length bounds is accepted | 1.3 |
| Impact request validation | An invalid hop limit or an extra key answers VALIDATION_ERROR | 1.3 |
| Impact request validation | A malformed project id answers VALIDATION_ERROR on impact | 1.3 |
| Impact request validation | The hop limit is forwarded only when sent | 2.1, 2.2 |
| Impact project resolution | An unknown project answers PROJECT_NOT_FOUND on impact | 2.3 |
| Impact project resolution | An upper-case project id resolves the same project on impact | 3.2 |
| Impact answered response | Q2 answers only the public fields over the seed | 3.1 |
| Impact answered response | An answered report over the in-memory subset makes no model call | 2.3 |
| Impact answered response | Fields the use case adds are not sent | 2.4 (see 5.a) |
| Impact unknown response | A change without search terms answers unknown | 2.3 |
| Impact unknown response | An unknown report with events sends no events | 2.4 |
| Impact error answers | Domain errors of the impact use case map to their answers | 2.5 |
| Impact error answers | Another error on impact answers INTERNAL | 2.5 |
| Impact error answers | The impact route is rate limited | 2.5 |
| Impact events | A report's query_not_logged event is logged | 2.6 |
| Impact in the OpenAPI document | The document lists impact with its parameter, body and responses | 2.7 |

No empty row. The 1:1 test map is planned in 4.2.

---

## Corrections to apply

### openspec/changes/http-impact/design.md
- **D1** (5.a / 8.a, blocking): add "The response schemas are `z.object` (as `/ask`): the serializer (`plugins/zod-compiler.ts`, `zod.parse`) drops every undeclared key, which is the guarantee that a field core adds is not published (api-foundation, 'Response serialisation by schema'). `toPublicReport` builds each entry field by field as defence in depth, and so that `staleSince` is sent only on a stale document."
- **D6** (7.a): add "This departs from `docs/backend-standards.md` §4 (closed sets declared once): core exports `RiskLevel` and `ImpactUnknownReason` as types only, and the ticket keeps core unchanged. `schemas/impact.ts` adds a two-way compile-time equality check between each literal set and its core type, so drift either way fails `npm run typecheck`." Update the P4 row to match.
- **D7**: change "after `registerAskRoute`" to "between `registerAskRoute` and `registerReindexRoute`".
- **D8** and Follow-ups **E7** (6.a): change "destination A for the next change that touches `impact`" to "destination D — accepted and recorded (the `## Purpose` stays as it is; the hook's denial is recorded)".
- **Risks** (4.a): replace "negligible next to the traversal" with "one primary-key read per request, besides the reads of the report and the `query_log` write".

### openspec/changes/http-impact/specs/http-impact/spec.md
- Requirement "Impact answered response" (5.a): replace "Each entry SHALL be built field by field from the use case's report, so a field the use case adds is not sent." with "A field that the use case's report, one of its entries or its `risk` carries beyond those listed SHALL NOT be sent."
- Scenario "Q2 answers only the public fields over the seed" (2.a): append to its last AND "and no entry of `direct`, `indirect` or `tests` has `file` `app/Services/ShippingService.php`".
- Scenario "An unknown report with events sends no events" (3.a): GIVEN "the app built with its log written to a test stream, a stored project and a use case that answers …"; THEN append "; and one log line carrying the request's `reqId` holds `type` `query_not_logged` and `code` `store-write-failed` at level `info` (30)".
- Scenario "Another error on impact answers INTERNAL" (3.b): replace "then with core's use case over a store whose project read rejects with `new Error('pool failed at 10.0.0.5')`" with "then with core's use case over a store that resolves the project and whose traversal read rejects with `new Error('pool failed at 10.0.0.5')`".

### openspec/changes/http-impact/tasks.md
- **1.2** (9.a, blocking): append "; and a minimal `packages/api/src/routes/impact.ts` with `registerImpactRoute(app, options)` declaring `params: impactParamsSchema` and `body: impactBodySchema` and a handler that answers `501`, `AppOptions.impact?: typeof impact` in `packages/api/src/app.ts` and its registration between `registerAskRoute` and `registerReindexRoute`, so the 1.1 scenario answers `400`. Step 2 completes the route."
- **1.3**: drop the parenthesis about writing the bounds scenario after 2.2. After the 1.2 change it goes RED (`501`) then GREEN in 2.2; say so.
- **2.2**: change "create `packages/api/src/routes/impact.ts`" to "complete `packages/api/src/routes/impact.ts`", and remove the `app.ts` part already done in 1.2.
- **2.4** (5.a, blocking): replace "(a spread in `toPublicReport` must make the first fail)" with "(the serializer drops undeclared keys, design D1; the first fails before `toPublicReport` sends `{ path, stale }` without `staleSince` for a current document)".
- **5.4** (4.b): replace "kill the meaningful survivors with red-first tests; record accepted survivors" with "kill every survivor in `toPublicReport`, `IMPACT_DOMAIN_ERRORS` and the body schema limits with red-first tests; accept only equivalent mutants, each recorded with its id and why it is equivalent".
- **6.3 / 6.4** (5.d): write the non-ASCII bodies with JSON escapes (`"cómo se gestionan los reembolsos"`, five `"😀"`).
- **6.4** (5.b): replace "the thirteenth request within the window" with "then `{"change":"abc"}` repeatedly until `429`, which must be the 13th request to `/api/projects/*/impact` in the window, with `Retry-After` an integer ≥ 1".
- **6.5** (5.c): after "each answered or unknown report wrote one", add "(expected 4; if the count differs, stop and record it)".
- **8.1** (7.b): add `readme.md` line 149 ("F3 (impacto) … Entrega 3") and the "Pantalla 3 — impacto" row at line 183, saying F3 works by CLI and `POST /impact` and only the web screen remains.
- **9.5** (6.a): change "destination A for the next change that touches `impact`" to "destination D — accepted and recorded".

### Linear DIS-95 (comment, in Spanish; the `[original]` block is not edited)
"*Texto del agente (auditoría de spec, ejecución autónoma, 2026-11-02).* La primera auditoría de `http-impact` sale `CHANGES REQUIRED` con 2 hallazgos bloqueantes, que se corrigen en el propio cambio: (1) la estrictez de los esquemas de respuesta: el serializador ya descarta las claves no declaradas, así que el test de la tarea 2.4 no puede detectar un spread; se fija `z.object` como en `/ask` y se corrige la tarea; (2) la tarea 1.2 no podía pasar a verde sin una ruta mínima registrada; la ruta mínima y la semilla `impact` se adelantan a la 1.2. Pregunta del padre (DIS-93 AC 4 lista `usage` y no `status`): se mantiene P1 (destino D); el DoD «solo los campos de §4» se comprueba contra el §4 reescrito en este cambio. El destino del fallback del `## Purpose` (decisión 7) pasa de A a D. Nada queda para la autora."

---

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), 2026-11-02. Decisions taken as lead engineer are recorded in `design.md` → Follow-ups R1–R5. `openspec validate http-impact --strict` passes after the edits.*

| Finding | Severity | Resolution |
|---|---|---|
| Q1 (parent AC 4 lists `usage`, not `status`) | question | Decided by the agent: P1 confirmed (destination D); the DIS-95 DoD is checked against the §4 rewritten by this change; task 8.1 says so (Follow-ups R3). |
| 2.a (graph/git separation in Q2) | improvable | Fixed: the Q2 scenario now says no entry of `direct`, `indirect` or `tests` has `file` `app/Services/ShippingService.php`. |
| 3.a (events of an unknown report) | improvable | Fixed: "An unknown report with events sends no events" builds the app with a test log stream and checks the `info` line with `reqId`, `type` and `code`; task 2.4 names `logStream()`. |
| 3.b (store failure inside the use case) | improvable | Fixed: the second half of "Another error on impact answers INTERNAL" resolves the project and fails the traversal read; task 2.5 names `getProject` resolving and `neighbors` rejecting (Follow-ups R4). |
| 4.a ("negligible next to the traversal") | improvable | Fixed in design → Risks with the reads counted. |
| 4.b ("meaningful survivors") | improvable | Fixed in task 5.4 as worded by the audit. |
| 5.a (response-schema strictness; RED that cannot fail) | blocking | Fixed and decided by the agent: `z.object` as `/ask`; design D1 says the serializer is the guarantee and `toPublicReport` is defence in depth; the requirement is reworded to the observable behaviour; task 1.2 names `z.object`; task 2.4's RED now fails on `staleSince` of a current document (Follow-ups R1). |
| 5.b (13th request) | improvable | Fixed in task 6.4: `{"change":"abc"}` repeated until `429`, which must be the 13th request, `Retry-After` an integer ≥ 1. |
| 5.c (expected `query_log` count) | improvable | Fixed in task 6.5: expected 4, stop and record if different. |
| 5.d (non-ASCII bytes from Git Bash) | improvable | Fixed in tasks 6.3 and 6.4 with JSON escapes (Follow-ups R5). |
| 6.a (destination A for a future change) | improvable | Fixed: design D8, Follow-ups E7 and task 9.5 use destination D, accepted and recorded; no new ticket. |
| 7.a (closed sets listed twice) | improvable | Fixed: design D6 names `docs/backend-standards.md` §4 as the rule departed from and adds the two-way compile-time equality check against `RiskLevel` and `ImpactUnknownReason`; P4 and task 1.2 updated. |
| 7.b (readme lines 149 and 183) | improvable | Fixed: task 8.1 adds the *Estado en la Entrega 2* sentence and the «Pantalla 3 — impacto» row. |
| 8.a (same defect as 5.a from the code) | blocking | Fixed by the 5.a correction. |
| 8 minor (D7 registration order) | improvable | Fixed: design D7 and task 1.2 say between `registerAskRoute` and `registerReindexRoute`. |
| 9.a (task 1.2 cannot reach GREEN) | blocking | Fixed and decided by the agent with option (a): task 1.2 also creates the minimal route answering `501`, the seam and its registration; 1.3 goes RED on `501` and GREEN in 2.2; 2.2 completes the route and no longer touches `app.ts` (Follow-ups R2). |

Nothing is left for the author: no task or follow-up has destination C.
