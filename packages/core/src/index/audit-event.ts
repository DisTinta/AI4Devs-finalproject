/** Identifier of a secret rule, in priority order from highest to lowest. */
export type SecretRule = 'private-key' | 'jwt' | 'aws-access-key-id' | 'generic-high-entropy';

/**
 * One span of a file was replaced by the redaction marker. It locates the span and names the rule,
 * and never carries the secret, a prefix of it or a hash of it.
 */
export interface SecretRedactedEvent {
  /** Discriminant. */
  type: 'secret_redacted';
  /** Repository-relative path of the file. */
  file: string;
  /** 1-based line where the span starts. */
  line: number;
  /** 1-based column where the span starts, in UTF-16 code units of the original line. */
  column: number;
  /** Highest-priority rule that matched the span. */
  rule: SecretRule;
}

/** An audit event: a JSON-serialisable union discriminated by `type`. Core returns them, never logs them. */
export type AuditEvent = SecretRedactedEvent;
