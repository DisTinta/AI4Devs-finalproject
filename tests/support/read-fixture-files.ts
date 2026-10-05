import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { SourceFile } from '@codemind/core';

/**
 * Every file under `root`, read-only, paths relative to `root` with `/`.
 *
 * @param ignoredDirs Entry names skipped wherever they appear (directories, or links to them); `.git` by default.
 */
export function readFixtureFiles(root: string, ignoredDirs: readonly string[] = ['.git']): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // By name, whatever the entry type: Stryker's sandbox links `node_modules` instead of copying it.
      if (ignoredDirs.includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const path = relative(root, full).split(sep).join('/');
      files.push({ path, content: readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  return files;
}
