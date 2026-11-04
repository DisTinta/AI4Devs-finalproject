import { z } from 'zod';
import type { StatementVerification } from '../explain/claim-items.js';
import type {
  EntailmentUnverifiedEvent,
  EvidenceBrokenEvent,
  QueryNotLoggedEvent,
  SanitizationEvent,
} from '../explain/explain-event.js';
import type { GenerationUsage } from '../explain/explain-answer.js';
import type { SchemaViolationSubcode } from '../explain/schema-violation.js';
import { SPAN_LINE_MAX } from '../knowledge/evidence.js';
import type { FileKind } from '../knowledge/graph-file.js';
import { withoutNul } from '../knowledge/text-without-nul.js';
import type { VerificationUsage } from '../verify/semantic.js';

// The report of `drift` (DIS-71 design D13, D17, D18): plain JSON-serialisable values. No event holds
// text of the document, the claims or the model output.

/**
 * The file id of the whole-file spans of documents and configuration files, which have no stored file
 * id (design D13): `sanitizeForPrompt`, `verifyCitations` and `verifyAnswer` never read it, and nothing
 * of `drift` writes a claim. Module-internal: `index.ts` does not re-export it, and a report never
 * exposes it. A later change that persists contradictions needs a file-id read first.
 */
export const UNSTORED_FILE_ID = '';

/** Why `drift` answers `unknown`: the model is in evaluation mode, or there is no document to check. */
export const DRIFT_UNKNOWN_REASONS = ['llm-required', 'no-docs'] as const;

/** Why `drift` answered `unknown`. */
export type DriftUnknownReason = (typeof DRIFT_UNKNOWN_REASONS)[number];

/** An `unknown` report: no other field. */
export interface UnknownDrift {
  /** Discriminant. */
  status: 'unknown';
  /** Why nothing was checked. */
  reason: DriftUnknownReason;
}

/** The claim of a document a contradiction is about, with its verified citation. */
export interface DriftClaim {
  /** The claim as the model extracted it. */
  text: string;
  /** The document's repository-relative path. */
  path: string;
  /** First line of the claim, from 1. */
  startLine: number;
  /** Last line of the claim, inclusive. */
  endLine: number;
  /** The redacted text of those lines. */
  excerpt: string;
  /** Always `cited`: the document citation passes the syntactic check only. */
  verification: 'cited';
}

/** One verified code citation of a contradiction. */
export interface DriftEvidence {
  /** The cited file's repository-relative path. */
  path: string;
  /** First cited line (a cut span ends at its kept last line). */
  startLine: number;
  /** Last cited line. */
  endLine: number;
  /** The kind of the cited file. */
  fileKind: FileKind;
  /** The redacted text of the cited lines. */
  excerpt: string;
  /** `entailed` when the semantic check found support, `cited` otherwise. */
  verification: StatementVerification;
}

/** A span of the confrontation prompt, by path. */
const driftInputSpanSchema = z
  .strictObject({
    path: withoutNul(z.string().min(1)),
    startLine: z.int().min(1).max(SPAN_LINE_MAX),
    endLine: z.int().max(SPAN_LINE_MAX),
  })
  .refine((span) => span.endLine >= span.startLine, { path: ['endLine'] });

/**
 * What produced a contradiction (design D13): `provenanceSchema` with the spans identified by path
 * instead of file id, since the report is not stored and the store has no read that maps a path to its
 * file id. The model, the SHA-256 of the prompt in lowercase hexadecimal, the spans the prompt held (at
 * least one) and the instant, ISO 8601 with a time zone.
 */
export const driftProvenanceSchema = z.strictObject({
  model: withoutNul(z.string().min(1)),
  promptHash: z.string().regex(/^[0-9a-f]{64}$/),
  inputSpans: z.array(driftInputSpanSchema).min(1),
  createdAt: z.iso.datetime({ offset: true }),
});

/** What produced a contradiction. */
export type DriftProvenance = z.infer<typeof driftProvenanceSchema>;

/** A claim of a document that the code, the tests or the configuration contradict, verified. */
export interface Contradiction {
  /** The claim and its document citation. */
  claim: DriftClaim;
  /** What the code does instead, as the model stated it. */
  statement: string;
  /** The kept code citations, in the model's citation order. */
  evidence: DriftEvidence[];
  /** Always `INFERENCE`: a contradiction is a judgement between two sources, never a `FACT`. */
  type: 'INFERENCE';
  /** The confrontation call that produced it. */
  provenance: DriftProvenance;
}

/** What `drift` found in one checked document. */
export interface DriftDocument {
  /** The document's repository-relative path. */
  path: string;
  /** The claims confronted and not skipped. */
  claimsChecked: number;
  /** The claims beyond `MAX_DOC_CLAIMS`, not confronted. */
  omittedClaims: number;
  /** The claims whose lines are beyond the last line sent whole, not confronted. */
  droppedClaims: number;
  /** The verified contradictions, in the order of the confronted claims. */
  contradictions: Contradiction[];
}

/** An event of `explain`'s shapes, whose evidence ids are local to one prompt. */
export type DriftInnerEvent = SanitizationEvent | EvidenceBrokenEvent | EntailmentUnverifiedEvent;

/** An inner event with the document (and the claim, from 0 among the confronted ones) it belongs to. */
export interface DriftCheckEvent {
  /** Discriminant. */
  type: 'drift_check_event';
  /** The document's path. */
  docPath: string;
  /** Present only for the events of a claim. */
  claimIndex?: number;
  /** The inner event. */
  event: DriftInnerEvent;
}

/** A document was not checked: its extraction was discarded, or the limit left it out. */
export interface DriftDocSkippedEvent {
  /** Discriminant. */
  type: 'drift_doc_skipped';
  /** The document's path. */
  docPath: string;
  /** `invalid-model-output` or `limit`. */
  reason: 'invalid-model-output' | 'limit';
  /** Present only for `invalid-model-output`: why the output was discarded. */
  subcode?: SchemaViolationSubcode;
}

/** A claim was not checked: its confrontation was discarded. */
export interface DriftClaimSkippedEvent {
  /** Discriminant. */
  type: 'drift_claim_skipped';
  /** The document's path. */
  docPath: string;
  /** The claim's index from 0 among the confronted claims. */
  claimIndex: number;
  /** Always `invalid-model-output`. */
  reason: 'invalid-model-output';
  /** Why the output was discarded. */
  subcode: SchemaViolationSubcode;
}

/**
 * An event of a drift report: a check event, a skip, or (last, at most once, DIS-73) the `query_not_logged`
 * event of an answered report whose `query_log` row could not be written.
 */
export type DriftEvent = DriftCheckEvent | DriftDocSkippedEvent | DriftClaimSkippedEvent | QueryNotLoggedEvent;

/** What a drift run cost: every `answer` call (generation) and every `verify` call (verification). */
export interface DriftUsage {
  /** Input tokens of every resolved call. */
  inputTokens: number;
  /** Output tokens of every resolved call. */
  outputTokens: number;
  /** The total cost in USD, rounded once to 6 decimals. */
  costUsd: number;
  /** Whole milliseconds between the clock's first and last reads, at least 1. */
  latencyMs: number;
  /** The `answer` calls. */
  generation: GenerationUsage;
  /** The `verify` calls. */
  verification: VerificationUsage;
}

/** An answered report. */
export interface AnsweredDrift {
  /** Discriminant. */
  status: 'answered';
  /** The project checked. */
  projectId: string;
  /** The indexed commit every file was read at. */
  commit: string;
  /** One entry per checked document, in byte order of the paths. */
  documents: DriftDocument[];
  /** The events, document by document, then the `limit` skips, then `query_not_logged` when it applies. */
  events: DriftEvent[];
  /** What the run cost. */
  usage: DriftUsage;
  /** `true` only for a golden report answered from the answer cache (DIS-73); `false` for a run with the model. */
  cacheHit: boolean;
}

/** The report of `drift`. */
export type DriftReport = AnsweredDrift | UnknownDrift;
