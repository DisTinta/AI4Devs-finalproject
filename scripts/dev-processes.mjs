/**
 * `node scripts/dev-processes.mjs list|stop [--since <date>]` (docs/AUTONOMOUS-RUN.md §6): lists or
 * ends the dev processes of this repository that are still running: `vitest`, `vite`, the API with its
 * `node --watch`, `concurrently`, `esbuild`, in this checkout or in a clone under the session's
 * scratchpad. An agent runs `stop` before it ends a step, so no orphaned process locks `node_modules`
 * or holds a port; the auto-mode classifier denies the raw process queries this wraps.
 *
 * A process is selected when it is `node` or `esbuild` and its command line names the repository
 * root, the scratchpad of this project, or `scripts/load-env.mjs` (the API is started with relative
 * paths). The process running this script and its ancestors are never selected. `stop` ends each
 * selected tree from its topmost selected process. Every dev process of the repository counts,
 * including one the author started by hand; `--since` keeps only the processes started at or after
 * that date. It imports only Node built-in modules.
 */
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

/** The repository root: the parent directory of `scripts/`. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The executables that can be dev processes of the repository. */
const NAMES = new Set(['node', 'node.exe', 'esbuild', 'esbuild.exe']);

/** A command line with this text belongs to the repository even when its paths are relative. */
const MARKER = 'scripts/load-env.mjs';

const USAGE = 'usage: node scripts/dev-processes.mjs list|stop [--since <ISO date>]\n';

/**
 * @typedef {{ pid: number, ppid: number, name: string, command: string, start: number }} ProcessInfo
 * @typedef {{ roots: string[], self: number, since?: number }} SelectOptions
 * @typedef {{ write: (chunk: string) => unknown }} Writable
 */

/**
 * Lowercases a path or command line and turns backslashes into slashes, so `C:\Repo` matches `c:/repo`.
 *
 * @param {string} text - A path or a command line.
 * @returns {string} The comparable text.
 */
function normalise(text) {
  return text.replaceAll('\\', '/').toLowerCase();
}

/**
 * The dev processes of the repository in `table`, in table order.
 *
 * @param {ProcessInfo[]} table - Every running process.
 * @param {SelectOptions} options - The roots that mark a process, the pid of this script and the date
 *   filter.
 * @returns {ProcessInfo[]} The selected processes.
 */
export function selectTargets(table, { roots, self, since }) {
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const protectedPids = new Set();
  for (let pid = self; pid !== undefined && !protectedPids.has(pid); pid = byPid.get(pid)?.ppid) {
    protectedPids.add(pid);
  }
  const needles = [...roots.map((root) => normalise(root).replace(/\/+$/, '')), MARKER];
  return table.filter((p) => {
    if (protectedPids.has(p.pid) || !NAMES.has(p.name.toLowerCase())) return false;
    if (since !== undefined && p.start < since) return false;
    const command = normalise(p.command);
    return needles.some((needle) => command.includes(needle));
  });
}

/**
 * Lists every running process with its command line and start time.
 *
 * @returns {Promise<ProcessInfo[]>} The process table.
 */
async function listProcesses() {
  if (process.platform === 'win32') {
    const script =
      'Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ' +
      'ppid = $_.ParentProcessId; name = $_.Name; command = [string]$_.CommandLine; ' +
      "start = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { '' } } } | " +
      'ConvertTo-Json -Compress';
    const out = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return JSON.parse(out).map((p) => ({ ...p, start: Date.parse(p.start) || 0 }));
  }
  const out = await exec('ps', ['-eo', 'pid=,ppid=,etimes=,comm=,args=']);
  const now = Date.now();
  return out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter((m) => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), start: now - Number(m[3]) * 1000, name: m[4], command: m[5] }));
}

/**
 * Ends a process and every process under it.
 *
 * @param {number} pid - The topmost process of the tree.
 * @returns {Promise<void>} Resolves once the kill command has run.
 */
async function killTree(pid) {
  if (process.platform === 'win32') {
    await exec('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => undefined);
    return;
  }
  const table = await listProcesses();
  const tree = [pid];
  for (let i = 0; i < tree.length; i++) tree.push(...table.filter((p) => p.ppid === tree[i]).map((p) => p.pid));
  for (const member of tree.reverse()) {
    try {
      process.kill(member, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

/**
 * Runs a program without a shell and resolves with its standard output.
 *
 * @param {string} file - The program.
 * @param {string[]} args - Its arguments.
 * @returns {Promise<string>} Its standard output.
 */
function exec(file, args) {
  return new Promise((done, fail) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) =>
      error ? fail(error) : done(stdout),
    );
  });
}

/**
 * Runs `list` or `stop` and resolves with the exit code: `0`, or `2` for a usage error.
 *
 * @param {{ args: string[], roots: string[], self: number, list: () => Promise<ProcessInfo[]>,
 *   kill: (pid: number) => Promise<void>, stdout: Writable, stderr: Writable }} options - The command
 *   line, the roots, this script's pid, the process table and killer, and the output streams.
 * @returns {Promise<number>} The exit code.
 */
export async function runDevProcesses({ args, roots, self, list, kill, stdout, stderr }) {
  const [command, flag, value, ...rest] = args;
  const since = flag === '--since' && value !== undefined ? Date.parse(value) : undefined;
  const valid =
    (command === 'list' || command === 'stop') &&
    rest.length === 0 &&
    (flag === undefined || (flag === '--since' && since !== undefined && !Number.isNaN(since)));
  if (!valid) {
    stderr.write(USAGE);
    return 2;
  }
  const targets = selectTargets(await list(), { roots, self, since });
  if (command === 'list') {
    for (const p of targets) stdout.write(`${p.pid} ${new Date(p.start).toISOString()} ${p.command}\n`);
    return 0;
  }
  const selected = new Set(targets.map((p) => p.pid));
  const tops = targets.filter((p) => !selected.has(p.ppid));
  if (tops.length === 0) {
    stdout.write('no dev process of the repository is running\n');
    return 0;
  }
  for (const p of tops) await kill(p.pid);
  stdout.write(`stopped ${tops.length} process trees: ${tops.map((p) => p.pid).join(', ')}\n`);
  return 0;
}

/**
 * The scratchpad folder Claude Code gives this project's sessions: the temp directory's `claude`
 * folder, named after the repository path with every `:`, `\` and `/` turned into `-`.
 *
 * @returns {string} The folder, whether or not it exists.
 */
function scratchpadRoot() {
  return join(tmpdir(), 'claude', resolve(ROOT).replace(/[:\\/]/g, '-'));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDevProcesses({
    args: process.argv.slice(2),
    roots: [ROOT, scratchpadRoot()],
    self: process.pid,
    list: listProcesses,
    kill: killTree,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
