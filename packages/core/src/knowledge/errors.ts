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

function describeViolation(violation: GraphViolation): string {
  const where = violation.field ? `${violation.element}.${violation.field}` : violation.element;
  return `${where}: ${violation.message}`;
}
