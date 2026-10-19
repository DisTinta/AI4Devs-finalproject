import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runUp, type StepOptions, type StepResult } from '../../../scripts/up.mjs';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "One command
// starts the system" (DIS-102 design D5). Each test is one scenario, named after it. The steps run
// through a recording runner double: nothing is spawned, Docker is not needed.

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const NPM_EXECPATH = '/opt/npm/bin/npm-cli.js';

/** One call the runner double received. */
interface Call {
  command: string;
  args: string[];
  options: StepOptions;
}

/** A runner double that records each call and answers with `answer(call index)`. */
function runner(answer: (index: number) => StepResult = () => ({ code: 0, signal: null })): {
  run: (command: string, args: string[], options: StepOptions) => Promise<StepResult>;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return answer(calls.length - 1);
    },
  };
}

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

const directories: string[] = [];

/** A temporary `.env` file holding `lines`. */
function temporaryEnvFile(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-up-'));
  directories.push(directory);
  const path = join(directory, '.env');
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

/** An interrupt double that records the listener `up` installs and can fire it. */
function interrupts(): {
  onInterrupt: (listener: () => void) => () => void;
  fire: () => void;
  installed: () => number;
} {
  let current: (() => void) | undefined;
  return {
    onInterrupt: (listener) => {
      current = listener;
      return () => {
        if (current === listener) current = undefined;
      };
    },
    fire: () => current?.(),
    installed: () => (current === undefined ? 0 : 1),
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('One command starts the system', () => {
  it('Up runs the start sequence in order', async () => {
    // Arrange
    const steps = runner();
    const stdout = recorder();
    const stderr = recorder();

    // Act
    const code = await runUp({
      env: { npm_execpath: NPM_EXECPATH },
      dotenvPath: temporaryEnvFile(['POSTGRES_PORT=5433']),
      run: steps.run,
      stdout,
      stderr,
      onInterrupt: interrupts().onInterrupt,
    });

    // Assert
    expect(steps.calls.map(({ command, args }) => [command, ...args])).toEqual([
      ['docker', 'compose', 'up', '-d', '--wait'],
      [process.execPath, NPM_EXECPATH, 'install'],
      [process.execPath, NPM_EXECPATH, 'run', 'db:migrate'],
      [process.execPath, NPM_EXECPATH, 'run', 'db:seed'],
      [process.execPath, NPM_EXECPATH, 'run', 'dev'],
    ]);
    for (const { options } of steps.calls) {
      expect(resolve(options.cwd)).toBe(ROOT);
      expect(options.stdio).toBe('inherit');
      expect(options.shell).toBe(false);
      expect(options.env.POSTGRES_PORT).toBe('5433');
    }
    expect(stdout.text()).toBe(
      [
        '[up] docker compose up -d --wait',
        '[up] npm install',
        '[up] npm run db:migrate',
        '[up] npm run db:seed',
        '[up] npm run dev',
        '',
      ].join('\n'),
    );
    expect(stderr.text()).toBe('');
    expect(code).toBe(0);
  });
});
