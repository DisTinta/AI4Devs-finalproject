import type { ClaimStatus, ClaimType } from '../knowledge/claim.js';
import type { ExplainEvent } from './explain-event.js';
import type { StatementType } from './typing-rules.js';
import type { UnknownExplain } from './unknown-policy.js';

// The answer of `explain` (DIS-39 design D4): `answered`, stored or not, or `unknown` with a reason.

/** One cited span of an answer or of a prior claim. */
export interface AnswerEvidence {
  /** A stored evidence row id, or the prompt id (`E1`…) when the answer was not stored. */
  id: string;
  /** Id of the cited file. */
  fileId: string;
  /** Repository-relative path of the cited file. */
  path: string;
  /** First cited line, from 1. */
  startLine: number;
  /** Last cited line, inclusive. */
  endLine: number;
  /** The cited span's redacted text; `null` only for a prior claim stored without one. */
  excerpt: string | null;
}

/** A statement of the answer, typed from the spans it cites. */
export interface AnswerStatement {
  /** The statement as the model wrote it. */
  text: string;
  /** `FACT` or `INFERENCE`, by the typing rule; never `FACT` when stale. */
  type: StatementType;
  /** `current`, or `stale` when the project was re-indexed while the answer was produced. */
  status: ClaimStatus;
  /** Present only when stale. */
  warning?: 'stale-evidence';
  /** Always `none`: citations are not verified yet (DIS-68). */
  verification: 'none';
  /** The ids of its evidence, in the order the model cited them. */
  evidenceIds: string[];
}

/** A stored claim whose evidence overlaps the pack, as the answer shows it. */
export interface PriorClaim {
  /** The stored claim id. */
  id: string;
  /** The stored object: the statement text. */
  text: string | null;
  /** The displayed type: never `FACT` when stale. */
  type: ClaimType;
  /** Whether the claim's evidence still matches the code. */
  status: ClaimStatus;
  /** Present only when the claim is stale. */
  warning?: 'stale-evidence';
  /** Every evidence of the claim. */
  evidence: AnswerEvidence[];
}

/** What every answered explain carries. */
interface AnsweredCommon {
  /** Discriminant. */
  kind: 'answered';
  /** The model's answer. */
  answer: string;
  /** The typed statements, in the model's order. */
  statements: AnswerStatement[];
  /** The cited spans (see `persisted`). */
  evidence: AnswerEvidence[];
  /** The stored claims over the same code, newest first. */
  priorClaims: PriorClaim[];
  /** What happened on the way; empty when the claims were stored. */
  events: ExplainEvent[];
}

/** An answer whose claims were stored: ids are evidence row ids, one evidence entry per citation. */
export interface StoredExplain extends AnsweredCommon {
  /** The claims were stored. */
  persisted: true;
}

/**
 * An answer whose claims could not be stored: ids are the prompt ids (`E1`…), one evidence entry per
 * distinct cited id in first-citation order, and `events` holds the `claims_not_persisted` event.
 */
export interface UnsavedExplain extends AnsweredCommon {
  /** The claims were not stored. */
  persisted: false;
}

/** An answer with statements. */
export type AnsweredExplain = StoredExplain | UnsavedExplain;

/** The answer of `explain`. */
export type ExplainAnswer = AnsweredExplain | UnknownExplain;
