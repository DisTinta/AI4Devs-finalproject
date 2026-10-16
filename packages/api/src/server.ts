/**
 * The API process (design U6): starts the API from `process.env`. On a start-up failure it writes one
 * `{"error":{code,message,details}}` line to stderr and sets the exit code to `1`; once listening,
 * `SIGINT` or `SIGTERM` closes the app (which ends the store's connections) and exits `0`, or `1`
 * when closing fails.
 *
 * @module
 */
import { startApi } from './start.js';
import { startupFailure } from './startup-failure.js';

try {
  const { app } = await startApi(process.env);
  const stop = (): void => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: startupFailure(error) })}\n`);
  process.exitCode = 1;
}
