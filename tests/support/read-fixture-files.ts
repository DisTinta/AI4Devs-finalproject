import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { SourceFile } from '@codemind/core';

/** Every file under `root`, read-only, `.git` skipped, paths relative to `root` with `/`. */
export function readFixtureFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
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
