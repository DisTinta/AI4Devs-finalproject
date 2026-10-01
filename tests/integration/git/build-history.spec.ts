import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Spec: openspec/specs/git-history/spec.md → "Fixture histories record every listed file" (archived
// change: 2026-10-01-co-change-edges). Each test is one scenario, named after it. Fixtures are throwaway directories under
// the OS temp dir with a synthetic author; the real fixtures are never touched here.

type ManifestEntry = string | { path: string; before: string };
type BuildOne = (name: string, cfg: { dir: string; manifest: string }) => Promise<void>;

const AUTHOR = 'Test Author <test.author@example.test>';
const temporaryDirectories: string[] = [];

/** The builder's `buildOne`, imported by URL (it is a plain `.mjs` script). */
async function buildOne(): Promise<BuildOne> {
  const module = (await import(pathToFileURL(resolve('fixtures/build-history.mjs')).href)) as { buildOne: BuildOne };
  return module.buildOne;
}

/**
 * A throwaway fixture: `files` written as its tracked content, `snapshots` under its history
 * directory, and a manifest with one commit per element of `commits`. Returns its paths.
 */
function throwawayFixture(
  files: Record<string, string>,
  snapshots: Record<string, string>,
  commits: ManifestEntry[][],
): { dir: string; manifest: string } {
  const root = mkdtempSync(join(tmpdir(), 'codemind-build-history-'));
  temporaryDirectories.push(root);
  const dir = join(root, 'fixture');
  const history = join(root, 'history');
  mkdirSync(dir);
  mkdirSync(history);
  for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
  for (const [path, content] of Object.entries(snapshots)) writeFileSync(join(history, path), content);
  const manifest = join(history, 'probe.commits.mjs');
  const entries = commits.map((files, i) => ({ date: `2024-01-0${i + 1}T10:00:00`, author: AUTHOR, message: `chore: commit ${i}`, files }));
  writeFileSync(manifest, `export default ${JSON.stringify(entries, null, 2)};\n`);
  return { dir, manifest };
}

/** Runs git in `cwd` and returns its trimmed stdout. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

describe('fixture history builder', () => {
  it('A re-touch with no new content still records the file', async () => {
    // Arrange
    const fixture = throwawayFixture({ 'x.ts': 'final\n' }, { 'x.before.ts': 'old\n' }, [
      [{ path: 'x.ts', before: 'x.before.ts' }],
      [{ path: 'x.ts', before: 'x.before.ts' }],
      ['x.ts'],
    ]);

    // Act
    await (await buildOne())('probe', fixture);

    // Assert
    const shas = git(fixture.dir, 'log', '--format=%H').split('\n');
    expect(shas).toHaveLength(3);
    for (const sha of shas) expect(git(fixture.dir, 'show', '--name-only', '--format=', sha), sha).toBe('x.ts');
    expect(readFileSync(join(fixture.dir, 'x.ts'), 'utf8')).toBe('final\n');
  });

  it('A final touch that changes nothing fails the build', async () => {
    // Arrange: commit 0 already writes the tracked content, so the final touch would change nothing.
    const fixture = throwawayFixture({ 'x.ts': 'final\n' }, { 'x.before.ts': 'final\n' }, [
      [{ path: 'x.ts', before: 'x.before.ts' }],
      ['x.ts'],
    ]);

    // Act
    const build = (await buildOne())('probe', fixture);

    // Assert
    await expect(build).rejects.toThrow(/probe: commit 1 lists x\.ts/);
    expect(readFileSync(join(fixture.dir, 'x.ts'), 'utf8')).toBe('final\n');
  });

  it('A re-touch that cannot be marked fails the build', async () => {
    // Arrange: a .json file takes no marker, so repeating its snapshot cannot change it.
    const fixture = throwawayFixture({ 'c.json': '{"a":2}\n' }, { 'c.before.json': '{"a":1}\n' }, [
      [{ path: 'c.json', before: 'c.before.json' }],
      [{ path: 'c.json', before: 'c.before.json' }],
      ['c.json'],
    ]);

    // Act
    const build = (await buildOne())('probe', fixture);

    // Assert
    await expect(build).rejects.toThrow(/probe: commit 1 lists c\.json/);
    expect(readFileSync(join(fixture.dir, 'c.json'), 'utf8')).toBe('{"a":2}\n');
  });
});
