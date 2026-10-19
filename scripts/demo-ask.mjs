/**
 * `npm run demo:ask -- <projectId> "<question>"` (DIS-102 design D8): sends one question to the
 * running API and prints the status and a short summary of the answer, with the same command in
 * PowerShell and in Bash. It replaces the Bash-only `ask_api` function of the old demo guide.
 *
 * Spec: `local-startup` → "The demo question helper".
 */
import { Buffer } from 'node:buffer';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOTENV_PATH, loadEnvFile } from './env.mjs';

/**
 * @typedef {{ write(chunk: string): unknown }} Writable
 * @typedef {(url: string, init: { method: string, headers: Record<string, string>, body: string }) => Promise<{ status: number, text(): Promise<string> }>} Send
 */

/** The exit code of a usage error, as the CLI's (`docs/DEPLOYMENT.md`). */
const USAGE_EXIT_CODE = 2;

/** The API's port when `PORT` is unset or blank (`packages/api/src/composition.ts`). */
const DEFAULT_PORT = 3000;

/**
 * Sends one request with `node:http`, which sets no time limit: Node's `fetch` stops waiting for the
 * headers or the body after 300 s, and a live model on a CPU can take longer (design D23). It resolves
 * with the status once the headers arrive; `text()` rejects when the connection drops before the body
 * ends. A connection that cannot be made rejects.
 *
 * @type {Send}
 */
function sendWithHttp(url, { method, headers, body }) {
  return new Promise((answered, failed) => {
    const outgoing = request(
      url,
      { method, headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) }, agent: false },
      (incoming) => {
        /** @type {Buffer[]} */
        const chunks = [];
        const text = new Promise((read, broken) => {
          incoming.on('data', (chunk) => chunks.push(chunk));
          incoming.on('end', () => read(Buffer.concat(chunks).toString('utf8')));
          incoming.on('error', broken);
          incoming.on('close', () => {
            if (!incoming.complete) broken(new Error('the connection closed before the body ended'));
          });
        });
        // A body nobody reads must not end the process with an unhandled rejection.
        text.catch(() => undefined);
        answered({ status: incoming.statusCode ?? 0, text: () => text });
      },
    );
    outgoing.on('error', failed);
    outgoing.end(body);
  });
}

/**
 * The port the API listens on, read as the API reads `PORT` (A21): trimmed, blank = 3000, decimal
 * digits only, 1–65535.
 *
 * @param {string | undefined} value - The `PORT` variable.
 * @returns {number | undefined} The port, or `undefined` when `value` is not a port number.
 */
function apiPort(value) {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return DEFAULT_PORT;
  const port = /^[0-9]+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return port >= 1 && port <= 65_535 ? port : undefined;
}

/**
 * The text `demo:ask` prints after the status line: for a `2xx` `UNKNOWN` body its answer, reason and
 * message; for any other `2xx` body with a `statements` array its counts and usage; otherwise the body
 * as it came (indented when it is JSON).
 *
 * @param {number} status - The HTTP status.
 * @param {string} text - The response body.
 * @returns {string} The text to print.
 */
function describeBody(status, text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return text;
  }
  if (isSuccess(status) && typeof body === 'object' && body !== null) {
    // An UNKNOWN body also has `statements: []`, so it is recognised first (A4).
    if (body.answer === 'UNKNOWN') {
      const { answer, reason, message } = body;
      return indent(message === undefined ? { answer, reason } : { answer, reason, message });
    }
    if (Array.isArray(body.statements)) {
      const evidence = Array.isArray(body.evidence) ? body.evidence.length : 0;
      return indent({ statements: body.statements.length, evidence, usage: body.usage });
    }
  }
  return indent(body);
}

/**
 * `value` as JSON indented with two spaces.
 *
 * @param {unknown} value - The value.
 * @returns {string} The JSON text.
 */
function indent(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * Whether `status` is a `2xx` status.
 *
 * @param {number} status - The HTTP status.
 * @returns {boolean} `true` for 200–299.
 */
function isSuccess(status) {
  return status >= 200 && status <= 299;
}

/**
 * Sends the question and prints the result; resolves with the exit code.
 *
 * @param {string[]} args - The command-line arguments: the project id and the question.
 * @param {{ env: Record<string, string | undefined>, dotenvPath?: string, send?: Send, stdout: Writable, stderr: Writable }} options
 *   - The environment to load `.env` into, the `.env` path, how to send the request and the output
 *   streams.
 * @returns {Promise<number>} The exit code.
 */
export async function runDemoAsk(args, { env, dotenvPath = DOTENV_PATH, send = sendWithHttp, stdout, stderr }) {
  loadEnvFile(dotenvPath, env, stderr);
  // `.` and `..` would be removed from the URL path as dot segments, so they are no project id (A27).
  if (args.length !== 2 || args[0] === '.' || args[0] === '..') {
    stderr.write('usage: npm run demo:ask -- <projectId> "<question>"\n');
    return USAGE_EXIT_CODE;
  }
  const [projectId, question] = args;
  const port = apiPort(env.PORT);
  if (port === undefined) {
    stderr.write('demo:ask: PORT must be a port number\n');
    return USAGE_EXIT_CODE;
  }
  const origin = `http://127.0.0.1:${port}`;
  let response;
  try {
    // No time limit: a live model can take minutes on a CPU, and Ctrl+C stops the helper (A4, D23).
    response = await send(`${origin}/api/projects/${encodeURIComponent(projectId)}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ question }),
    });
  } catch {
    stderr.write(`demo:ask: the API is not reachable at ${origin} (start it with npm run up)\n`);
    return 1;
  }
  let text;
  try {
    text = await response.text();
  } catch {
    // The connection dropped after the status line (design D22).
    stderr.write(`demo:ask: the answer of the API at ${origin} could not be read\n`);
    return 1;
  }
  stdout.write(`HTTP ${response.status}\n${describeBody(response.status, text)}\n`);
  return isSuccess(response.status) ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDemoAsk(process.argv.slice(2), {
    env: process.env,
    dotenvPath: DOTENV_PATH,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
