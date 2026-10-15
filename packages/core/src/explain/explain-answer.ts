import type { ClaimStatus, ClaimType } from '../knowledge/claim.js';
import type { VerificationUsage } from '../verify/semantic.js';
import type { StatementVerification } from './claim-items.js';
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
  /**
   * The cited span's redacted text, as the model read it: cut at its last kept line when the span was
   * over `MAX_EVIDENCE_TEXT_CHARS`, without the truncation mark or neutralisation; `null` only for a
   * prior claim stored without one.
   */
  excerpt: string | null;
}

/** A statement of the answer, typed from the spans it cites. */
export interface AnswerStatement {
  /** The statement as the model wrote it. */
  text: string;
  /**
   * `FACT` or `INFERENCE`, by the typing rule capped by the entailment policy (`FACT` only when every
   * citation is `entailed`); never `FACT` when stale.
   */
  type: StatementType;
  /** `current`, or `stale` when the project was re-indexed while the answer was produced. */
  status: ClaimStatus;
  /** Present only when stale. */
  warning?: 'stale-evidence';
  /**
   * `entailed` when the semantic check found that every citation it keeps supports it, `cited`
   * otherwise; every citation it keeps passed the syntactic check (DIS-68, DIS-70).
   */
  verification: StatementVerification;
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

/** What an answered explain cost beyond the `answer` call (DIS-70 design S7; DIS-74 aggregates the rest). */
export interface AnswerUsage {
  /** The usage of the semantic check of this answer: only its `verify` calls. */
  verification: VerificationUsage;
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
  /**
   * What happened on the way: the sanitisation events (the question's, then each span's in evidence-id
   * order), then the `evidence_broken` events in evidence-id order, then the `entailment_unverified`
   * events in statement order then citation order, then `claims_not_persisted` when the claims were
   * not stored; empty when nothing was flagged, cut, broken or left unverified and the claims were
   * stored.
   */
  events: ExplainEvent[];
  /** What the verification of this answer cost; no token of the `answer` call. */
  usage: AnswerUsage;
  /**
   * The confidence of all the statements together, in (0, 1): computed from their kept citations'
   * metadata and verdicts, never self-reported; ordinal and not calibrated (`docs/CONFIDENCE.md`).
   */
  confidence: number;
}

/** An answer whose claims were stored: ids are evidence row ids, one evidence entry per citation. */
export interface StoredExplain extends AnsweredCommon {
  /** The claims were stored. */
  persisted: true;
}

/**
 * An answer whose claims could not be stored: ids are the prompt ids (`E1`…) of the verified
 * citations, one evidence entry per distinct one in first-citation order (none for a broken id), and
 * `events` holds the sanitisation events, then the `evidence_broken` events, then the
 * `entailment_unverified` events, then the `claims_not_persisted` event.
 */
export interface UnsavedExplain extends AnsweredCommon {
  /** The claims were not stored. */
  persisted: false;
}

/** An answer with statements. */
export type AnsweredExplain = StoredExplain | UnsavedExplain;

/** The answer of `explain`. */
export type ExplainAnswer = AnsweredExplain | UnknownExplain;
