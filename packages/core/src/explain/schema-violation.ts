// The audit event of a discarded model output (DIS-38 design D4, D5). It identifies the output by its
// size and hash and says where it failed, but carries none of its content: no value, no validator
// message, no name of an unexpected field. Core returns it; the transport logs it (PH-09). It is not
// part of `AuditEvent`, whose events locate a file.

/** Why a model output was discarded; one value per check of the quarantine, in check order. */
export const SCHEMA_VIOLATION_SUBCODES = [
  'output_too_large',
  'invalid_json',
  'invalid_shape',
  'limit_exceeded',
  'empty_evidence',
  'duplicate_evidence_id',
  'unknown_evidence_id',
] as const;

/** Why a model output was discarded. */
export type SchemaViolationSubcode = (typeof SCHEMA_VIOLATION_SUBCODES)[number];

/** Where an output failed: a path of schema field names and array indices, and a code. */
export interface SchemaViolationIssue {
  /** Dot-separated path, e.g. `statements.0.evidenceIds.1`; empty for the whole output. */
  path: string;
  /** The validator's issue code (e.g. `too_big`), or the subcode itself for the evidence-id checks. */
  code: string;
}

/** A model output was discarded whole. JSON-serialisable; never holds any part of the output. */
export interface SchemaViolationEvent {
  /** Discriminant. */
  type: 'schema_violation';
  /** The inference stage that discarded the output (readme §2.5). */
  stage: 'l2_inference';
  /** Why it was discarded. */
  subcode: SchemaViolationSubcode;
  /** Size of the output in UTF-8 bytes. */
  outputBytes: number;
  /** SHA-256 of the output's UTF-8 bytes, lowercase hexadecimal; for correlation, not anonymisation. */
  outputSha256: string;
  /** Where it failed; empty when the output was too large or not JSON. */
  issues: SchemaViolationIssue[];
}
