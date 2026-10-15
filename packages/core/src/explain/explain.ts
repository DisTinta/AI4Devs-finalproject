import { isAbsolute } from 'node:path';
import { anchor } from '../context/anchor.js';
import { buildContextPack } from '../context/context-pack.js';
import type { ContextSpan } from '../context/context-pack.js';
import { confidence } from '../knowledge/confidence.js';
import { ClaimWriteFailed } from '../knowledge/errors.js';
import type { SavedClaim } from '../knowledge/stored-claim.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import type { VerificationUsage } from '../verify/semantic.js';
import type { VerificationCache } from '../verify/verification-cache.js';
import { verifyAnswer } from '../verify/verify-answer.js';
import { toClaimItems, toConfidenceStatement } from './claim-items.js';
import type { TypedStatement, VerifiedStatement } from './claim-items.js';
import type { AnswerEvidence, AnsweredExplain, ExplainAnswer, PriorClaim } from './explain-answer.js';
import type { ExplainEvent } from './explain-event.js';
import { parseExplainRequest } from './explain-request.js';
import type { ExplainRequest } from './explain-request.js';
import { toPriorClaim } from './prior-claims.js';
import { buildPrompt } from './prompt.js';
import { sanitizeForPrompt } from './sanitize.js';
import { parseModelOutput } from './statement-schema.js';
import type { ModelOutput } from './statement-schema.js';
import { typeStatement } from './typing-rules.js';
import { unknown } from './unknown-policy.js';

// The explain use case (DIS-39 design D4): one pass from a question to typed, verified (DIS-68 syntactic,
// DIS-70 semantic), stored statements, or an honest `UNKNOWN`. Each step is one `return` or one call, in the order of the `explain` spec, so
// every branch is observable through the calls the doubles count. Core returns events; it never logs
// the question, a span's text or the model's output.

/** What `explain` reads and writes through. */
export interface ExplainDependencies {
  /** The graph and claim store. */
  store: StorePort;
  /** The reader of the project's repository. */
  source: SourceTreePort;
  /** The model; in `evaluation` mode it is never called. */
  llm: LlmPort;
  /** Absolute path a relative project root resolves against. */
  workspaceRoot: string;
  /** The clock of the provenance. */
  now: () => Date;
  /** The verdicts of the semantic check already known; only passed to it (one per `ask` run, DIS-70 D2). */
  verificationCache: VerificationCache;
}

/**
 * Answers a question about one indexed project in a single pass: validates the request, anchors the
 * question once, answers `UNKNOWN` without building the pack when nothing anchors (`no-anchor`) or the
 * model is in evaluation mode (`llm-required`), builds the pack (`over-budget` when no span fits),
 * sanitises the question and the pack's spans (from then on the only spans: a span over the limit is
 * cut), reads the prior claims of those spans, asks the model once with the purpose `answer`,
 * quarantines its output (`invalid-model-output`, or `no-evidence` without statements), types each
 * statement, verifies the cited spans against the code the pack read (its commit and root) in one
 * batched read and drops the broken citations and the statements left with none (`broken-evidence`
 * when none is left, with no `verify` call). Then it checks semantically every kept (statement,
 * citation) pair with the purpose `verify` (one call per distinct pair `verificationCache` does not
 * hold, in sequence), caps each statement's type by the entailment policy (`FACT` only when every
 * citation is `entailed`) and stores each kept statement as a claim whose evidence rows carry the
 * verdict of their pair and whose `confidence` is that of the statement alone (`docs/CONFIDENCE.md`).
 * Every answer that reached the prompt carries the sanitisation events first, then the
 * `evidence_broken` events, then the `entailment_unverified` events; an answered one carries the usage
 * of the `verify` calls and the `confidence` of all its statements together, an `UNKNOWN` one none.
 * When the store fails with `ClaimWriteFailed` the answer is still returned, `persisted: false`, with
 * the prompt ids.
 *
 * @param dependencies The store, the source reader, the model, the workspace root, the clock and the
 *   verification cache.
 * @param request The project, the question and the limits of the pack; checked before any call.
 * @throws InvalidExplainRequest naming the field at fault, before any call.
 * @throws RangeError naming `workspaceRoot` when it is not absolute, before any call.
 * @throws ProjectNotFound, SourceUnavailable, the LlmUnavailable and BudgetExhausted of the `answer`
 *   call, and any failure of the prior-claims read, of the verification reads (other than a missing
 *   file, which breaks its citations), of a `verify` call other than LlmUnavailable and
 *   BudgetExhausted (which leave its citations `cited`), or of the claim write other than
 *   `ClaimWriteFailed`, unchanged.
 */
export async function explain(dependencies: ExplainDependencies, request: ExplainRequest): Promise<ExplainAnswer> {
  const { store, source, llm, workspaceRoot, now, verificationCache } = dependencies;
  const { projectId, question, tokenBudget, hops } = parseExplainRequest(request);
  if (!isAbsolute(workspaceRoot)) throw new RangeError('workspaceRoot must be an absolute path');

  const anchors = await anchor(store, projectId, question);
  if (anchors.length === 0) return unknown('no-anchor');
  // DIS-21: the answer cache is looked up here, after anchoring and before the evaluation-mode check.
  if (llm.mode === 'evaluation') return unknown('llm-required');

  const pack = await buildContextPack(
    { store, source, workspaceRoot },
    { projectId, question, anchors, ...(tokenBudget !== undefined && { tokenBudget }), ...(hops !== undefined && { hops }) },
  );
  if (pack.status === 'empty') return unknown('over-budget');
  const sanitized = sanitizeForPrompt(question, pack.spans);
  // The only spans from here on: a cut span ends at its kept last line everywhere (DIS-41 design D5).
  const spans = sanitized.spans;

  const prior = await store.findClaimsOverlapping(
    projectId,
    spans.map(({ fileId, startLine, endLine }) => ({ fileId, startLine, endLine })),
  );
  const prompt = buildPrompt(sanitized);
  const result = await llm.complete({ messages: prompt.messages, purpose: 'answer' });
  const parsed = parseModelOutput(result.text, new Set(prompt.evidenceIds.keys()));
  if (!parsed.ok) return unknown('invalid-model-output', [...sanitized.events, parsed.event]);
  if (parsed.output.statements.length === 0) return unknown('no-evidence', sanitized.events);

  const typed = typeStatements(parsed.output, prompt.evidenceIds);
  // Checked against the code the pack read (D1): its commit and its root, never the project's now.
  const verified = await verifyAnswer({ source, llm, cache: verificationCache }, pack.root, pack.commit, typed, prompt.evidenceIds);
  const events: ExplainEvent[] = [...sanitized.events, ...verified.events];
  if (verified.statements.length === 0) return unknown('broken-evidence', events);
  const statements = verified.statements;
  // No component produces contrary evidence until DIS-71.
  const answerConfidence = confidence(statements.map(toConfidenceStatement), { contradiction: false });
  const items = toClaimItems(
    { projectId, model: result.model, promptHash: prompt.promptHash, createdAt: now().toISOString(), packSpans: spans },
    statements,
  );
  const priorClaims = prior.map(toPriorClaim);
  try {
    // The pack's commit: claims read at code the project no longer indexes are written stale.
    const saved = await store.saveClaims(projectId, items, pack.commit);
    return storedAnswer(parsed.output.answer, statements, saved, priorClaims, events, verified.usage, answerConfidence);
  } catch (error) {
    if (!(error instanceof ClaimWriteFailed)) throw error;
    return unsavedAnswer(parsed.output.answer, statements, priorClaims, events, verified.usage, answerConfidence);
  }
}

/** Each statement of an accepted output with its cited spans, in the model's order, and its type. */
function typeStatements(output: ModelOutput, spanOf: ReadonlyMap<string, ContextSpan>): TypedStatement[] {
  return output.statements.map((statement) => {
    // The quarantine accepted only known ids and at least one per statement.
    const evidenceIds = [...statement.evidenceIds] as [string, ...string[]];
    const spans = evidenceIds.map((id) => spanOf.get(id) as ContextSpan) as [ContextSpan, ...ContextSpan[]];
    return { text: statement.text, type: typeStatement(spans), spans, evidenceIds };
  });
}

/** The evidence entry of `span` under `id`. */
function evidenceEntry(id: string, span: ContextSpan): AnswerEvidence {
  return { id, fileId: span.fileId, path: span.path, startLine: span.startLine, endLine: span.endLine, excerpt: span.text };
}

/**
 * A stored answer: one evidence entry per citation, under its stored row id, its events, its usage and
 * its confidence.
 */
function storedAnswer(
  answer: string,
  statements: readonly VerifiedStatement[],
  saved: readonly SavedClaim[],
  priorClaims: PriorClaim[],
  events: ExplainEvent[],
  verification: VerificationUsage,
  answerConfidence: number,
): AnsweredExplain {
  return {
    kind: 'answered',
    persisted: true,
    answer,
    statements: statements.map((statement, i) =>
      saved[i].status === 'stale'
        ? {
            text: statement.text,
            // As for a prior claim: a stale statement is never shown as a fact (design D11).
            type: 'INFERENCE' as const,
            status: 'stale' as const,
            warning: 'stale-evidence' as const,
            verification: statement.verification,
            evidenceIds: saved[i].evidenceIds,
          }
        : {
            text: statement.text,
            type: statement.type,
            status: 'current' as const,
            verification: statement.verification,
            evidenceIds: saved[i].evidenceIds,
          },
    ),
    evidence: statements.flatMap((statement, i) =>
      statement.spans.map((span, j) => evidenceEntry(saved[i].evidenceIds[j], span)),
    ),
    priorClaims,
    events,
    usage: { verification },
    confidence: answerConfidence,
  };
}

/**
 * An unsaved answer: the prompt ids, one evidence entry per distinct cited id in first-citation order,
 * its events followed by `claims_not_persisted`, its usage and its confidence.
 */
function unsavedAnswer(
  answer: string,
  statements: readonly VerifiedStatement[],
  priorClaims: PriorClaim[],
  events: ExplainEvent[],
  verification: VerificationUsage,
  answerConfidence: number,
): AnsweredExplain {
  const evidence = new Map<string, AnswerEvidence>();
  for (const statement of statements) {
    statement.evidenceIds.forEach((id, j) => {
      if (!evidence.has(id)) evidence.set(id, evidenceEntry(id, statement.spans[j]));
    });
  }
  return {
    kind: 'answered',
    persisted: false,
    answer,
    statements: statements.map((statement) => ({
      text: statement.text,
      type: statement.type,
      status: 'current',
      verification: statement.verification,
      evidenceIds: [...statement.evidenceIds],
    })),
    evidence: [...evidence.values()],
    priorClaims,
    events: [...events, { type: 'claims_not_persisted', code: 'store-write-failed' }],
    usage: { verification },
    confidence: answerConfidence,
  };
}
