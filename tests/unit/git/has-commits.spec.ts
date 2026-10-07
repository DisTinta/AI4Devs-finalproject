import { describe, expect, it } from 'vitest';
import type { SimpleGit } from 'simple-git';
import { hasCommits } from '../../../packages/adapters/git/src/repository';

// Spec: openspec/changes/index-repository/specs/repository-indexing/spec.md → "Source tree contract":
// `EmptyRepository` means "no commit". Only an unborn `HEAD` reads as no commit; any git failure
// propagates. Git missing from PATH is simulated with a fake, never by uninstalling anything.

/** A fake `SimpleGit` whose `raw` answers per command, or rejects with `failure`. */
function fakeGit(answers: Record<string, string>, failure?: Error): SimpleGit {
  return {
    raw: async (args: string[]) => {
      if (failure) throw failure;
      const answer = answers[args.join(' ')];
      if (answer === undefined) throw new Error(`unexpected git ${args.join(' ')}`);
      return answer;
    },
  } as unknown as SimpleGit;
}

describe('hasCommits', () => {
  it('propagates the failure when git cannot run', async () => {
    const missing = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });

    await expect(hasCommits(fakeGit({}, missing))).rejects.toBe(missing);
  });

  it('is true when HEAD resolves to a commit', async () => {
    await expect(hasCommits(fakeGit({ 'rev-parse --verify --quiet HEAD': 'a'.repeat(40) + '\n' }))).resolves.toBe(true);
  });

  it('is false when HEAD names a branch with no commit yet', async () => {
    const git = fakeGit({ 'rev-parse --verify --quiet HEAD': '', 'symbolic-ref --quiet HEAD': 'refs/heads/main\n' });

    await expect(hasCommits(git)).resolves.toBe(false);
  });

  it('rejects when HEAD resolves to nothing and names no branch', async () => {
    const git = fakeGit({ 'rev-parse --verify --quiet HEAD': '', 'symbolic-ref --quiet HEAD': '' });

    await expect(hasCommits(git)).rejects.toThrow(/HEAD/);
  });
});
