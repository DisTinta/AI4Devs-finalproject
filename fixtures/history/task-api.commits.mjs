// Deterministic commit history for the task-api fixture.
//
// Replayed by ../build-history.mjs. Dates span 2024-06 .. 2024-09. Three
// fictitious authors. Several messages carry a "(#NN)" for pr_number.
//
// Co-change pair: src/services/task.service.ts <-> src/schemas/task.schema.ts
// change together in three commits (#15, #31, #40). The service imports from
// the schema only indirectly, so the strong historical coupling is not
// something the static import graph makes obvious.
//
// No drift is planted here — F6 is demonstrated in acme-shop.
//
// Semantic diffs: commits #31 and #40 carry a real diff. The 'before' field
// is placed on the EARLIER touch of each file so the next touch (which writes
// the new state) produces a meaningful diff instead of a filler marker removal.

const NOA = 'Noa Ferreira <noa.ferreira@taskapi.test>';
const IVAN = 'Iván Molina <ivan.molina@taskapi.test>';
const SARA = 'Sara Klein <sara.klein@taskapi.test>';

export default [
  { date: '2024-06-03T09:20:00', author: NOA, message: 'chore: scaffold TypeScript + Fastify project',
    files: ['package.json', 'tsconfig.json', '.gitignore', '.env.example', 'vitest.config.ts'] },
  { date: '2024-06-05T11:15:00', author: IVAN, message: 'feat: task status lifecycle and transitions',
    files: ['src/domain/task-status.ts'] },
  { date: '2024-06-07T14:02:00', author: NOA, message: 'feat: task priority with ordered ranks',
    files: ['src/domain/task-priority.ts'] },
  { date: '2024-06-10T10:44:00', author: SARA, message: 'feat: task entity and pagination types (#3)',
    files: ['src/domain/task.entity.ts', 'src/domain/pagination.ts'] },
  { date: '2024-06-13T16:30:00', author: IVAN, message: 'feat: domain errors with http mapping',
    files: ['src/domain/errors.ts'] },
  // Schema first introduced without nullable fields or refine check.
  // PR #31 will add those; using snapshot so that diff is real.
  { date: '2024-06-17T09:55:00', author: NOA, message: 'feat: zod task schemas for create and update (#6)',
    files: [
      { path: 'src/schemas/task.schema.ts', before: 'snapshots/r31/src/schemas/task.schema.ts' },
    ] },
  { date: '2024-06-20T13:12:00', author: SARA, message: 'feat: pagination query schema and barrel export',
    files: ['src/schemas/pagination.schema.ts', 'src/schemas/index.ts'] },
  { date: '2024-06-24T10:08:00', author: IVAN, message: 'feat: task repository port (#9)',
    files: ['src/repositories/task.repository.ts'] },
  { date: '2024-06-27T15:26:00', author: NOA, message: 'feat: pure filtering and sorting helpers',
    files: ['src/services/task.filters.ts'] },
  { date: '2024-07-01T11:33:00', author: SARA, message: 'feat: in-memory task repository (#12)',
    files: ['src/repositories/in-memory-task.repository.ts'] },
  { date: '2024-07-04T09:41:00', author: IVAN, message: 'feat: uuid id helper',
    files: ['src/services/id.ts'] },
  // Service first introduced with explicit conditional checks (before PR #40
  // aligns it to schema defaults). Schema re-touched with no semantic change.
  { date: '2024-07-08T14:50:00', author: NOA, message: 'feat: task service with transition rules (#15)',
    files: [
      { path: 'src/services/task.service.ts', before: 'snapshots/r31/src/services/task.service.ts' },
      { path: 'src/schemas/task.schema.ts', before: 'snapshots/r31/src/schemas/task.schema.ts' },
    ] },
  { date: '2024-07-11T10:17:00', author: SARA, message: 'feat: environment parsing with zod',
    files: ['src/config/env.ts'] },
  { date: '2024-07-15T16:04:00', author: IVAN, message: 'feat: fastify instance decorator typing (#18)',
    files: ['src/types/index.ts'] },
  { date: '2024-07-18T09:28:00', author: NOA, message: 'feat: single error boundary plugin',
    files: ['src/plugins/error-handler.ts'] },
  { date: '2024-07-22T13:45:00', author: SARA, message: 'feat: db composition-root plugin (#21)',
    files: ['src/plugins/db.ts'] },
  { date: '2024-07-25T11:09:00', author: IVAN, message: 'feat: openapi generation plugin',
    files: ['src/plugins/swagger.ts'] },
  { date: '2024-07-29T15:52:00', author: NOA, message: 'feat: task and health controllers (#24)',
    files: ['src/controllers/tasks.controller.ts', 'src/controllers/health.controller.ts'] },
  { date: '2024-08-01T10:36:00', author: SARA, message: 'feat: routes with schemas attached (#26)',
    files: ['src/routes/tasks.routes.ts', 'src/routes/health.routes.ts', 'src/routes/index.ts'] },
  { date: '2024-08-05T14:23:00', author: IVAN, message: 'feat: app builder and server bootstrap (#28)',
    files: ['src/app.ts', 'src/server.ts'] },
  // Tightens schema: adds nullable fields and empty-body refine. Tightens
  // service to match. 'before' = post-tighten/pre-defaults state (r40 snapshot).
  { date: '2024-08-08T09:47:00', author: NOA, message: 'refactor: tighten create and update validation (#31)',
    files: [
      { path: 'src/schemas/task.schema.ts', before: 'snapshots/r40/src/schemas/task.schema.ts' },
      { path: 'src/services/task.service.ts', before: 'snapshots/r40/src/services/task.service.ts' },
    ] },
  { date: '2024-08-12T13:30:00', author: SARA, message: 'test: helpers and status unit tests',
    files: ['tests/helpers/build-app.ts', 'tests/unit/task-status.test.ts'] },
  { date: '2024-08-15T11:14:00', author: IVAN, message: 'test: filter and sort unit tests (#34)',
    files: ['tests/unit/task.filters.test.ts'] },
  { date: '2024-08-19T15:41:00', author: NOA, message: 'test: task service unit tests',
    files: ['tests/unit/task.service.test.ts'] },
  { date: '2024-08-22T10:05:00', author: SARA, message: 'test: routes integration tests (#37)',
    files: ['tests/integration/tasks.routes.test.ts'] },
  { date: '2024-08-26T14:18:00', author: IVAN, message: 'test: request validation integration tests',
    files: ['tests/integration/validation.test.ts'] },
  // Last touch of schema and service: adds .default() calls to schema so they
  // match service defaults; simplifies service to ?? operator. Diff from r40.
  { date: '2024-08-29T09:52:00', author: NOA, message: 'refactor: align schema defaults with service (#40)',
    files: ['src/schemas/task.schema.ts', 'src/services/task.service.ts'] },
  { date: '2024-09-02T13:07:00', author: SARA, message: 'docs: api reference and project readme',
    files: ['docs/api.md', 'README.md'] },
];
