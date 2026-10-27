import { describe, expect, it } from 'vitest';
import { runDevProcesses, selectTargets, type ProcessInfo } from '../../../scripts/dev-processes.mjs';

// docs/AUTONOMOUS-RUN.md §6: a step ends with no dev process of the repository left running, and
// `node scripts/dev-processes.mjs stop` is how an agent ensures it (the auto-mode classifier denies the
// raw process queries). The process table and the killer are doubles: nothing is listed or ended.

const ROOT = 'C:\\work\\Codemind';
const SCRATCH = 'C:\\Temp\\claude\\C--work-Codemind';

/** One process row; `start` defaults to 10:00 UTC on 2026-10-27. */
function proc(pid: number, ppid: number, name: string, command: string, start = '2026-10-27T10:00:00Z'): ProcessInfo {
  return { pid, ppid, name, command, start: Date.parse(start) };
}

const TABLE: ProcessInfo[] = [
  proc(1, 0, 'explorer.exe', 'C:\\Windows\\explorer.exe'),
  proc(10, 1, 'node.exe', 'node C:\\Users\\me\\AppData\\claude\\cli.js'),
  proc(20, 10, 'node.exe', 'node C:\\work\\Codemind\\scripts\\dev-processes.mjs stop'),
  proc(30, 1, 'node.exe', 'node "C:\\work\\Codemind\\node_modules\\.bin\\..\\vitest\\vitest.mjs" run'),
  proc(31, 30, 'node.exe', 'node C:\\work\\Codemind\\node_modules\\tinypool\\dist\\esm\\entry\\process.js'),
  proc(40, 1, 'cmd.exe', 'cmd /c npm -w packages/api run dev'),
  proc(41, 40, 'node.exe', 'node --watch --import ../../scripts/load-env.mjs src/server.ts', '2026-10-26T22:45:00Z'),
  proc(42, 41, 'node.exe', 'node --import ../../scripts/load-env.mjs src/server.ts', '2026-10-27T12:03:00Z'),
  proc(50, 1, 'node.exe', 'node C:\\Temp\\claude\\C--work-Codemind\\scratchpad\\c2\\node_modules\\vite\\bin\\vite.js'),
  proc(51, 50, 'esbuild.exe', 'C:\\Temp\\claude\\C--work-Codemind\\scratchpad\\c2\\node_modules\\@esbuild\\esbuild.exe --service'),
  proc(60, 1, 'Code.exe', 'Code.exe C:\\work\\Codemind\\node_modules\\typescript\\lib\\tsserver.js'),
  proc(70, 1, 'node.exe', 'node C:\\other-project\\node_modules\\vite\\bin\\vite.js'),
];

const OPTIONS = { roots: [ROOT, SCRATCH], self: 20 };

describe('selectTargets', () => {
  it('selects the node and esbuild processes of the repository and of its scratchpad', () => {
    expect(selectTargets(TABLE, OPTIONS).map((p) => p.pid)).toEqual([30, 31, 41, 42, 50, 51]);
  });

  it('selects a server started with a relative path through the load-env marker', () => {
    expect(selectTargets(TABLE, OPTIONS).map((p) => p.pid)).toContain(41);
  });

  it('never selects itself, its ancestors or a process outside the roots', () => {
    const pids = selectTargets(TABLE, OPTIONS).map((p) => p.pid);
    expect(pids).not.toContain(20);
    expect(pids).not.toContain(10);
    expect(pids).not.toContain(70);
  });

  it('ignores processes that are not node or esbuild, such as the editor', () => {
    expect(selectTargets(TABLE, OPTIONS).map((p) => p.pid)).not.toContain(60);
  });

  it('matches paths whatever their case and slash direction', () => {
    const table = [proc(80, 1, 'node', 'node c:/WORK/codemind/node_modules/vite/bin/vite.js')];
    expect(selectTargets(table, { roots: [ROOT], self: 99 }).map((p) => p.pid)).toEqual([80]);
  });

  it('with since, keeps only the processes started at or after it', () => {
    const pids = selectTargets(TABLE, { ...OPTIONS, since: Date.parse('2026-10-27T11:00:00Z') }).map((p) => p.pid);
    expect(pids).toEqual([42]);
  });
});

/** A stream double that records every write. */
function recorder(): { write: (chunk: string) => boolean; text: () => string } {
  const chunks: string[] = [];
  return {
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    text: () => chunks.join(''),
  };
}

/** Runs the command with the table above and a killer double; returns the code, the output and the kills. */
async function run(args: string[]): Promise<{ code: number; out: string; err: string; killed: number[] }> {
  const stdout = recorder();
  const stderr = recorder();
  const killed: number[] = [];
  const code = await runDevProcesses({
    args,
    roots: [ROOT, SCRATCH],
    self: 20,
    list: async () => TABLE,
    kill: async (pid) => {
      killed.push(pid);
    },
    stdout,
    stderr,
  });
  return { code, out: stdout.text(), err: stderr.text(), killed };
}

describe('runDevProcesses', () => {
  it('list prints one line per selected process and ends nothing', async () => {
    const { code, out, killed } = await run(['list']);
    expect(code).toBe(0);
    expect(out.trim().split('\n')).toHaveLength(6);
    expect(out).toContain('41 2026-10-26T22:45:00.000Z');
    expect(killed).toEqual([]);
  });

  it('stop ends each selected tree once, from its topmost selected process', async () => {
    const { code, out, killed } = await run(['stop']);
    expect(code).toBe(0);
    expect(killed).toEqual([30, 41, 50]);
    expect(out).toContain('stopped 3 process trees');
  });

  it('stop with since ends only the newer processes', async () => {
    const { killed } = await run(['stop', '--since', '2026-10-27T11:00:00Z']);
    expect(killed).toEqual([42]);
  });

  it('stop with nothing selected says so and exits 0', async () => {
    const { code, out, killed } = await run(['stop', '--since', '2026-10-28T00:00:00Z']);
    expect(code).toBe(0);
    expect(killed).toEqual([]);
    expect(out).toContain('no dev process');
  });

  it('rejects an unknown command or a since that is not a date, with exit 2', async () => {
    for (const args of [[], ['kill'], ['stop', '--since', 'yesterday'], ['stop', '--since']]) {
      const { code, err, killed } = await run(args);
      expect(code).toBe(2);
      expect(err).toContain('usage: node scripts/dev-processes.mjs');
      expect(killed).toEqual([]);
    }
  });
});
