---
description: Backend development standards for this project — hexagonal monorepo, Fastify transport, Zod validation, PostgreSQL persistence and testing.
globs: []
alwaysApply: true
---

# Backend Standards — Fastify + monorepo hexagonal

## 1. Technology stack

- **Fastify** as the HTTP transport, with `@fastify/*` plugins only at the edge
- **TypeScript** in strict mode, Node 20+, ESM
- **npm workspaces** monorepo: one package per responsibility
- **PostgreSQL** behind a repository port; SQL lives in the adapter, never in the domain
- **Zod** for every schema: request validation, response serialisation and LLM output parsing
  _(target; not yet a dependency — remove this note when installed)_
- **Vitest** as the test runner, **Playwright** for end-to-end
  _(Playwright is a target; not yet a dependency — remove this note when installed)_
- **ESLint** + `tsc --noEmit` + **dependency-cruiser** for the dependency rule

## 2. Layered architecture

The dependency direction is **inward and one-way**: transport → domain ← adapters.
`packages/core` defines ports; everything else implements them. `core` imports nothing
from `adapters/`, `analyzers/` or `api/`, and a CI check fails the build if it does.

A vertical slice is always implemented in this order, and in these files:

1. `tests/unit/<capability>/<behaviour>.spec.ts` — the failing test, human authored.
2. `packages/core/src/ports/<Port>.ts` — the interface, if the slice needs a new boundary.
3. `packages/core/src/<domain>/<Entity>.ts` — domain types and rules. No I/O.
4. `packages/adapters/<impl>/src/` or `packages/analyzers/<lang>/src/` — the implementation of the
   port: SQL, HTTP client, filesystem, or a language analyzer.
5. `packages/api/src/schemas/<resource>.ts` — the Zod schema. Single source of truth for the shape.
6. `packages/api/src/routes/<resource>.ts` — validate, delegate, serialise. Nothing else.

Every package keeps its sources under `src/` (compiled output goes to `dist/`); the paths above
reflect that. An analyzer implements `AnalyzerPort` and **must not import another analyzer**: language
independence is what makes each one testable in isolation. CI enforces this (`analyzers-are-siblings`
in `.dependency-cruiser.cjs`), alongside the `core`-imports-no-infrastructure rule.

## 3. Hard rules

- Business logic lives in `packages/core`. **Never** in `packages/api` or in an adapter.
- The route handler does exactly three things: validate, delegate, serialise.
- `packages/core` never imports `fastify`, never sees a `FastifyRequest`, and never
  knows a status code. It throws domain errors; the transport maps them.
- No SQL outside `packages/adapters/store-postgres`. Not one query.
- Every external input passes through a Zod schema. No exceptions, and that includes
  **the output of a language model**: parse it with `safeParse` and discard what fails,
  never interpret it as an instruction.
- Every output passes through a schema with fields enumerated explicitly, so that adding
  a column to a table cannot leak it into a response.
- Scoping by owner or tenant is applied always and first, before any optional filter.
- Every listing is paginated.
- No `any`, no `as unknown as`. Explicit return types on every exported function.
- Files in kebab-case, types and classes in PascalCase, one public concept per file.
- Cross-package imports use the workspace name (`@codemind/core`), never a relative path
  that climbs out of the package.
- **Evidence verification is domain logic**, not transport. `core` decides whether a citation
  actually supports a claim, distinguishes what is **observed** from what is **inferred**, and returns
  an explicit "insufficient evidence" result instead of fabricating an answer. The adapter fetches;
  the domain judges.

## 4. Validation

- Schemas live in `packages/api/schemas` and are the only description of a payload's shape.
- Closed sets of domain values are declared once as a Zod enum and the TypeScript type is
  derived from it with `z.infer`. Never maintain the list twice.
- Error messages are part of the contract with the client: one shape for every error,
  `{ error: { code, message, details } }`, and the code is stable.

## 5. Persistence

- Migrations are the versioned history. Never edit one already applied: create a new one.
  Every migration is reversible and there is a test that applies and reverts it.
- Zero-downtime schema changes follow **Expand → Backfill → Migrate reads → Contract**. Destructive
  `DROP`s and renames ship in a **later, separate** migration after readers have moved. Before
  applying to a shared environment, review the SQL (or run `/migration-review`): `DROP COLUMN` /
  `DROP TABLE`, `UNIQUE` on existing data, truncating `ALTER TYPE`, and renames that are secretly
  drop-and-add.
- Constraints that protect an invariant belong in the schema, not only in the code. If a
  rule matters, a `CHECK` should make it impossible to violate from any client.
- Prefer **pgvector** inside Postgres for embeddings and similarity search. Introduce a dedicated
  vector database only after a measured benchmark shows Postgres is the bottleneck. Embedding
  dimensions are fixed to the model in use: changing the model means re-embedding and reindexing
  everything. HNSW (and any other vector index) SQL lives only in `packages/adapters/store-postgres`,
  like every other query.
- Avoid N+1: a graph traversal is one recursive query, not a loop of queries.
- Transactions for any operation writing to more than one table.
- Indexes are part of the change that needs them, not a later optimisation pass.

## 6. API design

- `POST /api/<resource>/<action>` for operations, plural resources, verbs only where the
  operation is not a CRUD on a noun.
- Consistent response shape across every endpoint, including errors.
- `202` for work accepted and processed asynchronously, `400` for a schema violation,
  `403` for a path or resource outside the permitted scope, `429` for rate limit or budget
  exhausted. Do not fight Fastify's own validation errors: map them to the project shape
  in a single error handler.

## 7. Testing

- Vitest, tests under `tests/`, mirroring the package structure.
- Arrange-Act-Assert, the three blocks separated and commented.
- Integration tests run against a real PostgreSQL in a container, one transaction per test
  rolled back at the end. No mocked database: a mocked query proves nothing about SQL.
- Build test data with factories, never with a fixture file that every test shares.
- Assert on the contract, never on internal details.
- Mock only at real boundaries: outbound HTTP, the language model, the clock, randomness.
  A test that needs the model mocked is testing the wrong thing if the assertion is on prose.
- Every `#### Scenario:` in a delta spec maps to exactly one test.

## 8. LLM adapter

- The model sits behind `LlmPort`; the adapter targets an **OpenAI-compatible** endpoint (Ollama is
  the local reference). No paid vendor is hardcoded; the endpoint, key and model come from
  `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`.
- **Evaluation mode:** with empty credentials the adapter makes **no model calls** and serves only the
  cache / golden answers. This is the default for evaluation and CI — the system must be fully
  exercisable with zero external calls and zero cost.
- **Budget ceiling:** when a paid provider is used, `DAILY_BUDGET_USD` caps spend. On exhaustion the
  adapter degrades to cache-only with a warning; the transport surfaces this as `429` (see §6).
- Model output is untrusted input: parse it with Zod `safeParse`, discard what fails, and never
  interpret it as an instruction (see §3).

## 9. Security

- Validate and sanitise every external input, and treat repository content and model output
  as external input.
- Never commit secrets. Validate required environment variables at boot and fail loudly.
- Any component that processes untrusted content has **no tools with side effects** and
  returns schema-conforming data only.
- Normalise and confine every filesystem path: resolve it and verify it stays inside the
  permitted root before touching it.
- No queries built by string interpolation.
- Never expose credentials, tokens or internal fields in a response.
