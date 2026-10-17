import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeAtomically } from '../../../packages/cli/src/cache/write-atomically';

// Plain tests of the atomic write of the cache build (DIS-26 design C5): the golden file holds its
// previous content or the whole new one, and no temporary file is left behind.

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemind-write-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeAtomically', () => {
  it('replaces the file with the new content and leaves no temporary file', () => {
    const path = join(dir, 'acme-shop.json');
    writeFileSync(path, 'old\n');
    writeAtomically(path, 'new\n');
    expect(readFileSync(path, 'utf8')).toBe('new\n');
    expect(readdirSync(dir)).toEqual(['acme-shop.json']);
  });

  it('removes the temporary file and rethrows when the rename fails', () => {
    // A non-empty directory where the file should be: the rename over it fails.
    const path = join(dir, 'acme-shop.json');
    mkdirSync(path);
    writeFileSync(join(path, 'keep'), 'kept\n');
    expect(() => writeAtomically(path, 'new\n')).toThrow();
    expect(readdirSync(dir)).toEqual(['acme-shop.json']);
    expect(readFileSync(join(path, 'keep'), 'utf8')).toBe('kept\n');
  });
});
