import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Writes `content` to a temporary file next to `path` (`.<name>.<pid>.tmp`) and renames it over
 * `path`, so `path` holds either its previous content or the whole new one; on failure the temporary
 * file is removed and the error is rethrown. A copy of the private helper of `seed-build.ts`, which
 * is a seed fingerprint input and is never edited (DIS-26 design C5).
 *
 * @param path The file to replace.
 * @param content Its new content.
 * @throws The error of the write or of the rename.
 */
export function writeAtomically(path: string, content: string): void {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, content);
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
