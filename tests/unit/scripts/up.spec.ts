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
    // Arrange: the runner double also notes what stdout held when each step started
    const stdout = recorder();
    const printedBeforeStep: string[] = [];
    const steps = runner(() => {
      printedBeforeStep.push(stdout.text());
      return { code: 0, signal: null };
    });
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
      [process.execPath, '--import', './scripts/defer-ctrl-c.mjs', 'fixtures/build-history.mjs', 'acme-shop'],
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
        '[up] node fixtures/build-history.mjs acme-shop',
        '[up] npm run dev',
        '',
      ].join('\n'),
    );
    // Assert: each [up] line was printed before its step started, and only the lines up to it
    const lines = stdout.text().split('\n');
    printedBeforeStep.forEach((printed, index) => {
      expect(printed, `before step ${index + 1}`).toBe(lines.slice(0, index + 1).join('\n') + '\n');
    });
    expect(printedBeforeStep).toHaveLength(6);
    expect(stderr.text()).toBe('');
    expect(code).toBe(0);
  });

  it('Up stops at the first failing step', async () => {
    // Arrange: npm install exits 3
    const failing = runner((index) => ({ code: index === 1 ? 3 : 0, signal: null }));
    const failingErr = recorder();
    // Arrange: the first step ends by a signal
    const signalled = runner(() => ({ code: null, signal: 'SIGINT' }));
    const signalledErr = recorder();

    // Act
    const failingCode = await runUp({ ...baseOptions(), run: failing.run, stderr: failingErr });
    const signalledCode = await runUp({ ...baseOptions(), run: signalled.run, stderr: signalledErr });

    // Assert
    expect(failing.calls.map(({ command, args }) => [command, ...args])).toEqual([
      ['docker', 'compose', 'up', '-d', '--wait'],
      [process.execPath, NPM_EXECPATH, 'install'],
    ]);
    expect(failingErr.text()).toContain('[up] "npm install" failed with exit code 3');
    expect(failingCode).toBe(3);
    expect(signalled.calls).toHaveLength(1);
    expect(signalledErr.text()).toContain('[up] "docker compose up -d --wait" failed (SIGINT)');
    expect(signalledCode).toBe(1);
  });

  it('Ctrl+C stops up without a failure line', async () => {
    // Arrange: Ctrl+C arrives while npm run dev runs, which then ends with Windows' STATUS_CONTROL_C_EXIT
    const signals = interrupts();
    const installedDuringSteps: number[] = [];
    const steps = runner((index) => {
      installedDuringSteps.push(signals.installed());
      if (index === 5) {
        signals.fire();
        return { code: 3221225786, signal: null };
      }
      return { code: 0, signal: null };
    });
    const stderr = recorder();

    // Act
    const code = await runUp({ ...baseOptions(), run: steps.run, stderr, onInterrupt: signals.onInterrupt });

    // Assert
    expect(steps.calls).toHaveLength(6);
    expect(installedDuringSteps).toEqual([1, 1, 1, 1, 1, 1]);
    expect(signals.installed()).toBe(0);
    expect(stderr.text()).toContain('[up] stopped (Ctrl+C)');
    expect(stderr.text()).not.toContain('failed');
    expect(code).toBe(130);
  });

  it('A step that cannot start stops up', async () => {
    // Arrange
    const steps = runner(() => ({ error: Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }) }));
    const stderr = recorder();

    // Act
    const code = await runUp({ ...baseOptions(), run: steps.run, stderr });

    // Assert
    expect(steps.calls).toHaveLength(1);
    expect(stderr.text()).toContain('[up] "docker compose up -d --wait" could not start (ENOENT)');
    expect(code).toBe(1);
  });

  it('Up needs npm to start it', async () => {
    // Arrange
    const steps = runner();
    const stderr = recorder();

    // Act
    const code = await runUp({ ...baseOptions(), env: {}, run: steps.run, stderr });

    // Assert
    expect(steps.calls).toHaveLength(0);
    expect(stderr.text()).toContain('[up] run it with npm run up');
    expect(code).toBe(1);
  });

  it('Up ignores an npm_execpath of .env', async () => {
    // Arrange: npm_execpath only in the .env file, not in the environment npm gave up
    const steps = runner();
    const stderr = recorder();

    // Act
    const code = await runUp({
      ...baseOptions(),
      env: {},
      dotenvPath: temporaryEnvFile(['npm_execpath=/tmp/not-npm.js']),
      run: steps.run,
      stderr,
    });

    // Assert
    expect(steps.calls).toHaveLength(0);
    expect(stderr.text()).toBe('[up] run it with npm run up\n');
    expect(code).toBe(1);
  });
});

/** The options of a run with `npm_execpath` set and no `.env`; each test overrides what it checks. */
function baseOptions(): Parameters<typeof runUp>[0] {
  return {
    env: { npm_execpath: NPM_EXECPATH },
    dotenvPath: missingEnvFile(),
    run: runner().run,
    stdout: recorder(),
    stderr: recorder(),
    onInterrupt: interrupts().onInterrupt,
  };
}

/** A path where no `.env` exists. */
function missingEnvFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-up-'));
  directories.push(directory);
  return join(directory, '.env');
}
