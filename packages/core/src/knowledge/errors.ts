/** Base of the errors the domain raises. `code` is stable, so a transport can map it. */
export abstract class DomainError extends Error {
  /** Stable machine-readable code. */
  abstract readonly code: string;
}

/** The project a store operation names does not exist. */
export class ProjectNotFound extends DomainError {
  /** Stable code. */
  readonly code = 'PROJECT_NOT_FOUND';

  /** @param projectId The id that matched no project. */
  constructor(readonly projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFound';
  }
}

/** A project with that name already exists. */
export class ProjectNameTaken extends DomainError {
  /** Stable code. */
  readonly code = 'PROJECT_NAME_TAKEN';

  /** @param projectName The name already in use. */
  constructor(readonly projectName: string) {
    super(`Project name already taken: ${projectName}`);
    this.name = 'ProjectNameTaken';
  }
}

/** One rule a graph breaks. */
export interface GraphViolation {
  /** The offending element, for example `edges[2]` or `files["src/a.ts"]`. */
  element: string;
  /** The field at fault, when the violation is about one field. */
  field?: string;
  /** What is wrong. */
  message: string;
}

/** A graph failed validation. `violations` lists every rule it breaks. */
export class InvalidGraph extends DomainError {
  /** Stable code. */
  readonly code = 'INVALID_GRAPH';

  /** @param violations Every violation found; never empty. */
  constructor(readonly violations: GraphViolation[]) {
    super(`Invalid graph: ${violations.map(describeViolation).join('; ')}`);
    this.name = 'InvalidGraph';
  }
}

/**
 * An argument the store checks: a read argument checked before querying, the claims of a write
 * (`claims`), checked before writing and, for the ownership of their files, by one query inside the
 * write (DIS-39 design D7), a query log entry (`entry`), checked before writing (DIS-74), or an
 * argument of an answer cache call (`question`, `response`, `entryId`, `at`), checked before any
 * statement (DIS-21).
 */
export type StoreQueryArgument =
  | 'name'
  | 'kinds'
  | 'hops'
  | 'direction'
  | 'since'
  | 'claims'
  | 'spans'
  | 'entry'
  | 'question'
  | 'response'
  | 'entryId'
  | 'at';

/**
 * A store operation was called with an invalid argument. Nothing was written, and nothing was sent to
 * the database except, for a claim write, the query that checks the ownership of the cited files.
 */
export class InvalidStoreQuery extends DomainError {
  /** Stable code. */
  readonly code = 'INVALID_STORE_QUERY';

  /**
   * @param argument The argument at fault.
   * @param reason What is wrong with it.
   */
  constructor(
    readonly argument: StoreQueryArgument,
    reason: string,
  ) {
    super(`Invalid store query: ${argument} ${reason}`);
    this.name = 'InvalidStoreQuery';
  }
}

/**
 * The database failed once the write of an answer's claims had started (DIS-39 design D7). It carries
 * no `cause` and no text of the database error: a Postgres error's message, `detail`, `hint` or
 * `where` can quote a written value, such as an excerpt.
 */
export class ClaimWriteFailed extends DomainError {
  /** Stable code. */
  readonly code = 'CLAIM_WRITE_FAILED';

  constructor() {
    super('The claims could not be written');
    this.name = 'ClaimWriteFailed';
  }
}

/**
 * The database failed once the write of a query log entry had started (DIS-74 design U3). It carries
 * no `cause` and no text of the database error: a Postgres error's message, `detail`, `hint` or
 * `where` can quote the question.
 */
export class QueryLogWriteFailed extends DomainError {
  /** Stable code. */
  readonly code = 'QUERY_LOG_WRITE_FAILED';

  constructor() {
    super('The query log entry could not be written');
    this.name = 'QueryLogWriteFailed';
  }
}

/**
 * The database failed once a write of the answer cache had started (DIS-21 design C3): a save, the
 * record of a hit or an invalidation. It carries no `cause` and no text of the database error: a
 * Postgres error's message, `detail`, `hint` or `where` can quote the key (a normalized question) or
 * the response.
 */
export class CacheWriteFailed extends DomainError {
  /** Stable code. */
  readonly code = 'CACHE_WRITE_FAILED';

  constructor() {
    super('The cache entry could not be written');
    this.name = 'CacheWriteFailed';
  }
}

/** A history read named a path that is not the top-level directory of a Git repository. */
export class NotAGitRepository extends DomainError {
  /** Stable code. */
  readonly code = 'NOT_A_GIT_REPOSITORY';

  /** @param repoPath The path that is missing, outside any repository or not a repository root. */
  constructor(readonly repoPath: string) {
    super(`Not a Git repository: ${repoPath}`);
    this.name = 'NotAGitRepository';
  }
}

/**
 * A repository read named a Git repository with no commit yet: `HEAD` names nothing, so there is
 * neither a tree to read nor a commit to index at. "Empty" means "no commit", not "no files": a
 * commit that tracks no file is not this error.
 */
export class EmptyRepository extends DomainError {
  /** Stable code. */
  readonly code = 'EMPTY_REPOSITORY';

  /** @param repoPath The top-level directory of the repository that has no commit. */
  constructor(readonly repoPath: string) {
    super(`Git repository has no commit: ${repoPath}`);
    this.name = 'EmptyRepository';
  }
}

/**
 * Why the code of a project cannot be read: the project was never indexed at a commit
 * (`not-indexed`), its root is not a repository's top-level directory (`not-a-repository`), the
 * commit or the path names no regular file (`missing`), the file is over the size limit
 * (`too-large`), or its bytes are not UTF-8 (`binary-content`).
 */
export type SourceUnavailableReason = 'not-indexed' | 'not-a-repository' | 'missing' | 'too-large' | 'binary-content';

/**
 * The source of a project, or one of its files, cannot be read. It names the path but never carries
 * the file's content, so it can be reported without leaking code.
 */
export class SourceUnavailable extends DomainError {
  /** Stable code. */
  readonly code = 'SOURCE_UNAVAILABLE';

  /**
   * @param reason Why the source cannot be read.
   * @param path The repository-relative path asked for, when the failure is about one file.
   */
  constructor(
    readonly reason: SourceUnavailableReason,
    readonly path?: string,
  ) {
    super(path === undefined ? `Source unavailable: ${reason}` : `Source unavailable: ${reason}: ${path}`);
    this.name = 'SourceUnavailable';
  }
}

function describeViolation(violation: GraphViolation): string {
  const where = violation.field ? `${violation.element}.${violation.field}` : violation.element;
  return `${where}: ${violation.message}`;
}
