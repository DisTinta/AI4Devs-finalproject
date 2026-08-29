import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

/**
 * Process entrypoint. Loads and validates the environment, builds the app, and
 * starts listening. Any startup failure exits non-zero.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildApp({ logger: true });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
