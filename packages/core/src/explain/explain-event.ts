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

/**
 * The instruction-like patterns the sanitisation of `explain` flags (DIS-41, author decision P4), in
 * the fixed order flags and events follow. A closed set: an event names a code, never the text.
 */
export const INSTRUCTION_PATTERNS = ['ignore-instructions', 'role-override', 'system-impersonation', 'delimiter-spoof'] as const;

/** A code of {@link INSTRUCTION_PATTERNS}. */
export type InstructionPatternCode = (typeof INSTRUCTION_PATTERNS)[number];

/** The question matched an instruction pattern. It carries the code only, no part of the question. */
export interface UntrustedQuestionFlaggedEvent {
  /** Discriminant. */
  type: 'untrusted_content_flagged';
  /** The question was flagged. */
  source: 'question';
  /** The pattern that matched. */
  pattern: InstructionPatternCode;
}

/**
 * The kept text of a prompt evidence matched an instruction pattern. It locates the first matching
 * line and carries no text, prefix or hash of it.
 */
export interface UntrustedEvidenceFlaggedEvent {
  /** Discriminant. */
  type: 'untrusted_content_flagged';
  /** An evidence of the prompt was flagged. */
  source: 'evidence';
  /** The evidence id of the span in the prompt (`E1…En`). */
  evidenceId: string;
  /** The span's repository-relative file path. */
  path: string;
  /** File line of the first line of the span where the pattern matched. */
  line: number;
  /** The pattern that matched. */
  pattern: InstructionPatternCode;
}

/** Untrusted text matched an instruction pattern: it was still sent, flagged. */
export type UntrustedContentFlaggedEvent = UntrustedQuestionFlaggedEvent | UntrustedEvidenceFlaggedEvent;

/** A span over `MAX_EVIDENCE_TEXT_CHARS` was cut; it carries line numbers, never the cut text. */
export interface UntrustedContentTruncatedEvent {
  /** Discriminant. */
  type: 'untrusted_content_truncated';
  /** The evidence id of the span in the prompt (`E1…En`). */
  evidenceId: string;
  /** The span's repository-relative file path. */
  path: string;
  /** Last line of the span before the cut. */
  originalEndLine: number;
  /** Last line kept. */
  keptEndLine: number;
}

/** An event of the sanitisation of untrusted content before the prompt. */
export type SanitizationEvent = UntrustedContentFlaggedEvent | UntrustedContentTruncatedEvent;

/**
 * Why the syntactic check found a citation `broken` (DIS-68 design V7), in the order it checks them: the
 * path is not at the commit; the range is not inside the file; the excerpt is not the range's text. A
 * closed set, so no free text can leak.
 */
export const EVIDENCE_BROKEN_REASONS = ['file-missing', 'range-out-of-file', 'excerpt-mismatch'] as const;

/** A reason of {@link EVIDENCE_BROKEN_REASONS}. */
export type EvidenceBrokenReason = (typeof EVIDENCE_BROKEN_REASONS)[number];

/**
 * A cited evidence of the answer failed the syntactic check: it was dropped from the answer and never
 * stored (ADR 20261014). A system failure, one per broken prompt id however many statements cite it.
 * It locates the cited span and carries no file content, excerpt, prefix or hash of them.
 */
export interface EvidenceBrokenEvent {
  /** Discriminant. */
  type: 'evidence_broken';
  /** The evidence id of the span in the prompt (`E1…En`). */
  evidenceId: string;
  /** The cited span's repository-relative file path. */
  path: string;
  /** First cited line. */
  startLine: number;
  /** Last cited line (a cut span ends at its kept last line). */
  endLine: number;
  /** Why the citation is broken. */
  reason: EvidenceBrokenReason;
}

/**
 * Why the semantic check left a citation `cited` without an answer from the verifier (DIS-70 design
 * S7, decision D3): its output was not `{"entails": boolean}`; the model was unavailable; the daily
 * budget was exhausted. A closed set, so no free text can leak.
 */
export const ENTAILMENT_UNVERIFIED_REASONS = ['invalid-output', 'llm-unavailable', 'budget-exhausted'] as const;

/** A reason of {@link ENTAILMENT_UNVERIFIED_REASONS}. */
export type EntailmentUnverifiedReason = (typeof ENTAILMENT_UNVERIFIED_REASONS)[number];

/**
 * A (statement, citation) pair of the answer could not be checked semantically: the citation stays
 * `cited` and its statement is never a `FACT` because of it. One per such pair. It locates the
 * statement and the cited span and carries no statement, excerpt, verifier output, prefix or hash of
 * them.
 */
export interface EntailmentUnverifiedEvent {
  /** Discriminant. */
  type: 'entailment_unverified';
  /** Position, from 0, of the statement in the answer's statements. */
  statementIndex: number;
  /** The evidence id of the span in the prompt (`E1…En`). */
  evidenceId: string;
  /** The cited span's repository-relative file path. */
  path: string;
  /** First cited line. */
  startLine: number;
  /** Last cited line (a cut span ends at its kept last line). */
  endLine: number;
  /** Why the citation was not checked. */
  reason: EntailmentUnverifiedReason;
}

/** An event of an explain answer. */
export type ExplainEvent =
  | SchemaViolationEvent
  | ClaimsNotPersistedEvent
  | SanitizationEvent
  | EvidenceBrokenEvent
  | EntailmentUnverifiedEvent;
