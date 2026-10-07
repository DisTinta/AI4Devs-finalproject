import { describe, expect, it } from 'vitest';
import type { SimpleGit } from 'simple-git';
import { hasCommits } from '../../../packages/adapters/git/src/repository';

// Spec: openspec/specs/repository-indexing/spec.md → "Source tree contract"
// and openspec/specs/git-history/spec.md → "A broken HEAD propagates git's error": `EmptyRepository` means
// "`HEAD` names no commit" (an unborn branch). A `HEAD` that resolves to something else, and any git
// failure, propagate git's own error. Git missing from PATH is simulated with a fake, never by
// uninstalling anything.

/** A fake `SimpleGit` whose `raw` answers per command (an `Error` is thrown), or rejects with `failure`. */
function fakeGit(answers: Record<string, string | Error>, failure?: Error): SimpleGit {
  return {
    raw: async (args: string[]) => {
      if (failure) throw failure;
      const answer = answers[args.join(' ')];
      if (answer === undefined) throw new Error(`unexpected git ${args.join(' ')}`);
      if (answer instanceof Error) throw answer;
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
    await expect(hasCommits(fakeGit({ 'rev-parse --verify --quiet HEAD^{commit}': 'a'.repeat(40) + '\n' }))).resolves.toBe(true);
  });

  it('is false when HEAD names a branch with no commit yet', async () => {
    const git = fakeGit({
      'rev-parse --verify --quiet HEAD^{commit}': '',
      'rev-parse --verify --quiet HEAD': '',
      'symbolic-ref --quiet HEAD': 'refs/heads/main\n',
    });

    await expect(hasCommits(git)).resolves.toBe(false);
  });

  it("rejects with git's own error when HEAD resolves to something that is not a commit", async () => {
    const gitsError = new Error("error: HEAD^{commit}: expected commit type, but the object is a tree\nfatal: Needed a single revision");
    const git = fakeGit({
      'rev-parse --verify --quiet HEAD^{commit}': '',
      'rev-parse --verify --quiet HEAD': 'b'.repeat(40) + '\n',
      'rev-parse --verify HEAD^{commit}': gitsError,
    });

    await expect(hasCommits(git)).rejects.toBe(gitsError);
  });

  it("rejects with git's own error when HEAD resolves to nothing and names no branch", async () => {
    const gitsError = new Error('fatal: Needed a single revision');
    const git = fakeGit({
      'rev-parse --verify --quiet HEAD^{commit}': '',
      'rev-parse --verify --quiet HEAD': '',
      'symbolic-ref --quiet HEAD': '',
      'rev-parse --verify HEAD^{commit}': gitsError,
    });

    await expect(hasCommits(git)).rejects.toBe(gitsError);
  });
});