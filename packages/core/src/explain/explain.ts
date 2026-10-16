import { isAbsolute } from 'node:path';
import { anchor } from '../context/anchor.js';
import { buildContextPack } from '../context/context-pack.js';
import type { ContextSpan } from '../context/context-pack.js';
import { confidence } from '../knowledge/confidence.js';
import { ClaimWriteFailed, InvalidStoreQuery, ProjectNotFound, QueryLogWriteFailed } from '../knowledge/errors.js';
import type { QueryLogEntry } from '../knowledge/query-log.js';
import type { SavedClaim } from '../knowledge/stored-claim.js';
import { COST_TABLE } from '../llm/cost-table.js';
import type { CostTable } from '../llm/cost-table.js';
import type { LlmPort } from '../ports/LlmPort.js';
import type { SourceTreePort } from '../ports/SourceTreePort.js';
import type { StorePort } from '../ports/StorePort.js';
import type { VerificationUsage } from '../verify/semantic.js';
import type { VerificationCache } from '../verify/verification-cache.js';
import { verifyAnswer } from '../verify/verify-answer.js';
import { toClaimItems, toConfidenceStatement } from './claim-items.js';
import type { TypedStatement, VerifiedStatement } from './claim-items.js';
import type { AnswerEvidence, ExplainAnswer, PriorClaim, StoredExplain, UnsavedExplain } from './explain-answer.js';
import type { ExplainEvent, QueryNotLoggedCode } from './explain-event.js';
import { parseExplainRequest } from './explain-request.js';
import type { ExplainRequest } from './explain-request.js';
import { toPriorClaim } from './prior-claims.js';
import { buildPrompt } from './prompt.js';
import { sanitizeForPrompt } from './sanitize.js';
import { parseModelOutput } from './statement-schema.js';
import type { ModelOutput } from './statement-schema.js';
import { typeStatement } from './typing-rules.js';
import { unknown } from './unknown-policy.js';
import type { UnknownExplain } from './unknown-policy.js';
import { aggregateUsage, latencyMs, queryLogEntry } from './usage.js';
import type { VerificationRowUsage } from './usage.js';
import { meterLlm } from './usage-meter.js';

// The explain use case (DIS-39 design D4): one pass from a question to typed, verified (DIS-68 syntactic,
// DIS-70 semantic), stored statements, or an honest `UNKNOWN`. Each step is one `return` or one call, in the order of the `explain` spec, so
// every branch is observable through the calls the doubles count. Core returns events; it never logs
// the question, a span's text or the model's output. Since DIS-74 every call is metered and recorded
// in one `query_log` row (design U7).

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
  /**
   * The clock of the provenance, of the latency of the call and of the semantic check (DIS-74): read
   * twice by explain when it writes a row, and twice more by the semantic check in `live` mode.
   */
  now: () => Date;
  /** The verdicts of the semantic check already known; only passed to it (one per `ask` run, DIS-70 D2). */
  verificationCache: VerificationCache;
  /** The prices of the usage (DIS-74); the shipped cost table of `llm-adapter` when absent. */
  costTable?: CostTable;
}

/** An answered answer before its usage is attached: the usage needs the latency, read after it. */
type UnpricedAnswer = Omit<StoredExplain, 'usage'> | Omit<UnsavedExplain, 'usage'>;

/** What the pipeline of one call ends with: an `UNKNOWN` answer, or an answer and its verification usage. */
type Outcome = { answer: UnknownExplain } | { answer: UnpricedAnswer; verification: VerificationUsage };

/** What `explain` learns about the call while the pipeline runs, for its `query_log` row. */
interface CallState {
  /** The pack's `baselineTokens` once the pack is built; `null` before. */
  baselineTokens: number | null;
  /**
   * The semantic check's latency for a rejection row (design U15): 0 until it starts, `null` while it
   * runs (an error raised inside it leaves its time unknown), its own `latencyMs` once it returned.
   */
  verifyLatencyMs: number | null;
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
 * (DIS-74: the `answer` call and the semantic check, priced with `costTable`, the savings against the
 * pack's baseline and the latency) and the `confidence` of all its statements together, an `UNKNOWN`
 * one neither. When the store fails with `ClaimWriteFailed` the answer is still returned,
 * `persisted: false`, with the prompt ids.
 *
 * Every call is recorded in one `query_log` row, written on its own after the claim write: on every
 * return (`UNKNOWN` included, with zero counters when no model call was made) and on every rejection
 * raised after a model call resolved (the spend so far, then the original error, whatever happened to
 * the row). No row is written when explain fails before any call resolved. When the row of a returned
 * answer fails with `QueryLogWriteFailed`, `ProjectNotFound` or `InvalidStoreQuery`, the answer is still returned with
 * `query_not_logged` as its last event. Explain reads its clock twice in a call that writes a row (after
 * validating the request, which is also every claim's provenance instant, and just before the row); in
 * `live` mode the semantic check reads it twice more between them.
 *
 * @param dependencies The store, the source reader, the model, the workspace root, the clock, the
 *   verification cache and, optionally, the cost table.
 * @param request The project, the question and the limits of the pack; checked before any call.
 * @throws InvalidExplainRequest naming the field at fault, before any call.
 * @throws RangeError naming `workspaceRoot` when it is not absolute, before any call.
 * @throws ProjectNotFound, SourceUnavailable, the LlmUnavailable and BudgetExhausted of the `answer`
 *   call, and any failure of the prior-claims read, of the verification reads (other than a missing
 *   file, which breaks its citations), of a `verify` call other than LlmUnavailable and
 *   BudgetExhausted (which leave its citations `cited`), or of the claim write other than
 *   `ClaimWriteFailed`, unchanged; any failure of the row write of a returned answer other than
 *   `QueryLogWriteFailed`, `ProjectNotFound` and `InvalidStoreQuery`, unchanged.
 */
export async function explain(dependencies: ExplainDependencies, request: ExplainRequest): Promise<ExplainAnswer> {
  const { store, llm, now } = dependencies;
  const parsed = parseExplainRequest(request);
  if (!isAbsolute(dependencies.workspaceRoot)) throw new RangeError('workspaceRoot must be an absolute path');

  const startedAt = now();
  const meter = meterLlm(llm, dependencies.costTable ?? COST_TABLE);
  const state: CallState = { baselineTokens: null, verifyLatencyMs: 0 };
  const row = (verification: VerificationRowUsage, latency: number): QueryLogEntry =>
    queryLogEntry({
      projectId: parsed.projectId,
      question: parsed.question,
      generation: meter.generation(),
      verification,
      baselineTokens: state.baselineTokens,
      latencyMs: latency,
    });
  // The verification of a row no semantic check finished: the meter's resolved `verify` calls.
  const meteredVerification = (): VerificationRowUsage => ({
    ...meter.verification(),
    calls: meter.verifyCalls(),
    latencyMs: state.verifyLatencyMs,
  });

  let outcome: Outcome;
  try {
    outcome = await answerQuestion({ ...dependencies, llm: meter.llm }, parsed, startedAt, state);
  } catch (error) {
    // Spend after a resolved call must reach the ceiling (decision D1); the row never masks the error.
    if (meter.resolvedCalls() > 0) {
      await store.saveQueryLog(row(meteredVerification(), latencyMs(startedAt, now()))).catch(() => undefined);
    }
    throw error;
  }
  const latency = latencyMs(startedAt, now());
  if (!('verification' in outcome)) {
    return withNotLoggedEvent(outcome.answer, await saveRow(store, row(meteredVerification(), latency)));
  }
  const usage = aggregateUsage({
    generation: meter.generation(),
    verification: outcome.verification,
    baselineTokens: state.baselineTokens ?? 0,
    latencyMs: latency,
  });
  const answer = { ...outcome.answer, usage } as ExplainAnswer;
  return withNotLoggedEvent(answer, await saveRow(store, row(usage.verification, latency)));
}

/**
 * Writes the row of a returned answer (DIS-74 design U9): resolves to the `query_not_logged` code when
 * the store fails with `QueryLogWriteFailed`, `ProjectNotFound` or `InvalidStoreQuery`, to `undefined`
 * once written.
 *
 * @throws Any other failure of the write, unchanged.
 */
async function saveRow(store: StorePort, entry: QueryLogEntry): Promise<QueryNotLoggedCode | undefined> {
  try {
    await store.saveQueryLog(entry);
    return undefined;
  } catch (error) {
    if (error instanceof QueryLogWriteFailed) return 'store-write-failed';
    if (error instanceof ProjectNotFound) return 'project-not-found';
    // Counts the model reported can exceed the row's columns; the claims are already stored (F1).
    if (error instanceof InvalidStoreQuery) return 'invalid-entry';
    throw error;
  }
}

/** `answer` with `query_not_logged` appended to its events when `code` says the row was not written. */
function withNotLoggedEvent<A extends ExplainAnswer>(answer: A, code: QueryNotLoggedCode | undefined): A {
  return code === undefined ? answer : { ...answer, events: [...answer.events, { type: 'query_not_logged', code }] };
}

/**
 * The pipeline of one call over the metered model, from anchoring to the claim write. It records in
 * `state` the pack's baseline and the progress of the semantic check (for a rejection row), and stamps
 * every claim's provenance with `startedAt`.
 */
async function answerQuestion(
  dependencies: ExplainDependencies,
  request: ExplainRequest,
  startedAt: Date,
  state: CallState,
): Promise<Outcome> {
  const { store, source, llm, workspaceRoot, now, verificationCache, costTable } = dependencies;
  const { projectId, question, tokenBudget, hops } = request;

  const anchors = await anchor(store, projectId, question);
  if (anchors.length === 0) return { answer: unknown('no-anchor') };
  // DIS-21: the answer cache is looked up here, after anchoring and before the evaluation-mode check.
  if (llm.mode === 'evaluation') return { answer: unknown('llm-required') };

  const pack = await buildContextPack(
    { store, source, workspaceRoot },
    { projectId, question, anchors, ...(tokenBudget !== undefined && { tokenBudget }), ...(hops !== undefined && { hops }) },
  );
  state.baselineTokens = pack.baselineTokens;
  if (pack.status === 'empty') return { answer: unknown('over-budget') };
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
  if (!parsed.ok) return { answer: unknown('invalid-model-output', [...sanitized.events, parsed.event]) };
  if (parsed.output.statements.length === 0) return { answer: unknown('no-evidence', sanitized.events) };

  const typed = typeStatements(parsed.output, prompt.evidenceIds);
  // Checked against the code the pack read (D1): its commit and its root, never the project's now.
  const verified = await verifyAnswer(
    {
      source,
      llm,
      cache: verificationCache,
      now,
      ...(costTable !== undefined && { costTable }),
      onSemanticStart: () => {
        state.verifyLatencyMs = null;
      },
    },
    pack.root,
    pack.commit,
    typed,
    prompt.evidenceIds,
  );
  state.verifyLatencyMs = verified.usage.latencyMs;
  const events: ExplainEvent[] = [...sanitized.events, ...verified.events];
  if (verified.statements.length === 0) return { answer: unknown('broken-evidence', events) };
  const statements = verified.statements;
  // No component produces contrary evidence until DIS-71.
  const answerConfidence = confidence(statements.map(toConfidenceStatement), { contradiction: false });
  const items = toClaimItems(
    { projectId, model: result.model, promptHash: prompt.promptHash, createdAt: startedAt.toISOString(), packSpans: spans },
    statements,
  );
  const priorClaims = prior.map(toPriorClaim);
  const verification = verified.usage;
  try {
    // The pack's commit: claims read at code the project no longer indexes are written stale.
    const saved = await store.saveClaims(projectId, items, pack.commit);
    return { answer: storedAnswer(parsed.output.answer, statements, saved, priorClaims, events, answerConfidence), verification };
  } catch (error) {
    if (!(error instanceof ClaimWriteFailed)) throw error;
    return { answer: unsavedAnswer(parsed.output.answer, statements, priorClaims, events, answerConfidence), verification };
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
 * A stored answer: one evidence entry per citation, under its stored row id, its events and its
 * confidence; `explain` attaches the usage.
 */
function storedAnswer(
  answer: string,
  statements: readonly VerifiedStatement[],
  saved: readonly SavedClaim[],
  priorClaims: PriorClaim[],
  events: ExplainEvent[],
  answerConfidence: number,
): Omit<StoredExplain, 'usage'> {
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
    confidence: answerConfidence,
  };
}

/**
 * An unsaved answer: the prompt ids, one evidence entry per distinct cited id in first-citation order,
 * its events followed by `claims_not_persisted`, and its confidence; `explain` attaches the usage.
 */
function unsavedAnswer(
  answer: string,
  statements: readonly VerifiedStatement[],
  priorClaims: PriorClaim[],
  events: ExplainEvent[],
  answerConfidence: number,
): Omit<UnsavedExplain, 'usage'> {
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
    confidence: answerConfidence,
  };
}
