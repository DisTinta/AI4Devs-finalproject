import { describe, expect, it } from 'vitest';
import { authorHashSaltFromEnv, createSimpleGitHistory } from '../../../packages/adapters/git/src/index';

// Spec `git-history` → Salt is mandatory. The factory throws synchronously, before any GitPort
// exists, so no git process can have run when it fails.
describe('author hash salt', () => {
  it('A missing or blank salt is rejected', () => {
    expect(() => authorHashSaltFromEnv({})).toThrow(/AUTHOR_HASH_SALT/);
    expect(() => authorHashSaltFromEnv({ AUTHOR_HASH_SALT: '   ' })).toThrow(/AUTHOR_HASH_SALT/);
    expect(() => createSimpleGitHistory({ authorHashSalt: '   ' })).toThrow(/AUTHOR_HASH_SALT/);
  });

  it('rejects an empty salt too', () => {
    expect(() => authorHashSaltFromEnv({ AUTHOR_HASH_SALT: '' })).toThrow(/AUTHOR_HASH_SALT/);
    expect(() => createSimpleGitHistory({ authorHashSalt: '' })).toThrow(/AUTHOR_HASH_SALT/);
  });

  it('returns a set salt trimmed', () => {
    expect(authorHashSaltFromEnv({ AUTHOR_HASH_SALT: '  s3cret-value \n' })).toBe('s3cret-value');
  });

  it('never puts the salt value in the error message', () => {
    const blank = ' \t ';
    try {
      createSimpleGitHistory({ authorHashSalt: blank });
      expect.unreachable('a blank salt must be rejected');
    } catch (error) {
      expect((error as Error).message).not.toContain(blank);
    }
  });

  it('creates a GitPort from a set salt', () => {
    expect(typeof createSimpleGitHistory({ authorHashSalt: 'unit-test-salt' }).readHistory).toBe('function');
  });
});
