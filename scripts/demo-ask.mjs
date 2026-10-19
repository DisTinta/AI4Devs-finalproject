/**
 * `npm run demo:ask -- <projectId> "<question>"` (DIS-102 design D8): sends one question to the
 * running API and prints the status and a short summary of the answer, with the same command in
 * PowerShell and in Bash. It replaces the Bash-only `ask_api` function of the old demo guide.
 *
 * Spec: `local-startup` → "The demo question helper".
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOTENV_PATH, loadEnvFile } from './env.mjs';

/**
 * @typedef {{ write(chunk: string): unknown }} Writable
 * @typedef {(url: string, init: { method: string, headers: Record<string, string>, body: string }) => Promise<{ status: number, text(): Promise<string> }>} Fetch
 */

/**
 * The summary `demo:ask` prints for a response body.
 *
 * @param {unknown} body - The parsed JSON body.
 * @returns {unknown} The summary.
 */
function summarise(body) {
  const answer = /** @type {{ statements: unknown[], evidence?: unknown[], usage?: unknown }} */ (body);
  return { statements: answer.statements.length, evidence: answer.evidence?.length ?? 0, usage: answer.usage };
}

/**
 * Sends the question and prints the result; resolves with the exit code.
 *
 * @param {string[]} args - The command-line arguments: the project id and the question.
 * @param {{ env: Record<string, string | undefined>, dotenvPath?: string, fetch?: Fetch, stdout: Writable, stderr: Writable }} options
 *   - The environment to load `.env` into, the `.env` path, the `fetch` to use and the output streams.
 * @returns {Promise<number>} The exit code.
 */
export async function runDemoAsk(args, { env, dotenvPath = DOTENV_PATH, fetch = globalThis.fetch, stdout, stderr }) {
  loadEnvFile(dotenvPath, env, stderr);
  const [projectId, question] = args;
  const port = env.PORT?.trim() || '3000';
  const response = await fetch(`http://127.0.0.1:${port}/api/projects/${encodeURIComponent(projectId)}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ question }),
  });
  const body = JSON.parse(await response.text());
  stdout.write(`HTTP ${response.status}\n${JSON.stringify(summarise(body), null, 2)}\n`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDemoAsk(process.argv.slice(2), {
    env: process.env,
    dotenvPath: DOTENV_PATH,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
