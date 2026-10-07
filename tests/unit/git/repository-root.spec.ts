import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SimpleGit } from 'simple-git';
import { NotAGitRepository } from '@codemind/core';
import { assertRepositoryRoot, GIT_ENV } from '../../../packages/adapters/git/src/repository';

// Spec: openspec/changes/index-repository/specs/repository-indexing/spec.md → "Source tree contract"
// and specs/git-history/spec.md → "A broken HEAD propagates git's error". Only git's own "not a git
// repository" answer becomes `NotAGitRepository`; every other failure propagates unchanged. The git
// process is a fake injected into `assertRepositoryRoot`, so no failure is simulated by changing the
// machine (no uninstalling git, no ownership changes).

const directory = mkdtempSync(join(tmpdir(), 'codemind-root-'));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** A git factory whose `rev-parse --show-toplevel` rejects with `failure`. */
function failingGit(failure: Error): (baseDir: string) => SimpleGit {
  return () =>
    ({
      raw: async () => {
        throw failure;
      },
    }) as unknown as SimpleGit;
}

describe('assertRepositoryRoot', () => {
  it("turns git's 'not a git repository' answer into NotAGitRepository", async () => {
    const answer = new Error('fatal: not a git repository (or any of the parent directories): .git\n');

    await expect(assertRepositoryRoot(directory, failingGit(answer))).rejects.toBeInstanceOf(NotAGitRepository);
  });

  it.each([
    ['a refused repository ownership', new Error("fatal: detected dubious ownership in repository at 'C:/repos/x'\n")],
    ['a permission error', Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })],
    ['git missing from PATH', Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })],
    ['any other git failure', new Error('fatal: unable to read config file')],
  ])('propagates %s unchanged', async (_label, failure) => {
    await expect(assertRepositoryRoot(directory, failingGit(failure))).rejects.toBe(failure);
  });
});

describe('git environment', () => {
  it('runs git with the C locale, so its messages never depend on the system language', () => {
    expect(GIT_ENV.LC_ALL).toBe('C');
    expect(GIT_ENV.LANGUAGE).toBe('C');
  });

  it('keeps the rest of the environment, so git is still found on PATH', () => {
    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH')!;

    expect(GIT_ENV[pathKey]).toBe(process.env[pathKey]);
  });

  it('passes no variable outside its closed list, such as GIT_DIR or EDITOR', () => {
    const allowed = ['PATH', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR', 'LC_ALL', 'LANGUAGE'];

    expect(Object.keys(GIT_ENV).filter((key) => !allowed.includes(key.toUpperCase()))).toEqual([]);
  });
});
