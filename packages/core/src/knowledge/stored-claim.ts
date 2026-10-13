import type { z } from 'zod';
import { claimSchema, inputSpanSchema } from './claim.js';
import type { Claim, ClaimStatus } from './claim.js';
import { InvalidStoreQuery } from './errors.js';
import { evidenceSchema } from './evidence.js';
import type { Evidence } from './evidence.js';

// The shapes the store's claim operations take and return (DIS-39 design D7, D11): the claims of one
// answer go in with their evidence in one call, and stored claims come back with their ids, the
// instant they were written and every evidence, each with its file's path.

/** Most claims `findClaimsOverlapping` returns: the most recent ones (author decision, 2026-10-13). */
export const MAX_PRIOR_CLAIMS = 20;

/** A span of one file: its id and its first and last line (from 1, inclusive), as the pack gives it. */
export type ClaimSpan = z.infer<typeof inputSpanSchema>;

/** One claim to write, with the evidence that backs it (at least one). */
export interface ClaimItem {
  /** The claim record. */
  claim: Claim;
  /** Its evidence records, in the order their ids are returned. */
  evidence: Evidence[];
}

/** The ids one written claim and its evidence were stored under, in the order they were given. */
export interface SavedClaim {
  /** The id of the stored claim. */
  claimId: string;
  /** The ids of its stored evidence, in the order of the item's evidence. */
  evidenceIds: string[];
  /** The status it was stored with: `stale` when it was read at a commit the project no longer indexes. */
  status: ClaimStatus;
}

/** A stored evidence: the record, the id it was stored under and the path of its file. */
export type StoredEvidence = Evidence & {
  /** The id of the evidence row. */
  id: string;
  /** The repository-relative path of the cited file. */
  path: string;
};

/** A stored claim: the record, its id, the instant it was written and all its evidence. */
export type StoredClaim = Claim & {
  /** The id of the claim row. */
  id: string;
  /** The instant the claim was written, ISO 8601 with a time zone. */
  createdAt: string;
  /** Every evidence of the claim, by first line and then by id. */
  evidence: StoredEvidence[];
};

/**
 * Checks the claims of one write before any statement (DIS-39 design D7): every claim and evidence
 * passes its record schema, every item has at least one evidence, and every claim names `projectId`
 * (compared lower-cased: a well-formed id is accepted in any letter case). The message is fixed text.
 *
 * @throws InvalidStoreQuery naming `claims` when any item breaks a rule.
 */
export function assertValidClaimItems(projectId: string, items: readonly ClaimItem[]): void {
  const project = projectId.toLowerCase();
  const valid = items.every(
    (item) =>
      claimSchema.safeParse(item.claim).success &&
      item.claim.projectId.toLowerCase() === project &&
      item.evidence.length > 0 &&
      item.evidence.every((evidence) => evidenceSchema.safeParse(evidence).success),
  );
  if (!valid) throw new InvalidStoreQuery('claims', 'must be valid claim and evidence records of the project');
}

/**
 * Checks the spans of an overlap read before querying: each must be a valid input span.
 *
 * @throws InvalidStoreQuery naming `spans` when any span is invalid.
 */
export function assertValidClaimSpans(spans: readonly ClaimSpan[]): void {
  if (!spans.every((span) => inputSpanSchema.safeParse(span).success)) {
    throw new InvalidStoreQuery('spans', 'must be valid input spans');
  }
}
