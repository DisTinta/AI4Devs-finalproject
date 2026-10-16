import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { composeFromEnv } from './composition.js';
import type { ComposeSeams, Environment } from './composition.js';

/** A listening API. */
export interface StartedApi {
  /** The instance; closing it ends the store's connections. */
  app: FastifyInstance;
  /** The address it listens on, such as `http://127.0.0.1:3000`. */
  address: string;
}

/**
 * Starts the API from the environment (design U6): composes its dependencies, builds the app with
 * an `info` request log, closes the store when the app closes, and listens on `HOST`:`PORT`. On any
 * failure after the store was opened, it closes the app (or the store, if the app does not exist
 * yet) before rethrowing, so no connection is left behind.
 *
 * @param env The environment.
 * @param seams The composition's test seams.
 * @returns The listening app and its address.
 * @throws What the composition, the build or `listen` threw (for example `EADDRINUSE`).
 */
export async function startApi(env: Environment, seams: ComposeSeams = {}): Promise<StartedApi> {
  const { config, deps, close } = await composeFromEnv(env, seams);
  let app: FastifyInstance | undefined;
  try {
    app = await buildApp(deps, { rateLimit: config.rateLimit, logger: { level: 'info' } });
    app.addHook('onClose', close);
    const address = await app.listen({ port: config.port, host: config.host });
    return { app, address };
  } catch (error) {
    await (app === undefined ? close() : app.close()).catch(() => undefined);
    throw error;
  }
}
