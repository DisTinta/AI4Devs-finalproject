import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnReaderGit } from '../../../packages/adapters/git/src/repository';

// Design D1 of openspec/changes/index-repository-debt, with the real git: a failing command rejects
// with git's own message, and a missing git binary propagates the start error.

const created: string[] = [];

afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** An empty repository under the OS temp dir. */
function emptyRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-spawn-'));
  created.push(directory);
  execFileSync('git', ['init', '-q'], { cwd: directory });
  return directory;
}

describe('spawnReaderGit with the real git', () => {
  it('resolves and streams stdout for a successful command', async () => {
    const git = spawnReaderGit(emptyRepository(), ['rev-parse', '--is-inside-work-tree']);
    const chunks: Buffer[] = [];
    git.child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    git.child.stdin.end();

    await git.finished;

    expect(Buffer.concat(chunks).toString('utf8').trim()).toBe('true');
  });

  it("rejects with git's message when the command fails", async () => {
    const git = spawnReaderGit(emptyRepository(), ['cat-file', '-t', 'a'.repeat(40)]);
    git.child.stdin.end();

    await expect(git.finished).rejects.toThrow(/^fatal: git cat-file: could not get object info$/);
  });

  it('propagates ENOENT when the git binary is missing', async () => {
    const git = spawnReaderGit(emptyRepository(), ['status'], (_command, args, options) => spawn('codemind-no-such-git', args, options));

    await expect(git.finished).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
