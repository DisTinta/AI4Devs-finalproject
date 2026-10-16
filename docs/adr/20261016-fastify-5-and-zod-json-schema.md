# The API runs on Fastify 5 with Zod as its single schema language, through its own compilers

## Status
Accepted

## Context and problem
Until DIS-76, `packages/api` was one file on Fastify `4.29.1` with `GET /health` and no validation,
error format or OpenAPI document. DIS-76 (CM-HU-12.1) builds the HTTP base every business route of
the API reuses (`POST /ask` in DIS-78, `POST /index` in DIS-9, `POST /impact` in CM-HU-16b), and
`readme.md` promises schema validation of every request body (§4), an OpenAPI document at `/docs`
(§1.4) and rate limiting by IP (§2.5). Two choices made here bind every future route:

* **The Fastify major.** Fastify 4 is out of support since 2025-06-30. The plugins the base needs —
  `@fastify/swagger`, `@fastify/swagger-ui` and `@fastify/rate-limit` — require Fastify 5 in their
  current majors (`9.9.2`, `6.1.2`, `11.2.1` on 2026-10-16); their Fastify 4 lines (`8.15.0`, `4.2.0`,
  `9.1.0`) receive no fixes.
* **The schema language.** Fastify validates with Ajv over JSON Schema by default, while the rest of
  the backend already uses Zod `4.6.5` for every schema (core since DIS-38, the LLM adapter since
  DIS-17; `docs/backend-standards.md` §1). Zod 4 converts a schema to OpenAPI 3.0 JSON Schema natively
  (`z.toJSONSchema(schema, { target: 'openapi-3.0' })`).

## Options considered
* **Stay on Fastify 4** with the old plugin majors.
* **Fastify 5 with JSON Schema (Ajv)** for the routes, and Zod only inside core.
* **Fastify 5 with Zod through `fastify-type-provider-zod`.**
* **Fastify 5 with Zod through the API's own validator and serializer compilers** (~50 lines in
  `packages/api/src/plugins/zod-compiler.ts`) and a `transform` for `@fastify/swagger` built on
  `z.toJSONSchema`.

## Decision
We choose **Fastify 5 with Zod through the API's own compilers**. This is the agent's decision as lead
engineer in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
recorded as D1 and D2 in the `[enhanced]` description of DIS-76; the author reviews it afterwards.
The reasons:
* Staying on Fastify 4 would tie the base of every endpoint to unpatched branches; the cost of moving
  now is low (the only route was `/health`, and Node `>=20.11` is already required).
* One schema language: a route's Zod schema is the single source of truth for validation, response
  serialisation (undeclared fields are dropped, so a new column cannot leak) and the OpenAPI document,
  as `docs/backend-standards.md` §1 already asks. Ajv schemas would duplicate shapes core declares in
  Zod.
* `fastify-type-provider-zod` would be a fifth runtime dependency with its own peer chain for what
  Zod 4 already covers in about fifty lines; the ticket lists four dependencies.
* Owning the compilers lets the API keep only `{ path, code, message }` per validation issue (never
  the received value) and fail at `ready()` with a `TypeError` naming the route when a schema is not
  a Zod schema.

## Consequences
* Handlers are not typed from their schemas automatically: each route types its body, query and
  response with `z.infer<typeof schema>` explicitly.
* Request schemas must be built with `z.strictObject` (an undeclared key is a `VALIDATION_ERROR`) and
  response schemas with `z.object` and enumerated fields; a schema Zod cannot represent in JSON
  Schema (a `.transform()`) makes the app fail at `ready()`.
* A plugin route that declares a JSON Schema for its body, query, params, headers or response would
  fail at `ready()`; `@fastify/swagger-ui` declares none, and a new plugin must be checked for it.
* `@fastify/swagger`, `@fastify/swagger-ui` and `@fastify/rate-limit` follow Fastify's majors: the
  next Fastify major moves the four together.
* Reverting means rewriting every route's schema and the error handler's validation branch.
