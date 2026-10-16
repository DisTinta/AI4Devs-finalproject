import type { FastifyInstance } from 'fastify';
import { createInMemoryVerificationCache, explain as coreExplain } from '@codemind/core';
import type { explain, ExplainAnswer, InvalidExplainRequest, LlmUnavailable, SourceUnavailable } from '@codemind/core';
import { DOMAIN_ERRORS } from '../plugins/error-handler.js';
import type { DomainErrorMapping, DomainErrorTable } from '../plugins/error-handler.js';
import { askBodySchema, askParamsSchema, askResponseSchema } from '../schemas/ask.js';
import type { AskBody, AskParams, AskResponse } from '../schemas/ask.js';
import { errorSchema } from '../schemas/common.js';

/** The global answer of `BUDGET_EXHAUSTED`, which the table of `/ask` extends (D6). */
const BUDGET_EXHAUSTED = DOMAIN_ERRORS.get('BUDGET_EXHAUSTED')!;

/**
 * The domain error table of `POST /api/projects/{projectId}/ask` (DIS-78 design U4, D5, D6): fixed
 * messages (those of the CLI `ask`, except `invalid request`, the message of every HTTP `400`
 * validation answer) and details built only from the error's fields. `BUDGET_EXHAUSTED` keeps the
 * global answer and adds `cacheOnly: true`: what needs no model call is still served.
 */
export const ASK_DOMAIN_ERRORS: DomainErrorTable = new Map<string, DomainErrorMapping>([
  ['PROJECT_NOT_FOUND', { status: 404, message: 'project not found', details: () => ({}) }],
  [
    'INVALID_EXPLAIN_REQUEST',
    { status: 400, message: 'invalid request', details: (error) => ({ field: (error as InvalidExplainRequest).field }) },
  ],
  [
    'LLM_UNAVAILABLE',
    {
      status: 503,
      message: 'the language model is unavailable',
      details: (error) => {
        const { reason, status, expected, received, systemCode } = error as LlmUnavailable;
        return {
          reason,
          ...(status !== undefined && { status }),
          ...(expected !== undefined && { expected }),
          ...(received !== undefined && { received }),
          ...(systemCode !== undefined && { systemCode }),
        };
      },
    },
  ],
  [
    'SOURCE_UNAVAILABLE',
    {
      status: 503,
      message: "the project's source cannot be read",
      details: (error) => {
        const { reason, path } = error as SourceUnavailable;
        return { reason, ...(path !== undefined && { path }) };
      },
    },
  ],
  ['BUDGET_EXHAUSTED', { ...BUDGET_EXHAUSTED, details: (error) => ({ ...BUDGET_EXHAUSTED.details(error), cacheOnly: true }) }],
]);

/** How the ask route is registered. */
export interface AskRouteOptions {
  /** The use case; core's `explain` when absent. A test seam only (DIS-78 design U3). */
  explain?: typeof explain;
}

/**
 * The public form of an answer of `explain` (DIS-78 design U3): an `UNKNOWN` keeps its reason and,
 * only for `llm-required`, its message; an answered question gets public evidence ids `ev-1`, `ev-2`…
 * in evidence order, `path` published as `file`, and only the fields of `readme.md` §4. A statement
 * citing an id absent from the evidence breaks the use case's contract: it throws, never drops nor
 * invents an id.
 *
 * @param answer The answer of `explain`.
 * @returns The `200` body.
 */
export function toPublicAnswer(answer: ExplainAnswer): AskResponse {
  if (answer.kind === 'unknown') {
    const { reason, message } = answer;
    // The route enforces "message only for llm-required" itself, whatever the use case sends.
    const sendsMessage = reason === 'llm-required' && message !== undefined;
    return { answer: 'UNKNOWN', reason, ...(sendsMessage && { message }), statements: [], evidence: [] };
  }
  const publicIds = new Map(answer.evidence.map((entry, i) => [entry.id, `ev-${i + 1}`]));
  const publicId = (id: string): string => {
    const found = publicIds.get(id);
    if (found === undefined) throw new Error('a statement cites an evidence id absent from the answer');
    return found;
  };
  const { usage } = answer;
  return {
    answer: answer.answer,
    statements: answer.statements.map(({ text, type, verification, evidenceIds }) => ({
      text,
      type,
      verification,
      evidenceIds: evidenceIds.map(publicId),
    })),
    evidence: answer.evidence.map(({ id, path, startLine, endLine, excerpt }) => ({
      id: publicId(id),
      file: path,
      startLine,
      endLine,
      // `null` only for a prior claim; were it here, the response schema would fail it (500 INTERNAL).
      excerpt: excerpt as string,
    })),
    confidence: answer.confidence,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      baselineTokens: usage.baselineTokens,
      baselineEstimator: usage.baselineEstimator,
      savingsPct: usage.savingsPct,
      costUsd: usage.costUsd,
      latencyMs: usage.latencyMs,
      cacheHit: usage.cacheHit,
      generation: { ...usage.generation },
      verification: { ...usage.verification },
    },
  };
}

/**
 * Registers `POST /api/projects/{projectId}/ask` (DIS-78 design U3): validates the request, resolves
 * the project in the store (whatever the question), answers with `explain`, writes the answer's
 * events to the request log (`evidence_broken` at `error`, the rest at `info`) and returns the public
 * form of the answer. One verification cache is created here and shared by every request of this
 * app (D9).
 *
 * @param app The instance to register the route on.
 * @param options The use case seam.
 */
export function registerAskRoute(app: FastifyInstance, options: AskRouteOptions = {}): void {
  const explainQuestion = options.explain ?? coreExplain;
  const verificationCache = createInMemoryVerificationCache();
  const schema = {
    params: askParamsSchema,
    body: askBodySchema,
    response: { 200: askResponseSchema, 400: errorSchema, 404: errorSchema, 429: errorSchema, 500: errorSchema, 503: errorSchema },
  };
  app.post('/api/projects/:projectId/ask', { schema, config: { domainErrors: ASK_DOMAIN_ERRORS } }, async (request) => {
    const { projectId } = request.params as AskParams;
    const body = request.body as AskBody;
    const project = await app.deps.store.getProject(projectId);
    const explained = await explainQuestion(
      { ...app.deps, verificationCache },
      { projectId: project.id, question: body.question, ...(body.tokenBudget !== undefined && { tokenBudget: body.tokenBudget }) },
    );
    // A broken citation is a system failure (DIS-68); every other event is information. Events hold
    // codes, ids, paths and lines only, never the question nor a span's text (design U5).
    for (const event of explained.events) request.log[event.type === 'evidence_broken' ? 'error' : 'info']({ ...event }, 'explain event');
    return toPublicAnswer(explained);
  });
}
