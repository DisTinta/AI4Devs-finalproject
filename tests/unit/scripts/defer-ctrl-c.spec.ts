import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/real-model-clean-clone/specs/local-startup/spec.md → "One command starts the
// system", scenario "The history step finishes its work before ending on Ctrl+C". The process is
// started the way `up` starts the fixture history step (`node --import ./scripts/defer-ctrl-c.mjs …`
// from the repository root), running a script that receives SIGINT while it works (design D3).
// On POSIX a real SIGINT is delivered; on Windows `process.kill(pid, 'SIGINT')` ends the process
// unconditionally, so the script emits the event to its own listeners instead (design D3, DR4).

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The script body: optional SIGINT, a short synchronous loop, the marker, then the given ending. */
function script(marker: string, { interrupt, ending }: { interrupt: boolean; ending: 'return' | 'exit' }): string {
  const deliver =
    "if (process.platform === 'win32') process.emit('SIGINT', 'SIGINT'); else process.kill(process.pid, 'SIGINT');";
  return [
    "import { writeFileSync } from 'node:fs';",
    interrupt ? deliver : '',
    // Wait until the signal has surely reached the process, then keep working synchronously.
    'await new Promise((done) => setTimeout(done, 200));',
    'const until = Date.now() + 100; while (Date.now() < until) { /* working */ }',
    `writeFileSync(${JSON.stringify(marker)}, 'done');`,
    ending === 'exit' ? 'process.exit(1);' : '',
  ].join('\n');
}

/** Runs the script under the preload, from the repository root, as `up` does. */
function runWithPreload(options: { interrupt: boolean; ending: 'return' | 'exit' }): {
  status: number | null;
  signal: NodeJS.Signals | null;
  marked: boolean;
} {
  const dir = mkdtempSync(join(tmpdir(), 'codemind-defer-'));
  const marker = join(dir, 'marker.txt');
  const file = join(dir, 'work.mjs');
  writeFileSync(file, script(marker, options));
  const result = spawnSync(process.execPath, ['--import', './scripts/defer-ctrl-c.mjs', file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: result.status, signal: result.signal, marked: existsSync(marker) };
}

describe('defer-ctrl-c preload', () => {
  it('The history step finishes its work before ending on Ctrl+C', () => {
    // Act
    const returning = runWithPreload({ interrupt: true, ending: 'return' });
    const exiting = runWithPreload({ interrupt: true, ending: 'exit' });
    const quiet = runWithPreload({ interrupt: false, ending: 'return' });

    // Assert
    expect(returning).toEqual({ status: 0, signal: null, marked: true });
    expect(exiting).toEqual({ status: 1, signal: null, marked: true });
    expect(quiet).toEqual({ status: 0, signal: null, marked: true });
  });
});
