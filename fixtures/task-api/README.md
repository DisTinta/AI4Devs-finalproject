# task-api

A small task-management HTTP API. TypeScript on Node 20, [Fastify](https://fastify.dev)
for routing, [Zod](https://zod.dev) for schema-first request validation.

It does one thing: CRUD over tasks, with filtering, pagination and a status
lifecycle. It is intentionally small and intentionally boring — no dynamic
dispatch, no reflection, no string-resolved handlers. Every reference resolves
at compile time.

## Design

- **Schema-first validation.** Each route attaches a Zod schema. Requests are
  parsed and typed before any controller runs, so *how requests are validated*
  has one answer, in one place: `src/schemas/`.
- **Ports over stores.** The service depends on the `TaskRepository` interface,
  not on a concrete database. The in-memory implementation is the default;
  swapping it is a one-line change in `src/plugins/db.ts`.
- **Thin controllers.** Business rules (timestamps, status transitions) live in
  `TaskService`; controllers only shape HTTP.

## Layout

```
src/
  config/env.ts            environment parsing
  domain/                  entity, status/priority, pagination, errors
  schemas/                 Zod request schemas (validation lives here)
  repositories/            TaskRepository port + in-memory adapter
  services/                TaskService (rules) + pure filters
  controllers/             HTTP handlers
  routes/                  route registration with schemas attached
  plugins/                 error handler, db wiring, swagger
  app.ts / server.ts       build + boot
tests/
  unit/                    service, filters, status transitions
  integration/             routes + validation (via app.inject)
```

## Task lifecycle

```
todo ─▶ in_progress ─▶ done ─▶ archived
          ▲   │  ▲        │
          │   ▼  └────────┘
        blocked ───────────▶ archived
```

Illegal moves (e.g. `done → in_progress`) are rejected with `409`.

## Scripts

```bash
npm run dev        # watch mode
npm run test       # vitest
npm run typecheck  # tsc --noEmit
```

## Note

This repository is a **sample fixture** for CODEMIND, not a production service.
It is analyzed, not deployed. See `fixtures/README.md` in the parent project for
its role in the test harness.
