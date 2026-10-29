import { NotAGitRepository } from '../knowledge/errors.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import { confinePath, ForbiddenPathError, IndexingDisabled } from './path-policy.js';

/**
 * Confines `repoPath` to `allowedRoot` lexically, then again on the real paths, since the lexical
 * check does not follow symbolic links. A root that does not exist means indexing is disabled. A
 * path whose real location is outside the root fails naming `requestedName`, so neither the target of
 * a link nor a resolved path is ever revealed.
 *
 * @param sourceTree Resolves real paths.
 * @param repoPath The path confined, absolute or relative to `allowedRoot`.
 * @param allowedRoot The allowed repositories root; missing or blank disables indexing.
 * @param requestedName The only name a `ForbiddenPathError` carries; defaults to `repoPath`.
 * @returns The real path of the repository.
 * @throws IndexingDisabled When the root is missing, blank or does not exist.
 * @throws ForbiddenPathError When the path, lexically or really, is outside the root.
 */
export async function confineRepository(
  sourceTree: SourceTreePort,
  repoPath: string,
  allowedRoot: string | undefined,
  requestedName: string = repoPath,
): Promise<string> {
  let lexicalRepo: string;
  try {
    lexicalRepo = confinePath(repoPath, allowedRoot);
  } catch (error) {
    throw error instanceof ForbiddenPathError ? new ForbiddenPathError(requestedName) : error;
  }
  const lexicalRoot = confinePath('', allowedRoot);
  const realRoot = await sourceTree.realPath(lexicalRoot).catch((error: unknown) => {
    throw error instanceof NotAGitRepository ? new IndexingDisabled() : error;
  });
  const realRepo = await sourceTree.realPath(lexicalRepo);
  try {
    confinePath(realRepo, realRoot);
  } catch (error) {
    throw error instanceof ForbiddenPathError ? new ForbiddenPathError(requestedName) : error;
  }
  return realRepo;
}
