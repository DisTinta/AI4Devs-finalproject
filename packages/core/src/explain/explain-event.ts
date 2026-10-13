import type { SchemaViolationEvent } from './schema-violation.js';

// The events of an explain answer (DIS-39 design D8). Core returns them and never logs; the
// transport writes them (PH-09). They are not part of `AuditEvent`, whose events locate a file.

/** Why the claims of an answer were not stored; a closed set, so no free text can leak. */
export const CLAIMS_NOT_PERSISTED_CODES = ['store-write-failed'] as const;

/** Why the claims of an answer were not stored. */
export type ClaimsNotPersistedCode = (typeof CLAIMS_NOT_PERSISTED_CODES)[number];

/**
 * The claims of an answer could not be stored: the answer was still returned, with the prompt ids.
 * It carries only its code: no message, no detail, no cause, no part of the question or the output
 * (the detail of a database error can quote an excerpt).
 */
export interface ClaimsNotPersistedEvent {
  /** Discriminant. */
  type: 'claims_not_persisted';
  /** Why the claims were not stored. */
  code: ClaimsNotPersistedCode;
}

/** An event of an explain answer. */
export type ExplainEvent = SchemaViolationEvent | ClaimsNotPersistedEvent;
