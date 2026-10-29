/**
 * `@codemind/api` — the HTTP base of the API (DIS-76): `buildApp` builds the Fastify instance with
 * the error format, Zod validation, the OpenAPI document at `/docs`, the rate limit by IP,
 * `/health` and, since DIS-78, `POST /api/projects/{projectId}/ask`; `composeFromEnv` and `startApi`
 * compose it from the environment. Importing this module starts nothing: the process entry is `src/server.ts`.
 *
 * @module
 */
export { buildApp, BODY_LIMIT_BYTES, serializeRequest, type AppDeps, type AppOptions, type IndexingDeps, type LoggedRequest } from './app.js';
export {
  API_APPLICATION_NAME,
  apiConfigFromEnv,
  ApiConfigError,
  composeFromEnv,
  type ApiConfig,
  type ApiConfigVariable,
  type ComposedApi,
  type ComposeSeams,
  type Environment,
} from './composition.js';
export { startApi, type StartedApi } from './start.js';
export { startupFailure, type StartupFailure } from './startup-failure.js';
export { errorSchema, healthResponseSchema, type ErrorBody } from './schemas/common.js';
export {
  askAnsweredSchema,
  askBodySchema,
  askParamsSchema,
  askResponseSchema,
  askUnknownSchema,
  askUsageSchema,
  type AskAnswered,
  type AskBody,
  type AskParams,
  type AskResponse,
  type AskUnknown,
  type AskUsage,
} from './schemas/ask.js';
export { registerAskRoute, type AskRouteOptions } from './routes/ask.js';
export {
  reindexBodySchema,
  reindexParamsSchema,
  reindexResponseSchema,
  type ReindexBody,
  type ReindexParams,
  type ReindexResponse,
} from './schemas/reindex.js';
export { registerReindexRoute, type ReindexRouteOptions } from './routes/reindex.js';
