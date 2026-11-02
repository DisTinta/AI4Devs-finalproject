## Why

The impact report (DIS-89, DIS-90, DIS-94: `direct`, `indirect`, `tests`, `docs`, `history`, `risk`)
can only be reached through the CLI `impact`. `readme.md` §4 promises
`POST /api/projects/{projectId}/impact`, and the web screen 3 (DIS-14) and any script need it. The API
already has everything a route needs (error format, Zod validation, OpenAPI at `/docs`, rate limit by
IP, per-route domain error tables, DIS-76/DIS-78), so this is the last piece of CM-HU-16b (DIS-93).

This is DIS-95 (CM-HU-16b.2). Its user story: "Como desarrolladora (o la pantalla 3 de la web,
DIS-14) que va a cambiar un componente, quiero pedir por HTTP el informe de impacto de un cambio
descrito en palabras, con lo que viene del grafo separado de lo que viene del historial de git, la
documentación relacionada y el riesgo con su justificación, para saber qué más se vería afectado sin
abrir la CLI." Its DoD: the route is visible in `/docs`, tests cover `200`, `400` and `404`, and the
response lists only the fields of §4 (as §4 is rewritten by this change, design D1).

The decisions were taken by the agent as lead engineer in the autonomous run (`docs/AUTONOMOUS-RUN.md`
§6) and recorded in the DIS-95 `[enhanced]` description and its comment of 2026-11-02; they are in
`design.md` → Follow-ups (E1–E8).

## What Changes

- New route `POST /api/projects/{projectId}/impact` (`packages/api/src/routes/impact.ts`), registered by
  `buildApp` after `/ask`, so it is rate limited and documented. It validates, resolves the project
  with `StorePort.getProject` before the use case (so an unknown id answers `404` also for a change
  with no search term, closing DIS-89 P6), delegates to core's `impact` with the app's clock and
  serialises the public report field by field.
- New Zod schemas (`packages/api/src/schemas/impact.ts`), the only description of the payload:
  - path `projectId`: the shared `projectIdParamsSchema` (8-4-4-4-12 hexadecimal, any case);
  - strict body `{ change, maxHops? }`: `change` 5–500 code points, not only whitespace, without
    U+0000; `maxHops` an integer from 1 to `MAX_HOPS` (3), absent → the use case's default 2, published
    in OpenAPI as `default`; any other key rejected. Every limit is imported from `@codemind/core`;
  - `200` response: the `answered` report (`status`, `direct`, `indirect`, `tests`, `docs`, `history`,
    `risk`) or `{ status: 'unknown', reason: 'no-anchor' }`. No `events`, no `usage` (the impact makes
    no model call), no `projectId`, no change text.
- Its own domain error table: `PROJECT_NOT_FOUND` → `404` `project not found` `{}`;
  `INVALID_IMPACT_REQUEST` → `400` `invalid request` `{ field }`; any other error → `500` `INTERNAL`.
- The report's `query_not_logged` events go to the request log at `info`, never to the body.
- `AppOptions.impact` (a test seam, as `explain` and `reindex`); `packages/api/src/index.ts` exports the
  new schemas, their types and `registerImpactRoute`.
- Docs: `readme.md` §4 (the `/impact` OpenAPI block rewritten to the real shape with a seed example,
  its error table, the `PROJECT_NOT_FOUND` sentence), the architecture and stack lines that say
  "`/impact` en la Entrega 3"; `docs/project-context.md`; `docs/DEMO.md` Paso 4 (only the web screen
  is still pending).
- `openspec/specs/impact/spec.md` → `## Purpose` names the related documentation (current or stale)
  and the co-change history from git of an answered report (task 13.7 of DIS-94, carried here; design
  D8). Edited while this change is active and approved, before `/opsx:archive`.

## Capabilities

### New Capabilities

- `http-impact`: the `POST /api/projects/{projectId}/impact` endpoint — request validation, project
  resolution, delegation to `impact`, the public `answered` and `unknown` shapes, its error answers,
  the logging of the report's events, its OpenAPI entry and its rate limit.

### Modified Capabilities

None. `impact` keeps every requirement (only its `## Purpose` text is updated, design D8);
`api-foundation` already allows a route's own domain error table (DIS-78).

## Impact

- Code: `packages/api/src/schemas/impact.ts` and `packages/api/src/routes/impact.ts` (new);
  `packages/api/src/app.ts` (seam and registration); `packages/api/src/index.ts` (exports). Core, the
  adapters, the CLI and the web do not change.
- Tests: `tests/unit/api/impact.spec.ts` (`inject` with the in-memory acme-shop subset and counted
  doubles, runs under Stryker) and `tests/integration/api/impact.spec.ts` (`inject` over Postgres with
  the acme-shop seed). No existing test changes (`tests/unit/api/health-docs.spec.ts` asserts paths
  with `toContain`, so a new path does not break it).
- Dependencies: none new.
- Security and privacy: no received value (change text, project id) appears in an error body or a log
  line; the change text is stored only in `query_log`, as with the CLI; the response carries no
  database id. No model call, cost 0, unaffected by the daily LLM ceiling.

### Non-goals

- The web screen 3 and its typed client (DIS-14).
- Any change to the `impact` use case, its risk, `docs` or `history` (DIS-89, DIS-90, DIS-94).
- Projecting `history` to one entry per pull request (design D1).
- A `npm run demo:impact` helper, a new HTTP step in `docs/DEMO.md`, `GET /api/projects`, other
  endpoints, authentication.
