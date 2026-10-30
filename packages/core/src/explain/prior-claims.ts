import type { ClaimType } from '../knowledge/claim.js';
import type { StoredClaim } from '../knowledge/stored-claim.js';
import type { PriorClaim } from './explain-answer.js';

// How a stored claim over the pack's code is shown (DIS-39 design D11). Stale claims are shown,
// marked and never as `FACT`. A due stale claim is refreshed before it is shown (DIS-42,
// `stale-refresh.ts`): once rewritten it is passed here with its new values and is `current`;
// otherwise it is shown as it was read.

/**
 * The type a stored claim is shown with: its provenance's statement type when it has one, its stored
 * type otherwise; a stale `FACT` is shown as `INFERENCE` (a stale `INFERENCE` or `UNKNOWN` keeps its
 * type).
 *
 * @param claim The stored claim.
 */
export function displayType(claim: StoredClaim): ClaimType {
  // Only an `L2` `INFERENCE` provenance has a statement type; the other variants have none.
  const { statementType } = (claim.provenance ?? {}) as { statementType?: ClaimType };
  const type = statementType ?? claim.type;
  return claim.status === 'stale' && type === 'FACT' ? 'INFERENCE' : type;
}

/**
 * A stored claim as the answer shows it: its id, its object as text, its displayed type, its status,
 * its evidence and, when stale, `warning: 'stale-evidence'`.
 *
 * @param claim The stored claim.
 */
export function toPriorClaim(claim: StoredClaim): PriorClaim {
  return {
    id: claim.id,
    text: claim.object,
    type: displayType(claim),
    status: claim.status,
    ...(claim.status === 'stale' && { warning: 'stale-evidence' as const }),
    evidence: claim.evidence.map(({ id, fileId, path, startLine, endLine, excerpt }) => ({
      id,
      fileId,
      path,
      startLine,
      endLine,
      excerpt,
    })),
  };
}
