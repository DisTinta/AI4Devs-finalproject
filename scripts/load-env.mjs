/**
 * The `.env` preload (DIS-102 design D3, D4): imported with `--import ./scripts/load-env.mjs` by the
 * npm scripts of the guide (and with `--import ../../scripts/load-env.mjs` by the API's `dev`), it
 * loads the repository root's `.env` into `process.env` before the program starts. A variable already
 * set in the environment keeps its value. It exports nothing.
 *
 * Spec: `local-startup` → "Loading .env into a process" and "Which commands load .env".
 */
import { DOTENV_PATH, loadEnvFile } from './env.mjs';

loadEnvFile(DOTENV_PATH, process.env, process.stderr);
