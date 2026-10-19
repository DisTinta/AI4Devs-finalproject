/**
 * `npm run up` (DIS-102 design D5): loads the repository root's `.env` and starts the whole system
 * with the same command in PowerShell and in Bash: `docker compose up -d --wait`, `npm install`,
 * `npm run db:migrate`, `npm run db:seed` and `npm run dev`, in order, from the repository root. It
 * imports only Node built-in modules and files of `scripts/`, so it works before `npm install`.
 *
 * Spec: `local-startup` → "One command starts the system".
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { DOTENV_PATH, loadEnvFile } from './env.mjs';

/** The repository root: the parent directory of `scripts/`, resolved from this module (A22). */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * @typedef {{ cwd: string, env: Record<string, string | undefined>, stdio: 'inherit', shell: false }} StepOptions
 * @typedef {{ code: number | null, signal: string | null } | { error: NodeJS.ErrnoException }} StepResult
 * @typedef {(command: string, args: string[], options: StepOptions) => Promise<StepResult>} StepRunner
 */

/**
 * Starts `command` with inherited standard streams and no shell, and resolves with how it ended.
 *
 * @type {StepRunner}
 */
function spawnStep(command, args, options) {
  return new Promise((done) => {
    const child = spawn(command, args, options);
    child.once('error', (error) => done({ error }));
    child.once('exit', (code, signal) => done({ code, signal }));
  });
}

/**
 * Subscribes `listener` to the process's SIGINT and returns the function that removes it.
 *
 * @param {() => void} listener - Called on Ctrl+C.
 * @returns {() => void} The unsubscribe function.
 */
function onProcessInterrupt(listener) {
  process.on('SIGINT', listener);
  return () => process.off('SIGINT', listener);
}

/**
 * The steps of the start sequence: the line `up` prints, and the command it runs. The npm steps run
 * the npm that started `up` (`npm_execpath`) with the same Node, never `npm` by name through a shell.
 *
 * @param {string} npmCli - The npm-cli.js of the running npm.
 * @returns {{ label: string, command: string, args: string[] }[]} The steps, in order.
 */
function startSequence(npmCli) {
  const npm = (/** @type {string[]} */ ...args) => ({
    label: `npm ${args.join(' ')}`,
    command: process.execPath,
    args: [npmCli, ...args],
  });
  return [
    { label: 'docker compose up -d --wait', command: 'docker', args: ['compose', 'up', '-d', '--wait'] },
    npm('install'),
    npm('run', 'db:migrate'),
    npm('run', 'db:seed'),
    npm('run', 'dev'),
  ];
}

/**
 * Runs the start sequence and resolves with the exit code of `up`.
 *
 * @param {{
 *   env: Record<string, string | undefined>,
 *   dotenvPath?: string,
 *   run?: StepRunner,
 *   stdout: { write(chunk: string): unknown },
 *   stderr: { write(chunk: string): unknown },
 *   cwd?: string,
 *   onInterrupt?: (listener: () => void) => () => void,
 * }} options - The environment to load `.env` into and give every step, the `.env` path, the step
 *   runner, the output streams, the directory the steps run in and the SIGINT subscription.
 * @returns {Promise<number>} The exit code.
 */
export async function runUp({ env, dotenvPath = DOTENV_PATH, run = spawnStep, stdout, stderr, cwd = ROOT }) {
  loadEnvFile(dotenvPath, env, stderr);
  const npmCli = /** @type {string} */ (env.npm_execpath);
  for (const step of startSequence(npmCli)) {
    stdout.write(`[up] ${step.label}\n`);
    await run(step.command, step.args, { cwd, env, stdio: 'inherit', shell: false });
  }
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runUp({
    env: { ...process.env },
    dotenvPath: DOTENV_PATH,
    run: spawnStep,
    stdout: process.stdout,
    stderr: process.stderr,
    onInterrupt: onProcessInterrupt,
  });
}
