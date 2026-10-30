import type { ContextSpan } from '../context/context-pack.js';
import { ClaimWriteFailed, InvalidStoreQuery } from '../knowledge/errors.js';
import type { ClaimItem, StoredClaim, StoredEvidence } from '../knowledge/stored-claim.js';
import { BudgetExhausted, LlmUnavailable } from '../llm/errors.js';
import type { CostTable } from '../llm/cost-table.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import type { VerificationUsage } from '../verify/semantic.js';
import type { VerificationCache } from '../verify/verification-cache.js';
import { verifyAnswer } from '../verify/verify-answer.js';
import { toClaimItems } from './claim-items.js';
import type { TypedStatement } from './claim-items.js';
import type { PriorClaim } from './explain-answer.js';
import type { StaleClaimNotRefreshedCode, StaleClaimNotRefreshedEvent } from './explain-event.js';
import { toPriorClaim } from './prior-claims.js';
import { buildRefreshPrompt } from './refresh-prompt.js';
import { sanitizeForPrompt } from './sanitize.js';
import type { SanitizedSpan } from './sanitize.js';
import { parseModelOutput } from './statement-schema.js';
import { typeStatement } from './typing-rules.js';

// The lazy refresh of the stale prior claims of an answered answer (DIS-42 design D1–D10). Each due
// claim is re-inferred over the current spans of the pack that overlap its evidence, with a prompt of
// its own, then quarantined, typed and verified as an answer's statement is, and written back in its
// own row only while it is still stale and the pack's commit is still the indexed one. A refresh that
// does not reach a verified statement leaves the claim as it was and is reported by a closed code; it
// never fails the answer. Core returns events; it never logs a claim, a span or a model output.

/** The most stale claims refreshed by one question, the newest ones (DIS-42 design D2). */
export const MAX_STALE_REFRESHES = 3;

/** What `refreshStaleClaims` reads and writes through: the answer's own, metered. */
export interface StaleRefreshDependencies {
  /** The claim store. */
  store: StorePort;
  /** The reader of the repository, for the syntactic check. */
  source: SourceTreePort;
  /** The metered model: its `answer` and `verify` calls count in the call's usage and row. */
  llm: LlmPort;
  /** The verdicts of the semantic check already known. */
  verificationCache: VerificationCache;
  /** The clock the semantic check times itself with. */
  now: () => Date;
  /** The prices of the semantic check's usage. */
  costTable?: CostTable;
  /** Called just before a refresh's semantic check starts: from then on an error comes from inside it. */
  onSemanticStart?: () => void;
  /** Called with the usage of each refresh's semantic check once it returned. */
  onSemanticDone?: (usage: VerificationUsage) => void;
}

/** What `refreshStaleClaims` is given about the answered call. */
export interface StaleRefreshInput {
  /** The project of the call. */
  projectId: string;
  /** The repository root the pack was read from. */
  root: string;
  /** The commit the pack was read at. */
  commit: string;
  /** The clock's first instant of the call: the provenance instant of a refreshed claim. */
  startedAt: Date;
  /** The spans of the pack before sanitisation, in pack order. */
  rawSpans: readonly ContextSpan[];
  /** The sanitised spans of the pack, position by position with `rawSpans`. */
  sanitizedSpans: readonly SanitizedSpan[];
  /** The prior claims read before the model, in the order the store returned them. */
  prior: readonly StoredClaim[];
}

/** What `refreshStaleClaims` returns. */
export interface StaleRefreshResult {
  /** The prior claims to show, in the order of `prior`: a refreshed claim replaced at its position. */
  priorClaims: PriorClaim[];
  /** One event per due claim that was not rewritten, in prior-claims order. */
  events: StaleClaimNotRefreshedEvent[];
  /** The usage of each semantic check the refreshes ran, in order. */
  verifications: VerificationUsage[];
}

/** The outcome of refreshing one claim: the claim to show, or the code it was not refreshed with. */
type Refreshed = { claim: StoredClaim } | { code: StaleClaimNotRefreshedCode };

/**
 * Whether a prior claim is due for a refresh: stale, `L2`, `INFERENCE`, with an object and a
 * provenance holding a statement type, `FACT` or `INFERENCE` (the shape `toClaimItems` writes).
 */
function isDue(claim: StoredClaim): boolean {
  const statementType = (claim.provenance as { statementType?: unknown } | undefined)?.statementType;
  return (
    claim.status === 'stale' &&
    claim.layer === 'L2' &&
    claim.type === 'INFERENCE' &&
    claim.object !== null &&
    (statementType === 'FACT' || statementType === 'INFERENCE')
  );
}

/** Whether the lines of `span` overlap, inclusively, those of `evidence` in the same file. */
function overlaps(span: SanitizedSpan, evidence: StoredEvidence): boolean {
  return span.fileId === evidence.fileId && span.startLine <= evidence.endLine && span.endLine >= evidence.startLine;
}

/**
 * Refreshes, one at a time, the first `MAX_STALE_REFRESHES` due stale claims of `input.prior`, newest
 * first: for each, the model is called once with the purpose `answer` and a refresh prompt over the
 * pack's sanitised spans that overlap the claim's evidence; the first statement of its output is
 * quarantined, typed and verified as an answer's statement, and the claim is rewritten in place through
 * the store, read at the pack's commit. A claim that is not rewritten is shown as it was read and gets
 * one event with its code. When the refresh's `answer` call fails with `LlmUnavailable` or
 * `BudgetExhausted`, that claim and every due claim after it get the matching code and no further call
 * is made.
 *
 * @param deps The store, the source reader, the metered model, the verification cache, the clock, the
 *   cost table and the callbacks of the semantic check.
 * @param input The call's project, root, commit, instant, spans and prior claims.
 * @returns The prior claims to show, the events and the usage of the semantic checks.
 * @throws Any failure of the refresh's `answer` call other than `LlmUnavailable` and `BudgetExhausted`,
 *   of a verification read other than a missing file, of a `verify` call other than those two, or of
 *   the claim refresh other than `ClaimWriteFailed` (code `store-write-failed`) and `InvalidStoreQuery`
 *   naming `claims` (code `superseded`: a re-index deleted a cited file before the write), unchanged.
 */
export async function refreshStaleClaims(deps: StaleRefreshDependencies, input: StaleRefreshInput): Promise<StaleRefreshResult> {
  const due = input.prior.filter(isDue).slice(0, MAX_STALE_REFRESHES);
  const outcomes = new Map<string, Refreshed>();
  const verifications: VerificationUsage[] = [];
  let stopped: StaleClaimNotRefreshedCode | undefined;
  for (const claim of due) {
    if (stopped !== undefined) {
      outcomes.set(claim.id, { code: stopped });
      continue;
    }
    const outcome = await refreshOne(deps, input, claim, verifications);
    if ('code' in outcome && (outcome.code === 'llm-unavailable' || outcome.code === 'budget-exhausted')) stopped = outcome.code;
    outcomes.set(claim.id, outcome);
  }
  const events: StaleClaimNotRefreshedEvent[] = [];
  const priorClaims = input.prior.map((claim) => {
    const outcome = outcomes.get(claim.id);
    if (outcome === undefined) return toPriorClaim(claim);
    if ('claim' in outcome) return toPriorClaim(outcome.claim);
    events.push({ type: 'stale_claim_not_refreshed', claimId: claim.id, code: outcome.code });
    return toPriorClaim(claim);
  });
  return { priorClaims, events, verifications };
}

/**
 * Refreshes one due claim (design D3–D5, D8): resolves to the claim as rewritten, or to the code it was
 * not refreshed with. The usage of its semantic check, when it ran, is appended to `verifications`.
 */
async function refreshOne(
  deps: StaleRefreshDependencies,
  input: StaleRefreshInput,
  claim: StoredClaim,
  verifications: VerificationUsage[],
): Promise<Refreshed> {
  const indices = input.sanitizedSpans.flatMap((span, i) => (claim.evidence.some((evidence) => overlaps(span, evidence)) ? [i] : []));
  if (indices.length === 0) return { code: 'no-evidence' };
  // The stored object is untrusted text: checked against the instruction patterns like a question, over
  // the raw spans, so the spans come out as the answer's prompt saw them. Its events are not returned.
  const sanitized = sanitizeForPrompt(claim.object as string, indices.map((i) => input.rawSpans[i] as ContextSpan));
  const prompt = buildRefreshPrompt(sanitized);

  let result;
  try {
    result = await deps.llm.complete({ messages: prompt.messages, purpose: 'answer' });
  } catch (error) {
    if (error instanceof LlmUnavailable) return { code: 'llm-unavailable' };
    if (error instanceof BudgetExhausted) return { code: 'budget-exhausted' };
    throw error;
  }
  const parsed = parseModelOutput(result.text, new Set(prompt.evidenceIds.keys()));
  if (!parsed.ok) return { code: 'invalid-model-output' };
  const [statement] = parsed.output.statements;
  if (statement === undefined) return { code: 'no-evidence' };

  const evidenceIds = [...statement.evidenceIds] as [string, ...string[]];
  const spans = evidenceIds.map((id) => prompt.evidenceIds.get(id) as SanitizedSpan) as [SanitizedSpan, ...SanitizedSpan[]];
  const typed: TypedStatement = { text: statement.text, type: typeStatement(spans), spans, evidenceIds };
  const verified = await verifyAnswer(
    {
      source: deps.source,
      llm: deps.llm,
      cache: deps.verificationCache,
      now: deps.now,
      ...(deps.costTable !== undefined && { costTable: deps.costTable }),
      ...(deps.onSemanticStart !== undefined && { onSemanticStart: deps.onSemanticStart }),
    },
    input.root,
    input.commit,
    [typed],
    prompt.evidenceIds,
  );
  verifications.push(verified.usage);
  deps.onSemanticDone?.(verified.usage);
  const [kept] = verified.statements;
  if (kept === undefined) return { code: 'broken-evidence' };

  const item = toClaimItems(
    {
      projectId: input.projectId,
      model: result.model,
      promptHash: prompt.promptHash,
      createdAt: input.startedAt.toISOString(),
      packSpans: input.sanitizedSpans,
    },
    [kept],
  )[0] as ClaimItem;
  let refresh;
  try {
    refresh = await deps.store.refreshClaim(input.projectId, claim.id, item, input.commit);
  } catch (error) {
    if (error instanceof ClaimWriteFailed) return { code: 'store-write-failed' };
    // A cited file that is no longer a file of the project: a re-index deleted it after the pack was
    // read, so the claim is no longer due against the indexed code (spec "Stale claim refresh" step 5).
    if (error instanceof InvalidStoreQuery && error.argument === 'claims') return { code: 'superseded' };
    throw error;
  }
  if (!refresh.refreshed) return { code: 'superseded' };
  // The claim as the store now holds it: its id, project and creation instant, and the new evidence.
  const rewritten = {
    ...item.claim,
    id: claim.id,
    createdAt: claim.createdAt,
    evidence: item.evidence.map((evidence, j) => ({
      ...evidence,
      id: refresh.evidenceIds[j] as string,
      path: kept.spans[j].path,
    })),
  } as StoredClaim;
  return { claim: rewritten };
}
