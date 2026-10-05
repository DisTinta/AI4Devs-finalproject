import path from 'node:path';
import { DomainError } from '../knowledge/errors.js';

/** No allowed repositories root is configured, so indexing is off (fixtures-only mode). */
export class IndexingDisabled extends DomainError {
  /** Stable code. */
  readonly code = 'INDEXING_DISABLED';

  constructor() {
    super('indexing disabled (fixtures-only mode)');
    this.name = 'IndexingDisabled';
  }
}

/** A requested repository path resolves outside the allowed root. */
export class ForbiddenPathError extends DomainError {
  /** Stable code. */
  readonly code = 'FORBIDDEN_PATH';

  /** @param requestedPath The path as it was requested, before resolution. */
  constructor(readonly requestedPath: string) {
    super(`Forbidden path: ${requestedPath}`);
    this.name = 'ForbiddenPathError';
  }
}

/**
 * Resolves `requested` against `allowedRoot` and returns it only when it stays inside the root.
 * Lexical: nothing on disk is read, so symbolic links are not followed.
 *
 * @param requested Repository path, absolute or relative to the root.
 * @param allowedRoot The allowed repositories root; missing or blank disables indexing.
 * @returns The resolved absolute path.
 * @throws IndexingDisabled When `allowedRoot` is missing, empty or only whitespace.
 * @throws ForbiddenPathError When the resolved path is outside the root.
 */
export function confinePath(requested: string, allowedRoot: string | undefined): string {
  if (allowedRoot === undefined || allowedRoot.trim() === '') throw new IndexingDisabled();
  const root = path.resolve(allowedRoot);
  const resolved = path.resolve(root, requested);
  const rel = path.relative(root, resolved);
  const inside = rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
  if (!inside) throw new ForbiddenPathError(requested);
  return resolved;
}
