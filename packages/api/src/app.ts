import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyServerOptions } from 'fastify';
import type { LlmPort, SourceTreePort, StorePort } from '@codemind/core';
import { installErrorHandler } from './plugins/error-handler.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { installZodCompilers } from './plugins/zod-compiler.js';
import { registerHealthRoute } from './routes/health.js';

/** Largest request body accepted, in bytes (64 KiB). */
export const BODY_LIMIT_BYTES = 65_536;

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
}

/** How the app is built. */
export interface AppOptions {
  /** Requests per client IP within the window. */
  rateLimit: { max: number; windowMs: number };
  /** Fastify's logger options; no logger when absent. */
  logger?: FastifyServerOptions['logger'];
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The dependencies the business routes delegate to. */
    readonly deps: Readonly<AppDeps>;
  }
}

/** What the request log records of a request: never its body nor any header but `host` (design U9). */
// A type alias, not an interface: Fastify's serialiser type needs an implicit index signature.
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
    remotePort: request.socket?.remotePort,
  };
}

/** `logger` with {@link serializeRequest} added to its serialisers; `false` when there is none. */
function withRequestSerializer(logger: AppOptions['logger']): FastifyServerOptions['logger'] {
  if (logger === undefined || logger === false) return false;
  const options = logger === true ? {} : logger;
  return { ...options, serializers: { ...options.serializers, req: serializeRequest } };
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
  return app;
}
