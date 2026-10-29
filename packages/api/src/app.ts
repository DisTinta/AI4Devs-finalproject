import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyServerOptions } from 'fastify';
import type { AnalyzerPort, explain, GitPort, LlmPort, ProjectLanguage, reindexProject, SourceTreePort, StorePort } from '@codemind/core';
import { installErrorHandler } from './plugins/error-handler.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { installZodCompilers } from './plugins/zod-compiler.js';
import { registerAskRoute } from './routes/ask.js';
import { registerHealthRoute } from './routes/health.js';
import { registerReindexRoute } from './routes/reindex.js';

/** Largest request body accepted, in bytes (64 KiB). */
export const BODY_LIMIT_BYTES = 65_536;

/**
 * What `POST /api/projects/{projectId}/index` needs besides the store and the source tree. Composed
 * only when both `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` are set; absent means indexing disabled.
 */
export interface IndexingDeps {
  /** The allowed repositories root (trimmed). */
  allowedRoot: string;
  /** Reads a repository's history, with the author-hash salt. */
  git: GitPort;
  /** The analyzer of a project language. */
  analyzerFor(language: ProjectLanguage): AnalyzerPort;
  /** The extractor name of the analyzer of a project language, as published in the `202` body. */
  analyzerName(language: ProjectLanguage): string;
  /** Runs work in one transaction of the store; `work` receives the store bound to it. */
  inTransaction<T>(work: (store: StorePort) => Promise<T>): Promise<T>;
}

/** What the business routes delegate to: the ports, the clock and the repository root. */
export interface AppDeps {
  /** The store. */
  store: StorePort;
  /** The language model, already wrapped by the daily ceiling when one applies. */
  llm: LlmPort;
  /** Reads the projects' files. */
  source: SourceTreePort;
  /** The clock. */
  now: () => Date;
  /** The repository root, against which a project's relative `root_path` resolves. */
  workspaceRoot: string;
  /** The indexing dependencies; absent means `POST /api/projects/{projectId}/index` answers `INDEXING_DISABLED`. */
  indexing?: IndexingDeps;
}

/** How the app is built. */
export interface AppOptions {
  /** Requests per client IP within the window. */
  rateLimit: { max: number; windowMs: number };
  /** Fastify's logger options (an object, such as `{ level: 'info' }`); no logger when absent. */
  logger?: Exclude<FastifyServerOptions['logger'], boolean>;
  /** The use case of `POST /api/projects/{projectId}/ask`; core's `explain` when absent. A test seam only. */
  explain?: typeof explain;
  /** The use case of `POST /api/projects/{projectId}/index`; core's `reindexProject` when absent. A test seam only. */
  reindex?: typeof reindexProject;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The dependencies the business routes delegate to. */
    readonly deps: Readonly<AppDeps>;
  }
}

/**
 * What the request log records of a request: never its body nor any header but `host` (design U9).
 * A type alias, not an interface: Fastify's serialiser type needs an implicit index signature.
 */
export type LoggedRequest = {
  /** The HTTP method. */
  method: string;
  /** The URL as requested, with its query string. */
  url: string;
  /** The `host` header. */
  host: string;
  /** The client address (the socket's, as `trustProxy` is off). */
  remoteAddress: string;
  /** The client port. */
  remotePort: number | undefined;
};

/**
 * The request serialiser of the log (design U9): Fastify's default without `version` (the
 * `accept-version` header), so no request header but `host` reaches the log.
 *
 * @param request The request.
 * @returns The logged fields.
 */
export function serializeRequest(request: FastifyRequest): LoggedRequest {
  return {
    method: request.method,
    url: request.url,
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort,
  };
}

/** `logger` with {@link serializeRequest} added to its serialisers; `false` when there is none. */
function withRequestSerializer(logger: AppOptions['logger']): FastifyServerOptions['logger'] {
  return logger === undefined ? false : { ...logger, serializers: { ...logger.serializers, req: serializeRequest } };
}

/**
 * Builds the API without listening and without reading the environment (design U6), so tests drive
 * it with `inject`. The returned instance is not ready yet: routes may still be added before `ready()`.
 *
 * @param deps The dependencies the routes delegate to.
 * @param options The rate limit and the logger.
 * @returns The instance, not ready.
 */
export async function buildApp(deps: AppDeps, options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ bodyLimit: BODY_LIMIT_BYTES, logger: withRequestSerializer(options.logger) });
  installZodCompilers(app);
  installErrorHandler(app);
  app.decorate('deps', Object.freeze({ ...deps }));
  await registerOpenApi(app);
  await registerRateLimit(app, options.rateLimit);
  registerHealthRoute(app);
  registerAskRoute(app, { explain: options.explain });
  registerReindexRoute(app, { reindex: options.reindex });
  return app;
}
