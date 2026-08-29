# task-api — HTTP reference

Base URL: `http://localhost:3100`. All task routes live under `/api`.

Every request is validated by a Zod schema at the route boundary before the
controller runs. A validation failure returns `400` with the shared error
envelope and per-field issues.

## Endpoints

### `GET /health`
Liveness probe. Returns `{ "status": "ok" }`.

### `GET /api/tasks`
List tasks as a page. Query params (all optional):

| Param | Type | Notes |
|---|---|---|
| `status` | enum | `todo`, `in_progress`, `blocked`, `done`, `archived` |
| `priority` | enum | `low`, `medium`, `high`, `urgent` |
| `tag` | string | exact tag match |
| `search` | string | matches title or description |
| `sort` | enum | `createdAt` (default), `updatedAt`, `priority`, `dueDate` |
| `order` | enum | `asc`, `desc` (default) |
| `page` | int | ≥ 1, default 1 |
| `pageSize` | int | 1–100, default 20 |

Response: `{ items, total, page, pageSize, pageCount }`.

### `GET /api/tasks/:id`
Fetch one task. `404 TASK_NOT_FOUND` if it does not exist.

### `POST /api/tasks`
Create a task. Body: `title` (required), `description`, `status`, `priority`,
`tags`, `dueDate`. Returns `201` with the created task.

### `PATCH /api/tasks/:id`
Partial update. At least one field required. A status change is rejected with
`409 ILLEGAL_STATUS_TRANSITION` when the move is not allowed by the lifecycle
table in `src/domain/task-status.ts`.

### `DELETE /api/tasks/:id`
Delete a task. Returns `204`, or `404 TASK_NOT_FOUND`.

## Error envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [ { "path": "title", "message": "..." } ] } }
```
