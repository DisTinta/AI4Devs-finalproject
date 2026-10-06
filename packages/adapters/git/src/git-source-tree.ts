import { realpath } from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { EmptyRepository, NotAGitRepository } from '@codemind/core';
import type { SkippedEntry, SourceFile, SourceTree, SourceTreePort } from '@codemind/core';
import { assertRepositoryRoot, GIT_CONFIG, hasCommits } from './repository.js';

/** One entry of `git ls-tree`: its mode, object id and repository-relative path. */
interface TreeEntry {
  mode: string;
  oid: string;
  path: string;
}

/**
 * Lists the committed tree of `HEAD` recursively. `ls-tree HEAD` is the commit itself; `ls-files`
 * would list the index, which differs from `HEAD` when changes are staged. NUL framing, so paths
 * arrive raw (never C-quoted).
 */
const LS_TREE_ARGUMENTS = ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'];

/** Git mode of a symbolic link: never followed, never read. */
const SYMLINK_MODE = '120000';

/** Git mode of a submodule (a gitlink to another repository's commit). */
const SUBMODULE_MODE = '160000';

/**
 * Creates a `SourceTreePort` that reads the files tracked in a repository's `HEAD` commit through
 * Git, never the working tree.
 */
export function createGitSourceTree(): SourceTreePort {
  return {
    async realPath(path: string): Promise<string> {
      try {
        return await realpath(path);
      } catch (error) {
        if (isMissingPath(error)) throw new NotAGitRepository(path);
        throw error;
      }
    },
    async readFiles(root: string): Promise<SourceTree> {
      await assertRepositoryRoot(root);
      const git = simpleGit({ baseDir: root, config: GIT_CONFIG });
      if (!(await hasCommits(git))) throw new EmptyRepository(root);
      const files: SourceFile[] = [];
      const skipped: SkippedEntry[] = [];
      for (const entry of parseTree(await git.raw(LS_TREE_ARGUMENTS))) {
        if (entry.mode === SYMLINK_MODE) skipped.push({ path: entry.path, reason: 'symlink' });
        else if (entry.mode === SUBMODULE_MODE) skipped.push({ path: entry.path, reason: 'submodule' });
        else {
          const content = decodeUtf8(await readBlob(git, entry.oid));
          if (content === undefined) skipped.push({ path: entry.path, reason: 'binary-content' });
          else files.push({ path: entry.path, content });
        }
      }
      return { files, skipped };
    },
  };
}

/** Whether a file-system error says the path, or one of its parents, does not exist. */
function isMissingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Parses NUL-terminated `<mode> <type> <oid>\t<path>` records. */
function parseTree(output: string): TreeEntry[] {
  return output
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const tab = record.indexOf('\t');
      const [mode, , oid] = record.slice(0, tab).split(' ');
      return { mode, oid, path: record.slice(tab + 1) };
    });
}

/** The raw bytes of a blob. */
async function readBlob(git: SimpleGit, oid: string): Promise<Buffer> {
  return (await git.binaryCatFile(['blob', oid])) as Buffer;
}

/**
 * The bytes as UTF-8 text, or `undefined` when they are not valid UTF-8. A leading byte order mark
 * is dropped (the decoder's default), which leaves line numbers unchanged.
 */
function decodeUtf8(bytes: Buffer): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
