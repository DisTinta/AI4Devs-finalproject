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

/** A read argument the store checks before querying. */
export type StoreQueryArgument = 'name' | 'kinds' | 'hops';

/** A read was called with an invalid argument; nothing was sent to the database. */
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

function describeViolation(violation: GraphViolation): string {
  const where = violation.field ? `${violation.element}.${violation.field}` : violation.element;
  return `${where}: ${violation.message}`;
}
