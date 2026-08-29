/**
 * Domain errors carry an HTTP status and a stable machine-readable code. The
 * error-handler plugin turns them into the shared error envelope; nothing else
 * needs to know about HTTP.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class TaskNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Task ${id} not found`, 404, 'TASK_NOT_FOUND');
  }
}

export class IllegalStatusTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Cannot move task from '${from}' to '${to}'`, 409, 'ILLEGAL_STATUS_TRANSITION');
  }
}
