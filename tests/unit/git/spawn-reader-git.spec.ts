import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { GIT_CONFIG, GIT_ENV, spawnReaderGit } from '../../../packages/adapters/git/src/repository';

// Design D1 of openspec/changes/index-repository-debt: every process the git adapter starts itself
// keeps the pinned configuration and the closed environment of `readerGit` (security invariants of
// `repository-indexing` and `git-history`). The spawn function is injected: no real process here.

interface Spawned {
  command: string;
  args: readonly string[];
  options: SpawnOptionsWithoutStdio;
}

/** A fake child process whose streams and exit the test drives. */
function fakeChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
  return child;
}

describe('spawnReaderGit', () => {
  it('passes every GIT_CONFIG entry as -c, then the subcommand, with the closed environment and no shell', () => {
    // Arrange
    const calls: Spawned[] = [];
    const spawnProcess = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => {
      calls.push({ command, args, options });
      return fakeChild();
    };

    // Act
    spawnReaderGit('/repo', ['cat-file', '--batch'], spawnProcess);

    // Assert
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('git');
    expect(calls[0].args).toEqual([...GIT_CONFIG.flatMap((entry) => ['-c', entry]), 'cat-file', '--batch']);
    expect(calls[0].options).toMatchObject({ cwd: '/repo', env: GIT_ENV, shell: false, windowsHide: true });
  });

  it('resolves finished on exit code 0', async () => {
    const child = fakeChild();
    const git = spawnReaderGit('/repo', ['log'], () => child);

    child.emit('close', 0, null);

    await expect(git.finished).resolves.toBeUndefined();
  });

  it("rejects finished with git's trimmed stderr on a non-zero exit", async () => {
    const child = fakeChild();
    const git = spawnReaderGit('/repo', ['log'], () => child);

    const stderr = child.stderr as PassThrough;
    stderr.write('fatal: bad object HEAD\n');
    stderr.end();
    child.emit('close', 128, null);

    await expect(git.finished).rejects.toThrow(/^fatal: bad object HEAD$/);
  });

  it('rejects finished with the start error, unchanged', async () => {
    const child = fakeChild();
    const git = spawnReaderGit('/repo', ['log'], () => child);
    const missing = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });

    child.emit('error', missing);

    await expect(git.finished).rejects.toBe(missing);
  });
});
